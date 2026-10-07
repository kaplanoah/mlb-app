// A sheet a tap opens over the page: the whole screen on phones, rising from the bottom, and a
// modal on wider screens. A sheet is a page in a dialog.
//
// The stack: a dialog with a .sheet-row holds several sheets, one over another, like a game's, a
// team's, and a player's. A sheet opened from another slides in from the right beside it, the one
// under it moving out to the left, the row's gap between them, with a back arrow in place of its
// close caret, named after the one under it. The arrow, or a swipe right that the finger drags,
// slides it away, the one under it coming back in, and it leaves the stack and lets go of what it
// showed. Only the sheet on top is drawn at rest; the ones under it are hidden and inert. The caret, a click on the backdrop,
// Escape, and on phones a swipe down close the dialog (sheet-swipe.js). A page that loads again
// shows the sheets it showed before, where they were scrolled (show-last-drawn.js and
// sheet-reopen.js). The stack and a sheet's sections both move their panels with slide-panels.js.
//
// Three rules hold for every motion here, and for the tab bar and pager too:
// - Nothing asks for a layer ahead of time: the only will-change is on [data-dragged], which a
//   dialog carries only while a finger drags it down.
// - Nothing animates at rest: once a slide, a spring back, or a close ends,
//   document.getAnimations() is empty and nothing asks for an animation frame.
// - Nothing filters what is behind it: no backdrop-filter anywhere.

import { noteSheetStep } from "./sheet-log.js";
import { closeOnSwipeDown, closeSheet } from "./sheet-swipe.js";
import { createSlidePanels } from "./slide-panels.js";

/**
 * How a sheet's code tells what it shows, as a value JSON can hold, and shows it again on the
 * page's next load, saying whether it could.
 * @typedef {{ read: () => unknown, reopen: (subject: any) => boolean }} SheetKeeper
 */
/**
 * @typedef {object} SheetParts
 * @property {HTMLElement} closeButton
 * @property {HTMLElement} [backButton] shown in place of the close button when the sheet opened
 *   from another, with its `.sheet-back-label` naming that one
 * @property {(target: EventTarget) => boolean} [isOwnGesture] a touch on a target this claims,
 *   like a drag handle or a picker, never moves the sheet
 * @property {() => HTMLElement} [findScroller] what scrolls the content shown, when the sheet
 *   holds sections that each scroll on their own, like a team's Team and Roster
 * @property {SheetKeeper} [keeper]
 * @property {string} [name] what the back button of a sheet opened from it calls it
 * @property {() => void} [forget] lets go of what the sheet showed once it's no longer beside the
 *   others, or its dialog closes
 */
/** @typedef {ReturnType<typeof createSlidePanels>} SlidePanels */

/** @type {WeakMap<HTMLElement, SheetParts>} */
const sheetParts = new WeakMap();
// Each dialog's sheets, in the order they opened.
/** @type {WeakMap<HTMLDialogElement, HTMLElement[]>} */
const stacks = new WeakMap();
/** @type {WeakMap<HTMLDialogElement, SlidePanels>} */
const panelsByDialog = new WeakMap();
// In the order they opened.
/** @type {Set<HTMLDialogElement>} */
const openDialogs = new Set();

/** @param {HTMLElement} sheet */
const findDialog = (sheet) => /** @type {HTMLDialogElement} */ (sheet.closest("dialog"));

/** @param {HTMLDialogElement} dialog */
const findRow = (dialog) =>
  /** @type {HTMLElement | null} */ (dialog.querySelector(":scope > .sheet-row"));

/** @param {HTMLDialogElement} dialog */
const listStack = (dialog) => stacks.get(dialog) ?? [];

/** @param {HTMLDialogElement} dialog */
const readShownIndex = (dialog) => panelsByDialog.get(dialog)?.readShown() ?? 0;

/** @param {HTMLElement} sheet */
export const readSheetParts = (sheet) => sheetParts.get(sheet);

/** @param {HTMLDialogElement} dialog */
const findShownSheet = (dialog) => listStack(dialog)[readShownIndex(dialog)] ?? dialog;

/** @param {HTMLElement[]} sheets */
const listIds = (sheets) => sheets.map((sheet) => sheet.id).join(", ");

