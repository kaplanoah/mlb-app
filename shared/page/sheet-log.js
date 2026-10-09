import { createStepLog } from "./step-log.js";

// What an open dialog's row of sheets does: each touch and click on it, each sheet a tap brings
// in, each slide, and each sheet it settles on or lets go of.
export const sheetLog = createStepLog({
  key: "diagnosticsSheets",
  title: "Sheets",
  isWatched: (target) => !!target.closest("dialog[open] .sheet-row"),
});

export const noteSheetStep = sheetLog.noteStep;
