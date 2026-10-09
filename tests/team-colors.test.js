import test from "node:test";
import assert from "node:assert/strict";
import { measureColorDistance, pickSideColors } from "../shared/page/team-colors.js";

const NAVY = ["#738eb1", "#ff4551"];
const BLUE = ["#528fd6", "#bd9b60"];
const RED = ["#fb4c4c", "#e4e4e4"];

test("two teams whose first colors read apart keep them", () => {
  assert.deepEqual(pickSideColors(NAVY, RED), { away: "#738eb1", home: "#fb4c4c" });
});

test("when the first colors look alike, the away team takes its other one", () => {
  assert.ok(measureColorDistance(NAVY[0], BLUE[0]) < 0.15);
  assert.deepEqual(pickSideColors(NAVY, BLUE), { away: "#ff4551", home: "#528fd6" });
});

test("only when neither of the away team's colors will do does the home team take its other one", () => {
  const nearRed = ["#ff4645", "#fb4c4c"];
  assert.deepEqual(pickSideColors(nearRed, RED), { away: "#ff4645", home: "#e4e4e4" });
});
