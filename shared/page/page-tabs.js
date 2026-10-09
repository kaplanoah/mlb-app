import { saveLastTab } from "./last-tab.js";
import { scrollToTop } from "./spring-scroll.js";
import { moveTabSelection } from "./tab-bar.js";
import { readSelectedTab, selectTab, wireTabs } from "./tabs.js";

// The page's own tabs, in the tab bar, each showing the section whose id is `view-<tab>`.

const findTabButtons = () =>
  /** @type {HTMLButtonElement[]} */ ([...document.querySelectorAll("nav.tabs [role=tab]")]);

/** @param {string} tab */
function showTab(tab) {
  selectTab(findTabButtons(), tab);
  for (const view of document.querySelectorAll("section.view")) {
    view.classList.toggle("active", view.id === `view-${tab}`);
  }
}

/** @param {string} tab */
function switchTab(tab) {
  showTab(tab);
  moveTabSelection(tab);
  saveLastTab(tab);
}

// What choosing a tab that's already showing does instead of scrolling to the top, for a tab whose
// start isn't its top, like a Games view's today.
/** @type {Map<string, () => boolean>} */
const startReturns = new Map();

/**
 * Has choosing `tab` while it's showing call `returnToStart`, which says whether it moved the tab,
 * as when the tab wasn't already at its start.
 * @param {string} tab
 * @param {() => boolean} returnToStart
 */
export function setTabStart(tab, returnToStart) {
  startReturns.set(tab, returnToStart);
}

// As on iPhone, choosing the tab that's already showing takes it back to where it starts, and then
// to the top.
/** @param {string} tab */
function returnToStart(tab) {
  if (!startReturns.get(tab)?.()) scrollToTop();
}

/** @param {string} tab */
function chooseTab(tab) {
  if (tab === readSelectedTab(findTabButtons())) returnToStart(tab);
  else switchTab(tab);
}

// The page has already reopened its last tab (open-last-tab.js), with the pill on it.
export function startPageTabs() {
  wireTabs(findTabButtons(), chooseTab);
}
