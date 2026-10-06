// A sheet a tap opens over the page: from the bottom on phones and as a modal on wider screens,
// as tall as the screen allows. A sheet is a page in a dialog. A dialog with a .sheet-row holds
// several side by side, like a game's, a team's, and its roster's, and a sheet opened from
// another slides in beside it, with a back button that names the one it came from. The row
// scrolls between them as the browser scrolls anything, so a swipe right goes back and a swipe
// left forward again, and both follow the finger and settle on a sheet with the phone's own
// momentum; the back and forward buttons scroll it the same way. Done, a click on the backdrop,
// Escape, and on phones a swipe down close the dialog. A page that loads again shows the sheets it
// showed before, where they were scrolled (show-last-drawn.js), and each sheet's code takes back
// what it showed.

import { stepBackOnEdgeSwipe } from "./sheet-edge-swipe.js";
import { closeOnSwipeDown, closeSheet } from "./sheet-swipe.js";

/**
 * How a sheet's code tells what it shows, as a value JSON can hold, and shows it again on the
 * page's next load, saying whether it could.
 * @typedef {{ read: () => unknown, reopen: (subject: any) => boolean }} SheetKeeper
 */
/** @typedef {{ id: string, scrollTop: number, subject: unknown, backLabel: string | null }} OpenSheet */
/**
 * @typedef {object} SheetParts
 * @property {HTMLElement} doneButton
 * @property {HTMLElement} [backButton] shown when the sheet opened from another, with its
 *   `.sheet-back-label` naming that one
 * @property {HTMLElement} [forwardButton] shown when a step back has left a sheet beside it to
 *   step forward to, with its `.sheet-forward-label` naming that one
 * @property {(target: EventTarget) => boolean} [isOwnGesture] a touch on a target this claims,
 *   like a drag handle or a picker, never moves the sheet
 * @property {SheetKeeper} [keeper]
 * @property {string} [name] what the back button of a sheet opened from it calls it
 * @property {() => string} [nameForForward] what the forward button of the sheet it opened from
 *   calls it, once a step back has left it there, when that's more than its `name`
 * @property {() => HTMLElement | null} [prepareNext] the sheet a swipe left from this one shows
 *   when nothing else is beside it, filled in and ready to show
 * @property {() => void} [forget] lets go of what the sheet showed once it's no longer beside the
 *   others, or its dialog closes
 */
/**
 * A dialog's sheets, in the row's order, and the one it shows. `prepared` is a sheet that waits
 * beside the last one for a swipe left, which no forward button names.
 * @typedef {{ sheets: HTMLElement[], shown: number, prepared: HTMLElement | null }} Stack
 */

// A row settles on a sheet within this many pixels of its edge.
const SETTLED_PX = 2;

/** @type {WeakMap<HTMLElement, SheetParts>} */
const sheetParts = new WeakMap();
/** @type {WeakMap<HTMLDialogElement, Stack>} */
const stacks = new WeakMap();
// In the order they opened.
/** @type {Set<HTMLDialogElement>} */
const openDialogs = new Set();

const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** @param {HTMLElement} sheet */
const findDialog = (sheet) => /** @type {HTMLDialogElement} */ (sheet.closest("dialog"));

/** @param {HTMLDialogElement} dialog */
const findRow = (dialog) =>
  /** @type {HTMLElement | null} */ (dialog.querySelector(":scope > .sheet-row"));

/** @param {HTMLDialogElement} dialog */
function readStack(dialog) {
  let stack = stacks.get(dialog);
  if (!stack) {
    stack = { sheets: [], shown: 0, prepared: null };
    stacks.set(dialog, stack);
  }
  return stack;
}

/** @param {HTMLDialogElement} dialog */
const findShownSheet = (dialog) => {
  const { sheets, shown } = readStack(dialog);
  return sheets[shown] ?? dialog;
};

/** @param {HTMLElement} sheet */
const nameSheet = (sheet) => sheetParts.get(sheet)?.name ?? "Back";

/** @param {HTMLElement} sheet */
const nameSheetForForward = (sheet) => {
  const parts = sheetParts.get(sheet);
  return parts?.nameForForward?.() ?? parts?.name ?? "Forward";
};

