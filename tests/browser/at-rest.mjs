import { drag } from "./touch.mjs";
import { expect } from "@playwright/test";

/**
 * Keeps each "ResizeObserver loop" error the page reports from then on, which a browser raises
 * when an observer's callback resizes what an observer watches, and returns a way to read them.
 * Each names the observers that last ran before it, by where the page made them and what they
 * watch, so a failure says which one looped.
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<() => Promise<string[]>>}
 */
export async function listResizeLoops(page) {
  await page.addInitScript(() => {
    const RECENT_CALLBACKS = 6;
    /** @type {string[]} */
    const resizeLoops = [];
    /** @type {string[]} */
    const recentCallbacks = [];
    Object.assign(window, { resizeLoops });
    /** @param {Element} target */
    const nameTarget = (target) =>
      target.id ? `#${target.id}` : [target.localName, ...target.classList].join(".");
    const PageResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class extends PageResizeObserver {
      /** @param {ResizeObserverCallback} callback */
      constructor(callback) {
        const pageFrames = (new Error().stack ?? "")
          .split("\n")
          .filter((line) => line.includes("http"));
        const madeAt = pageFrames[0]?.trim() ?? "somewhere";
        super((entries, observer) => {
          const targets = entries.map((entry) => nameTarget(entry.target)).join(", ");
          recentCallbacks.push(`${madeAt} on ${targets}`);
          recentCallbacks.splice(0, recentCallbacks.length - RECENT_CALLBACKS);
          callback(entries, observer);
        });
      }
    };
    // The list reports each loop, so WebKit doesn't also raise it as an uncaught error.
    addEventListener("error", (event) => {
      if (!event.message.includes("ResizeObserver loop")) return;
      event.preventDefault();
      resizeLoops.push(`${event.message} After: ${recentCallbacks.join(" | ")}`);
    });
  });
  return () => page.evaluate(() => /** @type {any} */ (window).resizeLoops);
}

/**
 * Empties the list of ResizeObserver loops, so it counts only from here on.
 * @param {import("@playwright/test").Page} page
 */
export const forgetResizeLoops = (page) =>
  page.evaluate(() => {
    /** @type {any} */ (window).resizeLoops.length = 0;
  });

/**
 * Lists where the page asked for each frame across `durationMs` of its clock, by the first line
 * of the page's own code that asked, with how many times, so a failure says what kept asking.
 * @param {import("@playwright/test").Page} page
 * @param {number} durationMs
 * @returns {Promise<string[]>}
 */
async function listFrameRequestsAcross(page, durationMs) {
  await page.evaluate(() => {
    const counted = /** @type {any} */ (window);
    counted.pageRequestFrame ??= window.requestAnimationFrame;
    /** @type {Map<string, number>} */
    const requests = new Map();
    counted.frameRequests = requests;
    window.requestAnimationFrame = (callback) => {
      const pageFrames = (new Error().stack ?? "")
        .split("\n")
        .filter((line) => line.includes("http"));
      const askedAt = pageFrames[0]?.trim() ?? "somewhere";
      requests.set(askedAt, (requests.get(askedAt) ?? 0) + 1);
      return counted.pageRequestFrame(callback);
    };
  });
  await page.clock.runFor(durationMs);
  return page.evaluate(() =>
    [.../** @type {Map<string, number>} */ (/** @type {any} */ (window).frameRequests)].map(
      ([askedAt, count]) => `${count} from ${askedAt}`,
    ),
  );
}

/**
 * Counts the frames the page asks for across `durationMs` of its clock.
 * @param {import("@playwright/test").Page} page
 * @param {number} durationMs
 */
export async function countFramesAcross(page, durationMs) {
  const requests = await listFrameRequestsAcross(page, durationMs);
  return requests.reduce((total, request) => total + Number.parseInt(request, 10), 0);
}

/**
 * Waits for a second of the page's clock without a frame asked for. A wait that times out names
 * what last kept asking, which a poll's own timeout leaves out.
 * @param {import("@playwright/test").Page} page
 */
async function waitForNoFrameRequests(page) {
  /** @type {string[]} */
  let lastRequests = [];
  try {
    await expect
      .poll(async () => (lastRequests = await listFrameRequestsAcross(page, 1000)))
      .toEqual([]);
  } catch (error) {
    throw new Error(`The page kept asking for frames: ${lastRequests.join("; ")}`, {
      cause: error,
    });
  }
}

/**
 * Waits for the page to finish drawing what it loaded. Its first drawing ends the load note, its
 * store then reads every document it watches again to catch up, which it marks by keeping when it
 * was current, and each drawing can lay the page out again a frame later. A page quiet while its
 * reads are on their way, or between those frames, isn't done loading.
 * @param {import("@playwright/test").Page} page
 */
export async function waitForLoadToSettle(page) {
  await expect(page.locator("#loadNote")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("syncedAt"))).not.toBeNull();
  await waitForNoFrameRequests(page);
}

/**
 * Expects the page to be at rest: no animation left on it, and nothing asking for a frame across
 * a second of its clock.
 * @param {import("@playwright/test").Page} page
 */
export async function expectAtRest(page) {
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  expect(await listFrameRequestsAcross(page, 1000)).toEqual([]);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
}

/**
 * Swipes the lists under `from` on to the next one: with a finger in Chromium, and in WebKit,
 * which Playwright gives no touches or wheel to move on a phone, as a smooth scroll of the lists.
 * @param {import("@playwright/test").Page} page
 * @param {string} browserName
 * @param {{ x: number, y: number }} from
 */
export async function swipeToNextList(page, browserName, from) {
  if (browserName === "chromium") {
    const lift = await drag(page, from, { x: -300 });
    await lift();
    return;
  }
  await page.evaluate(({ x, y }) => {
    const pages = document.elementFromPoint(x, y)?.closest(".pager-pages");
    pages?.scrollBy({ left: pages.clientWidth, behavior: "smooth" });
  }, from);
}
