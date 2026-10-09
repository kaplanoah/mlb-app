// While Diagnostics is on, each record ends with where each pager's lists are: how far their row
// is scrolled, whether scrollend or the fallback timer last settled it, the list they last went
// back from after a move no one made, and for each list where it sits on the screen, how it's
// styled, and its first item's opacity and what a tap on it would land on, and with every
// animation on the page that hasn't finished. A list the phone laid out but didn't draw still
// names its item. A season's list of days (day-strip.js) says the same of the day at its top, and
// which day its strip has chosen.

/** @param {DOMRect} rect */
const describeRect = ({ left, top, width, height }) =>
  `${Math.round(left)},${Math.round(top)} ${Math.round(width)}x${Math.round(height)}`;

/** @param {Element | null} element */
function nameElement(element) {
  if (!element) return "nothing";
  if (element.id) return `#${element.id}`;
  return [element.localName, ...element.classList].join(".");
}

/** @param {DOMRect} rect */
const isOnScreen = ({ left, top, right, bottom }) =>
  right > 0 && bottom > 0 && left < innerWidth && top < innerHeight;

/** @param {Element | null} item */
function describeFirstItem(item) {
  if (!item) return "no items";
  const rect = item.getBoundingClientRect();
  if (!isOnScreen(rect)) return `first item at ${describeRect(rect)}, off the screen`;
  const x = Math.max(0, rect.left) + 1;
  const y = Math.max(0, rect.top) + 1;
  const { opacity } = getComputedStyle(item);
  return `first item at ${describeRect(rect)}, opacity ${opacity}, a tap there lands on ${nameElement(document.elementFromPoint(x, y))}`;
}

/** @param {HTMLElement} list */
function describeList(list) {
  const style = getComputedStyle(list);
  return [
    `${list.id} at ${describeRect(list.getBoundingClientRect())}`,
    `opacity ${style.opacity}`,
    style.visibility,
    `transform ${style.transform}`,
    list.inert && "inert",
    describeFirstItem(list.firstElementChild),
  ]
    .filter(Boolean)
    .join(", ");
}

/** @param {HTMLElement} pages */
function describeSettle(pages) {
  const { settledBy, putBackFrom } = pages.dataset;
  if (!settledBy) return "not yet settled";
  const putBack = putBackFrom ? `, last put back from ${putBackFrom}, a move no one made` : "";
  return `last settled by ${settledBy}${putBack}`;
}

/** @param {HTMLElement} pages */
const describePages = (pages) =>
  [
    `${pages.id} scrolled ${Math.round(pages.scrollLeft)} of ${pages.scrollWidth}, ${pages.clientWidth} wide, ${describeSettle(pages)}`,
    .../** @type {HTMLElement[]} */ ([...pages.children]).map(describeList),
  ].join("; ");

/** @param {Animation} animation */
function describeAnimation(animation) {
  const target = /** @type {KeyframeEffect | null} */ (animation.effect)?.target ?? null;
  const time = Math.round(Number(animation.currentTime ?? 0));
  return `${nameElement(target)} ${animation.playState} at ${time}ms`;
}

/**
 * Every animation on the page that hasn't finished, as one that never moves on leaves what it
 * moves where it started, like a fade-in at nothing.
 */
export function describeAnimations() {
  const unfinished = document.getAnimations().filter(({ playState }) => playState !== "finished");
  return unfinished.length
    ? `Animations: ${unfinished.map(describeAnimation).join("; ")}`
    : "Animations: none";
}

/**
 * A line for each pager showing on the screen.
 * @returns {string[]}
 */
export const describeShownPagers = () =>
  /** @type {HTMLElement[]} */ ([...document.querySelectorAll(".pager-pages")])
    .filter((pages) => pages.clientWidth > 0)
    .map(describePages);

/** @param {HTMLElement} list */
function findDayAtTop(list) {
  const top = list.getBoundingClientRect().top + 1;
  const days = /** @type {HTMLElement[]} */ ([...list.children]);
  return days.find((day) => day.getBoundingClientRect().bottom > top) ?? null;
}

/** @param {HTMLElement} list */
function describeDayList(list) {
  const view = list.closest(".day-view");
  const chosen = /** @type {HTMLElement | null} */ (view?.querySelector(".day-cell.is-chosen"));
  const day = findDayAtTop(list);
  return [
    `${view?.id ?? "day list"} scrolled ${Math.round(list.scrollTop)} of ${list.scrollHeight}, ${list.clientHeight} tall`,
    `strip on ${chosen?.dataset.day ?? "no day"}`,
    `${day?.dataset.day ?? "no day"} at the top, ${describeFirstItem(day)}`,
  ].join("; ");
}

/**
 * A line for each season's list of days showing on the screen.
 * @returns {string[]}
 */
export const describeShownDayLists = () =>
  /** @type {HTMLElement[]} */ ([...document.querySelectorAll(".day-list")])
    .filter((list) => list.clientHeight > 0)
    .map(describeDayList);
