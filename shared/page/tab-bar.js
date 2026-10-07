import { readSelectedTab } from "./tabs.js";

// Matches the phone layout in chrome.css, where the tabs float at the bottom as a tinted glass bar.
const FLOATING_MEDIA = "(max-width: 779px)";
/** @type {MediaQueryList | undefined} */
let floatingQuery;

const BAR_PADDING_PX = 5;
const PILL_OVERHANG_PX = 4;
// The tabs sit in from the pill's inset by its overhang, so every pill can center on its tab.
const ROW_INSET_PX = BAR_PADDING_PX + PILL_OVERHANG_PX;
const DRAG_THRESHOLD_PX = 6;
// A click this soon after a press the bar handled is that press's own click.
const PRESS_CLICK_WINDOW_MS = 600;

const press = {
  isActive: false,
  isDragging: false,
  startX: 0,
  pointerId: null,
  /** @type {string | undefined} */
  tab: undefined,
  choseAt: -Infinity,
};
let pillX = 0;
/** @type {(tab: string) => void} */
let chooseTab = () => {};
/** @type {DOMRect | null} */
let restingBarRect = null;

const findBar = () => /** @type {HTMLElement} */ (document.getElementById("tabBar"));
const findList = () => /** @type {HTMLElement} */ (findBar().querySelector(".tab-list"));
const findPill = () => /** @type {HTMLElement} */ (findBar().querySelector(".tab-pill"));
const findTabButtons = () =>
  /** @type {HTMLButtonElement[]} */ ([...findList().querySelectorAll("[role=tab]")]);
const readTabs = () => findTabButtons().map((button) => button.dataset.tab);
const readShownTab = () => readSelectedTab(findTabButtons());

// Read on first use, so the module can load where there is no screen.
const readFloatingQuery = () => (floatingQuery ??= matchMedia(FLOATING_MEDIA));
const isFloating = () => readFloatingQuery().matches;
const measureSlotWidth = () => (findList().clientWidth - ROW_INSET_PX * 2) / readTabs().length;
const clampToRow = (x) => Math.min(Math.max(x, 0), measureSlotWidth() * (readTabs().length - 1));
const findPillX = (tab) => readTabs().indexOf(tab) * measureSlotWidth();
const measurePointerX = (event) =>
  event.clientX - findList().getBoundingClientRect().left - ROW_INSET_PX;

// A phone can hit-test a touch that stops the page's momentum scroll against where the page has
// scrolled rather than where the bar still sits, and hand a tap on the bar to the page under it, so
// a touch is the bar's by where the bar rests on the screen too. Nothing but a dialog sits over it.
function measureRestingBar() {
  restingBarRect = findBar().getBoundingClientRect();
}

/** @param {{ clientX: number, clientY: number }} point */
const isWithinRestingBar = ({ clientX, clientY }) =>
  restingBarRect !== null &&
  clientX >= restingBarRect.left &&
  clientX <= restingBarRect.right &&
  clientY >= restingBarRect.top &&
  clientY <= restingBarRect.bottom;

/**
 * Whether a touch or click is on the tab bar, or where it rests outside an open dialog.
 * @param {Event} event
 * @param {{ clientX: number, clientY: number }} point
 */
export function isAtTabBar(event, point) {
  if (!(event.target instanceof Element) || event.target.closest("dialog[open]")) return false;
  return findBar().contains(event.target) || isWithinRestingBar(point);
}

function findTabUnderPill() {
  const tabs = readTabs();
  const slot = Math.round(pillX / measureSlotWidth());
  return tabs[Math.min(Math.max(slot, 0), tabs.length - 1)];
}

function findTabUnderPointer(event) {
  const tabs = readTabs();
  const slot = Math.floor(measurePointerX(event) / measureSlotWidth());
  return tabs[Math.min(Math.max(slot, 0), tabs.length - 1)];
}

/** @param {number} x */
function movePill(x) {
  pillX = x;
  findPill().style.transform = `translateX(${x}px)`;
}

/** @param {string | undefined} tab */
const slidePillTo = (tab) => movePill(findPillX(tab));