/**
 * @param {HTMLElement | undefined} button
 * @param {string | null} name what it steps to, or null to hide it
 * @param {{ labelClass: string, verb: string }} kind
 */
function labelStepButton(button, name, { labelClass, verb }) {
  if (!button) return;
  button.hidden = name === null;
  if (name === null) return;
  const label = button.querySelector(labelClass);
  if (label) label.textContent = name;
  button.setAttribute("aria-label", `${verb} ${name}`);
}

/** @param {Stack} stack */
function labelStepButtons({ sheets, prepared }) {
  sheets.forEach((sheet, index) => {
    const parts = sheetParts.get(sheet);
    const before = sheets[index - 1];
    const after = sheets[index + 1];
    labelStepButton(parts?.backButton, before ? nameSheet(before) : null, {
      labelClass: ".sheet-back-label",
      verb: "Back to",
    });
    labelStepButton(
      parts?.forwardButton,
      after && after !== prepared ? nameSheetForForward(after) : null,
      {
        labelClass: ".sheet-forward-label",
        verb: "Forward to",
      },
    );
  });
}

// Each sheet in the stack takes its place in the row, later ones drawn over earlier ones, and the
// rest leave it.
/** @param {HTMLDialogElement} dialog */
function placeSheets(dialog) {
  const row = findRow(dialog);
  if (!row) return;
  const stack = readStack(dialog);
  for (const sheet of /** @type {HTMLElement[]} */ ([...row.children])) {
    const index = stack.sheets.indexOf(sheet);
    sheet.hidden = index < 0;
    sheet.style.order = index < 0 ? "" : String(index);
    sheet.inert = index !== stack.shown;
  }
  labelStepButtons(stack);
}

/** @param {HTMLElement} sheet */
const forgetSheet = (sheet) => sheetParts.get(sheet)?.forget?.();

/**
 * Takes every sheet after the shown one out of the row, but `kept`.
 * @param {Stack} stack
 * @param {HTMLElement} [kept]
 */
function dropSheetsAhead(stack, kept) {
  const dropped = stack.sheets.splice(stack.shown + 1);
  stack.prepared = null;
  for (const sheet of dropped) if (sheet !== kept) forgetSheet(sheet);
}

// A sheet that a finger or a button brought into view is the one the keyboard and screen readers
// are in, and is named by the dialog.
/** @param {HTMLDialogElement} dialog */
function focusShownSheet(dialog) {
  const sheet = findShownSheet(dialog);
  const title = sheet.getAttribute("aria-labelledby");
  if (title) dialog.setAttribute("aria-labelledby", title);
  if (!sheet.contains(document.activeElement)) sheet.focus({ preventScroll: true });
}

/** @param {HTMLDialogElement} dialog */
function prepareNextSheet(dialog) {
  const stack = readStack(dialog);
  if (stack.shown !== stack.sheets.length - 1) return;
  const next = sheetParts.get(stack.sheets[stack.shown])?.prepareNext?.();
  if (!next || stack.sheets.includes(next)) return;
  stack.sheets.push(next);
  stack.prepared = next;
}

/**
 * Makes the sheet at `index` the shown one, once the row has come to rest on it.
 * @param {HTMLDialogElement} dialog
 * @param {number} index
 */
function settleOnSheet(dialog, index) {
  const stack = readStack(dialog);
  if (!stack.sheets[index]) return;
  stack.shown = index;
  if (stack.sheets[index] === stack.prepared) stack.prepared = null;
  prepareNextSheet(dialog);
  placeSheets(dialog);
  focusShownSheet(dialog);
}

/** @param {HTMLDialogElement} dialog */
function settleWhereScrolled(dialog) {
  const row = findRow(dialog);
  if (!row?.clientWidth) return;
  const index = Math.round(row.scrollLeft / row.clientWidth);
  if (Math.abs(row.scrollLeft - index * row.clientWidth) > SETTLED_PX) return;
  if (index !== readStack(dialog).shown) settleOnSheet(dialog, index);
}

/**
 * Scrolls the row to the sheet at `index`, which settles on it once there.
 * @param {HTMLDialogElement} dialog
 * @param {number} index
 */
