import { html } from "./html.js";

// The page shows what it last drew, and keeps what it has while it's away, so until the store has
// answered it can look current when it isn't. A line on the header says so once that has lasted
// long enough to notice, and at once when the phone is offline.

const NOTE_WAIT_MS = 2000;
export const UPDATING_TEXT = "Updating...";
export const OFFLINE_TEXT = "You're offline. Scores may be out of date.";

let isBehind = false;
let hasWaited = false;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let noteTimer;

function describeCatchUp() {
  if (!isBehind) return "";
  if (navigator.onLine === false) return OFFLINE_TEXT;
  return hasWaited ? UPDATING_TEXT : "";
}

/**
 * Redraws with `redraw` each time the note changes.
 * @param {{ watchCatchUp: (onChange: (isCaughtUp: boolean) => void) => void }} store
 * @param {() => void} redraw
 */
export function startCatchUpNote(store, redraw) {
  clearTimeout(noteTimer);
  isBehind = false;
  hasWaited = false;
  let shownText = "";
  const redrawIfChanged = () => {
    const text = describeCatchUp();
    if (text === shownText) return;
    shownText = text;
    redraw();
  };
  store.watchCatchUp((isCaughtUp) => {
    clearTimeout(noteTimer);
    isBehind = !isCaughtUp;
    hasWaited = false;
    if (isBehind)
      noteTimer = setTimeout(() => {
        hasWaited = true;
        redrawIfChanged();
      }, NOTE_WAIT_MS);
    redrawIfChanged();
  });
  addEventListener("online", redrawIfChanged);
  addEventListener("offline", redrawIfChanged);
}

/**
 * The header's line on the page still catching up, if it has one.
 * @returns {import("./html.js").Markup[]}
 */
export function renderCatchUpLines() {
  const text = describeCatchUp();
  return text ? [html`<span>${text}</span>`] : [];
}
