import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { readDeclarations, readRule } from "./css-rules.js";

const SHARED = new URL("../shared/page/", import.meta.url);
const APPS = new URL("../apps/", import.meta.url);

// Each layer a phone keeps for a backdrop filter or a promised motion takes its memory, and iOS can
// leave what scrolls sideways, like a sheet's row or a pager's lists, unpainted on a page with more. So only the tab bar's glass and the fade at the screen's foot filter what's behind them, and
// only a sheet a finger moves asks for a layer ahead.
const LAYERED_RULES = [".tab-glass", ".edge-fade", ".sheet-panel[data-dragged]"];

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

test("only the tab bar's glass, the screen's foot, and a dragged sheet make layers of their own", () => {
  for (const path of listStylesheets()) {
    const stray = listLayeredRules(path).filter((rule) => !LAYERED_RULES.includes(rule));
    assert.deepEqual(stray, [], path);
  }
});
