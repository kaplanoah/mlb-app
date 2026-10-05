import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeViewport,
  describeViewportShape,
  isViewportOff,
  writeViewportAsText,
} from "../shared/page/viewport-log.js";
import { normalizeSpaces } from "./text.js";
import { checkInTimeZone, EASTERN } from "./time-zone.js";

const steady = {
  screen: 874,
  layout: 812,
  visualHeight: 812,
  visualTop: 0,
  scroll: 1400,
  page: 2600,
  tabBarBottom: 790,
  sheetBottom: null,
};

test("a reading names each viewport, the page, and where the tab bar and an open sheet end", () => {
  assert.equal(
    describeViewport({ ...steady, sheetBottom: 812 }),
    "screen 874, layout 812, visual 812 from 0, page 2600, tab bar ends 790, sheet ends 812, scrolled 1400",
  );
});

test("a reading's shape leaves out how far the page is scrolled", () => {
  assert.equal(describeViewportShape(steady), describeViewportShape({ ...steady, scroll: 300 }));
  assert.notEqual(
    describeViewportShape(steady),
    describeViewportShape({ ...steady, visualTop: 110 }),
  );
});

test("a visual viewport moved or sized away from the layout one is off", () => {
  assert.equal(isViewportOff(steady), false);
  assert.equal(isViewportOff({ ...steady, visualTop: 110 }), true);
  assert.equal(isViewportOff({ ...steady, visualHeight: 702 }), true);
});

test("copied viewport lines follow a heading, each with its time and any flag", () =>
  checkInTimeZone(EASTERN, () => {
    const lines = [
      { at: Date.parse("2026-10-04T20:13:05Z"), text: "screen 874, layout 812", isOff: true },
      { at: Date.parse("2026-10-04T20:12:58Z"), text: "screen 874, layout 874", isOff: false },
    ];

    assert.equal(
      normalizeSpaces(writeViewportAsText(lines)),
      [
        "Viewport",
        "4:13:05 PM screen 874, layout 812 (off)",
        "4:12:58 PM screen 874, layout 874",
      ].join("\n"),
    );
    assert.equal(writeViewportAsText([]), "");
  }));
