import { html, setHtml } from "./html.js";
import { createPillThumb } from "./pill-thumb.js";
import { selectTab, wireTabs } from "./tabs.js";

// Lists side by side under a pill, as pager.css lays them out, like the Games view's Previous,
// Today, and Next. A tap on the pill or a swipe moves between them. An app fills the lists; the
// pager only moves between them.

/** @typedef {import("./html.js").Markup} Markup */
/** @typedef {{ key: string, name: string }} PagerList */
/**
 * @typedef {object} PagerOptions
 * @property {string} label the pill's name for screen readers
 * @property {string} idPrefix starts the id of each element the pager builds
 * @property {PagerList[]} lists
 * @property {string} openOn the list shown first
 */

// The lists count as at rest once they haven't scrolled for this long, where scrollend doesn't say so.
const SETTLE_DELAY_MS = 150;
const hasScrollend = () => "onscrollend" in window;

const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** @returns {ScrollBehavior} */
const chooseScrollBehavior = () => (prefersReducedMotion() ? "instant" : "smooth");

/**
 * Builds the pill and the lists inside `root`, and wires them.
 * @param {HTMLElement} root
 * @param {PagerOptions} options
 * @returns {{
 *   fill: (renderList: (key: string) => Markup) => void,
 *   readShownList: () => string,
 *   readChosenList: () => string,
 *   showList: (key: string) => void,
 *   switchToList: (key: string) => void,
 * }}
 */
