// A dialog shown as a sheet, from the bottom on phones and as a modal on wider screens. It opens
// at its top. A sheet opened from another slides in over it, like the next screen of an app, with
// a back button that names the one under it, and a swipe right takes it away again, which a
// swipe left undoes. Done, a click on the backdrop, Escape, and on phones a swipe down close every
// sheet showing at once. A page that loads again shows the sheets it showed before, where they
// were scrolled (show-last-drawn.js), and each sheet's code takes back what it showed.

import { followSideSwipes } from "./sheet-steps.js";
import { closeOnSwipeDown, closeSheets, slideSheet } from "./sheet-swipe.js";

/**
 * How a sheet's code tells what it shows, as a value JSON can hold, and shows it again on the
 * page's next load or a step forward, saying whether it could.
 * @typedef {{ read: () => unknown, reopen: (subject: any) => boolean }} SheetKeeper
 */
/** @typedef {{ id: string, scrollTop: number, subject: unknown, backLabel: string | null }} OpenSheet */
/**
 * @typedef {object} SheetParts
 * @property {HTMLElement} doneButton
 * @property {HTMLElement} [backButton] shown when the sheet opens over another, with its
 *   `.sheet-back-label` naming that one
 * @property {(target: EventTarget) => boolean} [isOwnGesture] a touch on a target this claims,
 *   like a drag handle or a picker, never moves the sheet
 * @property {SheetKeeper} [keeper]
 * @property {() => string} [nameForBack] what a sheet opened over this one calls it
 * @property {() => HTMLDialogElement | null} [prepareNext] the sheet a swipe left opens over this
 *   one when there's no sheet to step forward to, filled in and ready to open
 */

// In the order they opened, so a sheet opened over another opens over it again.
/** @type {HTMLDialogElement[]} */
const openSheets = [];
/** @type {WeakMap<HTMLDialogElement, SheetParts>} */
const sheetParts = new WeakMap();
/** @type {Set<HTMLDialogElement>} */
const leavingSheets = new Set();
// The sheet the last step back took away, which a step forward from the one under it shows again.
/** @type {{ dialog: HTMLDialogElement, subject: unknown, under: HTMLDialogElement } | null} */
let stepAhead = null;

const findTopSheet = () => openSheets.at(-1) ?? null;
const listStack = () => [...openSheets];

/** Closes every sheet showing. */
const closeAllSheets = () => closeSheets(listStack());

// A click on the backdrop lands on the dialog itself; its content fills it edge to edge.
/** @param {MouseEvent} event */
function closeOnBackdropClick(event) {
  if (event.target === event.currentTarget) closeAllSheets();
}

/** @param {Event} event */
function closeAllOnCancel(event) {
  event.preventDefault();
  closeAllSheets();
}

/**
 * @param {HTMLDialogElement} dialog
 * @param {HTMLDialogElement} under
 */
function labelBackButton(dialog, under) {
  const button = sheetParts.get(dialog)?.backButton;
  if (!button) return;
  const name = sheetParts.get(under)?.nameForBack?.() ?? "Back";
  const label = button.querySelector(".sheet-back-label");
  if (label) label.textContent = name;
  button.setAttribute("aria-label", `Back to ${name}`);
  button.hidden = false;
}

// A sheet over another is at least as tall as it, so none of the one under it shows.
/**
 * @param {HTMLDialogElement} under
 * @param {HTMLDialogElement} dialog
 */
function coverSheet(under, dialog) {
  dialog.setAttribute("data-stacked", "");
  dialog.style.minHeight = `${under.getBoundingClientRect().height}px`;
  under.setAttribute("data-covered", "");
  labelBackButton(dialog, under);
}

/** @param {HTMLDialogElement} dialog */
function showSheet(dialog) {
  const under = findTopSheet();
  if (under) coverSheet(under, dialog);
  dialog.showModal();
  openSheets.push(dialog);
}

/**
 * Shows a sheet over any showing, or keeps it showing, scrolled back to its top.
 * @param {HTMLDialogElement} dialog
 */
export function openSheet(dialog) {
  if (!dialog.open) {
    stepAhead = null;
    showSheet(dialog);
  }
  dialog.scrollTop = 0;
}

