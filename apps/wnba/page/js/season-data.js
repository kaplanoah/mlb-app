import { readEasternDay } from "#shared/days.js";
import { createSeasonReader } from "#shared/season-reader.js";
import { session } from "./session.js";
import { SNAPSHOT_VERSION } from "./snapshot.js";

// The Worker keeps each season in the store as it plays out, says which season is current, and
// pushes every change to the page, which the shared season reader follows.

const UNREACHABLE = "Can't reach the page's server right now.";

/** @type {ReturnType<typeof createSeasonReader> | null} */
let reader = null;

const noteUnreachable = () => {
  session.problem = UNREACHABLE;
};

/**
 * Starts reading the season, and redraws with `showChange` for each change after it loads, and
 * with `showStamp` for each status of the store's last update or problem reading it. A record in a
 * version the page doesn't read calls `showUnreadable`.
 * @param {{ showChange: () => void, showStamp: () => void, showUnreadable: () => void }} handlers
 */
export function startSeasonData({ showChange, showStamp, showUnreadable }) {
  reader = createSeasonReader({
    store: session.db,
    version: SNAPSHOT_VERSION,
    showUnreadable,
    guessYear: (now) => readEasternDay(now).year,
    keepSeason: (year, season) => Object.assign(session, { year, season, problem: "" }),
    showChange,
    showStatus: (status) => {
      session.status = status;
      showStamp();
    },
    showLoadFailure: () => {
      noteUnreachable();
      showStamp();
    },
  });
}

// A page whose load failed may be watching a season the store doesn't have yet, and the store may
// have moved on to a new season, so a retry loads the current season again.
export async function loadSeason() {
  try {
    await reader?.loadCurrentSeason();
  } catch {
    noteUnreachable();
  }
}
