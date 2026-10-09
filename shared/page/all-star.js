import { html } from "./html.js";

// An All-Star team's star, drawn here rather than taken from Phosphor, since it stands in for a
// team's dot: filled in the team's color, with soft tips, and set into the card as a dot is, a
// shadow inside along its top left and a light outside along its bottom right. Its colors come from
// the app's :root (game-row.css), and its shadow's reach from the app, as the dot's box-shadow does.

const INNER_RADIUS = 0.4;
const TIP_ROUNDING = 0.07;

// A blurred inset shadow, drawn without a filter, as unblurred bands averaged over the blur's
// reach: one where it falls, and eight around it at half the blur and at the whole.
const BAND_RINGS = [0.5, 1];
const BAND_STEPS = 8;
const SHADOW_COVER = 0.98;

/**
 * @typedef {object} AllStarLook
 * @property {number} size the star's width, point to point, in pixels
 * @property {{ x: number, y: number, blur: number }} shadow the inset shadow's offset and blur
 * @property {{ x: number, y: number }} light the light's offset outside the star
 * @property {number} [hairline] the width of a faint line around the star
 */

/** @param {number} value */
const formatNumber = (value) => value.toFixed(2);

/** The star's ten corners, tip first, on a circle of radius 1. */
function listCorners() {
  return Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 ? INNER_RADIUS : 1;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
}

/**
 * The corners scaled to `size` across, centered in a square of that size.
 * @param {number} size
 */
function placeCorners(size) {
  const corners = listCorners();
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const scale = size / (Math.max(...xs) - Math.min(...xs));
  const top = (size - (Math.max(...ys) - Math.min(...ys)) * scale) / 2 - Math.min(...ys) * scale;
  return corners.map(([x, y]) => [x * scale + size / 2, y * scale + top]);
}

/**
 * A point `distance` along the line from `from` toward `to`.
 * @param {number[]} from
 * @param {number[]} to
 * @param {number} distance
 */
function moveToward([fromX, fromY], [toX, toY], distance) {
  const length = Math.hypot(toX - fromX, toY - fromY);
  return [fromX + ((toX - fromX) * distance) / length, fromY + ((toY - fromY) * distance) / length];
}

/**
 * The star's outline, its tips rounded and its inner corners sharp, moved by `x` and `y`.
 * @param {number[][]} corners
 * @param {number} rounding
 * @param {number} x
 * @param {number} y
 */
function outlineStar(corners, rounding, x, y) {
  /** @param {number[]} point */
  const formatPoint = ([pointX, pointY]) =>
    `${formatNumber(pointX + x)},${formatNumber(pointY + y)}`;
  const steps = corners.map((corner, index) => {
    const command = index ? "L" : "M";
    if (index % 2) return `${command}${formatPoint(corner)}`;
    const before = corners[(index + corners.length - 1) % corners.length];
    const after = corners[(index + 1) % corners.length];
    const into = moveToward(corner, before, rounding);
    const out = moveToward(corner, after, rounding);
    return `${command}${formatPoint(into)}Q${formatPoint(corner)} ${formatPoint(out)}`;
  });
  return `${steps.join("")}Z`;
}

/**
 * Where each of the shadow's bands falls, around its offset.
 * @param {{ x: number, y: number, blur: number }} shadow
 */
const listBandOffsets = ({ x, y, blur }) => [
  [x, y],
  ...BAND_RINGS.flatMap((ring) =>
    Array.from({ length: BAND_STEPS }, (_, step) => {
      const angle = (step * 2 * Math.PI) / BAND_STEPS;
      return [x + ring * blur * Math.cos(angle), y + ring * blur * Math.sin(angle)];
    }),
  ),
];

/**
 * An All-Star team's star, which takes the place of its dot.
 * @param {{ id: string, color: string, look: AllStarLook }} star `id` names its clip, unique on the
 *   page; `color` is any CSS color, like a token
 */
export function renderAllStarMark({ id, color, look }) {
  const { size, shadow, light, hairline } = look;
  const corners = placeCorners(size);
  const rounding = TIP_ROUNDING * size;
  const outline = (x = 0, y = 0) => outlineStar(corners, rounding, x, y);
  const around = `M-${size} -${size}H${size * 2}V${size * 2}H-${size}Z`;
  const offsets = listBandOffsets(shadow);
  const bandOpacity = formatNumber(1 - (1 - SHADOW_COVER) ** (1 / offsets.length));
  const bands = offsets.map(
    ([x, y]) => html`<path d="${around}${outline(x, y)}" fill-rule="evenodd"/>`,
  );
  return html`<svg class="all-star-mark" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="--all-star-color: ${color}" aria-hidden="true"
    ><clipPath id="${id}"><path d="${outline()}"/></clipPath
    ><path class="all-star-light" d="${outline(light.x, light.y)}"/>${
      !!hairline &&
      html`<path class="all-star-hairline" d="${outline()}" stroke-width="${formatNumber(hairline * 2)}"/>`
    }<path class="all-star-fill" d="${outline()}"/><g class="all-star-shadow" clip-path="url(#${id})" fill-opacity="${bandOpacity}"
      >${bands}</g
    ></svg
  >`;
}
