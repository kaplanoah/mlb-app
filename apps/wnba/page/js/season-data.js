import { readEasternDay } from "#shared/days.js";
import { createSeasonReader } from "#shared/season-reader.js";
import { session } from "./session.js";

// The Worker keeps each season in the store as it plays out, says which season is current, and
// pushes every change to the page, which the shared season reader follows.

const UNREACHABLE = "Can't reach the page's server right now.";

/** @type {ReturnType<typeof createSeasonReader> | null} */
let reader = null;

/**
 * Starts reading the season, and redraws with `showChange` for each change after it loads, and
 * with `showStatus` for each status of the store's last update.
 * @param {{ showChange: () => void, showStatus: () => void }} redraws
 */
export function startSeasonData({ showChange, showStatus }) {
  reader = createSeasonReader({
    store: session.db,
    guessYear: (now) => readEasternDay(now).year,
    keepSeason: (year, season) => Object.assign(session, { year, season, problem: "" }),
    showChange,
    showStatus: (status) => {
      session.status = status;
      showStatus();
    },
  });
}

// A page whose load failed may be watching a season the store doesn't have yet, and the store may
// have moved on to a new season, so a retry loads the current season again.
export async function loadSeason() {
  try {
    await reader?.loadCurrentSeason();
  } catch {
    session.problem = UNREACHABLE;
  }
}
