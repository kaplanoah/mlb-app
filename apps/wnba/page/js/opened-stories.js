// The stories this device has opened from the News view, so each one's Read button shows a check.
// It forgets a story two weeks after opening it, by when the view no longer shows it.

import { keepOnDevice, readFromDevice } from "#shared/device-storage.js";

const STORAGE_KEY = "openedStories";
const KEEP_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * When each story was opened, by its address.
 * @typedef {Record<string, number>} OpenedStories
 */

/**
 * The stories opened within two weeks of `now`.
 * @param {OpenedStories} opened
 * @param {number} now
 * @returns {OpenedStories}
 */
export const keepRecentOpens = (opened, now) =>
  Object.fromEntries(
    Object.entries(opened).filter(
      ([, openedAt]) => typeof openedAt === "number" && now - openedAt < KEEP_MS,
    ),
  );

/** @returns {OpenedStories} */
function readSavedOpens() {
  const saved = readFromDevice(STORAGE_KEY);
  return saved && typeof saved === "object"
    ? keepRecentOpens(/** @type {OpenedStories} */ (saved), Date.now())
    : {};
}

let opened = readSavedOpens();

export const readOpenedStories = () => opened;

/**
 * Keeps each story opened from a link in `list`, and calls `onChange`.
 * @param {HTMLElement} list
 * @param {() => void} onChange
 */
export function startOpenedStories(list, onChange) {
  list.addEventListener("click", (event) => {
    const link = event.target instanceof Element && event.target.closest("a[href]");
    if (!link) return;
    const now = Date.now();
    opened = { ...keepRecentOpens(opened, now), [link.getAttribute("href") ?? ""]: now };
    keepOnDevice(STORAGE_KEY, opened);
    onChange();
  });
}
