// The sheet a team's name or dot opens wherever it shows. Phones show it as a sheet from the
// bottom, wider screens as a modal, like a game's sheet, over a sheet it opens from, and in place
// of another team's. Each league hands it which teams it knows and what a team's sheet shows, and
// builds the buttons that open it with renderTeamSheetButton. A league whose sheet has more than
// one page names them, and a pill under the title switches between them.

import { html, joinWithSeparator, setHtml } from "./html.js";
import { renderSheetPart } from "./sheet-part.js";
import { redrawSheet } from "./sheet-resize.js";
import { openSheet, wireSheet } from "./sheet.js";

/** @typedef {import("./html.js").Markup} Markup */
/** @typedef {{ id: string, label: string }} TeamPage */
/** @typedef {{ heading: Markup, note: Markup | string, body: Markup, pages?: TeamPage[] }} TeamSheet */
/** @typedef {{ isTeam: (team: string) => boolean, renderSheet: (team: string, page: string | null) => TeamSheet }} League */

/** @type {League | null} */
let league = null;
/** @type {string | null} */
let shownTeam = null;
// The page the pill shows, or null for a sheet's first.
/** @type {string | null} */
let shownPage = null;
let areAllTitlesShown = false;

const TITLES_SHOWN = 3;
// A shorter list reads in about the room its button would take, so it shows whole.
const MOST_TITLES_LISTED = 6;

const findDialog = () => /** @type {HTMLDialogElement} */ (document.getElementById("teamDialog"));
const findElement = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * The pill between a sheet's pages, its thumb under the shown one.
 * @param {TeamPage[]} pages
 * @param {string} shown
 */
function renderPagePill(pages, shown) {
  const index = Math.max(
    0,
    pages.findIndex((page) => page.id === shown),
  );
  return html`<div class="pager-tabs team-pages" role="tablist" aria-label="Team" style="--list-count: ${pages.length}; --swipe: ${index}">
    <span class="pager-thumb" aria-hidden="true"></span>
    ${pages.map(
      (page) =>
        html`<button type="button" role="tab" data-page="${page.id}" aria-selected="${String(page.id === shown)}">${page.label}</button>`,
    )}
  </div>`;
}

function renderSheet() {
  if (!league || !shownTeam) return;
  const { heading, note, body, pages = [] } = league.renderSheet(shownTeam, shownPage);
  const page = pages.find((each) => each.id === shownPage)?.id ?? pages[0]?.id ?? "";
  const dialog = findDialog();
  redrawSheet(dialog, () => {
    dialog.dataset.page = page;
    setHtml(findElement("teamTitle"), heading);
    setHtml(findElement("teamNote"), note);
    const pill = document.getElementById("teamPages");
    if (pill) setHtml(pill, pages.length > 1 && renderPagePill(pages, page));
    setHtml(findElement("teamBody"), body);
  });
}

/** @param {string} team */
function openTeamSheet(team) {
  if (!league?.isTeam(team)) return;
  shownTeam = team;
  shownPage = null;
  areAllTitlesShown = false;
  renderSheet();
  openSheet(findDialog());
}

const readShownTeam = () => shownTeam && { team: shownTeam, page: shownPage, areAllTitlesShown };

/** @param {{ team: string, page?: string | null, areAllTitlesShown: boolean } | null} shown */
function reopenTeamSheet(shown) {
  if (!shown || !league?.isTeam(shown.team)) return false;
  shownTeam = shown.team;
  shownPage = typeof shown.page === "string" ? shown.page : null;
  areAllTitlesShown = shown.areAllTitlesShown === true;
  renderSheet();
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

/** @param {Event} event */
function showPageOnTap(event) {
  const tab = /** @type {HTMLElement | null} */ (
    /** @type {Element} */ (event.target).closest("[data-page]")
  );
  if (!tab?.dataset.page || tab.dataset.page === shownPage) return;
  shownPage = tab.dataset.page;
  renderSheet();
}

/** @param {League} teams */
export function startTeamSheet(teams) {
  league = teams;
  const dialog = findDialog();
  wireSheet(dialog, {
    doneButton: findElement("teamDoneBtn"),
    keeper: { read: readShownTeam, reopen: reopenTeamSheet },
  });
  findElement("teamBody").addEventListener("click", showAllTitlesOnTap);
  document.getElementById("teamPages")?.addEventListener("click", showPageOnTap);
  dialog.addEventListener("close", () => {
    shownTeam = null;
    shownPage = null;
  });
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
