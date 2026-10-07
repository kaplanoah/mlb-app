// While Diagnostics is on, each record ends with where each pager's lists are: how far their row
// is scrolled, and for each list where it sits on the screen, how it's styled, and what a tap on
// its first item would land on. A list the phone laid out but didn't draw still names its item.

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
  return `first item at ${describeRect(rect)}, a tap there lands on ${nameElement(document.elementFromPoint(x, y))}`;
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
const describePages = (pages) =>
  [
    `${pages.id} scrolled ${Math.round(pages.scrollLeft)} of ${pages.scrollWidth}, ${pages.clientWidth} wide`,
    .../** @type {HTMLElement[]} */ ([...pages.children]).map(describeList),
  ].join("; ");

/**
 * A line for each pager showing on the screen.
 * @returns {string[]}
 */
export const describeShownPagers = () =>
  /** @type {HTMLElement[]} */ ([...document.querySelectorAll(".pager-pages")])
    .filter((pages) => pages.clientWidth > 0)
    .map(describePages);
