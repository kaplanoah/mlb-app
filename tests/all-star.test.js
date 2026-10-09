import test from "node:test";
import assert from "node:assert/strict";
import { renderAllStarMark } from "../shared/page/all-star.js";

const LOOK = { size: 18.5, shadow: { x: 0.4, y: 0.4, blur: 1 }, light: { x: 0.4, y: 0.4 } };

/** @param {string} path */
const readXs = (path) =>
  [...path.matchAll(/(-?\d+\.\d+),-?\d+\.\d+/g)].map((match) => Number(match[1]));

test("an All-Star star is as wide as its look says, point to point, in its color", () => {
  const markup = renderAllStarMark({ id: "star-away", color: "var(--al)", look: LOOK }).text;
  assert.match(
    markup,
    /<svg class="all-star-mark" width="18.5" height="18.5" viewBox="0 0 18.5 18.5"/,
  );
  assert.match(markup, /style="--all-star-color: var\(--al\)"/);
  const [fill] = markup.match(/class="all-star-fill" d="([^"]*)"/)?.slice(1) ?? [];
  const xs = readXs(fill);
  assert.ok(Math.min(...xs) >= 0 && Math.max(...xs) <= 18.5);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 18);
});

test("an All-Star star is set in as a dot is, without a filter: a shadow inside, clipped to it, and a light outside", () => {
  const markup = renderAllStarMark({ id: "star-away", color: "#ffffff", look: LOOK }).text;
  assert.match(markup, /<clipPath id="star-away">/);
  assert.match(markup, /<g class="all-star-shadow" clip-path="url\(#star-away\)"/);
  assert.equal(markup.match(/fill-rule="evenodd"/g)?.length, 17);
  assert.match(markup, /class="all-star-light"/);
  assert.doesNotMatch(markup, /filter/);
  assert.doesNotMatch(markup, /all-star-hairline/);
  const withHairline = renderAllStarMark({
    id: "star-home",
    color: "#ffffff",
    look: { ...LOOK, hairline: 0.15 },
  }).text;
  assert.match(withHairline, /class="all-star-hairline" d="[^"]*" stroke-width="0.30"/);
});
