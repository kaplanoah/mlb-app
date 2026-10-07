// A page that loads again, after a deploy or after the phone dropped it, would show empty views
// until the store answers, so it first draws what it showed when it was last on screen: the
// markup of each part it draws whole and the sheets it showed, which show-last-drawn.js puts back
// before the first paint, with the pictures from other sites in it, which the service worker
// keeps, and the season, which the page draws from once its modules load, before its sheets take
// back what they showed.

import { keepImages } from "./service-worker.js";
import { listOpenSheets, reopenSheets } from "./sheet-reopen.js";

const LAST_SEEN_KEY = "lastSeen";
const LAST_DRAWN_KEY = "lastDrawn";
const OPEN_SHEETS_KEY = "openSheets";
// Another site's picture can count as several megabytes toward the storage the page's copy needs,
// so only the first ones, which a load opens on, are kept.
const KEPT_IMAGE_COUNT = 12;

// Storage can be empty or refuse access, as in a private window, so the page never depends on it.

/**
 * @param {string} key
 * @returns {any}
 */
function readItem(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

export const readLastSeen = () => readItem(LAST_SEEN_KEY);

/** Has the sheets the page showed when it was last on screen show again what they showed. */
export const reopenLastSheets = () => reopenSheets(readItem(OPEN_SHEETS_KEY));

/**
 * The child indexes that lead from `part` down to `element`.
 * @param {Element} part
 * @param {Element} element
 */
function readPath(part, element) {
  const path = [];
  for (let node = element; node !== part; node = /** @type {Element} */ (node.parentElement))
    path.unshift([.../** @type {Element} */ (node.parentElement).children].indexOf(node));
  return path;
}

// A list or bracket that scrolls sideways shows where it was, rather than its start.
/** @param {Element} part */
const readScrolls = (part) =>
  [...part.querySelectorAll("*")]
    .filter((element) => element.scrollLeft > 0)
    .map((element) => ({ path: readPath(part, element), left: element.scrollLeft }));

// A part's classes and colors can come from its code rather than its markup, like a pager's
// classes and a game sheet's teams' colors.
/** @param {HTMLElement} part */
const readDrawnPart = (part) => ({
  markup: part.innerHTML,
  hidden: part.hidden,
  classes: part.className,
  style: part.getAttribute("style"),
  scrolls: readScrolls(part),
});

function readDrawnParts() {
  const parts = /** @type {HTMLElement[]} */ ([...document.querySelectorAll("[data-last-drawn]")]);
  return Object.fromEntries(parts.map((part) => [part.id, readDrawnPart(part)]));
}

/** @param {HTMLImageElement} image */
function isShownOtherSiteImage(image) {
  const url = new URL(image.src);
  const isOtherSite = /^https?:$/.test(url.protocol) && url.origin !== location.origin;
  return isOtherSite && image.complete && image.naturalWidth > 0;
}

// A picture still waiting to be scrolled to was never shown, so it isn't kept.
function listDrawnImages() {
  const images = /** @type {HTMLImageElement[]} */ ([
    ...document.querySelectorAll("[data-last-drawn] img[src]"),
  ]);
  const urls = images.filter(isShownOtherSiteImage).map((image) => image.src);
  return [...new Set(urls)].slice(0, KEPT_IMAGE_COUNT);
}

/**
 * @param {string} key
 * @param {unknown} value
 */
function saveItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* the next load waits for the store instead */
  }
}

/** @param {() => any} readShown what the page shows, or null before it has anything to show */
function saveLastSeen(readShown) {
  const shown = readShown();
  if (!shown) return;
  saveItem(LAST_SEEN_KEY, shown);
  saveItem(LAST_DRAWN_KEY, readDrawnParts());
  saveItem(OPEN_SHEETS_KEY, listOpenSheets());
  keepImages(listDrawnImages());
}

// Leaving the screen is the last moment the page is sure to run, whether it then reloads, sleeps,
// or is dropped.
/** @param {() => any} readShown what the page shows, or null before it has anything to show */
export function keepLastSeen(readShown) {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveLastSeen(readShown);
  });
  addEventListener("pagehide", () => saveLastSeen(readShown));
}
