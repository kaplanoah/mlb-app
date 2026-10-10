// The Games view's search, which takes the place of the season's list of days while it's open: a
// field with Cancel, the line under it saying how the search read its words, and the games it
// found, under their days, opening on the first from today. Before anything is typed, quiet
// examples to tap sit under the field, inside its width; while words are typed, suggestions sit
// over the games already found, until a suggestion is tapped or the search is sent. A reload shows
// the search as it was, and two minutes away closes it, as the list goes back to today. A league
// hands it its season's games and words, how it draws a day's games, and a team's dot.

import {
  createSearchContext,
  createSearchDictionary,
  describeNoGames,
  describeSearch,
  findSearchGames,
  readSearch,
} from "./game-search.js";
import { html, joinWithSeparator, setHtml } from "./html.js";
import { isAwayLong } from "./long-away.js";
import { watchTimeAway } from "./resume.js";
import { listExamples, listSuggestions } from "./search-suggestions.js";

/** @typedef {import("./html.js").Markup} Markup */
/** @typedef {import("./game-search.js").SearchGame} SearchGame */
/** @typedef {import("./game-search.js").SearchTerms} SearchTerms */
/** @typedef {import("./search-suggestions.js").Suggestion} Suggestion */
/**
 * What a league hands its search.
 * @typedef {object} SearchLeague
 * @property {() => { terms: SearchTerms, games: SearchGame[] } | null} readSeason the season shown,
 *   or null before the page has one
 * @property {(games: SearchGame[], now: number) => { day: string, markup: Markup }[]} listDays the
 *   days of the games found, drawn as the Games view draws them
 * @property {(code: string) => Markup} renderTeamMark a team's dot
 * @property {() => void} close what the view does as the search closes, like going back to today
 */

// Phosphor's magnifying-glass at its Light weight in the field, as the page's controls are, and at
// its Regular weight, calendar-blank, and map-pin beside a suggestion's words, and x-circle at its
// Fill weight to clear the field, as iOS does.
const FIELD_GLASS = html`<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M228.24,219.76l-51.38-51.38a86.15,86.15,0,1,0-8.48,8.48l51.38,51.38a6,6,0,0,0,8.48-8.48ZM38,112a74,74,0,1,1,74,74A74.09,74.09,0,0,1,38,112Z"/></svg>`;
const MARKS = {
  search: html`<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/></svg>`,
  date: html`<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Z"/></svg>`,
  place: html`<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M128,64a40,40,0,1,0,40,40A40,40,0,0,0,128,64Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,128,128Zm0-112a88.1,88.1,0,0,0-88,88c0,31.4,14.51,64.68,42,96.25a254.19,254.19,0,0,0,41.45,38.3,8,8,0,0,0,9.18,0A254.19,254.19,0,0,0,174,200.25c27.45-31.57,42-64.85,42-96.25A88.1,88.1,0,0,0,128,16Zm0,206c-16.53-13-72-60.75-72-118a72,72,0,0,1,144,0C200,161.23,144.53,209,128,222Z"/></svg>`,
};
const CLEAR = html`<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm37.66,130.34a8,8,0,0,1-11.32,11.32L128,139.31l-26.34,26.35a8,8,0,0,1-11.32-11.32L116.69,128,90.34,101.66a8,8,0,0,1,11.32-11.32L128,116.69l26.34-26.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>`;

/** @type {HTMLElement | null} */
let view = null;
/** @type {SearchLeague | null} */
let league = null;
// While words are typed, suggestions show over the games, until a suggestion is tapped or the
// search is sent.
let isTyping = false;
// The search and its suggestions the list was last placed for, so a redraw keeps where it is.
/** @type {string | null} */
let placedFor = null;
/** @type {WeakMap<SearchTerms, import("./search-words.js").Dictionary>} */
const dictionaries = new WeakMap();

const findInput = () =>
  /** @type {HTMLInputElement | null} */ (view?.querySelector(".search-input") ?? null);
const findBar = () =>
  /** @type {HTMLElement | null} */ (view?.querySelector(".search-bar") ?? null);
const findList = () =>
  /** @type {HTMLElement | null} */ (view?.querySelector(".search-list") ?? null);
const findRead = () =>
  /** @type {HTMLElement | null} */ (view?.querySelector(".search-read") ?? null);

const renderShell = () =>
  html`<div class="day-bar search-bar is-empty">
      <form class="search-row" role="search">
        <label class="search-field"
          >${FIELD_GLASS}<input
            type="search"
            class="search-input"
            value=""
            placeholder="Search games"
            aria-label="Search games"
            enterkeyhint="search"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false" /><button type="button" class="search-clear" aria-label="Clear" hidden>
            ${CLEAR}
          </button></label
        >
        <button type="button" class="search-cancel">Cancel</button>
      </form>
      <p class="search-read"></p>
    </div>
    <div class="day-list search-list"></div>`;

