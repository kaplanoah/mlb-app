// How many compositing layers Chromium draws the page in, as its DevTools' Layers panel lists them,
// and each view's count against its budget.

import { expect } from "@playwright/test";

/**
 * Counts the layers in the page's next layer tree, once a frame has drawn it.
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<number>}
 */
async function countLayers(page) {
  const session = await page.context().newCDPSession(page);
  const counted = new Promise((resolve) =>
    session.on("LayerTree.layerTreeDidChange", ({ layers }) => {
      if (layers) resolve(layers.length);
    }),
  );
  await session.send("LayerTree.enable");
  await page.evaluate(() =>
    document.body.style.setProperty("--layer-count", String(Math.random())),
  );
  const count = await counted;
  await session.detach();
  return /** @type {number} */ (count);
}

/**
 * Shows each view in turn and expects its layers within its budget, naming every view over.
 * @param {import("@playwright/test").Page} page
 * @param {{ view: string, show: () => Promise<void> }[]} views
 * @param {Record<string, number>} budgets
 */
export async function expectWithinBudgets(page, views, budgets) {
  const counts = /** @type {Record<string, number>} */ ({});
  for (const { view, show } of views) {
    await show();
    counts[view] = await countLayers(page);
  }
  const over = Object.entries(counts)
    .filter(([view, count]) => !(count <= budgets[view]))
    .map(([view, count]) => `${view}: ${count} layers, over its budget of ${budgets[view]}`);
  expect(over).toEqual([]);
}
