// Where a dialog's row of sheets, as shared/page/sheet.js fills it, has come to rest.

import { expect } from "@playwright/test";

/**
 * How far right of its row's left edge a sheet, or what it holds, is drawn.
 * @param {import("@playwright/test").Locator} locator
 */
export const readLeft = (locator) =>
  locator.evaluate(
    (element) =>
      element.getBoundingClientRect().x -
      /** @type {Element} */ (element.closest(".sheet-row")).getBoundingClientRect().x,
  );

/**
 * Waits until the row has come to rest on the sheet, the only one of its sheets a keyboard or a
 * screen reader can reach.
 * @param {import("@playwright/test").Locator} sheet
 */
export async function expectShown(sheet) {
  await expect(sheet).toBeVisible();
  await expect(sheet).not.toHaveAttribute("inert");
  await expect.poll(() => readLeft(sheet)).toBe(0);
}

/**
 * Waits until the row has moved on from the sheet, which stays beside the one it shows, out of
 * reach: under it, or after it, waiting for a swipe left.
 * @param {import("@playwright/test").Locator} sheet
 */
export async function expectSteppedAway(sheet) {
  await expect(sheet).toHaveAttribute("inert");
  await expect.poll(() => readLeft(sheet)).not.toBe(0);
}