/** The words in the field, as typed. */
const readQuery = () => findInput()?.value ?? "";

/**
 * Puts words in the field, and in its markup, so a reload shows them.
 * @param {string} text
 */
function writeQuery(text) {
  const input = findInput();
  if (!input) return;
  input.value = text;
  input.setAttribute("value", text);
  const clear = /** @type {HTMLElement | null} */ (view?.querySelector(".search-clear") ?? null);
  if (clear) clear.hidden = !text;
}

/** @param {{ terms: SearchTerms, games: SearchGame[] }} season */
function createContext({ terms, games }) {
  if (!dictionaries.has(terms)) dictionaries.set(terms, createSearchDictionary(terms));
  const dictionary = /** @type {import("./search-words.js").Dictionary} */ (
    dictionaries.get(terms)
  );
  return createSearchContext({ terms, dictionary, games, now: Date.now() });
}

/**
 * The examples to tap, inside the field's width, as room as wide as Cancel keeps them from it.
 * @param {string[]} examples
 */
const renderExamples = (examples) =>
  html`<div class="search-examples">
    <ul>
      ${examples.map(
        (example) =>
          html`<li><button type="button" class="search-example" data-search="${example}">${example}</button></li>`,
      )}
    </ul>
    <span class="search-cancel search-cancel-room" aria-hidden="true">Cancel</span>
  </div>`;

/**
 * A suggestion's words, with the part already typed dimmer.
 * @param {string} text
 * @param {string} typed
 */
function renderTyped(text, typed) {
  let length = 0;
  while (length < typed.length && text[length]?.toLowerCase() === typed[length].toLowerCase())
    length += 1;
  return html`<span class="search-typed">${text.slice(0, length)}</span>${text.slice(length)}`;
}

/** @param {Suggestion["mark"]} mark */
const renderMark = (mark) =>
  mark.kind === "team" ? league?.renderTeamMark(mark.code) : MARKS[mark.kind];

/**
 * @param {Suggestion[]} suggestions
 * @param {string} typed
 */
const renderSuggestions = (suggestions, typed) =>
  html`<ul class="search-suggestions">
      ${suggestions.map(
        ({ text, mark, detail }) =>
          html`<li>
            <button type="button" class="search-suggestion" data-search="${text}">
              <span class="search-mark">${renderMark(mark)}</span
              ><span class="search-words">${renderTyped(text, typed)}</span
              >${detail && html`<span class="search-detail">${detail}</span>`}
            </button>
          </li>`,
      )}
    </ul>
    <h3 class="search-head">Games</h3>`;

/**
 * @param {{ day: string, markup: Markup }[]} days
 */
const renderDays = (days) =>
  html`${days.map(({ day, markup }) => html`<div class="listed-day" data-day="${day}">${markup}</div>`)}`;

/**
 * The line under the field: what the search is about, in bold, then the rest of what it read.
 * @param {{ lead: string, facts: string[] }} read
 */
const renderRead = ({ lead, facts }) => joinWithSeparator([html`<b>${lead}</b>`, ...facts]);

/**
 * Places the list on the first day found from today, with room after the last day for it to reach
 * the top, or, when every day found is past, or suggestions sit over the games, at its end or its
 * top.
 * @param {string} today
 * @param {boolean} hasSuggestions
 */
function placeList(today, hasSuggestions) {
  const list = findList();
  if (!list) return;
  const days = /** @type {HTMLElement[]} */ ([...list.querySelectorAll(".listed-day")]);
  const gap = Number.parseFloat(getComputedStyle(list).paddingTop) || 0;
  const ahead = hasSuggestions ? null : days.find((each) => (each.dataset.day ?? "") >= today);
  const last = days.at(-1);
  const room = ahead && last ? list.clientHeight - last.offsetHeight - gap : 0;
  list.style.setProperty("--end-room", `${Math.max(0, room)}px`);
  if (ahead) list.scrollTop = Math.max(0, ahead.offsetTop - gap);
  else list.scrollTop = hasSuggestions ? 0 : list.scrollHeight;
  markStuck();
}

// The bar ends in a line once something has scrolled under it, as the day strip's does.
function markStuck() {
  findBar()?.classList.toggle("stuck", (findList()?.scrollTop ?? 0) > 0);
}

/**
 * The games from today on, or, when none are left, all of them.
 * @param {SearchGame[]} games
 * @param {string} today
 */
function listFromToday(games, today) {
  const ahead = games.filter((game) => game.day >= today);
  return ahead.length ? ahead : games;
}

/**
 * What the line reads while words are typed: a half-typed team as the team the first suggestion
 * finishes it into, and any other half-typed word left out until it's whole, rather than named as
 * one it can't use.
 * @param {string} text
 * @param {Suggestion[]} suggestions
 * @param {import("./game-search.js").SearchContext} context
 */
