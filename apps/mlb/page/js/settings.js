// Baseball's parts of the settings panel: the touches in the sheet that belong to the ranking and
// the season picker instead of the swipe.

import { startSettingsSheet } from "#shared/settings-sheet.js";

// The ranking's grips drag rows, and the season picker opens its own menu.
const isOwnGesture = (target) => target instanceof Element && !!target.closest(".grip, select");

export function startSettings() {
  startSettingsSheet({ isOwnGesture });
}
