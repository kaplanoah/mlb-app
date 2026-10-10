// Where a season's day strip, its line, and the month and Today over it sit against the column the
// Games view takes, and how many of its days show whole.

/**
 * @typedef {object} StripEdges
 * @property {{ left: number, right: number }} column the Games view's own edges
 * @property {{ left: number, right: number }} line the bar that ends in the strip's line
 * @property {{ left: number, right: number }} strip
 * @property {number} wholeDays how many days show whole
 * @property {number} firstDayLeft the left edge of the first day that shows whole
 * @property {number} lastDayRight the right edge of the last day that shows whole
 * @property {number} monthLeft
 * @property {number} todayRight
 */

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<StripEdges>}
 */
export const readStripEdges = (page) =>
  page.evaluate(() => {
    const readBox = (/** @type {string} */ selector) =>
      /** @type {Element} */ (document.querySelector(selector)).getBoundingClientRect();
    const column = readBox("#seasonGames");
    const line = readBox("#seasonGames .day-bar");
    const strip = readBox("#seasonGames .day-strip");
    const whole = [...document.querySelectorAll("#seasonGames .day-strip > .day-cell")]
      .map((cell) => cell.getBoundingClientRect())
      .filter((cell) => cell.left >= strip.left - 0.5 && cell.right <= strip.right + 0.5);
    const edges = (/** @type {DOMRect} */ box) => ({ left: box.left, right: box.right });
    return {
      column: edges(column),
      line: edges(line),
      strip: edges(strip),
      wholeDays: whole.length,
      firstDayLeft: whole[0].left,
      lastDayRight: whole[whole.length - 1].right,
      monthLeft: readBox("#seasonGames .strip-month").left,
      todayRight: readBox("#seasonGames .go-today").right,
    };
  });

/**
 * Scrolls the strip by `by`, as a trackpad would leave it.
 * @param {import("@playwright/test").Page} page
 * @param {number} by
 */
export const scrollStripBy = (page, by) =>
  page
    .locator("#seasonGames .day-strip")
    .evaluate((strip, left) => strip.scrollBy({ left, behavior: "instant" }), by);