function scrollToSheet(dialog, index) {
  const row = findRow(dialog);
  if (!row) return;
  const left = index * row.clientWidth;
  if (Math.abs(row.scrollLeft - left) <= SETTLED_PX) return settleOnSheet(dialog, index);
  row.scrollTo({ left, behavior: prefersReducedMotion() ? "instant" : "smooth" });
}

/** @param {HTMLElement} sheet */
function stepBack(sheet) {
  const dialog = findDialog(sheet);
  const index = readStack(dialog).sheets.indexOf(sheet);
  if (index > 0) scrollToSheet(dialog, index - 1);
}

/** @param {HTMLElement} sheet */
function stepForward(sheet) {
  const dialog = findDialog(sheet);
  const { sheets } = readStack(dialog);
  const index = sheets.indexOf(sheet);
  if (index >= 0 && sheets[index + 1]) scrollToSheet(dialog, index + 1);
}

/**
 * @param {HTMLDialogElement} dialog
 * @param {HTMLElement} sheet
 */
function showDialog(dialog, sheet) {
  stacks.set(dialog, { sheets: sheet === dialog ? [] : [sheet], shown: 0, prepared: null });
  placeSheets(dialog);
  dialog.showModal();
  openDialogs.add(dialog);
  const row = findRow(dialog);
  if (row) row.scrollLeft = 0;
  settleOnSheet(dialog, 0);
}

/**
 * Brings a sheet into the open dialog beside the shown one, in place of any after it.
 * @param {HTMLDialogElement} dialog
 * @param {HTMLElement} sheet
 */
function showBeside(dialog, sheet) {
  const stack = readStack(dialog);
  const index = stack.sheets.indexOf(sheet);
  if (index >= 0 && index < stack.shown) return scrollToSheet(dialog, index);
  dropSheetsAhead(stack, sheet);
  stack.sheets.push(sheet);
  placeSheets(dialog);
  scrollToSheet(dialog, stack.sheets.length - 1);
}

/**
 * Shows a sheet, opening its dialog or beside the dialog's shown sheet, or keeps it showing,
 * scrolled back to its top.
 * @param {HTMLElement} sheet
 */
export function openSheet(sheet) {
  const dialog = findDialog(sheet);
  if (!dialog.open) showDialog(dialog, sheet);
  else if (findShownSheet(dialog) !== sheet) showBeside(dialog, sheet);
  sheet.scrollTop = 0;
}

/** @param {HTMLDialogElement} dialog */
function forgetDialog(dialog) {
  const { sheets } = readStack(dialog);
  stacks.delete(dialog);
  openDialogs.delete(dialog);
  dialog.removeAttribute("data-reopened");
  for (const sheet of sheets) forgetSheet(sheet);
  if (sheets.length === 0) forgetSheet(dialog);
  placeSheets(dialog);
}

// A click on the backdrop lands on the dialog itself; its content fills it edge to edge.
/**
 * @param {HTMLDialogElement} dialog
 * @param {MouseEvent} event
 */
function closeOnBackdropClick(dialog, event) {
  if (event.target === dialog) closeSheet(dialog);
}

/** @param {HTMLDialogElement} dialog */
function closeOnCancel(dialog) {
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeSheet(dialog);
  });
}

/** @type {WeakSet<HTMLDialogElement>} */
const wiredDialogs = new WeakSet();

/** @param {HTMLDialogElement} dialog */
function wireDialog(dialog) {
  if (wiredDialogs.has(dialog)) return;
  wiredDialogs.add(dialog);
  dialog.addEventListener("click", (event) => closeOnBackdropClick(dialog, event));
  dialog.addEventListener("close", () => forgetDialog(dialog));
  closeOnCancel(dialog);
  closeOnSwipeDown(dialog, {
    isOwnGesture: (target) =>
      sheetParts.get(findShownSheet(dialog))?.isOwnGesture?.(target) ?? false,
    findScroller: () => findShownSheet(dialog),
  });
  const row = findRow(dialog);
  if (!row) return;
  row.addEventListener("scroll", () => settleWhereScrolled(dialog), { passive: true });
  row.addEventListener("scrollend", () => settleWhereScrolled(dialog));
  stepBackOnEdgeSwipe(row, {
    findShownSheet: () => findShownSheet(dialog),
    readShown: () => readStack(dialog).shown,
    scrollToSheet: (index) => scrollToSheet(dialog, index),
  });
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
  parts.doneButton.addEventListener("click", () => closeSheet(dialog));
  parts.backButton?.addEventListener("click", () => stepBack(sheet));
  parts.forwardButton?.addEventListener("click", () => stepForward(sheet));
  wireDialog(dialog);
}