/**
 * Each dialog that's open, with its sheets in the order they opened and the one it shows.
 * @returns {{ dialog: HTMLDialogElement, sheets: HTMLElement[], shown: number }[]}
 */
export const listOpenDialogs = () =>
  [...openDialogs]
    .filter((dialog) => dialog.open)
    .map((dialog) => ({ dialog, sheets: listStack(dialog), shown: readShownIndex(dialog) }));

/**
 * Where a sheet sits for the row's position: past the left edge, under the one on top, on top, or
 * past the right edge, waiting to come in.
 * @param {number} index
 * @param {number} position
 */
const placeSheet = (index, position) => Math.max(-1, Math.min(index - position, 1));

/**
 * @param {HTMLElement | undefined} button
 * @param {HTMLElement | undefined} before the sheet it steps back to, if any
 */
function labelBackButton(button, before) {
  if (!button) return;
  button.hidden = !before;
  if (!before) return;
  const name = sheetParts.get(before)?.name ?? "Back";
  const label = button.querySelector(".sheet-back-label");
  if (label) label.textContent = name;
  button.setAttribute("aria-label", `Back to ${name}`);
}

/** @param {HTMLDialogElement} dialog */
function placeRow(dialog) {
  const row = findRow(dialog);
  if (!row) return;
  const sheets = listStack(dialog);
  for (const sheet of /** @type {HTMLElement[]} */ ([...row.children])) {
    const index = sheets.indexOf(sheet);
    sheet.hidden = index < 0;
    sheet.style.zIndex = index < 0 ? "" : String(index);
    labelBackButton(sheetParts.get(sheet)?.backButton, sheets[index - 1]);
  }
}

/** @param {HTMLElement} sheet */
const forgetSheet = (sheet) => sheetParts.get(sheet)?.forget?.();

/**
 * Takes every sheet after the shown one out of the stack, but `kept`.
 * @param {HTMLDialogElement} dialog
 * @param {HTMLElement} [kept]
 */
function dropSheetsAhead(dialog, kept) {
  const sheets = listStack(dialog);
  const dropped = sheets.splice(readShownIndex(dialog) + 1).filter((sheet) => sheet !== kept);
  if (!dropped.length) return;
  for (const sheet of dropped) {
    sheet.hidden = true;
    sheet.style.transform = "";
    forgetSheet(sheet);
  }
  noteSheetStep(`let go of ${listIds(dropped)}`);
}

// A sheet a finger or a button brought into view is the one the keyboard and screen readers are
// in, and is named by the dialog.
/** @param {HTMLDialogElement} dialog */
function focusShownSheet(dialog) {
  const sheet = findShownSheet(dialog);
  const title = sheet.getAttribute("aria-labelledby");
  if (title) dialog.setAttribute("aria-labelledby", title);
  if (!sheet.contains(document.activeElement)) sheet.focus({ preventScroll: true });
}

/** @param {HTMLDialogElement} dialog */
function settleOnShown(dialog) {
  if (!dialog.open) return;
  dropSheetsAhead(dialog);
  placeRow(dialog);
  focusShownSheet(dialog);
  noteSheetStep(`settle on ${findShownSheet(dialog).id}`);
}

/**
 * @param {HTMLDialogElement} dialog
 * @param {number} index
 */
function slideToSheet(dialog, index) {
  noteSheetStep(`slide to ${listStack(dialog)[index].id}`);
  panelsByDialog.get(dialog)?.slideTo(index);
}

/**
 * Shows the dialog's stack at rest on its last sheet, as when it opens.
 * @param {HTMLDialogElement} dialog
 * @param {HTMLElement[]} sheets
 */
export function restoreStack(dialog, sheets) {
  stacks.set(dialog, sheets);
  openDialogs.add(dialog);
  placeRow(dialog);
  panelsByDialog.get(dialog)?.jumpTo(Math.max(sheets.length - 1, 0));
}

/**
 * Brings a sheet into the open dialog after the shown one, in place of any after it, sliding in
 * from the right edge, or back to a sheet under the shown one.
 * @param {HTMLDialogElement} dialog
 * @param {HTMLElement} sheet
 */
