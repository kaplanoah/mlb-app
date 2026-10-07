import { createPillThumb } from "./pill-thumb.js";
import { stepBackOnEdgeSwipe } from "./sheet-edge-swipe.js";
import { selectTab, wireTabs } from "./tabs.js";

// A sheet's sections side by side under the pills in its top, like a WNBA team's Team and Roster.
// A tap on a pill or a swipe moves between them as the browser scrolls anything, and each section
// scrolls up and down on its own while the sheet's top, pills and all, stays still above them, with
// a line under it once the shown section has scrolled under it. A section that scrolls sideways,
// like the roster, goes back to the one before with a swipe right from its left edge.

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
  const top = /** @type {HTMLElement} */ (sheet.querySelector(".sheet-top"));
  const tabList = /** @type {HTMLElement} */ (sheet.querySelector(".sheet-top [role=tablist]"));
  const tabs = /** @type {HTMLButtonElement[]} */ ([...tabList.querySelectorAll("[role=tab]")]);
  const keys = tabs.map((tab) => tab.dataset.tab ?? "");
  const thumb = createPillThumb(tabList);
  let shown = keys[0];
  /** @type {string | null} */
  let slidingTo = null;
  let rowWidth = 0;

  /** @param {string} key */
  const findSection = (key) =>
    /** @type {HTMLElement} */ (
      document.getElementById(tabs[keys.indexOf(key)].getAttribute("aria-controls") ?? "")
    );

  // The pill's block follows the row, but for while it scrolls to a section a tap chose, where the
  // block is already sliding.
  function paintSwipe() {
    if (slidingTo) return;
    thumb.moveThumb(row.clientWidth ? row.scrollLeft / row.clientWidth : keys.indexOf(shown));
  }

  function markHeld() {
    top.classList.toggle("stuck", findSection(shown).scrollTop > 0);
  }

  /** @param {string} key */
  function markShown(key) {
    shown = key;
    selectTab(tabs, key);
    for (const other of keys) findSection(other).inert = other !== key;
    markHeld();
  }

  function settleWhereScrolled() {
    if (!row.clientWidth) return;
    const index = Math.round(row.scrollLeft / row.clientWidth);
    if (Math.abs(row.scrollLeft - index * row.clientWidth) > SETTLED_PX) return;
    if (keys[index] === slidingTo) slidingTo = null;
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
    const left = keys.indexOf(key) * row.clientWidth;
    const isSliding = behavior === "smooth" && Math.abs(row.scrollLeft - left) > SETTLED_PX;
    slidingTo = isSliding ? key : null;
    thumb.moveThumb(keys.indexOf(key), { isSliding });
    row.scrollTo({ left, behavior });
    if (!isSliding) markShown(key);
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

  row.addEventListener("pointerdown", () => (slidingTo = null));
  row.addEventListener("scroll", paintSwipe, { passive: true });
  row.addEventListener("scroll", settleWhereScrolled, { passive: true });
  row.addEventListener("scrollend", settleWhereScrolled);
  for (const key of keys) findSection(key).addEventListener("scroll", markHeld, { passive: true });
  new ResizeObserver(realign).observe(row);
  wireTabs(tabs, (key) => showSection(key));
  stepBackOnEdgeSwipe(row, {
    findShown: () => findSection(shown),
    findSideways: () => findSection(shown),
    readShown: () => keys.indexOf(shown),
    scrollToIndex: (index) => showSection(keys[index]),
  });
  markShown(shown);
  thumb.moveThumb(keys.indexOf(shown));

  return {
    findSections: () => row,
    findShownSection: () => findSection(shown),
    readShown: () => shown,
    showSection,
    showFirstSection,
  };
}
