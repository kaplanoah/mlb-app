// The Roster section of a club's sheet, beside its Team section: the club's roster, which the store
// keeps for the current season, read as the sheet shows the club and again once it's old. The
// club's sheet keeps what the section shows, so a reload draws it again while it reads again.

import { html, setHtml } from "#shared/html.js";
import { fetchFromWorker } from "#shared/worker-fetch.js";
import { renderRoster } from "./roster-view.js";
import { session } from "./session.js";

/** @typedef {import("./roster-view.js").Roster} Roster */
/** @typedef {{ at: number, roster: Roster | null, isLoading: boolean }} RosterRead */

const FETCH_TIMEOUT_MS = 15 * 1000;
// A roster changes with a transaction, and its numbers after each game.
const READ_AGAIN_MS = 10 * 60 * 1000;
// A roster that didn't load is read again a minute later.
const RETRY_MS = 60 * 1000;

/** @type {Map<string, RosterRead>} */
const reads = new Map();
/** @type {string | null} */
let shownClub = null;

const findElement = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @param {string} club */
const fetchRoster = (club) =>
  fetchFromWorker(`store/rosters/${encodeURIComponent(club)}`, {
    reuseMs: READ_AGAIN_MS,
    timeoutMs: FETCH_TIMEOUT_MS,
    isExpected: (body) => "data" in body,
  });

/** @param {RosterRead} read */
const isFresh = (read) =>
  read.isLoading || Date.now() - read.at < (read.roster ? READ_AGAIN_MS : RETRY_MS);

/**
 * Keeps what a read found, or what the last one did when it failed or found none.
 * @param {string} club
 * @param {RosterRead} read
 * @param {Roster | null} found
 */
function keepRead(club, read, found) {
  if (reads.get(club) !== read) return;
  reads.set(club, { ...read, isLoading: false, roster: found ?? read.roster });
  if (shownClub === club) renderSection();
}

/**
 * The club's last read, after starting a new one when it has none or it's old.
 * @param {string} club
 */
function readRoster(club) {
  const kept = reads.get(club);
  if (kept && isFresh(kept)) return kept;
  /** @type {RosterRead} */
  const read = { at: Date.now(), roster: kept?.roster ?? null, isLoading: true };
  reads.set(club, read);
  fetchRoster(club).then(
    (body) => keepRead(club, read, body.data),
    () => keepRead(club, read, null),
  );
  return read;
}

const isCurrentSeason = () => session.activeYear === session.currentSeason;

function renderSection() {
  if (!shownClub) return;
  const body = findElement("rosterBody");
  if (!isCurrentSeason()) {
    setHtml(body, html`<p class="sheet-message">Rosters show for the current season only</p>`);
    return;
  }
  const { roster, isLoading } = readRoster(shownClub);
  setHtml(body, renderRoster(roster, { isLoading }));
}

/**
 * Fills the section in with a club's roster.
 * @param {string} club
 */
export function fillRoster(club) {
  shownClub = club;
  renderSection();
}

/** @param {any} saved */
const isSavedRoster = (saved) =>
  typeof saved?.club === "string" && Array.isArray(saved.roster?.players);

/** What the section shows, for the club's sheet to keep. */
export function readShownRoster() {
  const roster = shownClub ? reads.get(shownClub)?.roster : null;
  return shownClub && roster ? { club: shownClub, roster } : null;
}

/**
 * Takes back what the section showed, to show while it reads again, unless it has read since.
 * @param {unknown} saved what readShownRoster found
 */
export function reopenRoster(saved) {
  if (!isSavedRoster(saved)) return;
  const { club, roster } = /** @type {{ club: string, roster: Roster }} */ (saved);
  if (!reads.has(club)) reads.set(club, { at: 0, roster, isLoading: false });
}
