import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { readDeclarations, readRule } from "./css-rules.js";

const SHARED = new URL("../shared/page/", import.meta.url);
const APPS = new URL("../apps/", import.meta.url);

// iOS can leave what scrolls sideways, like a sheet's row or a pager's lists, unpainted under a
// backdrop filter or beside a layer kept for a motion. So nothing filters what's behind it, and only
// a sheet a finger moves asks for a layer ahead.
const LAYERED_RULES = [".sheet-panel[data-dragged]"];

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

test("nothing filters what's behind it, and only a dragged sheet asks for a layer of its own", () => {
  for (const path of listStylesheets()) {
    const stray = listLayeredRules(path).filter((rule) => !LAYERED_RULES.includes(rule));
    assert.deepEqual(stray, [], path);
  }
});
