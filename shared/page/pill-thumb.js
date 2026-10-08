import { readSelectedTab, selectTab } from "./tabs.js";

// The accent block under a pill's shown name. It never travels between names: once the lists or
// sections under the pill set off for another, the shown name's block hands off to the new one's,
// as pager.css fades them, and a pill shown at once, as for a sheet that's opening, jumps.

/**
 * Shows `key`'s name as the pill's chosen one.
 * @param {HTMLElement} tabList the pill, holding its names' tabs
 * @param {string} key
 * @param {{ isHandoff?: boolean }} [options] fades the block from the shown name to this one
 */
export function showPillName(tabList, key, { isHandoff = false } = {}) {
  const tabs = /** @type {HTMLButtonElement[]} */ ([...tabList.querySelectorAll("[role=tab]")]);
  if (readSelectedTab(tabs) === key) return;
  tabList.classList.toggle("is-handing-off", isHandoff);
  selectTab(tabs, key);
}
