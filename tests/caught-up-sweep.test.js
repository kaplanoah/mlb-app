import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startCaughtUpSweep } from "../shared/page/caught-up-sweep.js";

let prefersReducedMotion = false;

beforeEach(() => {
  prefersReducedMotion = false;
  globalThis.document = /** @type {any} */ ({ hidden: false });
  globalThis.matchMedia = /** @type {any} */ (() => ({ matches: prefersReducedMotion }));
});

afterEach(() => {
  delete (/** @type {any} */ (globalThis).document);
  delete (/** @type {any} */ (globalThis).matchMedia);
});

// The header's lines, with the classes they're given and the animationend they listen for.
/** @param {string} text */
function createLines(text) {
  const classes = new Set();
  /** @type {(event: { target: unknown }) => void} */
  let onAnimationEnd = () => {};
  const lines = {
    textContent: text,
    classList: {
      add: (/** @type {string[]} */ ...names) => names.forEach((name) => classes.add(name)),
      remove: (/** @type {string[]} */ ...names) => names.forEach((name) => classes.delete(name)),
    },
    getBoundingClientRect: () => ({}),
    addEventListener: (/** @type {string} */ type, /** @type {any} */ listener) => {
      if (type === "animationend") onAnimationEnd = listener;
    },
  };
  return {
    lines,
    readClasses: () => [...classes],
    endAnimation: (/** @type {unknown} */ target = lines) => onAnimationEnd({ target }),
  };
}

// A store that starts behind, as a page's store starts, and whose catching up the test sets.
/** @param {string} text what the header's lines show as the page starts */
function startSweep(text) {
  /** @type {(isCaughtUp: boolean) => void} */
  let announce = () => {};
  const store = {
    watchCatchUp: (/** @type {(isCaughtUp: boolean) => void} */ onChange) => {
      announce = onChange;
      onChange(false);
    },
  };
  const header = createLines(text);
  startCaughtUpSweep(store, /** @type {any} */ (header.lines));
  return { ...header, announce };
}

const LAST_GAME = "Last game Liberty 84, Lynx 79 final";

test("lines that read the same once the page catches up let a band pass through them", () => {
  const header = startSweep(LAST_GAME);

  header.announce(true);

  assert.deepEqual(header.readClasses(), ["caught-up-band"]);
});

test("lines that changed as the page caught up sweep up to full strength", () => {
  const header = startSweep("NOW Liberty 78, Lynx 75");

  header.lines.textContent = LAST_GAME;
  header.announce(true);

  assert.deepEqual(header.readClasses(), ["caught-up-wipe"]);
});

test("a page coming back compares its lines with what they showed as it fell behind", () => {
  const header = startSweep(LAST_GAME);
  header.announce(true);
  header.endAnimation();

  header.announce(false);
  header.lines.textContent = `Getting the latest scores ${LAST_GAME}`;
  header.announce(false);
  header.lines.textContent = LAST_GAME;
  header.announce(true);

  assert.deepEqual(header.readClasses(), ["caught-up-band"]);
});

test("each catch-up compares with what the lines showed since the last one", () => {
  const header = startSweep("NOW Liberty 78, Lynx 75");
  header.lines.textContent = LAST_GAME;
  header.announce(true);
  header.endAnimation();

  header.announce(false);
  header.announce(true);

  assert.deepEqual(header.readClasses(), ["caught-up-band"]);
});

test("a sweep still under way starts again as the next one plays", () => {
  const header = startSweep(LAST_GAME);
  header.announce(true);

  header.announce(false);
  header.lines.textContent = "Last game Liberty 90, Lynx 79 final";
  header.announce(true);

  assert.deepEqual(header.readClasses(), ["caught-up-wipe"]);
});

test("the sweep's class goes once the sweep ends, but not when an animation inside it ends", () => {
  const header = startSweep(LAST_GAME);
  header.announce(true);

  header.endAnimation({});
  assert.deepEqual(header.readClasses(), ["caught-up-band"]);
  header.endAnimation();
  assert.deepEqual(header.readClasses(), []);
});

test("a header that showed nothing has nothing to confirm", () => {
  const header = startSweep("");

  header.lines.textContent = LAST_GAME;
  header.announce(true);

  assert.deepEqual(header.readClasses(), []);
});

test("nothing sweeps under reduced motion", () => {
  prefersReducedMotion = true;
  const header = startSweep(LAST_GAME);

  header.announce(true);

  assert.deepEqual(header.readClasses(), []);
});

test("nothing sweeps while the page is hidden", () => {
  const header = startSweep(LAST_GAME);
  globalThis.document = /** @type {any} */ ({ hidden: true });

  header.announce(true);

  assert.deepEqual(header.readClasses(), []);
});
