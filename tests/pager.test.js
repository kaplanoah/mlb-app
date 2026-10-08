import { test } from "node:test";
import assert from "node:assert/strict";
import { findSwipeTarget } from "../shared/page/pager.js";

test("a swipe heads for the list past where the finger lifted, in the way the lists then move", () => {
  assert.equal(findSwipeTarget(1.3, 1.31, 2), 2);
  assert.equal(findSwipeTarget(1.3, 1.29, 2), 1);
  assert.equal(findSwipeTarget(0.8, 0.82, 2), 1);
  assert.equal(findSwipeTarget(0.8, 0.79, 2), 0);
});

test("a swipe lifted on a list heads for the next one only once the lists move past it", () => {
  assert.equal(findSwipeTarget(1, 1.01, 2), 1);
  assert.equal(findSwipeTarget(1, 0.99, 2), 1);
});

test("a swipe has no target until the lists move, and none past the first or last list", () => {
  assert.equal(findSwipeTarget(1.3, 1.3, 2), null);
  assert.equal(findSwipeTarget(2.1, 2.05, 2), 2);
  assert.equal(findSwipeTarget(-0.1, -0.05, 2), 0);
});
