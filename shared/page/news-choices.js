// The settings panel's News switches: the league's own team's beat writers, and each switch a league
// gives for outlets a device can leave out, like ones whose stories mostly need a subscription. Each
// is on until switched off, and shows on its button, `#<name>Switch`.

import { createViewerChoice } from "./device-storage.js";
import { isChoiceOn, TEAM_OUTLETS } from "./news-picks.js";

/** @typedef {import("./news-picks.js").NewsChoices} NewsChoices */

/**
 * @param {unknown} stored
 * @returns {NewsChoices}
 */
const readChoices = (stored) =>
  stored && typeof stored === "object"
    ? Object.fromEntries(Object.entries(stored).filter(([, isOn]) => typeof isOn === "boolean"))
    : {};

const newsChoices = createViewerChoice("newsChoices", readChoices);

export const readNewsChoices = () => newsChoices.read();

/** @param {string} name */
const findSwitch = (name) => /** @type {HTMLElement} */ (document.getElementById(`${name}Switch`));

/** @param {string[]} names */
function showSwitches(names) {
  const choices = readNewsChoices();
  for (const name of names)
    findSwitch(name).setAttribute("aria-checked", String(isChoiceOn(choices, name)));
}

/**
 * Shows the saved choices on the switches, and calls `onChange` after each switch's change, here or
 * in another tab.
 * @param {() => void} onChange
 * @param {string[]} outletSwitches the names of the league's switches for its outlets
 */
export function startNewsChoices(onChange, outletSwitches) {
  const names = [TEAM_OUTLETS, ...outletSwitches];
  const showChange = () => {
    showSwitches(names);
    onChange();
  };
  showSwitches(names);
  for (const name of names) {
    findSwitch(name).addEventListener("click", () => {
      const choices = readNewsChoices();
      newsChoices.keep({ ...choices, [name]: !isChoiceOn(choices, name) });
      showChange();
    });
  }
  newsChoices.watch(showChange);
}
