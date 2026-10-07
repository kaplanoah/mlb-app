// On phones the tabs float at the bottom in equal slots, and chrome.css slides the pill to the
// slot the bar's --tab-index names. open-last-tab.js places it before the first paint.

const findBar = () => /** @type {HTMLElement} */ (document.getElementById("tabBar"));

const readTabs = () =>
  /** @type {HTMLElement[]} */ ([...findBar().querySelectorAll("[role=tab]")]).map(
    (button) => button.dataset.tab,
  );

/**
 * Slides the pill to a tab.
 * @param {string} tab
 */
export function moveTabSelection(tab) {
  findBar().style.setProperty("--tab-index", String(readTabs().indexOf(tab)));
}
