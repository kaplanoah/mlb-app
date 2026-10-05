// The settings panel's News switches: the Liberty's own beat writers, and The Athletic, whose
// stories mostly need a subscription. Both are on until switched off.

import { keepOnDevice, readFromDevice } from "#shared/device-storage.js";

const STORAGE_KEY = "newsChoices";
const SWITCH_IDS = { teamOutlets: "teamOutletsSwitch", paywalled: "paywalledSwitch" };

/** @typedef {import("./news-picks.js").NewsChoices} NewsChoices */

/** @returns {NewsChoices} */
function readSavedChoices() {
  const saved = /** @type {Partial<NewsChoices> | null} */ (readFromDevice(STORAGE_KEY));
  return {
    teamOutlets: saved?.teamOutlets !== false,
    paywalled: saved?.paywalled !== false,
  };
}

let choices = readSavedChoices();

export const readNewsChoices = () => choices;

/** @param {keyof NewsChoices} name */
const findSwitch = (name) => /** @type {HTMLElement} */ (document.getElementById(SWITCH_IDS[name]));

function showSwitches() {
  for (const name of /** @type {(keyof NewsChoices)[]} */ (Object.keys(SWITCH_IDS)))
    findSwitch(name).setAttribute("aria-checked", String(choices[name]));
}

/**
 * Shows the saved choices on the switches, and saves each switch's change and calls `onChange`.
 * @param {() => void} onChange
 */
export function startNewsChoices(onChange) {
  showSwitches();
  for (const name of /** @type {(keyof NewsChoices)[]} */ (Object.keys(SWITCH_IDS))) {
    findSwitch(name).addEventListener("click", () => {
      choices = { ...choices, [name]: !choices[name] };
      keepOnDevice(STORAGE_KEY, choices);
      showSwitches();
      onChange();
    });
  }
}
