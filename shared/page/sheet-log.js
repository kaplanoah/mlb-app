// While Diagnostics is on, the page logs what an open dialog's row of sheets does: each touch and
// click on it, each sheet a tap brings in, where the row is asked to scroll and where it then is on
// each frame, and each sheet it settles on or lets go of. The last few lines stay on this device,
// for Diagnostics to list.

import { createLineLog, describeInput, writeLinesAsText } from "./line-log.js";

// How long the row is followed, frame by frame, after it's asked to scroll.
const TRACKED_MS = 1500;

const log = createLineLog("diagnosticsSheets", 60);

export const readSheetLines = log.readLines;
export const forgetSheetLines = log.forgetLines;
/** Logs a step of the row's while Diagnostics is on. */
export const noteSheetStep = log.noteLine;

/**
 * Where the row was on each frame, a run of frames in one place written once with its count.
 * @param {number[]} lefts
 * @returns {string}
 */
export function describeLefts(lefts) {
  /** @type {{ left: number, frames: number }[]} */
  const runs = [];
  for (const left of lefts) {
    const last = runs.at(-1);
    if (last?.left === left) last.frames += 1;
    else runs.push({ left, frames: 1 });
  }
  return runs
    .map(({ left, frames }) => (frames > 1 ? `${left} x${frames}` : String(left)))
    .join(", ");
}

/**
 * Notes where the row is on each frame for a moment, in one line once the moment has passed.
 * @param {HTMLElement} row
 */
export function trackRow(row) {
  if (!log.isLogging()) return;
  /** @type {number[]} */
  const lefts = [];
  const startedAt = performance.now();
  const noteFrame = () => {
    lefts.push(Math.round(row.scrollLeft));
    if (performance.now() - startedAt < TRACKED_MS) requestAnimationFrame(noteFrame);
    else noteSheetStep(`row by frame: ${describeLefts(lefts)}`);
  };
  requestAnimationFrame(noteFrame);
}

/** @param {import("./line-log.js").LogLine[]} lines newest first */
export const writeSheetLinesAsText = (lines) => writeLinesAsText("Sheets", lines);

/** @param {Event} event */
function noteTouchOrClick(event) {
  if (!(event.target instanceof Element) || !event.target.closest("dialog[open] .sheet-row"))
    return;
  noteSheetStep(describeInput(event));
}

/**
 * Logs the steps of every dialog's row, and each touch and click on an open one, while isOn() says
 * to.
 * @param {() => boolean} isLogging
 * @param {() => void} onLineLogged
 */
export function watchSheets(isLogging, onLineLogged) {
  log.startLines(isLogging, onLineLogged);
  for (const type of ["touchstart", "touchend", "click"])
    document.addEventListener(type, noteTouchOrClick, { capture: true, passive: true });
}
