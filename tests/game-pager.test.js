import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseStartList } from "../shared/page/game-pager.js";

test("the Games view starts on Today while today has games", () => {
  assert.equal(chooseStartList({ hasGamesToday: true, hasGamesAhead: true }), "today");
  assert.equal(chooseStartList({ hasGamesToday: true, hasGamesAhead: false }), "today");
});

test("the Games view starts on Next on a day without games, with games ahead", () => {
  assert.equal(chooseStartList({ hasGamesToday: false, hasGamesAhead: true }), "next");
});

test("the Games view starts on Today with no games today or ahead", () => {
  assert.equal(chooseStartList({ hasGamesToday: false, hasGamesAhead: false }), "today");
});

test("a season that's over starts on its results", () => {
  const games = { isSeasonOver: true, hasGamesToday: false, hasGamesAhead: false };
  assert.equal(chooseStartList(games), "previous");
});
