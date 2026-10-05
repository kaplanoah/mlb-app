// A font file the page doesn't preload is only asked for once the page lays out text in it, so
// the first paint can draw that text in a stand-in font, which then swaps and shifts the page.

/**
 * The font files of the faces the page has drawn with so far that it doesn't preload.
 * @param {import("@playwright/test").Page} page
 */
export const listFontsNotPreloaded = (page) =>
  page.evaluate(async () => {
    await document.fonts.ready;
    /** @param {string} url */
    const readFileName = (url) => new URL(url, location.href).pathname.split("/").pop();
    /** @param {{ family: string, weight: string, style: string, unicodeRange: string }} face */
    const nameFace = ({ family, weight, style, unicodeRange }) =>
      [family.replaceAll('"', ""), weight, style || "normal", unicodeRange || "U+0-10FFFF"].join();
    /** @param {CSSFontFaceRule} rule */
    const readRuleFace = (rule) => ({
      family: rule.style.getPropertyValue("font-family"),
      weight: rule.style.getPropertyValue("font-weight"),
      style: rule.style.getPropertyValue("font-style"),
      unicodeRange: rule.style.getPropertyValue("unicode-range"),
    });
    /** @param {CSSFontFaceRule} rule */
    const readRuleFile = (rule) =>
      readFileName(/url\("?([^")]+)"?\)/.exec(rule.style.getPropertyValue("src"))[1]);

    const preloaded = new Set(
      [...document.querySelectorAll("link[rel=preload][as=font]")].map((link) =>
        readFileName(/** @type {HTMLLinkElement} */ (link).href),
      ),
    );
    const drawnFaces = new Set(
      [...document.fonts].filter((face) => face.status === "loaded").map(nameFace),
    );
    return [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .filter((rule) => rule instanceof CSSFontFaceRule)
      .filter((rule) => drawnFaces.has(nameFace(readRuleFace(rule))))
      .map(readRuleFile)
      .filter((file) => !preloaded.has(file));
  });