function showOver(dialog, sheet) {
  const sheets = listStack(dialog);
  const index = sheets.indexOf(sheet);
  if (index >= 0 && index < readShownIndex(dialog)) return slideToSheet(dialog, index);
  panelsByDialog.get(dialog)?.hold();
  dropSheetsAhead(dialog, sheet);
  if (index < 0) sheet.style.transform = "translateX(100%)";
  sheets.push(sheet);
  placeRow(dialog);
  slideToSheet(dialog, sheets.length - 1);
}

/**
 * Shows a sheet, opening its dialog or over the dialog's shown sheet, or keeps it showing,
 * scrolled back to its top.
 * @param {HTMLElement} sheet
 */
export function openSheet(sheet) {
  const dialog = findDialog(sheet);
  if (sheet !== dialog)
    noteSheetStep(`open ${sheet.id} over ${dialog.open ? findShownSheet(dialog).id : "the page"}`);
  if (!dialog.open) {
    dialog.showModal();
    restoreStack(dialog, sheet === dialog ? [] : [sheet]);
  } else if (findShownSheet(dialog) !== sheet) showOver(dialog, sheet);
  sheet.scrollTop = 0;
}

/** @param {HTMLElement} sheet */
function stepBack(sheet) {
  const dialog = findDialog(sheet);
  const index = listStack(dialog).indexOf(sheet);
  if (index > 0) slideToSheet(dialog, index - 1);
}

/** @param {HTMLDialogElement} dialog */
function forgetDialog(dialog) {
  const sheets = listStack(dialog);
  panelsByDialog.get(dialog)?.hold();
  stacks.delete(dialog);
  openDialogs.delete(dialog);
  dialog.removeAttribute("data-reopened");
  for (const sheet of sheets) forgetSheet(sheet);
  if (sheets.length === 0) forgetSheet(dialog);
  for (const sheet of sheets) sheet.style.transform = "";
  placeRow(dialog);
}

/** @param {HTMLDialogElement} dialog */
function closeOnCancel(dialog) {
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeSheet(dialog);
  });
}

// A click on the backdrop lands on the dialog itself; its content fills it edge to edge.
/** @param {HTMLDialogElement} dialog */
function closeOnBackdropClick(dialog) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeSheet(dialog);
  });
}

/** @param {HTMLDialogElement} dialog */
function wireStack(dialog) {
  const row = findRow(dialog);
  if (!row) return;
  const panels = createSlidePanels(row, {
    listPanels: () => listStack(dialog),
    place: placeSheet,
    canGo: (direction) => direction < 0 && readShownIndex(dialog) > 0,
    onSettle: () => settleOnShown(dialog),
  });
  panelsByDialog.set(dialog, panels);
}

/** @type {WeakSet<HTMLDialogElement>} */
const wiredDialogs = new WeakSet();

/** @param {HTMLDialogElement} dialog */
function wireDialog(dialog) {
  if (wiredDialogs.has(dialog)) return;
  wiredDialogs.add(dialog);
  closeOnBackdropClick(dialog);
  closeOnCancel(dialog);
  dialog.addEventListener("close", () => forgetDialog(dialog));
  /** @param {HTMLElement} sheet */
  const readParts = (sheet) => sheetParts.get(sheet);
  closeOnSwipeDown(dialog, {
    isOwnGesture: (target) => readParts(findShownSheet(dialog))?.isOwnGesture?.(target) ?? false,
    findScroller: () => {
      const sheet = findShownSheet(dialog);
      return readParts(sheet)?.findScroller?.() ?? sheet;
    },
  });
  wireStack(dialog);
}

/**
 * Wires a sheet's ways to close its dialog and to step between sheets, and with a `keeper`, its
 * showing again on the page's next load.
 * @param {HTMLElement} sheet the dialog itself, or one of the sheets in its row
 * @param {SheetParts} parts
 */
export function wireSheet(sheet, parts) {
  sheetParts.set(sheet, parts);
  const dialog = findDialog(sheet);
  if (sheet !== dialog) sheet.tabIndex = -1;
  parts.closeButton.addEventListener("click", () => closeSheet(dialog));
  parts.backButton?.addEventListener("click", () => stepBack(sheet));
  wireDialog(dialog);
}