export function createPager(root, { label, idPrefix, lists, openOn }) {
  const keys = lists.map((list) => list.key);
  let shownList = openOn;
  // The list a tapped tab is scrolling to, which the lists settle on even when they come to rest early.
  /** @type {string | null} */
  let scrollTarget = null;
  let pagesWidth = 0;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let settleTimer;

  /** @param {string} key */
  const findPage = (key) =>
    /** @type {HTMLElement} */ (document.getElementById(`${idPrefix}-${key}`));
  const findTabs = () =>
    /** @type {HTMLButtonElement[]} */ ([...root.querySelectorAll("[role=tab]")]);
  const findBar = () => /** @type {HTMLElement} */ (document.getElementById(`${idPrefix}-bar`));
  const findPages = () => /** @type {HTMLElement} */ (document.getElementById(`${idPrefix}-pages`));

  /** @param {PagerList} list */
  function renderTab({ key, name }) {
    const isShown = key === shownList;
    return html`<button
      type="button"
      role="tab"
      id="${idPrefix}-tab-${key}"
      data-tab="${key}"
      aria-controls="${idPrefix}-${key}"
      aria-selected="${String(isShown)}"
      tabindex="${isShown ? "0" : "-1"}"
      class="${isShown ? "active" : ""}"
    >
      ${name}
    </button>`;
  }

  /** @param {PagerList} list */
  const renderPage = ({ key }) =>
    html`<div
      id="${idPrefix}-${key}"
      class="pager-page"
      role="tabpanel"
      aria-labelledby="${idPrefix}-tab-${key}"
    ></div>`;

  const renderPager = () =>
    html`<div id="${idPrefix}-bar" class="pager-bar">
        <div class="pager-tabs" role="tablist" aria-label="${label}">
          <span class="pager-thumb" aria-hidden="true"></span>
          ${lists.map(renderTab)}
        </div>
      </div>
      <div id="${idPrefix}-pages" class="pager-pages">${lists.map(renderPage)}</div>`;

  // How far down the screen the pill holds, which is under anything else held to the top.
  const readBarTop = () => parseFloat(getComputedStyle(findBar()).top) || 0;

  // A list is never shorter than the space under the pill, so the lists can always rise to just
  // under it: the list a swipe brings in then starts there, even from far down a longer one. The
  // page's height and scroll are whole pixels, so the space takes a pixel more, or lists that start
  // a fraction of a pixel down the page would stop just short of the pill.
  function measureRoomUnderBar() {
    const bottomPadding = parseFloat(getComputedStyle(document.body).paddingBottom);
    return Math.ceil(innerHeight - bottomPadding - readBarTop() - findBar().offsetHeight) + 1;
  }

  // A hidden pill has no height to measure, so the room waits until the lists show.
  function fitPagesToRoomUnderBar() {
    if (!findBar().offsetHeight) return;
    const room = `${measureRoomUnderBar()}px`;
    const pages = findPages();
    if (pages.style.getPropertyValue("--room-under-bar") !== room)
      pages.style.setProperty("--room-under-bar", room);
  }

  // The page's scroll position that puts the top of the lists just under the pill.
  const measureListsTopScroll = () =>
    findPages().getBoundingClientRect().top + scrollY - readBarTop() - findBar().offsetHeight;

  // The lists share the page's scroll, so once it has carried the shown list up under the pill,
  // the others move down by as much, and a swipe brings each in from its top.
  function alignHiddenLists() {
    if (!findPages().clientWidth) return;
    const offset = Math.max(0, scrollY - measureListsTopScroll());
    findBar().classList.toggle("stuck", offset > 0);
    for (const key of keys) {
      const isOffset = offset > 0 && key !== shownList;
      findPage(key).style.transform = isOffset ? `translateY(${offset}px)` : "";
    }
  }

  /** @param {string} key */
  function markListsFor(key) {
    shownList = key;
    selectTab(findTabs(), key);
    for (const other of keys) findPage(other).inert = other !== key;
  }

  // A newly shown list keeps its place on screen: the page scrolls back by as much as it was moved.
  /** @param {string} key */
  function markShownList(key) {
    const listsTopScroll = measureListsTopScroll();
    const isNewList = key !== shownList;
    markListsFor(key);
    fitPagesToRoomUnderBar();
    if (isNewList && scrollY > listsTopScroll)
      scrollTo({ top: listsTopScroll, behavior: "instant" });
    alignHiddenLists();
  }

  /** @param {HTMLElement} pages */
  const readSwipePosition = (pages) => pages.scrollLeft / pages.clientWidth;
  /**
   * @param {HTMLElement} pages
   * @param {string} key
   */
  const findListLeft = (pages, key) => keys.indexOf(key) * pages.clientWidth;
  /**
   * @param {HTMLElement} pages
   * @param {string} key
   */
  const isAtList = (pages, key) => Math.abs(pages.scrollLeft - findListLeft(pages, key)) < 1;

  /**
   * @param {string} key
   * @param {ScrollBehavior} behavior
   */
  function scrollToList(key, behavior) {
    const pages = findPages();
    pages.scrollTo({ left: findListLeft(pages, key), behavior });
  }

  function scheduleSettle() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settleAfterQuiet, SETTLE_DELAY_MS);
  }

  // Safari can move the lists without firing scrollend, so lists that stop on a list other than the
  // shown one settle there even where the browser has scrollend. Anywhere else, a finger may still
  // be holding them, so where the browser has scrollend, only it settles them.
  function settleAfterQuiet() {
    const pages = findPages();
    const restingList = keys[Math.round(readSwipePosition(pages))];
    const isOnAnotherList = restingList !== shownList && isAtList(pages, restingList);
    if (hasScrollend() && !isOnAnotherList) return;
    settleSwipe("timer");
  }

  // Changing the lists' height or inertness mid-swipe can stop Safari's swipe short of a list, so
  // the shown list changes only once the lists come to rest on it, and a rest between lists goes
  // on to the nearest one. Diagnostics lists what last settled them.
  /** @param {"scrollend" | "timer"} settledBy */
  function settleSwipe(settledBy) {
    const pages = findPages();
    if (!pages.clientWidth) return;
    pages.dataset.settledBy = settledBy;
    const key = scrollTarget || keys[Math.round(readSwipePosition(pages))];
    if (!isAtList(pages, key)) {
      scrollToList(key, chooseScrollBehavior());
      return;
    }
    scrollTarget = null;
    if (key !== shownList) markShownList(key);
  }

  // While the lists scroll to one a tap chose, the pill's block is already sliding there.
  function followSwipe() {
    const pages = findPages();
    if (!pages.clientWidth) return;
    if (!scrollTarget) thumb.moveThumb(readSwipePosition(pages));
    scheduleSettle();
  }

  /** @param {string} key */
  function showList(key) {
    if (isAtList(findPages(), key)) {
      jumpToList(key);
      return;
    }
    selectTab(findTabs(), key);
    scrollTarget = key;
    thumb.moveThumb(keys.indexOf(key), { isSliding: true });
    scrollToList(key, chooseScrollBehavior());
  }

  /** @param {string} key */
  function jumpToList(key) {
    scrollTarget = null;
    scrollToList(key, "instant");
    thumb.moveThumb(keys.indexOf(key));
    markShownList(key);
  }

  // A hidden view's pages lose their scroll position, so the pager scrolls back to its list each
  // time it comes into view or the screen's width changes. It runs in an observer, so it only
  // scrolls: anything that resized the page there would loop the observer.
  function realignPages() {
    const { clientWidth } = findPages();
    if (clientWidth === pagesWidth) return;
    pagesWidth = clientWidth;
    if (!clientWidth) return;
    scrollTarget = null;
    scrollToList(shownList, "instant");
    thumb.moveThumb(keys.indexOf(shownList));
  }

  // Lists in a hidden view have no width to scroll, so one chosen there waits for realignPages.
  /** @param {string} key */
  function switchToList(key) {
    if (findPages().clientWidth) jumpToList(key);
    else markListsFor(key);
  }

  function wireSwipe() {
    const pages = findPages();
    const releaseScrollTarget = () => (scrollTarget = null);
    /** @param {WheelEvent} event */
    const releaseOnSidewaysWheel = (event) => event.deltaX && releaseScrollTarget();
    pages.addEventListener("scroll", followSwipe, { passive: true });
    pages.addEventListener("scrollend", () => settleSwipe("scrollend"));
    pages.addEventListener("pointerdown", releaseScrollTarget);
    pages.addEventListener("wheel", releaseOnSidewaysWheel, { passive: true });
    // The pill's bar is as wide as the lists, and realignPages never resizes it.
    new ResizeObserver(realignPages).observe(findBar());
    // The room under the pill is measured once the pill shows. An IntersectionObserver reports
    // that, and unlike a ResizeObserver, resizing the page in its callback loops nothing.
    new IntersectionObserver(fitPagesToRoomUnderBar).observe(findBar());
    addEventListener("resize", fitPagesToRoomUnderBar);
    addEventListener("scroll", alignHiddenLists, { passive: true });
  }

  root.classList.add("pager");
  setHtml(root, renderPager());
  const thumb = createPillThumb(/** @type {HTMLElement} */ (root.querySelector("[role=tablist]")));
  wireTabs(findTabs(), showList);
  markShownList(shownList);
  thumb.moveThumb(keys.indexOf(shownList));
  wireSwipe();

  return {
    fill(renderList) {
      for (const key of keys) setHtml(findPage(key), renderList(key));
    },
    readShownList: () => shownList,
    readChosenList: () => scrollTarget ?? shownList,
    showList,
    switchToList,
  };
}
