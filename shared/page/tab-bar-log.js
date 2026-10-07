// While Diagnostics is on, the page logs each touch, press, and click on the tab bar or where it
// rests, and anywhere on the page while it scrolls or just after, with how soon after the page last
// scrolled it came and the tab showing once it's handled, and each scroll once it comes to rest,
// since what a phone sends for a tap that stops a momentum scroll shows only on the phone. The last
// few lines stay on this device, for Diagnostics to list.

import { createLineLog, describeInput, findPoint, writeLinesAsText } from "./line-log.js";
import { isAtTabBar } from "./tab-bar.js";

// A touch this soon after the page last scrolled may have stopped its momentum.
const SCROLLING_MS = 1000;
// A scroll with no movement for this long has come to rest.
const SCROLL_REST_MS = 150;
const INPUT_TYPES = [
  "touchstart",
  "touchend",
  "touchcancel",
  "pointerdown",
  "pointerup",
  "pointercancel",
  "click",
];

const log = createLineLog("diagnosticsTabBar", 60);
let lastScrollAt = -Infinity;
let restingY = 0;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let scrollRestTimer;

export const readTabBarLines = log.readLines;
export const forgetTabBarLines = log.forgetLines;

/** @param {import("./line-log.js").LogLine[]} lines newest first */
export const writeTabBarLinesAsText = (lines) => writeLinesAsText("Tab bar", lines);

/**
 * @param {number} sinceScrollMs
 * @returns {string}
 */
export const describeSinceScroll = (sinceScrollMs) =>
  sinceScrollMs < SCROLLING_MS ? `, ${Math.round(sinceScrollMs)}ms after a scroll` : "";

const readShownTab = () =>
  document.querySelector("nav.tabs [role=tab][aria-selected=true]")?.textContent?.trim() ?? "";

/**
 * @param {number} fromY
 * @param {number} toY
 * @returns {string}
 */
export const describeScroll = (fromY, toY) =>
  `scroll from ${Math.round(fromY)} to ${Math.round(toY)}`;

/** @param {Event} event */
const isInDialog = (event) =>
  event.target instanceof Element && event.target.closest("dialog[open]") !== null;

/** @param {Event} event */
function noteInput(event) {
  const point = findPoint(event);
  if (!log.isLogging() || !point || isInDialog(event)) return;
  const sinceScrollMs = performance.now() - lastScrollAt;
  const isAtBar = isAtTabBar(event, point);
  if (!isAtBar && sinceScrollMs >= SCROLLING_MS) return;
  const where = isAtBar ? " at the tab bar" : "";
  const sinceScroll = describeSinceScroll(sinceScrollMs);
  log.noteLine(`${describeInput(event)}${where}${sinceScroll}, showing ${readShownTab()}`);
}

function noteScrollAtRest() {
  log.noteLine(describeScroll(restingY, scrollY));
  restingY = scrollY;
}

function markScroll() {
  lastScrollAt = performance.now();
  if (!log.isLogging()) {
    restingY = scrollY;
    return;
  }
  clearTimeout(scrollRestTimer);
  scrollRestTimer = setTimeout(noteScrollAtRest, SCROLL_REST_MS);
}

/**
 * Logs each touch, press, and click at the tab bar, or anywhere just after a scroll, and each
 * scroll as it comes to rest, while isLogging() says to. It listens on the window, after the bar
 * has handled each input, so each line says the tab the bar left showing.
 * @param {() => boolean} isLogging
 * @param {() => void} onLineLogged
 */
export function watchTabBar(isLogging, onLineLogged) {
  log.startLines(isLogging, onLineLogged);
  restingY = scrollY;
  addEventListener("scroll", markScroll, { passive: true });
  for (const type of INPUT_TYPES) addEventListener(type, noteInput, { passive: true });
}
