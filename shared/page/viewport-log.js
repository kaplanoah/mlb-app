// While Diagnostics is on, the page logs each change to the screen's viewports as the viewer
// scrolls and turns the phone: the screen, the layout viewport that the tab bar and sheets are held
// to, the visual viewport the viewer sees, and where the tab bar and an open sheet end. A visual
// viewport out of line with the layout one is flagged, since then whatever is held to the bottom of
// the screen shows away from it. The last few changes stay on this device, for Diagnostics to list.

import { formatClockTimeWithSeconds } from "./days.js";

const LINES_KEY = "diagnosticsViewport";
const KEPT_LINES = 40;

/**
 * @typedef {{
 *   screen: number,
 *   layout: number,
 *   visualHeight: number,
 *   visualTop: number,
 *   scroll: number,
 *   page: number,
 *   tabBarBottom: number | null,
 *   sheetBottom: number | null,
 * }} ViewportReading
 */
/** @typedef {{ at: number, text: string, isOff: boolean }} ViewportLine */

let lastShape = "";
let isReadingQueued = false;

/** @returns {ViewportLine[]} */
export function readViewportLines() {
  try {
    const lines = JSON.parse(localStorage.getItem(LINES_KEY) ?? "[]");
    return Array.isArray(lines) ? lines : [];
  } catch {
    return [];
  }
}

/** @param {ViewportLine[]} lines */
function saveViewportLines(lines) {
  try {
    localStorage.setItem(LINES_KEY, JSON.stringify(lines.slice(-KEPT_LINES)));
  } catch {
    /* the line is lost, and the next change tries again */
  }
}

export function forgetViewportLines() {
  lastShape = "";
  try {
    localStorage.removeItem(LINES_KEY);
  } catch {
    /* the lines stay until the next try */
  }
}

/** @param {Element | null} element */
const readBottom = (element) =>
  element ? Math.round(element.getBoundingClientRect().bottom) : null;

/** @returns {ViewportReading} */
function readViewport() {
  const openDialogs = document.querySelectorAll("dialog[open]");
  return {
    screen: screen.height,
    layout: innerHeight,
    visualHeight: Math.round(visualViewport?.height ?? innerHeight),
    visualTop: Math.round(visualViewport?.offsetTop ?? 0),
    scroll: Math.round(scrollY),
    page: document.documentElement.scrollHeight,
    tabBarBottom: readBottom(document.getElementById("tabBar")),
    sheetBottom: readBottom(openDialogs[openDialogs.length - 1] ?? null),
  };
}

/**
 * Everything in a reading but how far the page is scrolled, which changes with every scroll.
 * @param {ViewportReading} reading
 * @returns {string}
 */
export function describeViewportShape(reading) {
  const ends = [
    reading.tabBarBottom !== null && `tab bar ends ${reading.tabBarBottom}`,
    reading.sheetBottom !== null && `sheet ends ${reading.sheetBottom}`,
  ].filter(Boolean);
  return [
    `screen ${reading.screen}`,
    `layout ${reading.layout}`,
    `visual ${reading.visualHeight} from ${reading.visualTop}`,
    `page ${reading.page}`,
    ...ends,
  ].join(", ");
}

/**
 * @param {ViewportReading} reading
 * @returns {string}
 */
export const describeViewport = (reading) =>
  `${describeViewportShape(reading)}, scrolled ${reading.scroll}`;

/**
 * @param {ViewportReading} reading
 * @returns {boolean}
 */
export const isViewportOff = (reading) =>
  reading.visualTop !== 0 || reading.visualHeight !== reading.layout;

/**
 * @param {ViewportLine[]} lines newest first
 * @returns {string}
 */
export const writeViewportAsText = (lines) =>
  lines.length
    ? [
        "Viewport",
        ...lines.map(
          (line) =>
            `${formatClockTimeWithSeconds(new Date(line.at))} ${line.text}${line.isOff ? " (off)" : ""}`,
        ),
      ].join("\n")
    : "";

/** @param {() => void} onLogged */
function logChangedViewport(onLogged) {
  isReadingQueued = false;
  const reading = readViewport();
  const shape = describeViewportShape(reading);
  if (shape === lastShape) return;
  lastShape = shape;
  const line = { at: Date.now(), text: describeViewport(reading), isOff: isViewportOff(reading) };
  saveViewportLines([...readViewportLines(), line]);
  onLogged();
}

/**
 * Logs the viewport now and on each change to it, at most once a frame, while isOn() says to.
 * @param {() => boolean} isOn
 * @param {() => void} onLogged
 */
export function watchViewport(isOn, onLogged) {
  const queueReading = () => {
    if (isReadingQueued || !isOn()) return;
    isReadingQueued = true;
    requestAnimationFrame(() => logChangedViewport(onLogged));
  };
  addEventListener("scroll", queueReading, { passive: true });
  visualViewport?.addEventListener("scroll", queueReading);
  visualViewport?.addEventListener("resize", queueReading);
  document.addEventListener("toggle", queueReading, true);
  queueReading();
}
