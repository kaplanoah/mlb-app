// The sheet beside a team's that its Roster button, or a swipe left, brings in: the team's roster
// for the season shown, which the store keeps, beside every player's averages that season, which
// the store also keeps, read together as the team's sheet shows a season and again
// once they're old, sorted by the column the viewer picked until the sheet shows another team. Who
// is out shows only while the team still plays.

import { setHtml } from "#shared/html.js";
import { openSheet, wireSheet } from "#shared/sheet.js";
import { fetchFromWorker } from "#shared/worker-fetch.js";
import {
  chooseSort,
  DEFAULT_SORT,
  describeRosterNote,
  renderRoster,
  renderRosterHeading,
} from "./roster-view.js";
import { isStillPlaying } from "./series.js";
import { isPastSeason, session } from "./session.js";
import { TEAMS } from "./teams.js";

/** @typedef {import("./roster-view.js").Roster} Roster */
/** @typedef {import("./roster-view.js").Averages} Averages */
/** @typedef {{ at: number, roster: Roster | null, averages: Averages[], isLoading: boolean }} RosterRead */

const FETCH_TIMEOUT_MS = 15 * 1000;
// A roster changes with a signing or an injury, and the averages after each game.
const READ_AGAIN_MS = 10 * 60 * 1000;
// A roster that didn't load says to try again in a minute.
const RETRY_MS = 60 * 1000;

// Each read is kept by its team and season, as NYL:2026.
/** @type {Map<string, RosterRead>} */
const reads = new Map();
/** @type {string | null} */
let shownTeam = null;
let sort = DEFAULT_SORT;
/** @type {string | null} */
let sortedTeam = null;

const findSheet = () => /** @type {HTMLElement} */ (document.getElementById("rosterSheet"));
const findElement = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * @param {string} team
 * @param {number} year
 */
const fetchRoster = (team, year) =>
  fetchFromWorker(`roster?team=${encodeURIComponent(team)}&season=${year}`, {
    reuseMs: READ_AGAIN_MS,
    timeoutMs: FETCH_TIMEOUT_MS,
    isExpected: (body) => body.team === team && body.season === year && Array.isArray(body.players),
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
 * @param {number} year
 * @param {RosterRead} read
 * @param {[PromiseSettledResult<any>, PromiseSettledResult<any>]} results
 */
function keepRead(team, year, read, [roster, averages]) {
  const key = `${team}:${year}`;
  if (reads.get(key) !== read) return;
  reads.set(key, {
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
 * The team's last read for the season, after starting a new one when it has none or it's old.
 * @param {string} team
 * @param {number} year
 */
function readRoster(team, year) {
  const key = `${team}:${year}`;
  const kept = reads.get(key);
  if (kept && isFresh(kept)) return kept;
  /** @type {RosterRead} */
  const read = {
    at: Date.now(),
    roster: kept?.roster ?? null,
    averages: kept?.averages ?? [],
    isLoading: true,
  };
  reads.set(key, read);
  Promise.allSettled([fetchRoster(team, year), fetchAverages(year)]).then((results) =>
    keepRead(team, year, read, /** @type {any} */ (results)),
  );
  return read;
}

function renderSheet() {
  if (!shownTeam) return;
  const { roster, averages, isLoading } = readRoster(shownTeam, session.year);
  const team = shownTeam;
  const showsOut = !isPastSeason() && isStillPlaying(session.season?.series ?? [], team);
  setHtml(findElement("rosterTitle"), renderRosterHeading(team));
  setHtml(findElement("rosterNote"), describeRosterNote(roster, session.year));
  setHtml(findElement("rosterBody"), renderRoster({ roster, averages, sort, isLoading, showsOut }));
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
  return findSheet();
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
/** @param {HTMLElement} sheet */
const markScrolledAcross = (sheet) =>
  sheet.classList.toggle("is-scrolled-across", sheet.scrollLeft > 0);

export function startRosterSheet() {
  const sheet = findSheet();
  wireSheet(sheet, {
    doneButton: findElement("rosterDoneBtn"),
    backButton: findElement("rosterBackBtn"),
    keeper: { read: () => shownTeam && { team: shownTeam }, reopen: reopenRoster },
    name: "Roster",
    forget: () => {
      shownTeam = null;
    },
  });
  findElement("teamSheet").addEventListener("click", openOnTap);
  findElement("rosterBody").addEventListener("click", sortOnTap);
  sheet.addEventListener("scroll", () => markScrolledAcross(sheet), { passive: true });
}
