import { readFileSync } from "node:fs";

/** @typedef {{ selectors: string[], property: string, value: string }} Declaration */

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Every declaration in a stylesheet, with the selectors of the blocks it sits in, outermost first,
 * like ["@media (max-width: 779px)", ".tab-bar::before"].
 * @param {string} path
 * @returns {Declaration[]}
 */
export function readDeclarations(path) {
  const css = stripComments(readFileSync(path, "utf8"));
  /** @type {Declaration[]} */
  const declarations = [];
  /** @type {string[]} */
  const selectors = [];
  let text = "";
  const addDeclaration = () => {
    const colon = text.indexOf(":");
    if (colon > 0 && selectors.length) {
      declarations.push({
        selectors: [...selectors],
        property: text.slice(0, colon).trim(),
        value: text.slice(colon + 1).trim(),
      });
    }
    text = "";
  };
  for (const character of css) {
    if (character === "{") {
      selectors.push(text.trim());
      text = "";
    } else if (character === "}") {
      addDeclaration();
      selectors.pop();
    } else if (character === ";") {
      addDeclaration();
    } else {
      text += character;
    }
  }
  return declarations;
}

/** @param {Declaration} declaration */
export const readRule = (declaration) => declaration.selectors.at(-1) ?? "";

/**
 * The custom properties a stylesheet's `:root` blocks define.
 * @param {string} path
 */
export const listRootTokens = (path) =>
  new Set(
    readDeclarations(path)
      .filter((declaration) => readRule(declaration).startsWith(":root"))
      .map((declaration) => declaration.property),
  );

// The floating tab bar is a capsule in every app, for its glass, a switch is round like the phone's
// own, and app icons keep their own shape.
const OWN_SHAPES = new Set([
  ".switch",
  ".tab-bar::before",
  "nav.tabs .tab-list button",
  ".tab-glass",
  ".tab-copy",
  ".tab-pill",
  ".home-screen-icon",
  ".home-screen-tip .home-screen-icon",
  ".gate-icon",
  ".appearance-icon",
]);

/**
 * A corner set from the app's shape tokens, or a circle.
 * @param {string} value
 */
const isTokenCorner = (value) =>
  value === "50%" || /var\(--(radius-[a-z-]+|sheet-radius)\)/.test(value);

/** @param {string} rule */
const hasOwnShape = (rule) => rule.split(",").every((selector) => OWN_SHAPES.has(selector.trim()));

/**
 * Each corner a stylesheet sets some other way than from the shape tokens, but for a circle, the
 * tab bar's capsule, a switch, and an app icon.
 * @param {string} path
 */
export const listStrayCorners = (path) =>
  readDeclarations(path)
    .filter((declaration) => /^border(-[a-z]+)*-radius$/.test(declaration.property))
    .filter((declaration) => !hasOwnShape(readRule(declaration)))
    .filter((declaration) => !isTokenCorner(declaration.value))
    .map(
      (declaration) => `${readRule(declaration)} { ${declaration.property}: ${declaration.value} }`,
    );
