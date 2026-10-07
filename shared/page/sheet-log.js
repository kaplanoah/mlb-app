// While Diagnostics is on, the page logs what an open dialog's row of sheets does: each touch and
// click on it, each sheet a tap brings in, each slide, and each sheet it settles on or lets go of.
// The last few lines stay on this device, for Diagnostics to list.

import { formatClockTimeWithSeconds } from "./days.js";

const LINES_KEY = "diagnosticsSheets";
const KEPT_LINES = 60;

/** @typedef {{ at: number, text: string }} SheetLine */

let isOn = () => false;
let onLogged = () => {};

/** @returns {SheetLine[]} */
export function readSheetLines() {
  try {
    const lines = JSON.parse(localStorage.getItem(LINES_KEY) ?? "[]");
    return Array.isArray(lines) ? lines : [];
  } catch {
    return [];
  }
}

/** @param {SheetLine[]} lines */
function saveSheetLines(lines) {
  try {
    localStorage.setItem(LINES_KEY, JSON.stringify(lines.slice(-KEPT_LINES)));
  } catch {
    /* the line is lost, and the next step tries again */
  }
}

export function forgetSheetLines() {
  try {
    localStorage.removeItem(LINES_KEY);
  } catch {
    /* the lines stay until the next try */
  }
}

/**
 * Logs a step of the row's while Diagnostics is on.
 * @param {string} text
 */
export function noteSheetStep(text) {
  if (!isOn()) return;
  saveSheetLines([...readSheetLines(), { at: Date.now(), text }]);
  onLogged();
}

/**
 * What a touch or click landed on: the button or link it's in, by name, or else the element.
 * @param {EventTarget | null} target
 * @returns {string}
 */
function describeTarget(target) {
  if (!(target instanceof Element)) return "nothing";
  const control = target.closest("button, a");
  const name = control?.getAttribute("aria-label") || control?.textContent?.trim();
  if (name) return name;
  if (target.id) return `#${target.id}`;
  return [target.localName, ...target.classList].join(".");
}

/**
 * @param {SheetLine[]} lines newest first
 * @returns {string}
 */
export const writeSheetLinesAsText = (lines) =>
  lines.length
    ? [
        "Sheets",
        ...lines.map((line) => `${formatClockTimeWithSeconds(new Date(line.at))} ${line.text}`),
      ].join("\n")
    : "";

/**
 * @param {Event} event
 * @returns {{ clientX: number, clientY: number } | null}
 */
function findPoint(event) {
  const { changedTouches } = /** @type {Partial<TouchEvent>} */ (event);
  if (changedTouches) return changedTouches[0] ?? null;
  return /** @type {MouseEvent} */ (event);
}

/** @param {Event} event */
function noteTouchOrClick(event) {
  if (!(event.target instanceof Element) || !event.target.closest("dialog[open] .sheet-row"))
    return;
  const point = findPoint(event);
  const where = point ? ` at ${Math.round(point.clientX)},${Math.round(point.clientY)}` : "";
  noteSheetStep(`${event.type}${where} on ${describeTarget(event.target)}`);
}

/**
 * Logs the steps of every dialog's row, and each touch and click on an open one, while isOn() says
 * to.
 * @param {() => boolean} isLogging
 * @param {() => void} onLineLogged
 */
export function watchSheets(isLogging, onLineLogged) {
  isOn = isLogging;
  onLogged = onLineLogged;
  for (const type of ["touchstart", "touchend", "click"])
    document.addEventListener(type, noteTouchOrClick, { capture: true, passive: true });
}
