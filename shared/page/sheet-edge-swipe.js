// A sheet that scrolls sideways, like a wide table, keeps a swipe that starts on it for itself, so
// a phone's browser never hands the swipe on to its row: at the sheet's left edge it springs the
// sheet past that edge instead. So a swipe right that isn't scrolling the sheet back, one that
// starts on its top or while it's at its left edge, moves the row with the finger instead, and
// once the finger lifts, the row goes on to the sheet before, or back to this one, as a swipe
// between sheets does. The row doesn't snap while the finger moves it, and `scrollToSheet` lets it
// snap again once it arrives.

// A touch has to move this far before it counts as a swipe, so a tap stays a tap.
const SWIPE_START_PX = 6;
// A swipe goes back once it has moved this share of the row's width, or is this fast as it lifts.
const BACK_SHARE = 0.3;
const BACK_SPEED_PX_PER_MS = 0.3;

/** @param {HTMLElement} sheet */
const scrollsSideways = (sheet) => sheet.scrollWidth > sheet.clientWidth;

/** @param {Node} target */
const isOnTop = (target) => target instanceof Element && target.closest(".sheet-top") !== null;

/**
 * Moves the row with a swipe right that starts on a sideways sheet's top or at its left edge, and
 * settles it on a sheet once the finger lifts.
 * @param {HTMLElement} row
 * @param {{ findShownSheet: () => HTMLElement, readShown: () => number, scrollToSheet: (index: number) => void }} options
 *   `readShown` is the shown sheet's place in the row, and `scrollToSheet` brings the row to the
 *   sheet at a place, letting it snap again once there
 */
export function stepBackOnEdgeSwipe(row, { findShownSheet, readShown, scrollToSheet }) {
  /** @type {{ index: number, originX: number, originY: number, rowStart: number, lastX: number, lastTime: number, speed: number, isDragging: boolean } | null} */
  let swipe = null;

  /** @param {TouchEvent} event */
  function startSwipe(event) {
    const sheet = findShownSheet();
    const index = readShown();
    if (event.touches.length !== 1 || index === 0 || !(event.target instanceof Node)) return;
    if (!sheet.contains(event.target) || !scrollsSideways(sheet)) return;
    if (sheet.scrollLeft > 0 && !isOnTop(event.target)) return;
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
   * A swipe that sets off mostly rightward is the row's; any other is the sheet's own.
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
      row.classList.add("is-moving");
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
    scrollToSheet(isBack ? index - 1 : index);
  }

  row.addEventListener("touchstart", startSwipe, { passive: true });
  row.addEventListener("touchmove", followSwipe, { passive: false });
  row.addEventListener("touchend", endSwipe);
  row.addEventListener("touchcancel", endSwipe);
}
