// A dialog shown as a sheet, from the bottom on phones and as a modal on wider screens. It opens
// at its top, and closes with its Done button, a click on its backdrop, Escape, or on phones a
// swipe down. A page that loads again shows the sheets it showed before, where they were scrolled
// (show-last-drawn.js), and each sheet's code takes back what it showed.

import { closeOnSwipeDown, closeSheet } from "./sheet-swipe.js";

/**
 * How a sheet's code tells what it shows, as a value JSON can hold, and shows it again on the
 * page's next load, saying whether it could.
 * @typedef {{ read: () => unknown, reopen: (subject: any) => boolean }} SheetKeeper
 */
/** @typedef {{ id: string, scrollTop: number, subject: unknown }} OpenSheet */

// In the order they opened, so a sheet opened over another opens over it again.
/** @type {HTMLDialogElement[]} */
const openSheets = [];
/** @type {WeakMap<HTMLDialogElement, SheetKeeper>} */
const keepers = new WeakMap();

// A click on the backdrop lands on the dialog itself; its content fills it edge to edge.
/** @param {MouseEvent} event */
function closeOnBackdropClick(event) {
  const dialog = /** @type {HTMLDialogElement} */ (event.currentTarget);
  if (event.target === dialog) closeSheet(dialog);
}

/**
 * Shows a sheet, or keeps it showing, scrolled back to its top.
 * @param {HTMLDialogElement} dialog
 */
export function openSheet(dialog) {
  if (!dialog.open) {
    dialog.showModal();
    openSheets.push(dialog);
  }
  dialog.scrollTop = 0;
}

/** @param {Event} event */
function forgetSheet(event) {
  const dialog = /** @type {HTMLDialogElement} */ (event.currentTarget);
  const index = openSheets.indexOf(dialog);
  if (index >= 0) openSheets.splice(index, 1);
  dialog.removeAttribute("data-reopened");
}

/**
 * Wires a sheet's ways to close, and with a `keeper`, its showing again on the page's next load.
 * A touch that starts on a target `isOwnGesture` claims, like a drag handle or a picker, never
 * moves the sheet.
 * @param {HTMLDialogElement} dialog
 * @param {{ doneButton: HTMLElement, isOwnGesture?: (target: EventTarget) => boolean, keeper?: SheetKeeper }} parts
 */
export function wireSheet(dialog, { doneButton, isOwnGesture, keeper }) {
  doneButton.addEventListener("click", () => closeSheet(dialog));
  dialog.addEventListener("click", closeOnBackdropClick);
  dialog.addEventListener("close", forgetSheet);
  closeOnSwipeDown(dialog, isOwnGesture);
  if (keeper) keepers.set(dialog, keeper);
}

/**
 * The sheets showing, in the order they opened, with where each is scrolled and what it shows.
 * @returns {OpenSheet[]}
 */
export const listOpenSheets = () =>
  openSheets
    .filter((dialog) => dialog.open)
    .map((dialog) => ({
      id: dialog.id,
      scrollTop: dialog.scrollTop,
      subject: keepers.get(dialog)?.read() ?? null,
    }));

// What an earlier release saved may not fit this one's sheet.
/**
 * @param {HTMLDialogElement} dialog
 * @param {unknown} subject
 */
function reopenSheet(dialog, subject) {
  const keeper = keepers.get(dialog);
  if (!keeper) return true;
  try {
    return keeper.reopen(subject);
  } catch {
    return false;
  }
}

/** @param {unknown} sheet */
const isOpenSheet = (sheet) => typeof (/** @type {OpenSheet | null} */ (sheet)?.id) === "string";

/**
 * Takes over the sheets the page put back open as it loaded, each showing again what it showed,
 * and closes any that can't.
 * @param {unknown} saved what listOpenSheets listed as the page last left the screen
 */
export function reopenSheets(saved) {
  if (!Array.isArray(saved)) return;
  for (const { id, subject } of saved.filter(isOpenSheet)) {
    const dialog = /** @type {HTMLDialogElement | null} */ (document.getElementById(id));
    if (!dialog?.open) continue;
    openSheets.push(dialog);
    if (!reopenSheet(dialog, subject)) dialog.close();
  }
}
