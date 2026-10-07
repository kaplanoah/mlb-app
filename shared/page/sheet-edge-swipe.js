// What scrolls sideways inside a row, like a team's sections inside the row of sheets or its
// roster inside the row of sections, keeps a swipe that starts on it for itself, so a phone's
// browser never hands the swipe on to the row: at its left edge it springs past that edge instead.
// So a swipe right that starts while it's at its left edge moves the row with the finger instead,
// and once the finger lifts, the row goes on to the one before, or back to this one, as a swipe
// along the row does.

// A touch has to move this far before it counts as a swipe, so a tap stays a tap.
const SWIPE_START_PX = 6;
// A swipe goes back once it has moved this share of the row's width, or is this fast as it lifts.
const BACK_SHARE = 0.3;
const BACK_SPEED_PX_PER_MS = 0.3;
// The row has arrived on a sheet within this many pixels of its edge.
const ARRIVED_PX = 2;

/** @param {HTMLElement} scroller */
const scrollsSideways = (scroller) => scroller.scrollWidth > scroller.clientWidth;

/**
 * Lets the row snap again once it has arrived at `left`.
 * @param {HTMLElement} row
 * @param {number} left
 */
function snapOnArrival(row, left) {
  const hasArrived = () => Math.abs(row.scrollLeft - left) <= ARRIVED_PX;
  if (hasArrived()) return row.classList.remove("is-swiped");
  const release = () => {
    if (!hasArrived()) return;
    row.classList.remove("is-swiped");
    row.removeEventListener("scroll", release);
  };
  row.addEventListener("scroll", release, { passive: true });
}

/**
 * Moves the row with a swipe right that starts on what it shows while that's at its left edge, and
 * settles it on one of what it holds once the finger lifts.
 * @param {HTMLElement} row
 * @param {{ findShown: () => HTMLElement, findSideways: () => HTMLElement, readShown: () => number, scrollToIndex: (index: number) => void }} options
 *   `findShown` is what the row shows, `findSideways` what may scroll sideways in it, itself or a
 *   row of its own, `readShown` is its place in the row, and `scrollToIndex` brings the row to
 *   what's at a place
 */
export function stepBackOnEdgeSwipe(row, { findShown, findSideways, readShown, scrollToIndex }) {
  /** @type {{ index: number, originX: number, originY: number, rowStart: number, lastX: number, lastTime: number, speed: number, isDragging: boolean } | null} */
  let swipe = null;

  /** @param {TouchEvent} event */
  function startSwipe(event) {
    const shown = findShown();
    const sideways = findSideways();
    const index = readShown();
    if (event.touches.length !== 1 || index === 0 || !(event.target instanceof Node)) return;
    if (!shown.contains(event.target) || !scrollsSideways(sideways)) return;
    if (sideways.scrollLeft > 0) return;
    const { clientX, clientY } = event.touches[0];
    swipe = {
      index,
      originX: clientX,
      originY: clientY,
      rowStart: row.scrollLeft,
      lastX: clientX,
      lastTime: event.timeStamp,
      speed: 0,
      isDragging: false,
    };
  }

  /**
   * A swipe that sets off mostly rightward is the row's; any other is what it shows.
   * @param {number} across
   * @param {number} down
   */
  const isRightward = (across, down) => across > Math.abs(down);

  /**
   * @param {number} clientX
   * @param {number} time
   */
  function trackSpeed(clientX, time) {
    if (!swipe) return;
    const elapsed = time - swipe.lastTime;
    if (elapsed > 0) swipe.speed = (clientX - swipe.lastX) / elapsed;
    swipe.lastX = clientX;
    swipe.lastTime = time;
  }

  /** @param {TouchEvent} event */
  function followSwipe(event) {
    if (!swipe) return;
    const { clientX, clientY } = event.touches[0];
    const across = clientX - swipe.originX;
    if (!swipe.isDragging) {
      const down = clientY - swipe.originY;
      if (Math.hypot(across, down) < SWIPE_START_PX) return;
      if (!isRightward(across, down)) {
        swipe = null;
        return;
      }
      swipe.isDragging = true;
      row.classList.add("is-swiped");
    }
    if (event.cancelable) event.preventDefault();
    trackSpeed(clientX, event.timeStamp);
    row.scrollLeft = swipe.rowStart - Math.min(Math.max(across, 0), row.clientWidth);
  }

  /** @param {TouchEvent} event */
  function endSwipe(event) {
    if (!swipe) return;
    const { index, rowStart, speed, isDragging } = swipe;
    swipe = null;
    if (!isDragging) return;
    const moved = rowStart - row.scrollLeft;
    const isFarOrFast = moved > row.clientWidth * BACK_SHARE || speed > BACK_SPEED_PX_PER_MS;
    const isBack = event.type === "touchend" && isFarOrFast;
    snapOnArrival(row, isBack ? rowStart - row.clientWidth : rowStart);
    scrollToIndex(isBack ? index - 1 : index);
  }

  row.addEventListener("touchstart", startSwipe, { passive: true });
  row.addEventListener("touchmove", followSwipe, { passive: false });
  row.addEventListener("touchend", endSwipe);
  row.addEventListener("touchcancel", endSwipe);
}
