import { stepBackOnEdgeSwipe } from "./sheet-edge-swipe.js";
import { selectTab, wireTabs } from "./tabs.js";

// A sheet's sections side by side under the pills in its top, like a WNBA team's Team and Roster.
// A tap on a pill or a swipe moves between them as the browser scrolls anything, and each section
// scrolls up and down on its own while the sheet's top, pills and all, stays still above them. A
// section that scrolls sideways, like the roster, goes back to the one before with a swipe right
// from its left edge.

// The sections have come to rest on one within this many pixels of its edge.
const SETTLED_PX = 1;

const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  tabList.style.setProperty("--list-count", String(keys.length));
  let shown = keys[0];
  let rowWidth = 0;

  /** @param {string} key */
  const findSection = (key) =>
    /** @type {HTMLElement} */ (
      document.getElementById(tabs[keys.indexOf(key)].getAttribute("aria-controls") ?? "")
    );

  // The thumb under the pills follows the row, and each pill's name brightens as it nears it.
  function paintSwipe() {
    const position = row.clientWidth ? row.scrollLeft / row.clientWidth : keys.indexOf(shown);
    tabList.style.setProperty("--swipe", String(position));
    for (const [index, tab] of tabs.entries())
      tab.style.setProperty("--nearness", String(Math.max(0, 1 - Math.abs(index - position))));
  }

  /** @param {string} key */
  function markShown(key) {
    shown = key;
    selectTab(tabs, key);
    for (const other of keys) findSection(other).inert = other !== key;
  }

  function settleWhereScrolled() {
    if (!row.clientWidth) return;
    const index = Math.round(row.scrollLeft / row.clientWidth);
    if (Math.abs(row.scrollLeft - index * row.clientWidth) > SETTLED_PX) return;
    if (keys[index] && keys[index] !== shown) markShown(keys[index]);
  }

  /**
   * @param {string} key
   * @param {boolean} [isInstant] skips the slide, as for a sheet that's opening
   */
  function showSection(key, isInstant = false) {
    if (!keys.includes(key)) return;
    const behavior = isInstant || prefersReducedMotion() ? "instant" : "smooth";
    selectTab(tabs, key);
    row.scrollTo({ left: keys.indexOf(key) * row.clientWidth, behavior });
    if (behavior === "instant" || !row.clientWidth) {
      markShown(key);
      paintSwipe();
    }
  }

  // A hidden sheet's sections lose their place, so the row goes back to the shown one each time
  // the sheet comes into view or the screen's width changes.
  function realign() {
    if (row.clientWidth === rowWidth) return;
    rowWidth = row.clientWidth;
    if (!rowWidth) return;
    row.scrollLeft = keys.indexOf(shown) * rowWidth;
    paintSwipe();
  }

  /** Shows the first section, each scrolled to its top, as for a sheet showing something new. */
  function showFirstSection() {
    for (const key of keys) findSection(key).scrollTop = 0;
    showSection(keys[0], true);
  }

  row.addEventListener("scroll", paintSwipe, { passive: true });
  row.addEventListener("scroll", settleWhereScrolled, { passive: true });
  row.addEventListener("scrollend", settleWhereScrolled);
  new ResizeObserver(realign).observe(row);
  wireTabs(tabs, (key) => showSection(key));
  stepBackOnEdgeSwipe(row, {
    findShown: () => findSection(shown),
    findSideways: () => findSection(shown),
    readShown: () => keys.indexOf(shown),
    scrollToIndex: (index) => showSection(keys[index]),
  });
  markShown(shown);
  paintSwipe();

  return {
    findSections: () => row,
    findShownSection: () => findSection(shown),
    readShown: () => shown,
    showSection,
    showFirstSection,
  };
}
