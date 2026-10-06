// The sheet a team's Roster button opens over its team's sheet, as a swipe left on that sheet does
// too: the team's roster, which the Worker reads from ESPN, beside every player's averages, which
// the store keeps, read together the first time the sheet shows a team and again once they're old,
// sorted by the column the viewer picked until the sheet shows another team.

import { setHtml } from "#shared/html.js";
import { redrawSheet } from "#shared/sheet-resize.js";
import { openSheet, wireSheet } from "#shared/sheet.js";
import { fetchFromWorker } from "#shared/worker-fetch.js";
import { chooseSort, DEFAULT_SORT, describeRosterNote, renderRoster } from "./roster-view.js";
import { session } from "./session.js";
import { renderTeamHeading } from "./team-view.js";
import { TEAMS } from "./teams.js";

/** @typedef {import("./roster-view.js").Roster} Roster */
/** @typedef {import("./roster-view.js").Averages} Averages */
/** @typedef {{ at: number, roster: Roster | null, averages: Averages[], isLoading: boolean }} RosterRead */

const FETCH_TIMEOUT_MS = 15 * 1000;
// A roster changes with a signing or an injury, and the averages after each game.
const READ_AGAIN_MS = 10 * 60 * 1000;
// A roster that didn't load says to try again in a minute.
const RETRY_MS = 60 * 1000;

/** @type {Map<string, RosterRead>} */
const reads = new Map();
/** @type {string | null} */
let shownTeam = null;
let sort = DEFAULT_SORT;
/** @type {string | null} */
let sortedTeam = null;

const findDialog = () => /** @type {HTMLDialogElement} */ (document.getElementById("rosterDialog"));
const findElement = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @param {string} team */
const fetchRoster = (team) =>
  fetchFromWorker(`roster?team=${encodeURIComponent(team)}`, {
    reuseMs: READ_AGAIN_MS,
    timeoutMs: FETCH_TIMEOUT_MS,
    isExpected: (body) => body.team === team && Array.isArray(body.players),
  });

/** @param {number} year */
const fetchAverages = (year) =>
  fetchFromWorker(`store/averages/${year}`, {
    reuseMs: READ_AGAIN_MS,
    timeoutMs: FETCH_TIMEOUT_MS,
    isExpected: (body) => "data" in body,
  });

/**
 * Keeps what a read found, or what the last one did where it failed.
 * @param {string} team
 * @param {RosterRead} read
 * @param {[PromiseSettledResult<any>, PromiseSettledResult<any>]} results
 */
function keepRead(team, read, [roster, averages]) {
  if (reads.get(team) !== read) return;
  reads.set(team, {
    ...read,
    isLoading: false,
    roster: roster.status === "fulfilled" ? roster.value : read.roster,
    averages:
      averages.status === "fulfilled" ? (averages.value.data?.players ?? []) : read.averages,
  });
  if (shownTeam === team) renderSheet();
}

/** @param {RosterRead} read */
const isFresh = (read) =>
  read.isLoading || Date.now() - read.at < (read.roster ? READ_AGAIN_MS : RETRY_MS);

/**
 * The team's last read, after starting a new one when it has none or it's old.
 * @param {string} team
 */
function readRoster(team) {
  const kept = reads.get(team);
  if (kept && isFresh(kept)) return kept;
  /** @type {RosterRead} */
  const read = {
    at: Date.now(),
    roster: kept?.roster ?? null,
    averages: kept?.averages ?? [],
    isLoading: true,
  };
  reads.set(team, read);
  Promise.allSettled([fetchRoster(team), fetchAverages(session.year)]).then((results) =>
    keepRead(team, read, /** @type {any} */ (results)),
  );
  return read;
}

function renderSheet() {
  if (!shownTeam) return;
  const { roster, averages, isLoading } = readRoster(shownTeam);
  const team = shownTeam;
  redrawSheet(findDialog(), () => {
    setHtml(findElement("rosterTitle"), renderTeamHeading(team));
    setHtml(findElement("rosterNote"), describeRosterNote(roster));
    setHtml(findElement("rosterBody"), renderRoster({ roster, averages, sort, isLoading }));
  });
}

/**
 * Fills the sheet in with a team's roster, ready to open, keeping its sort while it's the same
 * team.
 * @param {string} team
 */
export function prepareRoster(team) {
  if (sortedTeam !== team) {
    sortedTeam = team;
    sort = DEFAULT_SORT;
  }
  shownTeam = team;
  renderSheet();
  return findDialog();
}

/** @param {{ team?: unknown } | null} saved */
function reopenRoster(saved) {
  const team = saved?.team;
  if (typeof team !== "string" || !Object.hasOwn(TEAMS, team)) return false;
  prepareRoster(team);
  return true;
}

/** @param {Event} event */
function openOnTap(event) {
  const button = /** @type {HTMLElement | null} */ (
    /** @type {Element} */ (event.target).closest("[data-roster]")
  );
  if (!button?.dataset.roster) return;
  openSheet(prepareRoster(button.dataset.roster));
}

/** @param {Event} event */
function sortOnTap(event) {
  const button = /** @type {HTMLElement | null} */ (
    /** @type {Element} */ (event.target).closest(".roster-sort")
  );
  if (!button?.dataset.sort) return;
  sort = chooseSort(sort, button.dataset.sort);
  renderSheet();
}

// The line at the pinned names' edge shows only once the table has scrolled under them.
/** @param {HTMLElement} dialog */
const markScrolledAcross = (dialog) =>
  dialog.classList.toggle("is-scrolled-across", dialog.scrollLeft > 0);

export function startRosterSheet() {
  const dialog = findDialog();
  wireSheet(dialog, {
    doneButton: findElement("rosterDoneBtn"),
    backButton: findElement("rosterBackBtn"),
    keeper: { read: () => shownTeam && { team: shownTeam }, reopen: reopenRoster },
    name: "Roster",
  });
  findElement("teamDialog").addEventListener("click", openOnTap);
  findElement("rosterBody").addEventListener("click", sortOnTap);
  dialog.addEventListener("scroll", () => markScrolledAcross(dialog), { passive: true });
  dialog.addEventListener("close", () => {
    shownTeam = null;
  });
}
