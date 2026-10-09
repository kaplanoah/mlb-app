// A player's number in a stat beside where it ranks, on a curve of every ranked player's number in
// it, smoothed, with the player's mark on it, as a player's sheet shows each ranked stat, or with
// several players' marks on one curve, as MLB's pitching matchup shows its two starters. A stat
// where fewer is better runs from the most to the fewest, so a better rank always sits further
// right. Each app colors the curve and the mark from its own stylesheet.

import { html } from "./html.js";
import { formatOrdinal } from "./ordinal.js";

// The curve's drawing is 100 wide and 20 tall, its peak kept CURVE_HEADROOM below the top.
const CURVE_WIDTH = 100;
const CURVE_HEIGHT = 20;
const CURVE_HEADROOM = 2;
const CURVE_POINTS = 48;

/**
 * A player's rank in a stat, among every ranked player's number in it. A player without a rank
 * has `rank` null.
 * @typedef {{ value: number | null, rank: number | null, count: number, values: number[] }} RankedStat
 */

/**
 * How wide each player's number spreads on the curve, by Silverman's rule of thumb.
 * @param {number[]} values
 */
function measureBandwidth(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return 1.06 * (Math.sqrt(variance) || 1) * values.length ** -0.2;
}

/**
 * The shape of every ranked player's numbers in a stat, smoothed, across the drawing from the
 * lowest to the highest, or the other way round when the fewest ranks first, and where a number
 * sits on it, as a share of the drawing from 0 to 100.
 * @param {number[]} values from the lowest
 * @param {boolean} isFewestFirst
 */
function drawCurve(values, isFewestFirst) {
  const low = values[0];
  const high = values.at(-1) ?? low;
  const width = measureBandwidth(values);
  /** @param {number} at */
  const measureDensity = (at) =>
    values.reduce((sum, each) => sum + Math.exp(-0.5 * ((at - each) / width) ** 2), 0);
  /** @param {number} share of the drawing's width, from 0 to 1 */
  const placeShare = (share) => (isFewestFirst ? 1 - share : share);
  const steps = Array.from({ length: CURVE_POINTS }, (_, index) => {
    const share = placeShare(index / (CURVE_POINTS - 1));
    return low + (high - low) * share;
  });
  const densities = steps.map(measureDensity);
  const tallest = Math.max(...densities);
  /** @param {number} density */
  const placeHeight = (density) =>
    CURVE_HEIGHT - (density / tallest) * (CURVE_HEIGHT - CURVE_HEADROOM);
  const line = densities
    .map(
      (density, index) =>
        `${((index / (CURVE_POINTS - 1)) * CURVE_WIDTH).toFixed(1)},${placeHeight(density).toFixed(1)}`,
    )
    .join(" L");
  return {
    area: `M0,${CURVE_HEIGHT} L${line} L${CURVE_WIDTH},${CURVE_HEIGHT} Z`,
    edge: `M${line}`,
    /** @param {number} value */
    place: (value) => ({
      left: high > low ? placeShare((value - low) / (high - low)) * 100 : 50,
      top: (placeHeight(measureDensity(value)) / CURVE_HEIGHT) * 100,
    }),
  };
}

/**
 * The shape of every ranked player's numbers in a stat, and where the player's sits on it.
 * @param {number[]} values from the lowest
 * @param {number} value the player's
 * @param {boolean} [isFewestFirst]
 */
export function drawSpread(values, value, isFewestFirst = false) {
  const { area, edge, place } = drawCurve(values, isFewestFirst);
  return { area, edge, ...place(value) };
}

/**
 * A curve of every ranked player's numbers in a stat, with a mark for each number given, any class
 * it has naming whose it is.
 * @param {number[]} values from the lowest
 * @param {{ value: number, className?: string }[]} marks
 * @param {boolean} [isFewestFirst]
 */
export function renderSpreadCurve(values, marks, isFewestFirst = false) {
  const { area, edge, place } = drawCurve(values, isFewestFirst);
  const renderMark = (/** @type {{ value: number, className?: string }} */ mark) => {
    const { left, top } = place(mark.value);
    const style = `left: ${left.toFixed(1)}%; top: ${top.toFixed(1)}%`;
    const owner = mark.className ? html` class="${mark.className}"` : "";
    return html`<i${owner} style="${style}"></i><b${owner} style="${style}"></b>`;
  };
  return html`<span class="player-curve" aria-hidden="true">
    <svg viewBox="0 0 ${CURVE_WIDTH} ${CURVE_HEIGHT}" preserveAspectRatio="none">
      <path class="player-curve-area" d="${area}"></path>
      <path class="player-curve-edge" d="${edge}"></path>
    </svg>
    ${marks.map(renderMark)}
  </span>`;
}

/**
 * @param {RankedStat} stat
 * @param {boolean} [isFewestFirst]
 */
function renderCurve(stat, isFewestFirst) {
  if (stat.rank == null || stat.value == null || !stat.values.length)
    return html`<span class="player-curve"></span>`;
  return renderSpreadCurve(stat.values, [{ value: stat.value }], isFewestFirst);
}

/** @param {RankedStat} stat */
const renderRank = (stat) =>
  html`<span class="player-rank">${stat.rank != null && html`<span class="player-rank-place">${formatOrdinal(stat.rank)}</span> of ${stat.count}`}</span>`;

/**
 * One ranked stat's row: its label, the player's number as the sheet writes it, the curve, and
 * the rank.
 * @param {{ label: string, shown: string | number, stat: RankedStat, isFewestFirst?: boolean }} row
 */
export const renderRankRow = ({ label, shown, stat, isFewestFirst = false }) =>
  html`<div class="player-rank-row">
    <span class="player-rank-label">${label}</span>
    <span class="player-rank-value tabular">${shown}</span>
    ${renderCurve(stat, isFewestFirst)}${renderRank(stat)}
  </div>`;

/**
 * A player's rank in a stat among every ranked player's number in it, counting only those strictly
 * better, so tied players share one, or none when the player isn't ranked.
 * @param {number[]} values every ranked player's
 * @param {number | null} value the player's
 * @param {{ isRanked: boolean, isFewestFirst?: boolean }} options
 * @returns {RankedStat}
 */
export function rankAmong(values, value, { isRanked, isFewestFirst = false }) {
  const sorted = [...values].sort((first, second) => first - second);
  if (!isRanked || value == null)
    return { value, rank: null, count: sorted.length, values: sorted };
  const better = sorted.filter((each) => (isFewestFirst ? each < value : each > value)).length;
  return { value, rank: better + 1, count: sorted.length, values: sorted };
}
