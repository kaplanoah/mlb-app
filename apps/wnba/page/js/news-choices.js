// The settings panel's News switches: the Liberty's own beat writers, and The Athletic, whose
// stories mostly need a subscription. Both are on until switched off, and each device keeps its
// own, since the page saves nothing to the store.

const STORAGE_KEY = "newsChoices";
const SWITCH_IDS = { teamOutlets: "teamOutletsSwitch", paywalled: "paywalledSwitch" };

/** @typedef {import("./news-picks.js").NewsChoices} NewsChoices */

/** @type {NewsChoices} */
const ALL_ON = { teamOutlets: true, paywalled: true };

// Storage can be off, as in a private window, and then every outlet shows.
/** @returns {NewsChoices} */
function readSavedChoices() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return {
      teamOutlets: saved?.teamOutlets !== false,
      paywalled: saved?.paywalled !== false,
    };
  } catch {
    return { ...ALL_ON };
  }
}

/** @param {NewsChoices} choices */
function saveChoices(choices) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choices));
  } catch {
    // The choice still applies until the page reloads.
  }
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
      saveChoices(choices);
      showSwitches();
      onChange();
    });
  }
}
