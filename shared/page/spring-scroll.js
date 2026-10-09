const isReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Like UIKit's scroll to top, a scroll this page makes takes off at once and eases into place on a
// critically damped spring, so the trip takes about the same time from any distance.
const SPRING_RESPONSE_SECONDS = 0.4;
const SPRING_OMEGA = (2 * Math.PI) / SPRING_RESPONSE_SECONDS;
const ARRIVED_WITHIN_PX = 0.5;

// Any touch, click, wheel or key stops the scroll where it is, as a touch does on a phone.
const INTERRUPTING_EVENTS = ["pointerdown", "touchstart", "wheel", "keydown"];

/** @type {{ frame: number, scroller: Element | null, startTop: number, endTop: number, startTime: number }} */
const scroll = { frame: 0, scroller: null, startTop: 0, endTop: 0, startTime: 0 };

/** @param {number} seconds */
const readRemainingFraction = (seconds) =>
  (1 + SPRING_OMEGA * seconds) * Math.exp(-SPRING_OMEGA * seconds);

/**
 * @param {Element} scroller
 * @param {number} top
 */
const jumpTo = (scroller, top) => scroller.scrollTo({ top, behavior: "instant" });

function stopScrolling() {
  cancelAnimationFrame(scroll.frame);
  scroll.frame = 0;
  for (const type of INTERRUPTING_EVENTS) removeEventListener(type, stopScrolling, true);
}

/** @param {number} time */
function stepScroll(time) {
  const { scroller, startTop, endTop, startTime } = scroll;
  if (!scroller) return;
  const seconds = Math.max((time - startTime) / 1000, 0);
  const remaining = (startTop - endTop) * readRemainingFraction(seconds);
  if (Math.abs(remaining) < ARRIVED_WITHIN_PX) {
    jumpTo(scroller, endTop);
    stopScrolling();
    return;
  }
  jumpTo(scroller, endTop + remaining);
  scroll.frame = requestAnimationFrame(stepScroll);
}

/**
 * Scrolls `scroller` to `top` on the spring, or at once for someone who asks for less motion.
 * @param {Element} scroller
 * @param {number} top
 */
export function scrollWithSpring(scroller, top) {
  stopScrolling();
  if (Math.abs(scroller.scrollTop - top) < ARRIVED_WITHIN_PX) return;
  if (isReducedMotion()) {
    jumpTo(scroller, top);
    return;
  }
  Object.assign(scroll, {
    scroller,
    startTop: scroller.scrollTop,
    endTop: top,
    startTime: performance.now(),
  });
  for (const type of INTERRUPTING_EVENTS)
    addEventListener(type, stopScrolling, { capture: true, passive: true });
  scroll.frame = requestAnimationFrame(stepScroll);
}

export const scrollToTop = () =>
  scrollWithSpring(/** @type {Element} */ (document.scrollingElement), 0);
