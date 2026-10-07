// Says whether a pull request is a red change: one that touches the shared code that moves,
// layers, and draws the page, or adds a line that makes the browser draw a part on a layer of
// its own. No browser CI runs draws as an iPhone does, so a red change merges only once the owner
// has used it on the beta app and labeled it phone-ok.
// Usage: git diff --no-renames <base> <head> | node worker/red-change.mjs '<labels as JSON>'
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const PHONE_OK_LABEL = "phone-ok";

const RED_FILES = new Set(
  [
    "sheet.js",
    "sheet-reopen.js",
    "slide-panels.js",
    "sheet.css",
    "sheet-swipe.js",
    "sheet-sections.js",
    "side-swipe.js",
    "pager.js",
    "pager.css",
    "pill-thumb.js",
    "tab-bar.js",
    "eased-redraw.js",
    "show-last-drawn.js",
    "chrome.css",
    "team-sheet.css",
    "game-cards.css",
  ].map((file) => `shared/page/${file}`),
);

const LAYER_PROPERTIES = [
  "transform",
  "filter",
  "backdrop-filter",
  "mask",
  "mask-image",
  "clip-path",
  "will-change",
  "animation",
  "transition",
  "contain",
  "content-visibility",
];

const toCamelCase = (property) =>
  property.replace(/-([a-z])/g, (_dash, letter) => letter.toUpperCase());
const PROPERTY_NAMES = LAYER_PROPERTIES.join("|");
// After a prefix, as in webkitBackdropFilter, a style property's name starts with a capital.
const CAMEL_PROPERTY_NAMES = LAYER_PROPERTIES.map(toCamelCase)
  .flatMap((name) => [name, name[0].toUpperCase() + name.slice(1)])
  .join("|");

// A property's longhands set it too, as transition-duration and -webkit-mask-image do.
const LAYER_SETTINGS = [
  {
    name: "a CSS declaration",
    pattern: new RegExp(`(?:^|[\\s{;"'\`])(?:-webkit-)?(${PROPERTY_NAMES})(?:-[a-z]+)*\\s*:(?!:)`),
  },
  {
    name: "a style property",
    pattern: new RegExp(`\\.(?:webkit|Webkit)?(${CAMEL_PROPERTY_NAMES})(?:[A-Z][a-z]+)*\\s*=(?!=)`),
  },
  {
    name: "a style property",
    pattern: new RegExp(`setProperty\\(\\s*["'](?:-webkit-)?(${PROPERTY_NAMES})\\b`),
  },
  { name: "an animation", pattern: /\.(animate)\(/ },
  { name: "a fixed or sticky position", pattern: /\b(position\s*:\s*(?:fixed|sticky))\b/ },
  {
    name: "a fixed or sticky position",
    pattern: /\b(position\s*=\s*["'`](?:fixed|sticky))\b/,
  },
  {
    name: "a fixed or sticky position",
    pattern: /(setProperty\(\s*["']position["']\s*,\s*["'`](?:fixed|sticky))\b/,
  },
];

// Tests live outside every page's folder, so they're never red.
const isPageCode = (path) => /^(?:shared\/page|apps\/[^/]+\/page)\/.+\.(?:css|js)$/.test(path);
const isComment = (text) => /^\s*(?:\/\/|\/\*|\*)/.test(text);

/** @typedef {{ number: number, text: string }} AddedLine */
/** @typedef {{ path: string, addedLines: AddedLine[] }} ChangedFile */

/**
 * The files a unified diff changes, each with the lines it adds, numbered as the new file has
 * them. A file moved or deleted is listed under each path it had.
 * @param {string} diff
 * @returns {ChangedFile[]}
 */
export function readDiff(diff) {
  /** @type {ChangedFile[]} */
  const files = [];
  let current = null;
  let lineNumber = 0;
  for (const line of diff.split("\n")) {
    const header = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (header) {
      const [, oldPath, newPath] = header;
      current = { path: newPath, addedLines: [] };
      files.push(current);
      if (oldPath !== newPath) files.push({ path: oldPath, addedLines: [] });
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      lineNumber = Number(hunk[1]);
      continue;
    }
    if (!current || line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      current.addedLines.push({ number: lineNumber, text: line.slice(1) });
      lineNumber += 1;
    } else if (!line.startsWith("-") && !line.startsWith("\\")) {
      lineNumber += 1;
    }
  }
  return files;
}

/**
 * What a line sets that makes a layer, or null when it sets nothing that does.
 * @param {string} text
 */
function findLayerSetting(text) {
  if (isComment(text)) return null;
  for (const { name, pattern } of LAYER_SETTINGS) {
    const match = text.match(pattern);
    if (match) return `${name} that sets ${match[1]}`;
  }
  return null;
}

/**
 * @param {ChangedFile} file
 * @returns {string[]}
 */
function findFileReasons({ path, addedLines }) {
  if (RED_FILES.has(path)) return [`${path} is shared code that moves, layers, or draws the page`];
  if (!isPageCode(path)) return [];
  return addedLines.flatMap(({ number, text }) => {
    const setting = findLayerSetting(text);
    return setting ? [`${path}:${number} adds ${setting}: ${text.trim()}`] : [];
  });
}

/**
 * Why a change is red, one reason per file or line, or none when it isn't.
 * @param {ChangedFile[]} files
 */
export const findRedReasons = (files) => files.flatMap(findFileReasons);

/**
 * The gate's verdict on a pull request, given its diff and its labels.
 * @param {string} diff
 * @param {string[]} labels
 * @returns {{ isHeld: boolean, message: string }}
 */
export function decideGate(diff, labels) {
  const reasons = findRedReasons(readDiff(diff));
  if (!reasons.length) return { isHeld: false, message: "Not a red change." };
  const listed = reasons.map((reason) => `- ${reason}`).join("\n");
  if (labels.includes(PHONE_OK_LABEL))
    return {
      isHeld: false,
      message: `A red change, labeled ${PHONE_OK_LABEL} by the owner after using it on beta:\n${listed}`,
    };
  return {
    isHeld: true,
    message:
      `A red change: it needs the owner's iPhone, which no CI browser stands in for.\n${listed}\n` +
      `Deploy it to beta (git push -f origin <branch>:beta). The owner adds the ${PHONE_OK_LABEL} ` +
      "label after using it on the beta app, which runs this check again.",
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const labels = JSON.parse(process.argv[2] || "[]");
  const { isHeld, message } = decideGate(readFileSync(0, "utf8"), labels);
  console.log(isHeld ? `::error::${message.split("\n")[0]}\n${message}` : message);
  if (isHeld) process.exit(1);
}
