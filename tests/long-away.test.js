import { test } from "node:test";
import assert from "node:assert/strict";
import { isAwayLong } from "../shared/page/long-away.js";

const MINUTE_MS = 60 * 1000;

test("two minutes away or more is long enough to start over", () => {
  assert.equal(isAwayLong(2 * MINUTE_MS - 1), false);
  assert.equal(isAwayLong(2 * MINUTE_MS), true);
});