function readWhileTyping(text, suggestions, context) {
  const last = text.split(/\s+/).at(-1) ?? "";
  const isHalfTyped = readSearch(text, context).skipped.includes(last.toLowerCase());
  if (!isTyping || !isHalfTyped) return text;
  const [first] = suggestions;
  const isTeamFinished =
    first?.mark.kind === "team" && first.text.toLowerCase().startsWith(text.toLowerCase());
  return isTeamFinished ? first.text : text.slice(0, text.length - last.length).trim();
}

/** Draws what the search finds, or its examples while nothing is typed. */
function draw() {
  const season = league?.readSeason();
  const list = findList();
  const readLine = findRead();
  if (!season || !list || !readLine) return;
  const context = createContext(season);
  const query = readQuery();
  const text = query.trim();
  findBar()?.classList.toggle("is-empty", !text);
  if (!text) {
    setHtml(readLine, html``);
    setHtml(list, renderExamples(listExamples(context)));
    placeOnce(nameShown("", false), context.today);
    return;
  }
  const suggestions = isTyping ? listSuggestions(query, context) : [];
  const hasSuggestions = suggestions.length > 0;
  const search = readSearch(readWhileTyping(text, suggestions, context), context);
  const found = findSearchGames(search, context);
  setHtml(readLine, renderRead(describeSearch(search, found, context)));
  const shownGames = hasSuggestions ? listFromToday(found.games, context.today) : found.games;
  const games = shownGames.length
    ? renderDays(league.listDays(shownGames, Date.now()))
    : html`<p class="empty-note">${describeNoGames(search, context)}</p>`;
  setHtml(list, html`${hasSuggestions && renderSuggestions(suggestions, query)}${games}`);
  placeOnce(nameShown(text, hasSuggestions), context.today);
}

/**
 * What the list shows, for placing it once for each.
 * @param {string} text the search
 * @param {boolean} hasSuggestions
 */
const nameShown = (text, hasSuggestions) => `${text}\n${hasSuggestions}`;

/**
 * Places the list once for each search and whether suggestions show, so a redraw, as each minute,
 * keeps where it's been scrolled.
 * @param {string} shown
 * @param {string} today
 */
function placeOnce(shown, today) {
  if (shown === placedFor) return;
  placedFor = shown;
  placeList(today, shown.endsWith("\ntrue"));
}

/**
 * Runs a whole search, as a tapped suggestion or example does, putting the keyboard away.
 * @param {string} text
 */
function runSearch(text) {
  writeQuery(text);
  isTyping = false;
  findInput()?.blur();
  draw();
}

/**
 * Opens the search with an empty field and the keyboard up, from a tap, which a phone needs to
 * bring up the keyboard.
 */
export function openGameSearch() {
  if (!view) return;
  writeQuery("");
  isTyping = true;
  view.hidden = false;
  draw();
  findInput()?.focus();
}

/**
 * Closes the search, emptying its field.
 * @returns {boolean} whether it was open
 */
export function closeGameSearch() {
  if (!view || view.hidden) return false;
  findInput()?.blur();
  writeQuery("");
  isTyping = false;
  placedFor = null;
  view.hidden = true;
  league?.close();
  return true;
}

/** Draws the search again from the season, as new data or the clock moves on. */
export function refreshGameSearch() {
  if (view && !view.hidden) draw();
}

/** @param {Event} event */
function followTap(event) {
  const target = /** @type {Element} */ (event.target);
  const chosen = /** @type {HTMLElement | null} */ (target.closest("[data-search]"));
  if (chosen) runSearch(chosen.dataset.search ?? "");
  else if (target.closest(".search-cancel")) closeGameSearch();
  else if (target.closest(".search-clear")) {
    writeQuery("");
    isTyping = true;
    draw();
    findInput()?.focus();
  }
}

function followTyping() {
  writeQuery(readQuery());
  isTyping = true;
  draw();
}

/** @param {Event} event */
function sendSearch(event) {
  event.preventDefault();
  runSearch(readQuery());
}

/**
 * Wires the search in `element`, which the page may already have put back as it was shown before a
 * reload (show-last-drawn.js), then takes it over, keeping where its list was scrolled.
 * @param {HTMLElement} element
 * @param {SearchLeague} searchLeague
 */
export function startGameSearch(element, searchLeague) {
  view = element;
  league = searchLeague;
  if (!findInput()) setHtml(element, renderShell());
  placedFor = element.hidden ? null : nameShown(readQuery().trim(), false);
  element.addEventListener("click", followTap);
  element.addEventListener("input", followTyping);
  element.addEventListener("submit", sendSearch);
  findList()?.addEventListener("scroll", markStuck, { passive: true });
  watchTimeAway((awayMs) => {
    if (isAwayLong(awayMs)) closeGameSearch();
  });
}
