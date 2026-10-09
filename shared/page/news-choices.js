// The settings panel's News switches: the league's own team's beat writers, and the outlets whose
// stories mostly need a subscription. Both are on until switched off.

import { createViewerChoice } from "./device-storage.js";

const SWITCH_IDS = { teamOutlets: "teamOutletsSwitch", paywalled: "paywalledSwitch" };

/** @typedef {import("./news-picks.js").NewsChoices} NewsChoices */

/**
 * @param {unknown} stored
 * @returns {NewsChoices}
 */
function readChoices(stored) {
  const saved = /** @type {Partial<NewsChoices> | null} */ (stored);
  return {
    teamOutlets: saved?.teamOutlets !== false,
    paywalled: saved?.paywalled !== false,
  };
}

const newsChoices = createViewerChoice("newsChoices", readChoices);

export const readNewsChoices = () => newsChoices.read();

/** @param {keyof NewsChoices} name */
const findSwitch = (name) => /** @type {HTMLElement} */ (document.getElementById(SWITCH_IDS[name]));

function showSwitches() {
  const choices = readNewsChoices();
  for (const name of /** @type {(keyof NewsChoices)[]} */ (Object.keys(SWITCH_IDS)))
    findSwitch(name).setAttribute("aria-checked", String(choices[name]));
}

/**
 * Shows the saved choices on the switches, and calls `onChange` after each switch's change, here or
 * in another tab.
 * @param {() => void} onChange
 */
export function startNewsChoices(onChange) {
  const showChange = () => {
    showSwitches();
    onChange();
  };
  showSwitches();
  for (const name of /** @type {(keyof NewsChoices)[]} */ (Object.keys(SWITCH_IDS))) {
    findSwitch(name).addEventListener("click", () => {
      const choices = readNewsChoices();
      newsChoices.keep({ ...choices, [name]: !choices[name] });
      showChange();
    });
  }
  newsChoices.watch(showChange);
}
