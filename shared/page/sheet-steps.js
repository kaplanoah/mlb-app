// A finger swiping right across a sheet opened over another takes it back to the one under it,
// and swiping left goes forward to the sheet it last stepped back from, or whatever comes next
// from it. The sheets follow the finger, and the step happens once the swipe goes far or fast
// enough; anything less springs back. Something under the finger that scrolls sideways, like a
// wide table, scrolls to its edge first.

import { isSheetLayout, slideSheet } from "./sheet-swipe.js";

// A touch has to move this far before it counts as a swipe, so a tap stays a tap.
const SWIPE_START_PX = 6;
// A step happens past this share of the sheet's width, or this fast.
const STEP_SHARE = 0.3;
const STEP_SPEED_PX_PER_MS = 0.5;
// On a phone, the sheet under the top one sits this share of its width to the left, dimmed to
// this brightness, as sheet.css places it.
const UNDER_SHIFT = 0.28;
const UNDER_BRIGHTNESS = 0.75;

/**
 * @typedef {object} SheetSteps
 * @property {() => boolean} isTop whether the sheet is the one on top
 * @property {() => HTMLDialogElement | null} findUnder the sheet a step back shows
 * @property {() => HTMLDialogElement | null} prepareAhead the sheet a step forward shows, filled
 *   in and ready to open, or null when there's none
 * @property {(ahead: HTMLDialogElement) => void} showAhead opens it over this one, off to the side
 * @property {() => void} stepBack closes this sheet, from wherever the finger left it
 * @property {(ahead: HTMLDialogElement) => void} dropAhead closes it again, unseen
 * @property {(target: EventTarget) => boolean} isOwnGesture a touch the sheet's own gestures take
 */

/**
 * Whether anything from `target` out to the sheet can still scroll toward its start (`toward` -1)
 * or its end (1).
 * @param {EventTarget} target
 * @param {HTMLElement} sheet
 * @param {-1 | 1} toward
 */
function canScrollSideways(target, sheet, toward) {
  for (
    let element = /** @type {Element | null} */ (target);
    element;
    element = element.parentElement
  ) {
    if (element instanceof HTMLElement && canScroll(element, toward)) return true;
    if (element === sheet) return false;
  }
  return false;
}

/**
 * @param {HTMLElement} element
 * @param {-1 | 1} toward
 */
function canScroll(element, toward) {
  const room = element.scrollWidth - element.clientWidth;
  if (room <= 1 || !/auto|scroll/.test(getComputedStyle(element).overflowX)) return false;
  return toward < 0 ? element.scrollLeft > 0 : element.scrollLeft < room - 1;
}

/**
 * @param {HTMLElement} sheet
 * @param {number} offset how far right of its place, in pixels
 * @param {number} brightness
 */
function placeSheet(sheet, offset, brightness = 1) {
  sheet.style.transform = `translateX(${offset}px)`;
  sheet.style.filter = brightness < 1 ? `brightness(${brightness})` : "";
}

/** @param {HTMLElement} sheet */
function releaseSheet(sheet) {
  sheet.style.transform = "";
  sheet.style.filter = "";
  sheet.removeAttribute("data-dragged");
}

/**
 * The sheet under the top one, as far along as the top one has moved: `progress` is 0 with it
 * fully covered and 1 with it fully shown. Only a phone's sheets sit to the side.
 * @param {HTMLElement} sheet
 * @param {number} progress
 * @param {number} width
 */
function placeUnder(sheet, progress, width) {
  const shift = isSheetLayout() ? -UNDER_SHIFT * width * (1 - progress) : 0;
  placeSheet(sheet, shift, UNDER_BRIGHTNESS + (1 - UNDER_BRIGHTNESS) * progress);
}

/**
 * Lets a finger step from this sheet back to the one under it and forward again.
 * @param {HTMLDialogElement} dialog
 * @param {SheetSteps} steps
 */
