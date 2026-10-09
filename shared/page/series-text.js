// How a playoff game reads in every league's Updates box and notifications: its result, then
// where its series stands. A notification breaks its title from its body at a spaced dash, so
// the comma keeps the game and its series in one title.

import { html } from "./html.js";

/**
 * @param {number} own the wins of the side the sentence is about
 * @param {number} theirs its opponent's
 */
export const describeSeriesStanding = (own, theirs) =>
  own > theirs ? "lead" : own === theirs ? "tie" : "trail";

/**
 * A series' wins, which the Updates box keeps on one line.
 * @param {number} own
 * @param {number} theirs
 */
export const renderSeriesWins = (own, theirs) =>
  html`<span class="series-score">${own}&ndash;${theirs}</span>`;

/**
 * A game that leaves its series going. `result` is the game as the league words it, and `own`
 * and `theirs` each side's wins through it.
 * @param {{ result: unknown, number: number, series: string, own: number, theirs: number }} game
 */
export function describeSeriesGame({ result, number, series, own, theirs }) {
  const standing = describeSeriesStanding(own, theirs);
  return html`${result} in Game&nbsp;${number}, ${standing} the ${series} ${renderSeriesWins(own, theirs)}`;
}

/**
 * A game that wins its series.
 * @param {{ result: unknown, series: string, own: number, theirs: number }} game
 */
export const describeSeriesWin = ({ result, series, own, theirs }) =>
  html`${result} to win the ${series} ${renderSeriesWins(own, theirs)}`;
