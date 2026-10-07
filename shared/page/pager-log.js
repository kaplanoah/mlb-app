// While Diagnostics is on, each record ends with where each pager's lists are: how far their row
// is scrolled and whether scrollend or the fallback timer last settled it, and for each list where
// it sits on the screen, how it's styled, and its first item's opacity and what a tap on it would
// land on, and with every animation on the page that hasn't finished. A list the phone laid out but didn't draw still names its item.

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
const describeSettle = (pages) =>
  pages.dataset.settledBy ? `last settled by ${pages.dataset.settledBy}` : "not yet settled";

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
