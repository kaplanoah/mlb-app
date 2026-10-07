import { drag } from "./touch.mjs";
import { expect } from "@playwright/test";

/**
 * Keeps each "ResizeObserver loop" error the page reports from then on, which a browser raises
 * when an observer's callback resizes what an observer watches, and returns a way to read them.
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<() => Promise<string[]>>}
 */
export async function listResizeLoops(page) {
  await page.addInitScript(() => {
    /** @type {string[]} */
    const resizeLoops = [];
    Object.assign(window, { resizeLoops });
    addEventListener("error", (event) => {
      if (event.message.includes("ResizeObserver loop")) resizeLoops.push(event.message);
    });
  });
  return () => page.evaluate(() => /** @type {any} */ (window).resizeLoops);
}

/**
 * Expects the page to be at rest: no animation left on it, and nothing asking for a frame across
 * a second of its clock.
 * @param {import("@playwright/test").Page} page
 */
export async function expectAtRest(page) {
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.evaluate(() => {
    const requestFrame = window.requestAnimationFrame;
    const counter = { frames: 0 };
    Object.assign(window, { frameCounter: counter });
    window.requestAnimationFrame = (callback) => {
      counter.frames += 1;
      return requestFrame(callback);
    };
  });
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => /** @type {any} */ (window).frameCounter.frames)).toBe(0);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
}

/**
 * Swipes the lists under `from` on to the next one: with a finger in Chromium, and a sideways
 * wheel in WebKit, which Playwright gives no touches to move.
 * @param {import("@playwright/test").Page} page
 * @param {string} browserName
 * @param {{ x: number, y: number }} from
 */
export async function swipeToNextList(page, browserName, from) {
  if (browserName === "chromium") {
    const lift = await drag(page, from, { x: -200 });
    await lift();
    return;
  }
  await page.mouse.move(from.x, from.y);
  await page.mouse.wheel(200, 0);
}
