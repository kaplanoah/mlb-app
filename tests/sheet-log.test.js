import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeLefts,
  noteSheetStep,
  readSheetLines,
  watchSheets,
  writeSheetLinesAsText,
} from "../shared/page/sheet-log.js";
import { normalizeSpaces } from "./text.js";
import { checkInTimeZone, EASTERN } from "./time-zone.js";

/** @type {Map<string, string>} */
const stored = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (/** @type {string} */ key) => stored.get(key) ?? null,
  setItem: (/** @type {string} */ key, /** @type {string} */ value) => stored.set(key, value),
  removeItem: (/** @type {string} */ key) => stored.delete(key),
});
globalThis.document = /** @type {any} */ ({ addEventListener() {} });

test("a step is logged only while Diagnostics is on", () => {
  let isOn = false;
  let logged = 0;
  watchSheets(
    () => isOn,
    () => (logged += 1),
  );

  noteSheetStep("open teamSheet over gameSheet");
  assert.deepEqual(readSheetLines(), []);
  isOn = true;
  noteSheetStep("open teamSheet over gameSheet");
  assert.deepEqual(
    readSheetLines().map((line) => line.text),
    ["open teamSheet over gameSheet"],
  );
  assert.equal(logged, 1);
});

test("where the row was on each frame writes each run of frames in one place once, with its count", () =>
  assert.equal(describeLefts([0, 0, 0, 120, 300, 390, 390]), "0 x3, 120, 300, 390 x2"));

test("copied sheet lines follow a heading, each with its time", () =>
  checkInTimeZone(EASTERN, () =>
    assert.equal(
      normalizeSpaces(
        writeSheetLinesAsText([
          { at: Date.parse("2026-10-06T16:05:09Z"), text: "settle on gameSheet" },
        ]),
      ),
      "Sheets\n12:05:09 PM settle on gameSheet",
    ),
  ));
