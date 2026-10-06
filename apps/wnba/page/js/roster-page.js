// What a team's Roster page shows: its roster, which the Worker reads from ESPN, beside every
// player's averages, which the store keeps, read together the first time the page shows a team
// and again once they're old, and the column the viewer sorted by, until the sheet shows another
// team.

import { refreshTeamSheet } from "#shared/team-sheet.js";
import { fetchFromWorker } from "#shared/worker-fetch.js";
import { chooseSort, DEFAULT_SORT, renderRoster } from "./roster-view.js";

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
let sort = DEFAULT_SORT;
/** @type {string | null} */
let sortedTeam = null;

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
  refreshTeamSheet();
}

/** @param {RosterRead} read */
const isFresh = (read) =>
  read.isLoading || Date.now() - read.at < (read.roster ? READ_AGAIN_MS : RETRY_MS);

/**
 * The team's last read, after starting a new one when it has none or it's old.
 * @param {string} team
 * @param {number} year
 */
function readRoster(team, year) {
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
  Promise.allSettled([fetchRoster(team), fetchAverages(year)]).then((results) =>
    keepRead(team, read, /** @type {any} */ (results)),
  );
  return read;
}

/**
 * The Roster page for a team in the current season.
 * @param {string} team
 * @param {number} year
 */
export function renderRosterPage(team, year) {
  if (sortedTeam !== team) {
    sortedTeam = team;
    sort = DEFAULT_SORT;
  }
  const { roster, averages, isLoading } = readRoster(team, year);
  return renderRoster({ roster, averages, sort, isLoading });
}

/** @param {Event} event */
function sortOnTap(event) {
  const button = /** @type {HTMLElement | null} */ (
    /** @type {Element} */ (event.target).closest(".roster-sort")
  );
  if (!button?.dataset.sort) return;
  sort = chooseSort(sort, button.dataset.sort);
  refreshTeamSheet();
}

/** @param {HTMLElement} dialog */
const markScrolledAcross = (dialog) =>
  dialog.classList.toggle("is-scrolled-across", dialog.scrollLeft > 0);

// The line at the pinned names' edge shows only once the table has scrolled under them.
export function startRosterPage() {
  const dialog = /** @type {HTMLElement} */ (document.getElementById("teamDialog"));
  /** @type {HTMLElement} */ (document.getElementById("teamBody")).addEventListener(
    "click",
    sortOnTap,
  );
  dialog.addEventListener("scroll", () => markScrolledAcross(dialog), { passive: true });
}
