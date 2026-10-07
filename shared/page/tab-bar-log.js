// While Diagnostics is on, the page logs each touch, press, and click on the tab bar or where it
// rests, with how soon after the page last scrolled it came and the tab showing once it's handled,
// since what a phone sends for a tap that stops a momentum scroll shows only on the phone. The last
// few lines stay on this device, for Diagnostics to list.

import { createLineLog, describeInput, findPoint, writeLinesAsText } from "./line-log.js";
import { isAtTabBar } from "./tab-bar.js";

// A touch this soon after the page last scrolled may have stopped its momentum.
const SCROLLING_MS = 1000;
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

/** @param {Event} event */
function noteInput(event) {
  const point = findPoint(event);
  if (!log.isLogging() || !point || !isAtTabBar(event, point)) return;
  const sinceScroll = describeSinceScroll(performance.now() - lastScrollAt);
  log.noteLine(`${describeInput(event)}${sinceScroll}, showing ${readShownTab()}`);
}

function markScroll() {
  lastScrollAt = performance.now();
}

/**
 * Logs each touch, press, and click at the tab bar while isLogging() says to. It listens on the
 * window, after the bar has handled each, so each line says the tab the bar left showing.
 * @param {() => boolean} isLogging
 * @param {() => void} onLineLogged
 */
export function watchTabBar(isLogging, onLineLogged) {
  log.startLines(isLogging, onLineLogged);
  addEventListener("scroll", markScroll, { passive: true });
  for (const type of INPUT_TYPES) addEventListener(type, noteInput, { passive: true });
}
