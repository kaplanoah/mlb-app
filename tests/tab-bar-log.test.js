import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeScroll,
  describeSinceScroll,
  writeTabBarLinesAsText,
} from "../shared/page/tab-bar-log.js";
import { normalizeSpaces } from "./text.js";
import { checkInTimeZone, EASTERN } from "./time-zone.js";

test("a touch soon after a scroll says how soon, and one long after says nothing of it", () => {
  assert.equal(describeSinceScroll(84.4), ", 84ms after a scroll");
  assert.equal(describeSinceScroll(2500), "");
  assert.equal(describeSinceScroll(Infinity), "");
});

test("copied tab bar lines follow a heading, each with its time", () =>
  checkInTimeZone(EASTERN, () =>
    assert.equal(
      normalizeSpaces(
        writeTabBarLinesAsText([
          {
            at: Date.parse("2026-10-07T16:05:09Z"),
            text: "pointerup at 210,790 on Standings, showing Standings",
          },
        ]),
      ),
      "Tab bar\n12:05:09 PM pointerup at 210,790 on Standings, showing Standings",
    ),
  ));

test("nothing logged copies as nothing", () => assert.equal(writeTabBarLinesAsText([]), ""));

test("a scroll at rest says where it started and where it came to rest", () =>
  assert.equal(describeScroll(0, 1840.5), "scroll from 0 to 1841"));
