import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { readDeclarations, readRule } from "./css-rules.js";

const SHARED = new URL("../shared/page/", import.meta.url);
const APPS = new URL("../apps/", import.meta.url);

// iOS can leave what a row that scrolls sideways holds undrawn, while it draws every layer inside
// the row, so each pane of such a row is a layer of its own.
const SIDEWAYS_PANES = [
  { stylesheet: "pager.css", rule: ".pager-page" },
  { stylesheet: "sheet.css", rule: ".sheet-page" },
  { stylesheet: "sheet.css", rule: ".sheet-section" },
];

// Each layer a phone keeps for a backdrop filter or a promised motion takes its memory. So nothing
// filters what's behind it, and only a sheet a finger moves and those panes ask for a layer ahead.
const LAYERED_RULES = [".sheet-panel[data-dragged]", ...SIDEWAYS_PANES.map(({ rule }) => rule)];

const listStylesheets = () => [
  ...readdirSync(SHARED)
    .filter((name) => name.endsWith(".css"))
    .map((name) => new URL(name, SHARED).pathname),
  ...readdirSync(APPS).map((app) => new URL(`${app}/page/styles.css`, APPS).pathname),
];

const LAYER_PROPERTIES = new Set(["backdrop-filter", "-webkit-backdrop-filter", "will-change"]);

/** @param {string} path */
const listLayeredRules = (path) =>
  readDeclarations(path)
    .filter(({ property, value }) => LAYER_PROPERTIES.has(property) && value !== "none")
    .map(readRule);

test("nothing filters what's behind it, and only a dragged sheet and the panes of sideways rows ask for layers of their own", () => {
  for (const path of listStylesheets()) {
    const stray = listLayeredRules(path).filter((rule) => !LAYERED_RULES.includes(rule));
    assert.deepEqual(stray, [], path);
  }
});

test("each pane of a row that scrolls sideways is a layer of its own", () => {
  for (const { stylesheet, rule } of SIDEWAYS_PANES) {
    const willChange = readDeclarations(new URL(stylesheet, SHARED).pathname).find(
      (declaration) => readRule(declaration) === rule && declaration.property === "will-change",
    );
    assert.equal(willChange?.value, "transform", rule);
  }
});
