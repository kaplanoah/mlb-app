// The sheet a team's name or dot opens wherever it shows. Phones show it over the whole screen,
// wider screens as a modal, like a game's sheet, beside a sheet it opens from, and in place of
// another team's. Each league hands it which teams it knows and what a team's sheet shows, like
// the cards of its nearest games (game-cards.js), and builds the buttons that open it with
// renderTeamSheetButton. A league whose team sheet holds sections, like the WNBA's Team and
// Roster, names them with pills in its markup and fills the ones after the first itself.

import { fitGameCards, watchGameCards } from "./game-cards.js";
import { html, joinWithSeparator, setHtml } from "./html.js";
import { renderSheetPart } from "./sheet-part.js";
import { wireSheetSections } from "./sheet-sections.js";
import { openSheet, wireSheet } from "./sheet.js";

/** @typedef {import("./html.js").Markup} Markup */
/** @typedef {{ heading: Markup, note: Markup | string, body: Markup }} TeamSheet */
/**
 * @typedef {object} League
 * @property {(team: string) => boolean} isTeam
 * @property {(team: string) => TeamSheet} renderSheet
 * @property {(team: string) => void} [fillSections] fills the sections after the first, which
 *   `body` fills, for the team shown
 */

/** @type {League | null} */
let league = null;
/** @type {string | null} */
let shownTeam = null;
let areAllTitlesShown = false;
/** @type {ReturnType<typeof wireSheetSections> | null} */
let sections = null;

const TITLES_SHOWN = 3;
// A shorter list reads in about the room its button would take, so it shows whole.
const MOST_TITLES_LISTED = 6;

const findSheet = () => /** @type {HTMLElement} */ (document.getElementById("teamSheet"));
const findElement = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

function renderSheet() {
  if (!league || !shownTeam) return;
  const { heading, note, body } = league.renderSheet(shownTeam);
  setHtml(findElement("teamTitle"), heading);
  setHtml(findElement("teamNote"), note);
  setHtml(findElement("teamBody"), body);
  fitGameCards(findElement("teamBody"));
  league.fillSections?.(shownTeam);
}

/** @param {string} team */
function openTeamSheet(team) {
  if (!league?.isTeam(team)) return;
  shownTeam = team;
  areAllTitlesShown = false;
  renderSheet();
  sections?.showFirstSection();
  openSheet(findSheet());
}

const readShownTeam = () =>
  shownTeam && { team: shownTeam, areAllTitlesShown, section: sections?.readShown() ?? null };

/** @param {{ team: string, areAllTitlesShown: boolean, section?: unknown } | null} shown */
function reopenTeamSheet(shown) {
  if (!shown || !league?.isTeam(shown.team)) return false;
  shownTeam = shown.team;
  areAllTitlesShown = shown.areAllTitlesShown === true;
  renderSheet();
  if (typeof shown.section === "string") sections?.showSection(shown.section, true);
  return true;
}

/** Redraws the open sheet from what the page shows now. */
export const refreshTeamSheet = () => renderSheet();

/** @param {Event} event */
function openFromTap(event) {
  const button = /** @type {HTMLElement | null} */ (
    /** @type {Element} */ (event.target).closest("[data-team]")
  );
  if (button?.dataset.team) openTeamSheet(button.dataset.team);
}

/** @param {Event} event */
function showAllTitlesOnTap(event) {
  if (!(/** @type {Element} */ (event.target).closest(".team-titles-more"))) return;
  areAllTitlesShown = true;
  renderSheet();
}

/** @param {League} teams */
export function startTeamSheet(teams) {
  league = teams;
  const sheet = findSheet();
  sections = sheet.querySelector(".sheet-sections") ? wireSheetSections(sheet) : null;
  wireSheet(sheet, {
    closeButton: findElement("teamCloseBtn"),
    backButton: document.getElementById("teamBackBtn") ?? undefined,
    findScroller: sections?.findShownSection,
    keeper: { read: readShownTeam, reopen: reopenTeamSheet },
    name: "Team",
    forget: () => {
      shownTeam = null;
    },
  });
  findElement("teamBody").addEventListener("click", showAllTitlesOnTap);
  watchGameCards(findElement("teamBody"));
  document.addEventListener("click", openFromTap);
}

/**
 * A button around what shows a team, that opens its sheet.
 * @param {{ team: string, name: string, content: Markup | string, className?: string }} button
 *   `name` is the team's full name, for the button's label
 */
export const renderTeamSheetButton = ({ team, name, content, className = "" }) =>
  html`<button type="button" class="${className ? `${className} ` : ""}team-open" data-team="${team}" aria-label="Team details: ${name}">${content}</button>`;

/**
 * A grid of a team's numbers, each under its label, leaving out those it has none for, or nothing
 * when it has none at all.
 * @param {[Markup | string, Markup | string | number | null | undefined][]} stats
 */
export function renderTeamStats(stats) {
  const shown = stats.filter(([, value]) => value != null);
  if (!shown.length) return false;
  return html`<div class="team-stats">
    ${shown.map(
      ([label, value]) =>
        html`<div class="team-stat">
          <span class="team-label">${label}</span><b class="tabular">${value}</b>
        </div>`,
    )}
  </div>`;
}

/**
 * A line of a team's facts after their label.
 * @param {string} label
 * @param {Markup | string} content
 */
export const renderTeamDetail = (label, content) =>
  html`<p class="team-detail"><span class="team-label">${label}</span>${content}</p>`;

/** @param {(Markup | string | number)[]} years */
const joinYears = (years) => html`${years.map((year, index) => html`${index > 0 && ", "}${year}`)}`;

/** @param {(Markup | string | number)[]} years */
const countHiddenTitles = (years) =>
  areAllTitlesShown || years.length <= MOST_TITLES_LISTED ? 0 : years.length - TITLES_SHOWN;

/** @param {(Markup | string | number)[]} years newest first */
function renderTitleYears(years) {
  const hidden = countHiddenTitles(years);
  const shown = joinYears(years.slice(0, years.length - hidden));
  if (!hidden) return html`<span class="tabular">${shown}</span>`;
  return html`<span class="tabular">${shown}</span>
    <button type="button" class="team-titles-more">and ${hidden} more</button>`;
}

/**
 * A team's titles part: how many it has won and every season, or for a long list the latest few,
 * with a button for the rest that lists them all until the sheet shows another team.
 * @param {(Markup | string | number)[]} years newest first
 * @param {Markup | string | false} [aside] across from the part's title
 */
export function renderTitles(years, aside = false) {
  const body = years.length
    ? joinWithSeparator([html`<b>${years.length}</b>`, renderTitleYears(years)])
    : html`<span class="team-titles-none">None yet</span>`;
  return renderSheetPart("Titles", html`<p class="team-titles">${body}</p>`, aside);
}