/** @param {HTMLElement} sheet */
function readBackLabel(sheet) {
  const backButton = sheetParts.get(sheet)?.backButton;
  if (!backButton || backButton.hidden) return null;
  return backButton.querySelector(".sheet-back-label")?.textContent ?? null;
}

/** @param {HTMLElement} sheet */
const describeOpenSheet = (sheet) => ({
  id: sheet.id,
  scrollTop: sheet.scrollTop,
  subject: sheetParts.get(sheet)?.keeper?.read() ?? null,
  backLabel: readBackLabel(sheet),
});

/** @param {HTMLDialogElement} dialog */
function listShownSheets(dialog) {
  const { sheets, shown } = readStack(dialog);
  return sheets.length ? sheets.slice(0, shown + 1) : [dialog];
}

/**
 * The sheets showing, each dialog's in the order they opened up to the one it shows, with where
 * each is scrolled, what it shows, and what its back button calls the one before it.
 * @returns {OpenSheet[]}
 */
export const listOpenSheets = () =>
  [...openDialogs]
    .filter((dialog) => dialog.open)
    .flatMap(listShownSheets)
    .map(describeOpenSheet);

// What an earlier release saved may not fit the sheet as it is now.
/**
 * @param {HTMLElement} sheet
 * @param {unknown} subject
 */
function reopenSheet(sheet, subject) {
  const keeper = sheetParts.get(sheet)?.keeper;
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
 * The sheets that show again what they showed, up to the first that can't.
 * @param {{ sheet: HTMLElement, subject: unknown }[]} saved
 */
function listReopened(saved) {
  const failed = saved.findIndex(({ sheet, subject }) => !reopenSheet(sheet, subject));
  return saved.slice(0, failed < 0 ? saved.length : failed).map(({ sheet }) => sheet);
}

/**
 * Takes a dialog the page put back open as it loaded, with the sheets in its row that show again
 * what they showed, or closes it when none can.
 * @param {HTMLDialogElement} dialog
 * @param {{ sheet: HTMLElement, subject: unknown }[]} saved
 */
function reopenDialog(dialog, saved) {
  const reopened = listReopened(saved);
  openDialogs.add(dialog);
  if (!reopened.length) return dialog.close();
  const row = findRow(dialog);
  if (!row) return;
  const shown = reopened.length - 1;
  stacks.set(dialog, { sheets: reopened, shown, prepared: null });
  row.scrollLeft = shown * row.clientWidth;
  settleOnSheet(dialog, shown);
}

/** @param {unknown} saved */
function groupByDialog(saved) {
  /** @type {Map<HTMLDialogElement, { sheet: HTMLElement, subject: unknown }[]>} */
  const groups = new Map();
  for (const { id, subject } of /** @type {OpenSheet[]} */ (
    Array.isArray(saved) ? saved.filter(isOpenSheet) : []
  )) {
    const sheet = document.getElementById(id);
    const dialog = sheet?.closest("dialog");
    if (!sheet || !dialog?.open || openDialogs.has(dialog)) continue;
    groups.set(dialog, [...(groups.get(dialog) ?? []), { sheet, subject }]);
  }
  return groups;
}

/**
 * Takes over the sheets the page put back open as it loaded, each showing again what it showed
 * beside the one it was opened from, and closes a dialog none of whose sheets can.
 * @param {unknown} saved what listOpenSheets listed as the page last left the screen
 */
export function reopenSheets(saved) {
  for (const [dialog, sheets] of groupByDialog(saved)) reopenDialog(dialog, sheets);
}
