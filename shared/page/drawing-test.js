// While Diagnostics is on, settings list kinds of drawing an iPhone can fail at, each with a switch
// that leaves it out on this device, so a viewer can find which one leaves part of the page
// undrawn. A switch takes effect the next time the page opens, since changing how the page draws
// while it shows would redraw it, and a redraw alone can bring back what was undrawn. Each choice
// puts a class on the page's root, which chrome.css answers.

import { html } from "./html.js";

const KEY = "drawingTests";

/** @typedef {{ key: string, name: string, note: string }} DrawingTest */

/** @type {DrawingTest[]} */
export const DRAWING_TESTS = [
  { key: "plain", name: "Draw plainly", note: "Every kind below, left out at once" },
  { key: "no-layers", name: "No layers ahead", note: "Nothing asks for a layer before it moves" },
  { key: "no-shadows", name: "No shadows or glows", note: "Drop shadows, glows, and box shadows" },
  { key: "no-textures", name: "No textures or clipping", note: "Grain, masks, and clipped shapes" },
  { key: "no-pictures", name: "No pictures", note: "Photos and logos" },
  { key: "no-motion", name: "No motion", note: "Slides, fades, springs, and eased redraws" },
];

/** @returns {string[]} */
export function readDrawingTests() {
  try {
    const chosen = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(chosen) ? chosen.filter((key) => typeof key === "string") : [];
  } catch {
    return [];
  }
}

/** @param {string[]} chosen */
function saveDrawingTests(chosen) {
  try {
    if (chosen.length) localStorage.setItem(KEY, JSON.stringify(chosen));
    else localStorage.removeItem(KEY);
  } catch {
    /* the choice stays as it was */
  }
}

/** @param {string} key */
export function toggleDrawingTest(key) {
  const chosen = readDrawingTests();
  saveDrawingTests(
    chosen.includes(key) ? chosen.filter((other) => other !== key) : [...chosen, key],
  );
}

export function forgetDrawingTests() {
  saveDrawingTests([]);
}

/** Whether this page opened leaving out motion, as its eased redraws do too. */
export const isMotionLeftOut = () =>
  ["drawing-plain", "drawing-no-motion"].some((name) =>
    document.documentElement.classList.contains(name),
  );

/** Puts this device's choices on the page's root, as the page opens. */
export function applyDrawingTests() {
  for (const key of readDrawingTests()) document.documentElement.classList.add(`drawing-${key}`);
}

/** @param {string[]} chosen */
export const describeDrawingTests = (chosen) =>
  chosen.length ? `Drawing test: ${chosen.join(", ")}` : "";

/** @param {string[]} chosen */
export const renderDrawingTests = (chosen) =>
  html`<div class="drawing-tests">
    <h3>Drawing test</h3>
    <p class="diagnostics-empty">Each switch takes effect the next time the app opens</p>
    ${DRAWING_TESTS.map(
      ({ key, name, note }) =>
        html`<div class="control-row">
          <span class="control-label">
            <span id="drawingTest-${key}">${name}</span>
            <span class="control-note">${note}</span>
          </span>
          <button
            type="button"
            role="switch"
            class="switch"
            data-drawing-test="${key}"
            aria-checked="${String(chosen.includes(key))}"
            aria-labelledby="drawingTest-${key}"
          >
            <span class="switch-knob" aria-hidden="true"></span>
          </button>
        </div>`,
    )}
  </div>`;
