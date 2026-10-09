import { createStepLog } from "./step-log.js";

// What a season's list of days does: each touch and click on its strip, its Today, and its list,
// and where each tap on a day or on Today takes the list.
export const dayStripLog = createStepLog({
  key: "diagnosticsDayStrip",
  title: "Games list",
  isWatched: (target) => !!target.closest(".day-view"),
});
