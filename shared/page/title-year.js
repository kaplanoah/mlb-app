// The title names the season it shows whenever that isn't a season being played: an earlier one,
// or the current one once its last game is final, until the next one starts.

/**
 * The year the title shows, or null while the shown season is being played.
 * @param {{ shownYear: number, currentYear: number | null, isSeasonOver: boolean }} season
 * @returns {number | null}
 */
export function chooseTitleYear({ shownYear, currentYear, isSeasonOver }) {
  const isEarlierSeason = currentYear !== null && shownYear !== currentYear;
  return isEarlierSeason ? shownYear : null;
}

/**
 * Shows `year` in the title's #titleYear, or hides it.
 * @param {number | null} year
 */
export function showTitleYear(year) {
  const element = /** @type {HTMLElement} */ (document.getElementById("titleYear"));
  element.hidden = year === null;
  element.textContent = year === null ? "" : String(year);
}
