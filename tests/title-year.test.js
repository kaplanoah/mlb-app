import test from "node:test";
import assert from "node:assert/strict";
import { chooseTitleYear } from "../shared/page/title-year.js";

test("a season being played leaves the title without a year", () => {
  assert.equal(chooseTitleYear({ shownYear: 2026, currentYear: 2026, isSeasonOver: false }), null);
});

test("an earlier season puts its year in the title", () => {
  assert.equal(chooseTitleYear({ shownYear: 2025, currentYear: 2026, isSeasonOver: true }), 2025);
});

test("the current season puts its year in the title once its last game is final", () => {
  assert.equal(chooseTitleYear({ shownYear: 2026, currentYear: 2026, isSeasonOver: true }), 2026);
});

test("before the store says which season is current, only a finished season shows its year", () => {
  assert.equal(chooseTitleYear({ shownYear: 2026, currentYear: null, isSeasonOver: false }), null);
  assert.equal(chooseTitleYear({ shownYear: 2026, currentYear: null, isSeasonOver: true }), 2026);
});
