import { createSeasonReader } from "#shared/season-reader.js";
import { buildBracket } from "./bracket.js";
import { SNAPSHOT_VERSION } from "./snapshot.js";
import { composeState, guessSeasonYear, session } from "./session.js";
import { TEAMS } from "./teams.js";

// The Worker keeps each season's record in the store as it plays out, says which season is
// current, and pushes every change to the page, which the shared season reader follows.

const UNREACHABLE = "Can't reach the page's server right now.";

/** @type {ReturnType<typeof createSeasonReader> | null} */
let reader = null;
/** @type {{ year: number, record: any } | null} */
let deferredSeason = null;

const keepKnownClubs = (teams) =>
  Object.fromEntries(Object.entries(teams || {}).filter(([id]) => TEAMS[id]));

/**
 * A season's record as the page reads it, or an empty season for a year with no record.
 * @param {any} record
 * @param {number} year
 */
function normalizeSeason(record, year) {
  const season = record ?? {};
  return {
    ...season,
    year,
    teams: keepKnownClubs(season.teams),
    series: season.series ?? {},
    log: Array.isArray(season.log) ? season.log : [],
  };
}

/**
 * @param {number} year
 * @param {any} record
 */
function applySeason(year, record) {
  Object.assign(session, { activeYear: year, season: normalizeSeason(record, year), problem: "" });
  composeState();
}

// A drag keeps the order it shows, so a season that arrives during one waits for it to end.
/**
 * @param {number} year
 * @param {any} record
 */
function keepSeason(year, record) {
  if (session.isReordering) deferredSeason = { year, record };
  else applySeason(year, record);
}

export function applyDeferredSeason() {
  if (!deferredSeason) return;
  applySeason(deferredSeason.year, deferredSeason.record);
  deferredSeason = null;
}

// A page that couldn't read its season shows an empty one, and loads it again when it's next opened.
function noteUnreachable() {
  if (!session.season) applySeason(session.activeYear, null);
  session.problem = UNREACHABLE;
}

/**
 * Starts reading the season, and redraws with `showChange` for each change after it loads, with
 * `showStamp` for each status of the store's last update or problem reading it, and with
 * `showCurrentYear` when the store moves on to a new season. A record in a version the page
 * doesn't read calls `showUnreadable`.
 * @param {{ showChange: () => void, showStamp: () => void, showCurrentYear: () => void, showUnreadable: () => void }} handlers
 */
export function startSeasonData({ showChange, showStamp, showCurrentYear, showUnreadable }) {
  reader = createSeasonReader({
    store: session.db,
    version: SNAPSHOT_VERSION,
    guessYear: guessSeasonYear,
    showUnreadable,
    keepSeason,
    showChange: () => {
      if (!session.isReordering) showChange();
    },
    showStatus: (status) => {
      session.status = status;
      showStamp();
    },
    showLoadFailure: () => {
      noteUnreachable();
      showStamp();
    },
    noteCurrentYear: (year) => {
      session.currentSeason = year;
      showCurrentYear();
    },
  });
}

// A page whose load failed may be watching a season the store doesn't have yet, and the store may
// have moved on to a new season, so a retry loads the current season again.
export async function loadSeason() {
  try {
    await reader?.loadCurrentSeason();
    session.currentSeason = reader?.readCurrentYear() ?? session.currentSeason;
  } catch {
    noteUnreachable();
  }
}

/** @param {number} year */
export async function showYear(year) {
  session.activeYear = year;
  try {
    await reader?.showYear(year);
  } catch {
    noteUnreachable();
  }
}

function collectTrackedTitles(docs) {
  const titles = {};
  for (const stored of docs) {
    const doc = stored.data();
    if (!doc || !doc.teams || !doc.series) continue;
    const year = Number(doc.year ?? stored.id);
    const champion = buildBracket({ ...doc, teams: keepKnownClubs(doc.teams) }).ws?.winner;
    if (champion && Number.isFinite(year)) titles[champion] = [...(titles[champion] ?? []), year];
  }
  return titles;
}

// The seasons the store keeps, newest first, and every title they record.
export async function loadSeasonList() {
  const result = await session.db.collection("seasons").limit(50).get();
  session.trackedTitles = collectTrackedTitles(result.docs);
  return result.docs
    .map((doc) => doc.id)
    .filter((id) => /^\d{4}$/.test(id))
    .sort()
    .reverse();
}