export function followSideSwipes(dialog, steps) {
  /** @type {{ originX: number, originY: number, target: EventTarget, lastX: number, lastTime: number, speed: number, width: number, mode: "back" | "forward" | null, other: HTMLDialogElement | null } | null} */
  let swipe = null;

  /** @param {TouchEvent} event */
  function startSwipe(event) {
    if (event.touches.length !== 1 || !event.target || !steps.isTop()) return;
    if (steps.isOwnGesture(event.target)) return;
    const { clientX, clientY } = event.touches[0];
    swipe = {
      originX: clientX,
      originY: clientY,
      target: event.target,
      lastX: clientX,
      lastTime: event.timeStamp,
      speed: 0,
      width: dialog.getBoundingClientRect().width,
      mode: null,
      other: null,
    };
  }

  /**
   * A sideways swipe toward what it can step to, once nothing under it scrolls that way.
   * @param {NonNullable<typeof swipe>} moving
   * @param {number} across
   */
  function chooseStep(moving, across) {
    const toward = across > 0 ? -1 : 1;
    if (canScrollSideways(moving.target, dialog, toward)) return null;
    if (across > 0) {
      const under = steps.findUnder();
      return under && { mode: /** @type {const} */ ("back"), other: under };
    }
    const ahead = steps.prepareAhead();
    if (!ahead) return null;
    steps.showAhead(ahead);
    return { mode: /** @type {const} */ ("forward"), other: ahead };
  }

  /**
   * @param {NonNullable<typeof swipe>} moving
   * @param {number} clientX
   * @param {number} clientY
   */
  function startStep(moving, clientX, clientY) {
    const across = clientX - moving.originX;
    const down = clientY - moving.originY;
    if (Math.abs(across) <= Math.abs(down)) return false;
    const step = chooseStep(moving, across);
    if (!step) return false;
    Object.assign(moving, step);
    for (const sheet of [dialog, step.other]) sheet.setAttribute("data-dragged", "");
    return true;
  }

  /**
   * @param {NonNullable<typeof swipe>} moving
   * @param {number} clientX
   * @param {number} time
   */
  function trackSpeed(moving, clientX, time) {
    const elapsed = time - moving.lastTime;
    if (elapsed > 0) moving.speed = (clientX - moving.lastX) / elapsed;
    moving.lastX = clientX;
    moving.lastTime = time;
  }

  /**
   * @param {NonNullable<typeof swipe>} moving
   * @param {number} across
   */
  function moveSheets(moving, across) {
    const { width, other } = moving;
    if (!other) return;
    if (moving.mode === "back") {
      const offset = Math.min(width, Math.max(0, across));
      placeSheet(dialog, offset);
      placeUnder(other, offset / width, width);
    } else {
      const offset = Math.min(width, Math.max(0, -across));
      placeSheet(other, width - offset);
      placeUnder(dialog, 1 - offset / width, width);
    }
  }

  /** @param {TouchEvent} event */
  function followSwipe(event) {
    if (!swipe) return;
    const { clientX, clientY } = event.touches[0];
    if (!swipe.mode) {
      if (Math.hypot(clientX - swipe.originX, clientY - swipe.originY) < SWIPE_START_PX) return;
      if (!startStep(swipe, clientX, clientY)) {
        swipe = null;
        return;
      }
    }
    if (event.cancelable) event.preventDefault();
    trackSpeed(swipe, clientX, event.timeStamp);
    moveSheets(swipe, clientX - swipe.originX);
  }

  /**
   * @param {NonNullable<typeof swipe>} moving
   * @param {TouchEvent} event
   */
  function isStepTaken(moving, event) {
    if (event.type !== "touchend") return false;
    const direction = moving.mode === "back" ? 1 : -1;
    const across = (moving.lastX - moving.originX) * direction;
    return across > moving.width * STEP_SHARE || moving.speed * direction > STEP_SPEED_PX_PER_MS;
  }

  /** @param {TouchEvent} event */
  function endSwipe(event) {
    if (!swipe) return;
    const moving = swipe;
    swipe = null;
    const { mode, other } = moving;
    if (!mode || !other) return;
    const isTaken = isStepTaken(moving, event);
    if (mode === "back") finishBack(other, isTaken);
    else finishForward(other, isTaken);
  }

  /**
   * @param {HTMLDialogElement} under
   * @param {boolean} isTaken
   */
  function finishBack(under, isTaken) {
    releaseSheet(under);
    if (isTaken) {
      dialog.removeAttribute("data-dragged");
      steps.stepBack();
      return;
    }
    slideSheet(dialog, "none").finished.then((slide) => {
      slide.cancel();
      dialog.removeAttribute("data-dragged");
    });
  }

  /**
   * @param {HTMLDialogElement} ahead
   * @param {boolean} isTaken
   */
  function finishForward(ahead, isTaken) {
    if (!isTaken) dialog.removeAttribute("data-covered");
    releaseSheet(dialog);
    slideSheet(ahead, isTaken ? "none" : "translateX(100%)").finished.then((slide) => {
      ahead.removeAttribute("data-dragged");
      if (!isTaken) steps.dropAhead(ahead);
      slide.cancel();
    });
  }

  dialog.addEventListener("touchstart", startSwipe, { passive: true });
  dialog.addEventListener("touchmove", followSwipe, { passive: false });
  dialog.addEventListener("touchend", endSwipe);
  dialog.addEventListener("touchcancel", endSwipe);
}