/** @param {HTMLDialogElement} dialog */
function uncoverSheet(dialog) {
  dialog.removeAttribute("data-stacked");
  dialog.removeAttribute("data-covered");
  dialog.style.minHeight = "";
  const backButton = sheetParts.get(dialog)?.backButton;
  if (backButton) backButton.hidden = true;
}

/** @param {Event} event */
function forgetSheet(event) {
  const dialog = /** @type {HTMLDialogElement} */ (event.currentTarget);
  const index = openSheets.indexOf(dialog);
  if (index >= 0) openSheets.splice(index, 1);
  dialog.removeAttribute("data-reopened");
  uncoverSheet(dialog);
  findTopSheet()?.removeAttribute("data-covered");
  if (!openSheets.length) stepAhead = null;
}

/** Takes the top sheet away to show the one under it, which a step forward undoes. */
function stepBack() {
  const dialog = findTopSheet();
  const under = openSheets.at(-2);
  if (!dialog || !under || leavingSheets.has(dialog)) return;
  leavingSheets.add(dialog);
  stepAhead = { dialog, subject: sheetParts.get(dialog)?.keeper?.read() ?? null, under };
  under.removeAttribute("data-covered");
  slideSheet(dialog, "translateX(100%)").finished.then((slide) => {
    dialog.close();
    slide.cancel();
    leavingSheets.delete(dialog);
  });
}

// What an earlier release saved, or a step back kept, may not fit the sheet as it is now.
/**
 * @param {HTMLDialogElement} dialog
 * @param {unknown} subject
 */
function reopenSheet(dialog, subject) {
  const keeper = sheetParts.get(dialog)?.keeper;
  if (!keeper) return true;
  try {
    return keeper.reopen(subject);
  } catch {
    return false;
  }
}

/** The sheet a step forward from the top one shows, filled in and ready to open, if any. */
function prepareAhead() {
  const top = findTopSheet();
  if (!top) return null;
  const kept = stepAhead;
  if (kept?.under === top && !kept.dialog.open && reopenSheet(kept.dialog, kept.subject))
    return kept.dialog;
  return sheetParts.get(top)?.prepareNext?.() ?? null;
}

/**
 * Wires a sheet's ways to close and to step between sheets, and with a `keeper`, its showing
 * again on the page's next load or a step forward.
 * @param {HTMLDialogElement} dialog
 * @param {SheetParts} parts
 */
export function wireSheet(dialog, parts) {
  sheetParts.set(dialog, parts);
  const isOwnGesture = parts.isOwnGesture ?? (() => false);
  parts.doneButton.addEventListener("click", closeAllSheets);
  parts.backButton?.addEventListener("click", stepBack);
  dialog.addEventListener("click", closeOnBackdropClick);
  dialog.addEventListener("close", forgetSheet);
  dialog.addEventListener("cancel", closeAllOnCancel);
  closeOnSwipeDown(dialog, { isOwnGesture, listStack });
  followSideSwipes(dialog, {
    isTop: () => findTopSheet() === dialog,
    findUnder: () => openSheets.at(-2) ?? null,
    prepareAhead,
    showAhead: showSheet,
    stepBack,
    dropAhead: (ahead) => ahead.close(),
    isOwnGesture,
  });
}

/** @param {HTMLDialogElement} dialog */
function readBackLabel(dialog) {
  const backButton = sheetParts.get(dialog)?.backButton;
  if (!backButton || backButton.hidden) return null;
  return backButton.querySelector(".sheet-back-label")?.textContent ?? null;
}

/**
 * The sheets showing, in the order they opened, with where each is scrolled, what it shows, and
 * what its back button calls the one under it.
 * @returns {OpenSheet[]}
 */
export const listOpenSheets = () =>
  openSheets
    .filter((dialog) => dialog.open)
    .map((dialog) => ({
      id: dialog.id,
      scrollTop: dialog.scrollTop,
      subject: sheetParts.get(dialog)?.keeper?.read() ?? null,
      backLabel: readBackLabel(dialog),
    }));

/** @param {unknown} sheet */
const isOpenSheet = (sheet) => typeof (/** @type {OpenSheet | null} */ (sheet)?.id) === "string";

/**
 * Takes over the sheets the page put back open as it loaded, each showing again what it showed
 * over the one it was opened from, and closes any that can't.
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
  openSheets.forEach((dialog, index) => {
    if (index > 0) coverSheet(openSheets[index - 1], dialog);
  });
}
