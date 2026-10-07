// The accent block under a pill's shown name. It follows a swipe between names of any width, and
// slides straight to a name tapped, past any between, each name's letters taking the color of
// whatever is under them.

/**
 * @param {number} from
 * @param {number} to
 * @param {number} share
 */
const blend = (from, to, share) => from + (to - from) * share;

/**
 * Places the block in a pill's tab list, which holds a `.pager-thumb` before its tabs.
 * @param {HTMLElement} tabList
 */
export function createPillThumb(tabList) {
  const thumb = /** @type {HTMLElement} */ (tabList.querySelector(".pager-thumb"));
  const tabs = /** @type {HTMLElement[]} */ ([...tabList.querySelectorAll("[role=tab]")]);
  let position = 0;

  function paint() {
    const index = Math.min(Math.max(Math.floor(position), 0), tabs.length - 1);
    const next = tabs[Math.min(index + 1, tabs.length - 1)];
    const share = position - index;
    const left = blend(tabs[index].offsetLeft, next.offsetLeft, share);
    const width = blend(tabs[index].offsetWidth, next.offsetWidth, share);
    thumb.style.setProperty("--thumb-left", `${left}px`);
    thumb.style.setProperty("--thumb-width", `${width}px`);
    for (const tab of tabs) {
      tab.style.setProperty("--cover-start", `${left - tab.offsetLeft}px`);
      tab.style.setProperty("--cover-end", `${left + width - tab.offsetLeft}px`);
    }
  }

  /**
   * @param {number} nextPosition 0 at the first name, the last's index at the last, between them
   *   mid-swipe
   * @param {{ isSliding?: boolean }} [options] eases the block there, for a tap
   */
  function moveThumb(nextPosition, { isSliding = false } = {}) {
    tabList.classList.toggle("is-sliding", isSliding);
    position = nextPosition;
    paint();
  }

  // The names change width as the page's fonts arrive.
  new ResizeObserver(paint).observe(tabList);

  return { moveThumb };
}
