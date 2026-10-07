import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { readDeclarations, readRule } from "./css-rules.js";

const SHARED = new URL("../shared/page/", import.meta.url);
const APPS = new URL("../apps/", import.meta.url);

// Each layer a phone keeps for a backdrop filter or a promised motion takes its memory, so nothing
// filters what's behind it, and only what a finger is dragging asks for a layer ahead.
/** @param {string} rule */
const isDragged = (rule) =>
  rule.split(",").every((selector) => selector.includes("[data-dragged]"));

const listStylesheets = () => [
  ...readdirSync(SHARED)
    .filter((name) => name.endsWith(".css"))
    .map((name) => new URL(name, SHARED).pathname),
  ...readdirSync(APPS).map((app) => new URL(`${app}/page/styles.css`, APPS).pathname),
];

/**
 * @param {string} path
 * @param {string[]} properties
 */
const listDeclarations = (path, properties) =>
  readDeclarations(path).filter(
    ({ property, value }) => properties.includes(property) && !/^(none|auto)\b/.test(value),
  );

test("nothing filters what's behind it", () => {
  for (const path of listStylesheets()) {
    const filters = listDeclarations(path, ["backdrop-filter", "-webkit-backdrop-filter"]);
    assert.deepEqual(filters.map(readRule), [], path);
  }
});

test("only what a finger drags asks for a layer of its own", () => {
  for (const path of listStylesheets()) {
    const stray = listDeclarations(path, ["will-change"])
      .map(readRule)
      .filter((rule) => !isDragged(rule));
    assert.deepEqual(stray, [], path);
  }
});
