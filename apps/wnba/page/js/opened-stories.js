// The stories this device has opened from the News view, so each one's Read button shows a check.
// Each device keeps its own, since the page saves nothing to the store, and forgets a story two
// weeks after opening it, by when the view no longer shows it.

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

// Storage can be off, as in a private window, and then no story shows as opened after a reload.
/** @returns {OpenedStories} */
function readSavedOpens() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return saved && typeof saved === "object" ? keepRecentOpens(saved, Date.now()) : {};
  } catch {
    return {};
  }
}

/** @param {OpenedStories} opened */
function saveOpens(opened) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(opened));
  } catch {
    // The check still shows until the page reloads.
  }
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
    saveOpens(opened);
    onChange();
  });
}
