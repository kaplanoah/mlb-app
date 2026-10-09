// While a day strip's chosen day changes as its list scrolls, the box holds still where the chosen
// day rests, and the dates slide behind it, as a picker's do, a copy of them in the box's ink
// inside it. They settle on a spring that never overshoots and keeps its speed when the next day
// comes before it settles. At the strip's ends, where it can't scroll a day to the middle, the box
// goes to the day. Once the dates settle, the box is the chosen day's own again, so nothing is left
// moving or on a layer of its own.

const SETTLE_MS = 360;
// A critically damped spring settles to within 1% of its distance in about 4.6 over its frequency.
const SPRING_FREQUENCY = 4.6 / (SETTLE_MS / 1000);
// A frame the page couldn't draw in time moves the spring only as far as a slow frame would.
const LONGEST_STEP_S = 0.032;
const SETTLED_PX = 0.3;
const SETTLED_SPEED = 5;

/**
 * @typedef {object} Slide
 * @property {HTMLElement} strip
 * @property {HTMLElement} lens
 * @property {HTMLElement} track
 * @property {number} middle where the strip's dates put the day under the box
 * @property {number} speed
 * @property {number} target the chosen day's middle
 * @property {number} restLeft where the box rests, from the strip's left
 * @property {number} lastFrame
 * @property {number} frame
 */

/** @type {Slide | null} */
let slide = null;

/** @param {HTMLElement} cell */
const findMiddle = (cell) => cell.offsetLeft + cell.offsetWidth / 2;

/**
 * The box, over the strip, with a copy of its dates that it shows in its own ink.
 * @param {HTMLElement} strip
 */
function openLens(strip) {
  const lens = document.createElement("div");
  lens.className = "strip-lens";
  lens.inert = true;
  const track = document.createElement("div");
  track.className = "strip-lens-track";
  track.append(...[...strip.children].map(copyDate));
  lens.append(track);
  strip.after(lens);
  strip.classList.add("is-sliding");
  return { lens, track };
}

/** @param {Element} cell */
function copyDate(cell) {
  const copy = /** @type {HTMLElement} */ (cell.cloneNode(true));
  copy.classList.add("is-chosen");
  for (const name of ["aria-current", "data-day", "data-key"]) copy.removeAttribute(name);
  return copy;
}

/**
 * Where the box rests: in the strip's middle, or, at its ends, on the chosen day.
 * @param {HTMLElement} strip
 * @param {HTMLElement} from
 */
function findRestLeft(strip, from) {
  const middle = (strip.clientWidth - from.offsetWidth) / 2;
  const left = from.offsetLeft - strip.scrollLeft;
  return Math.abs(left - middle) < 1 ? left : middle;
}

/** @param {Slide} shown */
function placeLens({ strip, lens, track, middle, restLeft }) {
  const first = /** @type {HTMLElement} */ (strip.firstElementChild);
  const width = first.offsetWidth;
  const wanted = middle - strip.clientWidth / 2;
  strip.scrollLeft = wanted;
  const isAtEnd = Math.abs(strip.scrollLeft - wanted) > 1;
  const left = isAtEnd ? middle - strip.scrollLeft - width / 2 : restLeft;
  Object.assign(lens.style, {
    left: `${strip.offsetLeft + left}px`,
    top: `${strip.offsetTop + first.offsetTop}px`,
    width: `${width}px`,
    height: `${first.offsetHeight}px`,
  });
  track.style.transform = `translateX(${first.offsetLeft - strip.scrollLeft - left}px)`;
}

/** @param {number} now */
function stepSlide(now) {
  if (!slide) return;
  const seconds = Math.min(LONGEST_STEP_S, (now - slide.lastFrame) / 1000);
  const pull =
    -2 * SPRING_FREQUENCY * slide.speed - SPRING_FREQUENCY ** 2 * (slide.middle - slide.target);
  slide.speed += pull * seconds;
  slide.middle += slide.speed * seconds;
  slide.lastFrame = now;
  const isSettled =
    Math.abs(slide.middle - slide.target) < SETTLED_PX && Math.abs(slide.speed) < SETTLED_SPEED;
  if (isSettled) {
    endStripSlide();
    return;
  }
  placeLens(slide);
  slide.frame = requestAnimationFrame(stepSlide);
}

/**
 * Slides the strip's dates from where they are to put `to` under the box, the box taking over from
 * `from`'s own in the same frame, so neither shows alone. The caller then marks `to` as chosen.
 * @param {HTMLElement} strip
 * @param {HTMLElement} from the chosen day's date
 * @param {HTMLElement} to the day to choose
 */
export function slideStripTo(strip, from, to) {
  if (slide?.strip !== strip) {
    endStripSlide();
    const { lens, track } = openLens(strip);
    const now = performance.now();
    slide = {
      strip,
      lens,
      track,
      middle: findMiddle(from),
      speed: 0,
      target: findMiddle(from),
      restLeft: findRestLeft(strip, from),
      lastFrame: now,
      frame: requestAnimationFrame(stepSlide),
    };
    placeLens(slide);
  }
  slide.target = findMiddle(to);
}

/** Puts the chosen day under the box at once, and gives the box back to the day. */
export function endStripSlide() {
  if (!slide) return;
  cancelAnimationFrame(slide.frame);
  slide.middle = slide.target;
  placeLens(slide);
  slide.lens.remove();
  slide.strip.classList.remove("is-sliding");
  slide = null;
}
