/**
 * Every shown block of text that ends in a period but holds only one sentence. A label, an empty
 * view's note, or a setting's note stands alone without one; only text of two or more sentences,
 * like a release note or a message that says what to do, ends in a period. An outlet's own words,
 * which a page marks with data-quoted, keep their punctuation, and so does a name that ends in an
 * abbreviation, like Jr. Text hidden for screen readers is left out.
 * @param {import("@playwright/test").Page} page
 */
export const listStrayPeriods = (page) =>
  page.evaluate(() => {
    const SENTENCE_BREAK = /[.!?]["”)]?\s+\S/;
    const ABBREVIATION_END = /\b(Jr|Sr|St|vs|No)\.$/;

    /** @param {Element} element */
    const isScreenReaderOnly = (element) => {
      const box = element.getBoundingClientRect();
      return box.width <= 1 || box.height <= 1;
    };

    /** The nearest element around `element` that isn't laid out in a line of text. @param {Element} element */
    const findBlock = (element) => {
      let block = element;
      while (block.parentElement && getComputedStyle(block).display.startsWith("inline"))
        block = block.parentElement;
      return block;
    };

    /** @param {string} text */
    const isStrayPeriod = (text) =>
      text.endsWith(".") && !ABBREVIATION_END.test(text) && !SENTENCE_BREAK.test(text.slice(0, -1));

    const blocks = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const element = node.parentElement;
      if (!element || !node.textContent?.trim() || !element.checkVisibility()) continue;
      if (element.closest("[data-quoted]") || isScreenReaderOnly(element)) continue;
      blocks.add(findBlock(element));
    }
    return [...blocks]
      .map((block) => block.textContent.replace(/\s+/g, " ").trim())
      .filter(isStrayPeriod);
  });