// The pill slides by its CSS transition, which a move that isn't a choice, like a resize, skips:
// reading the pill's box applies the move before the transition comes back.
/** @param {string | undefined} tab */
function placePillOn(tab) {
  const bar = findBar();
  bar.classList.add("is-placing");
  slidePillTo(tab);
  findPill().getBoundingClientRect();
  bar.classList.remove("is-placing");
}

function endDrag() {
  Object.assign(press, { isActive: false, isDragging: false });
  findBar().classList.remove("is-dragging");
}

// The pill heads for the touched tab on touch-down; the view switches on release.
function startPress(event) {
  if (!isFloating() || event.button !== 0 || !isAtTabBar(event, event)) return;
  Object.assign(press, {
    isActive: true,
    isDragging: false,
    startX: event.clientX,
    pointerId: event.pointerId,
    tab: findTabUnderPointer(event),
  });
  findBar().setPointerCapture(event.pointerId);
  slidePillTo(press.tab);
}

// While dragging, the pill follows the finger.
function trackPress(event) {
  if (!press.isActive || event.pointerId !== press.pointerId) return;
  if (!press.isDragging && Math.abs(event.clientX - press.startX) < DRAG_THRESHOLD_PX) return;
  press.isDragging = true;
  findBar().classList.add("is-dragging");
  movePill(clampToRow(measurePointerX(event) - measureSlotWidth() / 2));
}

function endPress(event) {
  if (!press.isActive || event.pointerId !== press.pointerId) return;
  const wasDragging = press.isDragging;
  // A cancelled touch may not say where it was, so a tap chooses the tab it started on.
  const tab = wasDragging ? findTabUnderPill() : press.tab;
  endDrag();
  // A phone's browser takes a tap that stops the page's momentum scroll for itself and cancels it,
  // but the tap still meant its tab, so only a cancelled drag goes back.
  if (event.type === "pointercancel" && wasDragging) {
    slidePillTo(readShownTab());
    return;
  }
  slidePillTo(tab);
  press.choseAt = performance.now();
  // Only a tap on the selected tab asks it to scroll to the top, not a drag that wanders back.
  const isDragBackToSelected = wasDragging && tab === readShownTab();
  if (!isDragBackToSelected) chooseTab(tab);
}

// A press chooses its tab itself, so the click that follows it must not choose again.
// Screen readers activate tabs with a bare click, which still goes through.
function ignorePressClicks(event) {
  const isPressClick = performance.now() - press.choseAt < PRESS_CLICK_WINDOW_MS;
  if (!isFloating() || !isPressClick || !isAtTabBar(event, event)) return;
  event.preventDefault();
  event.stopPropagation();
}

function fitBar() {
  measureRestingBar();
  if (!isFloating()) return;
  const bar = findBar();
  bar.style.setProperty("--pill-width", `${measureSlotWidth() + PILL_OVERHANG_PX * 2}px`);
  if (!press.isActive) placePillOn(readShownTab());
  bar.classList.add("placed");
}

// iOS can drop the end of a press while the page is off the screen, which would leave the pill
// off the shown tab for good, so leaving puts it back.
function restPill() {
  endDrag();
  if (isFloating()) placePillOn(readShownTab());
}

function restPillWhenHidden() {
  if (document.hidden) restPill();
}

/**
 * Moves the selection pill to a tab chosen some other way, like the keyboard.
 * @param {string} tab
 */
export function moveTabSelection(tab) {
  if (isFloating()) slidePillTo(tab);
}

/**
 * Wires the floating tab bar that phones show.
 * @param {(tab: string) => void} onChoose
 */
export function startTabBar(onChoose) {
  chooseTab = onChoose;
  document.addEventListener("pointerdown", startPress);
  document.addEventListener("pointermove", trackPress);
  document.addEventListener("pointerup", endPress);
  document.addEventListener("pointercancel", endPress);
  document.addEventListener("click", ignorePressClicks, true);
  addEventListener("resize", measureRestingBar);
  document.addEventListener("visibilitychange", restPillWhenHidden);
  addEventListener("pagehide", restPill);
  readFloatingQuery().addEventListener("change", fitBar);
  new ResizeObserver(fitBar).observe(findList());
  fitBar();
}
