import test from "node:test";
import assert from "node:assert/strict";
import { keepRecentOpens } from "../page/js/opened-stories.js";

const NOW = Date.parse("2026-10-05T16:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

test("a device keeps each story it opened for two weeks, then forgets it", () => {
  const opened = {
    "https://example.com/today": NOW - DAY_MS,
    "https://example.com/last-week": NOW - 13 * DAY_MS,
    "https://example.com/old": NOW - 14 * DAY_MS,
    "https://example.com/unreadable": /** @type {any} */ ("yesterday"),
  };

  assert.deepEqual(keepRecentOpens(opened, NOW), {
    "https://example.com/today": NOW - DAY_MS,
    "https://example.com/last-week": NOW - 13 * DAY_MS,
  });
});
