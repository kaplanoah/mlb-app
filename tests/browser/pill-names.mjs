// Where a pill's block sits over each of its names, and the colors each name's letters take.

/**
 * The block's edges and, for each name, its edges, where the block starts and ends over it, all on
 * the screen, and the colors its letters run through from left to right.
 * @param {import("@playwright/test").Locator} tabList
 */
export const readPillNames = (tabList) =>
  tabList.evaluate((list) => {
    const thumb = /** @type {Element} */ (
      list.querySelector(".pager-thumb")
    ).getBoundingClientRect();
    return {
      thumb: { left: thumb.left, right: thumb.right },
      names: [...list.querySelectorAll("[role=tab]")].map((tab) => {
        const box = tab.getBoundingClientRect();
        const style = getComputedStyle(tab);
        const readCover = (/** @type {string} */ edge) =>
          box.left + parseFloat(style.getPropertyValue(edge));
        return {
          name: (tab.textContent ?? "").trim(),
          left: box.left,
          right: box.right,
          coverStart: readCover("--cover-start"),
          coverEnd: readCover("--cover-end"),
          textColor: style.color,
          letterColors: style.backgroundImage.match(/rgba?\([^)]*\)/g) ?? [],
        };
      }),
    };
  });
