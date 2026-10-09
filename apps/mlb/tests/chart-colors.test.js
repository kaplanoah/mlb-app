import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TEAMS } from "../page/js/teams.js";
import { readOklab } from "../../../shared/page/team-colors.js";

const STYLES = readFileSync(`${import.meta.dirname}/../page/styles.css`, "utf8");
// What a number in a club's color needs to read, as WCAG asks of text its size, and how far past it
// a color made lighter may go.
const SMALLEST_CONTRAST = 4.5;
const CONTRAST_ROOM = 0.1;
// How far apart two hues may be and still read as the same color.
const SAME_HUE_DEGREES = 3;
const BLACK_STAND_IN = "#e4e4e4";
const LEADS_WITH_OTHER = ["CWS", "PIT", "SD"];

/** @param {string} token */
const readRootToken = (token) => STYLES.match(new RegExp(`${token}: (#[0-9a-f]{6});`))[1];

/** @param {string} hex */
function measureLuminance(hex) {
  const [red, green, blue] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/**
 * @param {string} first
 * @param {string} second
 */
function measureContrast(first, second) {
  const [lighter, darker] = [measureLuminance(first), measureLuminance(second)].sort(
    (one, other) => other - one,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

/** @param {string} hex */
function readHue(hex) {
  const [, greenRed, blueYellow] = readOklab(hex);
  return (Math.atan2(blueYellow, greenRed) * 180) / Math.PI;
}

/**
 * @param {string} first
 * @param {string} second
 */
function measureHueGap(first, second) {
  const gap = Math.abs(readHue(first) - readHue(second)) % 360;
  return Math.min(gap, 360 - gap);
}

/** @param {string} hex */
const isNearBlack = (hex) => measureLuminance(hex) < 0.02;

test("every club's two chart colors read as text on the sheet and the page", () => {
  const surfaces = [readRootToken("--card"), readRootToken("--bg")];
  for (const [code, club] of Object.entries(TEAMS)) {
    for (const color of club.chartColors)
      for (const surface of surfaces) {
        const contrast = measureContrast(color, surface);
        assert.ok(
          contrast >= SMALLEST_CONTRAST,
          `${code}'s ${color} on ${surface} is ${contrast.toFixed(2)} to 1`,
        );
      }
  }
});

test("each chart color is one of the club's own colors, or its hue made only as light as reading needs, or light gray for black", () => {
  const surface = readRootToken("--card");
  for (const [code, club] of Object.entries(TEAMS)) {
    const own = [club.color, club.color2];
    for (const color of club.chartColors) {
      if (own.some((hex) => hex.toLowerCase() === color)) continue;
      if (color === BLACK_STAND_IN) {
        assert.ok(own.some(isNearBlack), `${code} has no black for ${color} to stand in for`);
        continue;
      }
      assert.ok(
        own.some((hex) => measureHueGap(hex, color) <= SAME_HUE_DEGREES),
        `${code}'s ${color} keeps neither ${club.color}'s hue nor ${club.color2}'s`,
      );
      const contrast = measureContrast(color, surface);
      assert.ok(
        contrast <= SMALLEST_CONTRAST + CONTRAST_ROOM,
        `${code}'s ${color} goes past what reading needs, at ${contrast.toFixed(2)} to 1`,
      );
    }
  }
});

test("each club leads with its dot's first color, but for those whose first is black or near it", () => {
  /** @param {string} own @param {string} chart */
  const isFrom = (own, chart) =>
    own.toLowerCase() === chart || measureHueGap(own, chart) <= SAME_HUE_DEGREES;
  for (const [code, club] of Object.entries(TEAMS)) {
    const [first, other] = club.chartColors;
    if (LEADS_WITH_OTHER.includes(code)) {
      assert.ok(isNearBlack(club.color), `${code}'s first color isn't black`);
      assert.ok(isFrom(club.color2, first), `${code} doesn't lead with ${club.color2}`);
    } else
      assert.ok(
        isFrom(club.color, first) || (isNearBlack(club.color) && first === BLACK_STAND_IN),
        `${code} doesn't lead with ${club.color}`,
      );
    assert.notEqual(first, other, `${code}'s two chart colors are the same`);
  }
});
