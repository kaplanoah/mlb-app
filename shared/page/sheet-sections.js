import { createPillThumb } from "./pill-thumb.js";
import { followSideSwipes } from "./side-swipe.js";
import { SHEET_MOTION_MS } from "./sheet-swipe.js";
import { selectTab, wireTabs } from "./tabs.js";

// A sheet's sections under the pills in its top, like a WNBA team's Team and Roster, one shown at a
// time. A tap on a pill slides the shown section away and its own in, and a swipe drags the shown
// section with the finger, its neighbor beside it, and settles on the neighbor or springs back once
// the finger lifts. A section that scrolls sideways on its own, like the roster, keeps a swipe until
// it reaches its edge. Each section scrolls up and down on its own while the sheet's top, pills and
// all, stays still above them, with a line under it once the shown section has scrolled under it.
// Only the shown section is drawn while none is moving.

const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Wires a sheet's pills to its sections, which it shows from the first.
 * @param {HTMLElement} sheet holding a `.sheet-sections` row and, in its top, the pills that name
 *   them, each a tab whose `data-tab` is its section's key and whose `aria-controls` is its id
 */
export function wireSheetSections(sheet) {
  const row = /** @type {HTMLElement} */ (sheet.querySelector(".sheet-sections"));
  const tabList = /** @type {HTMLElement} */ (sheet.querySelector(".sheet-top [role=tablist]"));
  const top = /** @type {HTMLElement} */ (sheet.querySelector(".sheet-top"));
  const tabs = /** @type {HTMLButtonElement[]} */ ([...tabList.querySelectorAll("[role=tab]")]);
  const keys = tabs.map((tab) => tab.dataset.tab ?? "");
  const thumb = createPillThumb(tabList);
  let shown = keys[0];
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let slide;

  /** @param {string} key */
  const findSection = (key) =>
    /** @type {HTMLElement} */ (
      document.getElementById(tabs[keys.indexOf(key)].getAttribute("aria-controls") ?? "")
    );

  /**
   * Puts each section a whole width from the next, the one at `position` in place.
   * @param {number} position runs from 0 at the first section to the last's index
   */
  function placeSections(position) {
    keys.forEach((key, index) => {
      const share = index - position;
      findSection(key).style.transform = share ? `translateX(${share * 100}%)` : "";
    });
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

  /** @param {string} key */
  function settleOn(key) {
    clearTimeout(slide);
    row.classList.remove("is-moving", "is-sliding");
    placeSections(keys.indexOf(key));
    markShown(key);
  }

  /**
   * Slides the sections from wherever they are to rest on the one at `key`.
   * @param {string} key
   * @param {boolean} [isInstant] skips the slide, as for a sheet that's opening
   */
  function showSection(key, isInstant = false) {
    if (!keys.includes(key)) return;
    selectTab(tabs, key);
    if (isInstant || prefersReducedMotion()) {
      thumb.moveThumb(keys.indexOf(key));
      settleOn(key);
      return;
    }
    clearTimeout(slide);
    thumb.moveThumb(keys.indexOf(key), { isSliding: true });
    row.classList.add("is-moving", "is-sliding");
    placeSections(keys.indexOf(key));
    slide = setTimeout(() => settleOn(key), SHEET_MOTION_MS);
  }

  /** @param {-1 | 1} direction */
  const findNeighbor = (direction) => keys[keys.indexOf(shown) + direction];

  /**
   * @param {-1 | 1} direction
   * @param {number} share
   */
  function followSwipe(direction, share) {
    clearTimeout(slide);
    row.classList.toggle("is-sliding", false);
    row.classList.toggle("is-moving", true);
    const position = keys.indexOf(shown) + direction * share;
    placeSections(position);
    thumb.moveThumb(position);
  }

  /** Shows the first section, each scrolled to its top, as for a sheet showing something new. */
  function showFirstSection() {
    for (const key of keys) findSection(key).scrollTop = 0;
    showSection(keys[0], true);
  }

  for (const key of keys) findSection(key).addEventListener("scroll", markHeld, { passive: true });
  wireTabs(tabs, (key) => showSection(key));
  followSideSwipes(row, {
    canGo: (direction) => findNeighbor(direction) !== undefined,
    follow: followSwipe,
    settle: (direction, isGoing) => showSection(isGoing ? findNeighbor(direction) : shown),
  });
  settleOn(shown);
  thumb.moveThumb(keys.indexOf(shown));

  return {
    findShownSection: () => findSection(shown),
    readShown: () => shown,
    showSection,
    showFirstSection,
  };
}
