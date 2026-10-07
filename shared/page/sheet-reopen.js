// The sheets a page shows, listed as it leaves the screen, and taken back on its next load: the
// page puts them back open before its first paint (show-last-drawn.js), and once its modules
// load, each sheet's code shows again what it showed, beside the one it was opened from.

import { listOpenDialogs, readSheetParts, restoreStack } from "./sheet.js";

/** @typedef {{ id: string, scrollTop: number, subject: unknown, backLabel: string | null }} OpenSheet */
/** @typedef {{ sheet: HTMLElement, subject: unknown }} SavedSheet */

/** @param {HTMLElement} sheet */
function readBackLabel(sheet) {
  const backButton = readSheetParts(sheet)?.backButton;
  if (!backButton || backButton.hidden) return null;
  return backButton.querySelector(".sheet-back-label")?.textContent ?? null;
}

/** @param {HTMLElement} sheet */
const describeOpenSheet = (sheet) => ({
  id: sheet.id,
  scrollTop: sheet.scrollTop,
  subject: readSheetParts(sheet)?.keeper?.read() ?? null,
  backLabel: readBackLabel(sheet),
});

/** @param {{ dialog: HTMLDialogElement, sheets: HTMLElement[], shown: number }} open */
const listShownSheets = ({ dialog, sheets, shown }) =>
  sheets.length ? sheets.slice(0, shown + 1) : [dialog];

/**
 * The sheets showing, each dialog's in the order they opened up to the one it shows, with where
 * each is scrolled, what it shows, and what its back button calls the one before it.
 * @returns {OpenSheet[]}
 */
export const listOpenSheets = () =>
  listOpenDialogs().flatMap(listShownSheets).map(describeOpenSheet);

/**
 * Each sheet in each open dialog's row, in order, and whether it's the one its dialog shows.
 * @returns {{ id: string, isShown: boolean }[]}
 */
export const listSheetsInOpenDialogs = () =>
  listOpenDialogs().flatMap(({ dialog, sheets, shown }) =>
    sheets.length
      ? sheets.map((sheet, index) => ({ id: sheet.id, isShown: index === shown }))
      : [{ id: dialog.id, isShown: true }],
  );

// What an earlier release saved may not fit the sheet as it is now.
/** @param {SavedSheet} saved */
function reopenSheet({ sheet, subject }) {
  const keeper = readSheetParts(sheet)?.keeper;
  if (!keeper) return true;
  try {
    return keeper.reopen(subject);
  } catch {
    return false;
  }
}

/**
 * The sheets that show again what they showed, up to the first that can't.
 * @param {SavedSheet[]} saved
 */
function listReopened(saved) {
  const failed = saved.findIndex((each) => !reopenSheet(each));
  return saved.slice(0, failed < 0 ? saved.length : failed).map(({ sheet }) => sheet);
}

/**
 * Takes a dialog the page put back open as it loaded, with the sheets in its row that show again
 * what they showed, or closes it when none can.
 * @param {HTMLDialogElement} dialog
 * @param {SavedSheet[]} saved
 */
function reopenDialog(dialog, saved) {
  const reopened = listReopened(saved);
  if (!reopened.length) return dialog.close();
  restoreStack(dialog, reopened.includes(dialog) ? [] : reopened);
}

/** @param {unknown} sheet */
const isOpenSheet = (sheet) => typeof (/** @type {OpenSheet | null} */ (sheet)?.id) === "string";

/** @param {unknown} saved */
function groupByDialog(saved) {
  const isTaken = new Set(listOpenDialogs().map(({ dialog }) => dialog));
  /** @type {Map<HTMLDialogElement, SavedSheet[]>} */
  const groups = new Map();
  for (const { id, subject } of /** @type {OpenSheet[]} */ (
    Array.isArray(saved) ? saved.filter(isOpenSheet) : []
  )) {
    const sheet = document.getElementById(id);
    const dialog = sheet?.closest("dialog");
    if (!sheet || !dialog?.open || isTaken.has(dialog)) continue;
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
