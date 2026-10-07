import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { readDeclarations, readRule } from "./css-rules.js";

const SHARED = new URL("../shared/page/", import.meta.url);
const APPS = new URL("../apps/", import.meta.url);

// Each layer a phone keeps for a backdrop filter or a promised motion takes its memory. So nothing
// filters what's behind it, and only a sheet a finger moves and a pager's lists, which iOS can
// leave undrawn in their row unless each is a layer of its own, ask for a layer ahead.
const LAYERED_RULES = [".sheet-panel[data-dragged]", ".pager-page"];

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
    .filter(
      ({ property, value }) => LAYER_PROPERTIES.has(property) && !/^(none|auto)\b/.test(value),
    )
    .map(readRule);

test("nothing filters what's behind it, and only a dragged sheet and a pager's lists ask for layers of their own", () => {
  for (const path of listStylesheets()) {
    const stray = listLayeredRules(path).filter((rule) => !LAYERED_RULES.includes(rule));
    assert.deepEqual(stray, [], path);
  }
});

test("a pager's lists are each a layer of their own", () => {
  const path = new URL("pager.css", SHARED).pathname;
  const willChange = readDeclarations(path).find(
    (declaration) =>
      readRule(declaration) === ".pager-page" && declaration.property === "will-change",
  );
  assert.equal(willChange?.value, "transform");
});
