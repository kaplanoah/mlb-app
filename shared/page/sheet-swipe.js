// On phones, a dialog shown as a sheet from the bottom closes with a swipe down, and slides down
// whichever way it closes. Sheets opened over one another move and close together.

// Matches chrome.css's phone layout, where dialogs are sheets.
const SHEET_MEDIA = "(max-width: 779px)";
// A swipe down closes the sheet once it goes this far or this fast; anything less springs back.
const CLOSE_DISTANCE_PX = 110;
const CLOSE_SPEED_PX_PER_MS = 0.5;
// A touch has to move this far before it counts as a swipe, so a tap stays a tap.
const SWIPE_START_PX = 6;
const SHEET_MOTION_MS = 250;
const SHEET_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

export const isSheetLayout = () => matchMedia(SHEET_MEDIA).matches;
const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Moves a sheet from where a finger left it to `to`, and holds it there.
 * @param {HTMLElement} dialog
 * @param {string} to a transform
 */
export function slideSheet(dialog, to) {
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
export function finishOpening(sheet) {
  for (const motion of sheet.getAnimations()) if (motion instanceof CSSAnimation) motion.finish();
}

/** @param {HTMLDialogElement} dialog */
function fadeBackdropOut(dialog) {
  const duration = prefersReducedMotion() ? 0 : SHEET_MOTION_MS;
  return dialog.animate([{ opacity: 1 }, { opacity: 0 }], {
    pseudoElement: "::backdrop",
    duration,
    easing: SHEET_EASING,
    fill: "forwards",
  });
}

/** @type {WeakSet<HTMLDialogElement>} */
const closingSheets = new WeakSet();

/**
 * Slides sheets down together, the first one's backdrop fading with them, and closes them, the
 * last opened first.
 * @param {HTMLDialogElement[]} dialogs in the order they opened
 */
async function slideSheetsClosed(dialogs) {
  const closing = dialogs.filter((dialog) => !closingSheets.has(dialog));
  if (!closing.length) return;
  for (const dialog of closing) closingSheets.add(dialog);
  const motions = [
    ...closing.map((dialog) => slideSheet(dialog, "translateY(100%)")),
    fadeBackdropOut(closing[0]),
  ];
  await motions[0].finished;
  for (const dialog of [...closing].reverse()) {
    dialog.close();
    dialog.removeAttribute("data-dragged");
  }
  for (const motion of motions) motion.cancel();
  for (const dialog of closing) closingSheets.delete(dialog);
}

/**
 * Closes sheets, the last opened first, sliding them down together where they show as sheets.
 * @param {HTMLDialogElement[]} dialogs in the order they opened
 */
export function closeSheets(dialogs) {
  if (isSheetLayout()) slideSheetsClosed(dialogs);
  else for (const dialog of [...dialogs].reverse()) dialog.close();
}

/**
 * Moves the sheet, and those under it, with a finger swiping down from its top, and closes them
 * at the end of a far or fast enough swipe. A swipe down the scrolled content scrolls it to its
 * top, then moves the sheet. Touches on the sheet's own gestures, and swipes mostly sideways,
 * leave it where it is.
 * @param {HTMLDialogElement} dialog
 * @param {{ isOwnGesture: (target: EventTarget) => boolean, listStack: () => HTMLDialogElement[] }} options
 *   `listStack` names every sheet showing, in the order they opened
 */
export function closeOnSwipeDown(dialog, { isOwnGesture, listStack }) {
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
    if (dialog.scrollTop > 0 || clientY < moving.startY) moving.startY = clientY;
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
  function moveStack(offset) {
    for (const sheet of listStack()) {
      if (!sheet.hasAttribute("data-dragged")) finishOpening(sheet);
      sheet.setAttribute("data-dragged", "");
      sheet.style.transform = `translateY(${offset}px)`;
    }
  }

  function springStackBack() {
    for (const sheet of listStack())
      slideSheet(sheet, "none").finished.then((slide) => {
        slide.cancel();
        sheet.removeAttribute("data-dragged");
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
    moveStack(Math.max(0, clientY - swipe.startY));
  }

  /** @param {TouchEvent} event */
  function endSwipe(event) {
    if (!swipe) return;
    const { isDragging, startY, lastY, speed } = swipe;
    swipe = null;
    if (!isDragging) return;
    const isFarOrFast = lastY - startY > CLOSE_DISTANCE_PX || speed > CLOSE_SPEED_PX_PER_MS;
    if (event.type === "touchend" && isFarOrFast) slideSheetsClosed(listStack());
    else springStackBack();
  }

  dialog.addEventListener("touchstart", startSwipe, { passive: true });
  dialog.addEventListener("touchmove", followSwipe, { passive: false });
  dialog.addEventListener("touchend", endSwipe);
  dialog.addEventListener("touchcancel", endSwipe);
}
