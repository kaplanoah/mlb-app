// A Diagnostics log of timed lines: while Diagnostics is on, each line is kept on this device, the
// last few of them, for Diagnostics to list and copy.

import { formatClockTimeWithSeconds } from "./days.js";

/** @typedef {{ at: number, text: string }} LogLine */

/**
 * @param {string} key the storage key its lines are kept under
 * @param {number} keptLines how many of the latest lines it keeps
 */
export function createLineLog(key, keptLines) {
  let isOn = () => false;
  let onLogged = () => {};

  /** @returns {LogLine[]} */
  function readLines() {
    try {
      const lines = JSON.parse(localStorage.getItem(key) ?? "[]");
      return Array.isArray(lines) ? lines : [];
    } catch {
      return [];
    }
  }

  /** @param {LogLine[]} lines */
  function saveLines(lines) {
    try {
      localStorage.setItem(key, JSON.stringify(lines.slice(-keptLines)));
    } catch {
      /* the line is lost, and the next one tries again */
    }
  }

  function forgetLines() {
    try {
      localStorage.removeItem(key);
    } catch {
      /* the lines stay until the next try */
    }
  }

  /** @param {string} text */
  function noteLine(text) {
    if (!isOn()) return;
    saveLines([...readLines(), { at: Date.now(), text }]);
    onLogged();
  }

  /**
   * @param {() => boolean} isLogging
   * @param {() => void} onLineLogged
   */
  function startLines(isLogging, onLineLogged) {
    isOn = isLogging;
    onLogged = onLineLogged;
  }

  return { readLines, forgetLines, noteLine, startLines, isLogging: () => isOn() };
}

/**
 * @param {string} heading
 * @param {LogLine[]} lines newest first
 * @returns {string}
 */
export const writeLinesAsText = (heading, lines) =>
  lines.length
    ? [
        heading,
        ...lines.map((line) => `${formatClockTimeWithSeconds(new Date(line.at))} ${line.text}`),
      ].join("\n")
    : "";

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
 * @param {Event} event
 * @returns {{ clientX: number, clientY: number } | null}
 */
export function findPoint(event) {
  const { changedTouches } = /** @type {Partial<TouchEvent>} */ (event);
  if (changedTouches) return changedTouches[0] ?? null;
  return /** @type {MouseEvent} */ (event);
}

/**
 * A touch, press, or click as a log line: what it was, where, and what it landed on.
 * @param {Event} event
 * @returns {string}
 */
export function describeInput(event) {
  const point = findPoint(event);
  const where = point ? ` at ${Math.round(point.clientX)},${Math.round(point.clientY)}` : "";
  return `${event.type}${where} on ${describeTarget(event.target)}`;
}
