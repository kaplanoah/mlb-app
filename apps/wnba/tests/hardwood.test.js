import { test } from "node:test";
import assert from "node:assert/strict";
import { listStrayCorners, readDeclarations, readRule } from "../../../tests/css-rules.js";

const STYLES = new URL("../page/styles.css", import.meta.url).pathname;

const namesOrangeOrTeal = (value) => /var\(--(orange|teal)(-ink)?\)/.test(value);

test("only :root names orange or teal, so every rule colors by what it means: now, action, structure, or result", () => {
  const strays = readDeclarations(STYLES)
    .filter((declaration) => namesOrangeOrTeal(declaration.value))
    .filter((declaration) => !readRule(declaration).startsWith(":root"))
    .map(
      (declaration) => `${readRule(declaration)} { ${declaration.property}: ${declaration.value} }`,
    );
  assert.deepEqual(strays, []);
});

test("every corner comes from Hardwood's shape tokens, but for dots and app icons", () => {
  assert.deepEqual(listStrayCorners(STYLES), []);
});
