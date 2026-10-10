import { showPillName } from "./pill-thumb.js";
import { createSlidePanels } from "./slide-panels.js";
import { wireTabs } from "./tabs.js";

// A sheet's sections under the pills in its top, like a WNBA team's Team and Roster, one shown at a
// time, side by side, as slide-panels.js moves them: a tap on a pill slides to its section, and a
// swipe drags the shown section with its neighbor beside it. Each section scrolls up and down on
// its own under the sheet's still top. A section whose pill is hidden, like a game's Highlights
// before it ends, is neither shown nor swiped to.

/**
 * Wires a sheet's pills to its sections, which it shows from the first.
 * @param {HTMLElement} sheet holding a `.sheet-sections` row and, in its top, the pills that name
 *   them, each a tab whose `data-tab` is its section's key and whose `aria-controls` is its id
 */
export function wireSheetSections(sheet) {
  const row = /** @type {HTMLElement} */ (sheet.querySelector(".sheet-sections"));
  const tabList = /** @type {HTMLElement} */ (sheet.querySelector(".sheet-top [role=tablist]"));
  const tabs = /** @type {HTMLButtonElement[]} */ ([...tabList.querySelectorAll("[role=tab]")]);
  const keys = tabs.map((tab) => tab.dataset.tab ?? "");
  const sections = tabs.map(
    (tab) =>
      /** @type {HTMLElement} */ (document.getElementById(tab.getAttribute("aria-controls") ?? "")),
  );
  const findShownSection = () => sections[panels.readShown()];
  /** @param {number} index */
  const isOffered = (index) => Boolean(tabs[index] && !tabs[index].hidden);

  const panels = createSlidePanels(row, {
    listPanels: () => sections,
    place: (index, position) => index - position,
    canGo: (direction) => isOffered(panels.readShown() + direction),
    onShow: (index, isSliding) => showPillName(tabList, keys[index], { isHandoff: isSliding }),
  });

  /**
   * Slides to the section at `key`, or shows it at once, as for a sheet that's opening.
   * @param {string} key
   * @param {boolean} [isInstant]
   */
  function showSection(key, isInstant = false) {
    const index = keys.indexOf(key);
    if (!isOffered(index)) return;
    if (isInstant) panels.jumpTo(index);
    else panels.slideTo(index);
  }

  /** Shows the first section, each scrolled to its top, as for a sheet showing something new. */
  function showFirstSection() {
    for (const section of sections) section.scrollTop = 0;
    showSection(keys[0], true);
  }

  wireTabs(tabs, (key) => showSection(key));
  showSection(keys[0], true);

  return {
    findShownSection,
    readShown: () => keys[panels.readShown()],
    showSection,
    showFirstSection,
  };
}
