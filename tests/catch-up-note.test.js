import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import {
  OFFLINE_TEXT,
  renderCatchUpLines,
  startCatchUpNote,
  UPDATING_TEXT,
} from "../shared/page/catch-up-note.js";
import { html } from "../shared/page/html.js";

const NOTE_WAIT_MS = 2000;
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

/** @type {Record<string, () => void>} */
let windowListeners = {};

beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout"] });
  windowListeners = {};
  globalThis.addEventListener = /** @type {any} */ (
    (type, listener) => (windowListeners[type] = listener)
  );
  setOnline(true);
});

afterEach(() => {
  mock.timers.reset();
  delete (/** @type {any} */ (globalThis).addEventListener);
  if (realNavigator) Object.defineProperty(globalThis, "navigator", realNavigator);
});

/** @param {boolean} isOnline */
function setOnline(isOnline) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: isOnline },
  });
}

// A store whose catching up the test sets, starting behind, as a page's store starts.
function startNote() {
  /** @type {(isCaughtUp: boolean) => void} */
  let announce = () => {};
  const store = {
    watchCatchUp: (/** @type {(isCaughtUp: boolean) => void} */ onChange) => {
      announce = onChange;
      onChange(false);
    },
  };
  let redraws = 0;
  startCatchUpNote(store, () => (redraws += 1));
  return { announce: (isCaughtUp) => announce(isCaughtUp), countRedraws: () => redraws };
}

const readLines = () => renderCatchUpLines().map((line) => line.text);
const renderLine = (text) => html`<span>${text}</span>`.text;

test("a page still catching up says it's updating once that has lasted long enough to notice", () => {
  const { countRedraws } = startNote();
  mock.timers.tick(NOTE_WAIT_MS - 1);
  assert.deepEqual(readLines(), []);
  assert.equal(countRedraws(), 0);

  mock.timers.tick(1);

  assert.deepEqual(readLines(), [renderLine(UPDATING_TEXT)]);
  assert.equal(countRedraws(), 1);
});

test("a page that catches up drops the line", () => {
  const { announce, countRedraws } = startNote();
  mock.timers.tick(NOTE_WAIT_MS);

  announce(true);

  assert.deepEqual(readLines(), []);
  assert.equal(countRedraws(), 2);
});

test("a page that catches up in time never shows the line", () => {
  const { announce, countRedraws } = startNote();
  announce(true);

  mock.timers.tick(NOTE_WAIT_MS);

  assert.deepEqual(readLines(), []);
  assert.equal(countRedraws(), 0);
});

test("a page coming back waits again before saying it's updating", () => {
  const { announce } = startNote();
  mock.timers.tick(NOTE_WAIT_MS);

  announce(false);

  assert.deepEqual(readLines(), []);
  mock.timers.tick(NOTE_WAIT_MS);
  assert.deepEqual(readLines(), [renderLine(UPDATING_TEXT)]);
});

test("an offline page still catching up says so at once", () => {
  setOnline(false);
  startNote();

  assert.deepEqual(readLines(), [renderLine(OFFLINE_TEXT)]);
});

test("a page that goes offline while catching up says so as it does", () => {
  const { countRedraws } = startNote();

  setOnline(false);
  windowListeners.offline();

  assert.deepEqual(readLines(), [renderLine(OFFLINE_TEXT)]);
  assert.equal(countRedraws(), 1);
});
