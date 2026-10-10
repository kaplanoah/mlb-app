import test from "node:test";
import assert from "node:assert/strict";
import {
  drawSpread,
  placeOnRange,
  rankAmong,
  renderPlacedRow,
  renderRankRow,
} from "../shared/page/rank-curve.js";

test("the curve spreads across from the lowest number to the highest, its peak at the top, with the player's mark on it", () => {
  const { area, edge, left, top } = drawSpread([10, 10, 10, 20], 20);
  assert.match(area, /^M0,20 L0\.0,2\.0 .* L100,20 Z$/);
  assert.match(edge, /^M0\.0,2\.0 /);
  assert.equal(left, 100);
  assert.ok(top > 10 && top < 100);
  assert.equal(drawSpread([5], 5).left, 50);
});

test("a fewest-first curve runs from the most to the fewest, so the mark sits further right the fewer", () => {
  const values = [0.5, 1.2, 2.6, 4];
  const most = drawSpread(values, 2.6);
  const fewest = drawSpread(values, 2.6, true);
  assert.equal(fewest.left.toFixed(1), (100 - most.left).toFixed(1));
  assert.equal(fewest.top.toFixed(3), most.top.toFixed(3));
  assert.ok(drawSpread(values, 0.5, true).left > drawSpread(values, 4, true).left);
  assert.equal(fewest.edge.split(" L").length, most.edge.split(" L").length);
  assert.notEqual(fewest.edge, most.edge);
});

test("a rank counts only the players strictly better, so tied players share one, and the fewest can rank first", () => {
  const values = [0.25, 0.3, 0.3, 0.28];
  assert.deepEqual(rankAmong(values, 0.3, { isRanked: true }), {
    value: 0.3,
    rank: 1,
    count: 4,
    values: [0.25, 0.28, 0.3, 0.3],
  });
  assert.equal(rankAmong(values, 0.28, { isRanked: true }).rank, 3);
  assert.equal(rankAmong(values, 0.25, { isRanked: true, isFewestFirst: true }).rank, 1);
  assert.equal(rankAmong(values, 0.29, { isRanked: false }).rank, null);
});

test("a row shows the label, the number as written, the curve, and the rank, or no curve or rank for an unranked player", () => {
  const ranked = String(
    renderRankRow({
      label: "AVG",
      shown: ".282",
      stat: rankAmong([0.25, 0.282], 0.282, { isRanked: true }),
    }),
  );
  assert.match(ranked, /player-rank-label">AVG</);
  assert.match(ranked, /player-rank-value tabular">\.282</);
  assert.match(ranked, /<svg/);
  assert.match(ranked, /player-rank-place">1st<\/span> of 2/);
  const unranked = String(
    renderRankRow({
      label: "AVG",
      shown: ".300",
      stat: rankAmong([0.25], 0.3, { isRanked: false }),
    }),
  );
  assert.doesNotMatch(unranked, /<svg|player-rank-place/);
});

test("a number's place on a range is its share of it, the fewest on the right when fewer ranks first, held at either end, and nowhere without a range", () => {
  assert.equal(placeOnRange(85, [80, 100]), 25);
  assert.equal(placeOnRange(85, [80, 100], true), 75);
  assert.equal(placeOnRange(120, [80, 100]), 100);
  assert.equal(placeOnRange(70, [80, 100]), 0);
  assert.equal(placeOnRange(2 / 3, [0, 1]), 66.7);
  assert.equal(placeOnRange(null, [80, 100]), null);
  assert.equal(placeOnRange(85, null), null);
  assert.equal(placeOnRange(85, [90, 90]), null);
});

test("a placed row shows the label, the number, a line with the other's dot under its own, and the other number, leaving out a dot with no place", () => {
  const row = String(
    renderPlacedRow({
      label: "PPG",
      own: { shown: "89.5", at: 62.1 },
      other: { shown: "86.5", at: 44.4 },
    }),
  );
  assert.match(row, /player-rank-label">PPG</);
  assert.match(row, /player-rank-value tabular">89\.5</);
  assert.match(
    row,
    /<span class="placed-line" aria-hidden="true"><span><i class="other" style="left: 44\.4%"><\/i><i class="own" style="left: 62\.1%"><\/i><\/span><\/span>/,
  );
  assert.match(row, /placed-other tabular">86\.5</);
  const unplaced = String(
    renderPlacedRow({
      label: "Road",
      own: { shown: "0-0", at: null },
      other: { shown: "1-5", at: 16.7 },
    }),
  );
  assert.doesNotMatch(unplaced, /class="own"/);
  assert.match(unplaced, /class="other"/);
});
