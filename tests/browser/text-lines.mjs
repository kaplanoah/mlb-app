/**
 * How many lines the text in each element `locator` finds is drawn on.
 * @param {import("@playwright/test").Locator} locator
 */
export const countTextLines = (locator) =>
  locator.evaluateAll((elements) =>
    elements.map((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const lineTops = [...range.getClientRects()]
        .filter((rect) => rect.width > 0)
        .map((rect) => Math.round(rect.top));
      return new Set(lineTops).size;
    }),
  );
