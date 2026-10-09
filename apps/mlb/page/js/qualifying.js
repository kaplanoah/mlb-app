// How near a starter is to MLB's qualified starters, who have pitched an inning for each of their
// club's games.

import { session } from "./session.js";
import { formatInnings } from "./stat-table.js";

/**
 * A club's games in the season the page shows, from its standings, or null for another season.
 * @param {string} club
 * @param {number} season
 */
export function countClubGames(club, season) {
  if (season !== session.activeYear) return null;
  const rows = Object.values(session.standings?.divisions ?? {}).flat();
  const row = rows.find((each) => each.id === club);
  return row ? row.w + row.l : null;
}

/**
 * The innings a starter has pitched against those he needs, or that he needs more when either
 * isn't known.
 * @param {string} subject his last name, or He
 * @param {string | null | undefined} innings as MLB writes them, like 28.1
 * @param {number | null} clubGames
 */
export function describeQualifying(subject, innings, clubGames) {
  if (innings == null || clubGames == null)
    return `${subject} hasn't pitched the innings needed to qualify`;
  return `${subject} has pitched ${formatInnings(innings)} of the ${clubGames} innings needed to qualify`;
}
