import { html, setHtml } from "./html.js";
import { showPillName } from "./pill-thumb.js";
import { wireTabs } from "./tabs.js";

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

// Without scrollend, the lists count as at rest once they haven't scrolled for this long.
const SETTLE_DELAY_MS = 150;
const hasScrollend = () => "onscrollend" in window;

const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** @returns {ScrollBehavior} */
const chooseScrollBehavior = () => (prefersReducedMotion() ? "instant" : "smooth");

/**
 * The list a swipe is heading for, once the lists first move after the finger lifts: the one past
 * where it let go in the way they move, which is where they snap.
 * @param {number} liftPosition where the lists were as the finger lifted, 0 at the first list
 * @param {number} position where they are now
 * @param {number} lastIndex the last list's
 * @returns {number | null} null while they haven't moved
 */
export function findSwipeTarget(liftPosition, position, lastIndex) {
  const movedBy = position - liftPosition;
  if (Math.abs(movedBy) < 0.001) return null;
  const target = movedBy > 0 ? Math.ceil(liftPosition) : Math.floor(liftPosition);
  return Math.min(Math.max(target, 0), lastIndex);
}

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
  let isTouching = false;
  // Safari moves the lists itself at times, as the page loads or comes back, so only a move a
  // person started, or a tapped tab's, changes the shown list.
  let isMovedByPerson = false;
  // Where the lists were as a finger lifted, until their next move says which list they snap to.
  /** @type {number | null} */
  let liftPosition = null;
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

  const findTabList = () => /** @type {HTMLElement} */ (root.querySelector("[role=tablist]"));

  /** @param {string} key */
  function markListsFor(key) {
    shownList = key;
    showPillName(findTabList(), key);
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
    settleTimer = setTimeout(() => settleSwipe("timer"), SETTLE_DELAY_MS);
  }

  /** @param {HTMLElement} pages */
  function chooseRestingList(pages) {
    if (scrollTarget) return scrollTarget;
    return isMovedByPerson ? keys[Math.round(readSwipePosition(pages))] : shownList;
  }

  // A move no one made goes straight back, and Diagnostics names the list it had gone to.
  /**
   * @param {HTMLElement} pages
   * @param {string} key
   */
  function returnToList(pages, key) {
    const isOwnMove = !scrollTarget && !isMovedByPerson;
    if (isOwnMove) pages.dataset.putBackFrom = keys[Math.round(readSwipePosition(pages))];
    scrollToList(key, isOwnMove ? "instant" : chooseScrollBehavior());
  }

  // Changing the lists' height or inertness mid-swipe can stop Safari's swipe short of a list, so
  // the shown list changes only once the lists come to rest on it, and a rest between lists goes
  // on to the nearest one. Diagnostics lists what last settled them.
  /** @param {"scrollend" | "timer"} settledBy */
  function settleSwipe(settledBy) {
    const pages = findPages();
    if (!pages.clientWidth) return;
    pages.dataset.settledBy = settledBy;
    const key = chooseRestingList(pages);
    if (!isAtList(pages, key)) {
      returnToList(pages, key);
      return;
    }
    scrollTarget = null;
    liftPosition = null;
    isMovedByPerson = false;
    if (key === shownList) return;
    showPillName(findTabList(), key, { isHandoff: true });
    markShownList(key);
  }

  // The pill holds still while a finger moves the lists, and hands off to the list they're heading
  // for once it lifts, as a tap's does at once. Lists moved some other way, like a trackpad's,
  // hand off as the next list comes most of the way in.
  /** @param {HTMLElement} pages */
  function chooseSwipeTarget(pages) {
    const position = readSwipePosition(pages);
    if (liftPosition === null) return Math.round(position);
    const target = findSwipeTarget(liftPosition, position, keys.length - 1);
    if (target !== null) liftPosition = null;
    return target;
  }

  function followSwipe() {
    const pages = findPages();
    if (!pages.clientWidth) return;
    if (!hasScrollend()) scheduleSettle();
    if (scrollTarget || isTouching || !isMovedByPerson) return;
    const target = chooseSwipeTarget(pages);
    if (target !== null) showPillName(findTabList(), keys[target], { isHandoff: true });
  }

  /** @param {string} key */
  function showList(key) {
    if (isAtList(findPages(), key)) {
      jumpToList(key);
      return;
    }
    showPillName(findTabList(), key, { isHandoff: true });
    scrollTarget = key;
    scrollToList(key, chooseScrollBehavior());
  }

  /** @param {string} key */
  function jumpToList(key) {
    scrollTarget = null;
    scrollToList(key, "instant");
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
  }

  // Lists in a hidden view have no width to scroll, so one chosen there waits for realignPages.
  /** @param {string} key */
  function switchToList(key) {
    if (findPages().clientWidth) jumpToList(key);
    else markListsFor(key);
  }

  function wireSwipe() {
    const pages = findPages();
    const startPersonMove = () => {
      scrollTarget = null;
      isMovedByPerson = true;
    };
    // A wheel at the lists' end in its direction moves nothing, so it starts no move.
    /** @param {WheelEvent} event */
    const canWheelMove = ({ deltaX }) =>
      deltaX < 0
        ? pages.scrollLeft >= 1
        : pages.scrollLeft <= pages.scrollWidth - pages.clientWidth - 1;
    /** @param {WheelEvent} event */
    const startSidewaysWheel = (event) => event.deltaX && canWheelMove(event) && startPersonMove();
    const startTouch = () => {
      isTouching = true;
      isMovedByPerson = true;
      liftPosition = null;
    };
    // A tap, a key that doesn't scroll sideways, or a finger that scrolls the page up or down,
    // leaves the lists where they were.
    const endPersonMove = () => {
      if (isAtList(pages, shownList)) isMovedByPerson = false;
    };
    const endTouch = () => {
      isTouching = false;
      liftPosition = readSwipePosition(pages);
      endPersonMove();
    };
    pages.addEventListener("scroll", followSwipe, { passive: true });
    pages.addEventListener("scrollend", () => settleSwipe("scrollend"));
    pages.addEventListener("pointerdown", startPersonMove);
    pages.addEventListener("pointerup", endPersonMove);
    pages.addEventListener("keydown", startPersonMove);
    pages.addEventListener("keyup", endPersonMove);
    pages.addEventListener("wheel", startSidewaysWheel, { passive: true });
    pages.addEventListener("touchstart", startTouch, { passive: true });
    pages.addEventListener("touchend", endTouch, { passive: true });
    pages.addEventListener("touchcancel", endTouch, { passive: true });
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
  wireTabs(findTabs(), showList);
  markShownList(shownList);
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
