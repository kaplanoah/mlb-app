// On phones, a dialog shown as a sheet over the whole screen closes with a swipe down, and slides
// down whichever way it closes.

// Matches chrome.css's phone layout, where dialogs are sheets.
const SHEET_MEDIA = "(max-width: 779px)";
// A swipe down closes the sheet once it goes this far or this fast; anything less springs back.
const CLOSE_DISTANCE_PX = 110;
const CLOSE_SPEED_PX_PER_MS = 0.5;
// A touch has to move this far before it counts as a swipe, so a tap stays a tap.
const SWIPE_START_PX = 6;
// The phone's own sheets' pace and easing, as chrome.css's --sheet-motion has them.
const SHEET_MOTION_MS = 500;
const SHEET_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

const isSheetLayout = () => matchMedia(SHEET_MEDIA).matches;
const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Moves a sheet from where a finger left it to `to`, and holds it there.
 * @param {HTMLElement} dialog
 * @param {string} to a transform
 */
function slideSheet(dialog, to) {
  const from = dialog.style.transform || "none";
  dialog.style.transform = "";
  const duration = prefersReducedMotion() ? 0 : SHEET_MOTION_MS;
  return dialog.animate([{ transform: from }, { transform: to }], {
    duration,
    easing: SHEET_EASING,
    fill: "forwards",
  });
}

// A sheet still opening goes straight to where it was opening to, so a finger moves it from there.
/** @param {HTMLElement} sheet */
function finishOpening(sheet) {
  for (const motion of sheet.getAnimations()) if (motion instanceof CSSAnimation) motion.finish();
}

/** @type {WeakSet<HTMLDialogElement>} */
const closingSheets = new WeakSet();

/**
 * Slides a sheet down and closes it.
 * @param {HTMLDialogElement} dialog
 */
async function slideSheetClosed(dialog) {
  if (closingSheets.has(dialog)) return;
  closingSheets.add(dialog);
  const slide = slideSheet(dialog, "translateY(100%)");
  await slide.finished;
  dialog.close();
  dialog.removeAttribute("data-dragged");
  slide.cancel();
  closingSheets.delete(dialog);
}

/**
 * Closes a sheet, sliding it down where it shows as a sheet.
 * @param {HTMLDialogElement} dialog
 */
export function closeSheet(dialog) {
  if (isSheetLayout()) slideSheetClosed(dialog);
  else dialog.close();
}

/**
 * Moves the sheet with a finger swiping down from its top, and closes it at the end of a far or
 * fast enough swipe. A swipe down the scrolled content scrolls it to its top, then moves the
 * sheet. Touches on the sheet's own gestures, and swipes mostly sideways, leave it where it is.
 * @param {HTMLDialogElement} dialog
 * @param {{ isOwnGesture: (target: EventTarget) => boolean, findScroller: () => HTMLElement }} options
 *   `findScroller` names what scrolls the content the finger is on
 */
export function closeOnSwipeDown(dialog, { isOwnGesture, findScroller }) {
  /** @type {{ originX: number, originY: number, startY: number, lastY: number, lastTime: number, speed: number, isDragging: boolean } | null} */
  let swipe = null;

  /** @param {TouchEvent} event */
  function startSwipe(event) {
    if (!isSheetLayout() || event.touches.length !== 1 || !event.target) return;
    if (isOwnGesture(event.target)) return;
    const { clientX = 0, clientY } = event.touches[0];
    swipe = {
      originX: clientX,
      originY: clientY,
      startY: clientY,
      lastY: clientY,
      lastTime: event.timeStamp,
      speed: 0,
      isDragging: false,
    };
  }

  /**
   * @param {number} clientY
   * @param {number} time
   */
  function trackSwipeSpeed(clientY, time) {
    if (!swipe) return;
    const elapsed = time - swipe.lastTime;
    if (elapsed > 0) swipe.speed = (clientY - swipe.lastY) / elapsed;
    swipe.lastY = clientY;
    swipe.lastTime = time;
  }

  // Until the sheet moves, the swipe counts from the finger's highest point since the content
  // last scrolled, so a swipe that scrolls the content back to its top goes on to move the sheet.
  /**
   * @param {number} clientY
   * @param {{ startY: number }} moving
   */
  function startsDragging(clientY, moving) {
    if (findScroller().scrollTop > 0 || clientY < moving.startY) moving.startY = clientY;
    return clientY - moving.startY >= SWIPE_START_PX;
  }

  // A swipe that sets off mostly sideways is another gesture's, like stepping between sheets.
  /**
   * @param {number} clientX
   * @param {number} clientY
   * @param {{ originX: number, originY: number }} moving
   */
  function isSideways(clientX, clientY, moving) {
    const across = Math.abs(clientX - moving.originX);
    const down = Math.abs(clientY - moving.originY);
    return Math.hypot(across, down) >= SWIPE_START_PX && across > down;
  }

  /** @param {number} offset */
  function moveSheet(offset) {
    if (!dialog.hasAttribute("data-dragged")) finishOpening(dialog);
    dialog.setAttribute("data-dragged", "");
    dialog.style.transform = `translateY(${offset}px)`;
  }

  function springSheetBack() {
    slideSheet(dialog, "none").finished.then((slide) => {
      slide.cancel();
      dialog.removeAttribute("data-dragged");
    });
  }

  /** @param {TouchEvent} event */
  function followSwipe(event) {
    if (!swipe) return;
    const { clientX = 0, clientY } = event.touches[0];
    if (!swipe.isDragging && isSideways(clientX, clientY, swipe)) {
      swipe = null;
      return;
    }
    if (!swipe.isDragging && !startsDragging(clientY, swipe)) {
      trackSwipeSpeed(clientY, event.timeStamp);
      return;
    }
    swipe.isDragging = true;
    if (event.cancelable) event.preventDefault();
    trackSwipeSpeed(clientY, event.timeStamp);
    moveSheet(Math.max(0, clientY - swipe.startY));
  }

  /** @param {TouchEvent} event */
  function endSwipe(event) {
    if (!swipe) return;
    const { isDragging, startY, lastY, speed } = swipe;
    swipe = null;
    if (!isDragging) return;
    const isFarOrFast = lastY - startY > CLOSE_DISTANCE_PX || speed > CLOSE_SPEED_PX_PER_MS;
    if (event.type === "touchend" && isFarOrFast) slideSheetClosed(dialog);
    else springSheetBack();
  }

  dialog.addEventListener("touchstart", startSwipe, { passive: true });
  dialog.addEventListener("touchmove", followSwipe, { passive: false });
  dialog.addEventListener("touchend", endSwipe);
  dialog.addEventListener("touchcancel", endSwipe);
}
