import { test } from "node:test";
import assert from "node:assert/strict";
import { renderRetryBlock, renderRetryNote } from "../shared/page/retry.js";
import { stripTags } from "./text.js";

const readText = (markup) => stripTags(markup).replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

test("a whole part that didn't load is an icon, why, and a filled Try again button", () => {
  const block = renderRetryBlock("Couldn't load the box score");

  assert.equal(readText(block), "Couldn't load the box score Try again");
  assert.match(block.text, /^<div class="retry-block">\s*<svg class="retry-art"/);
  assert.match(block.text, /<p class="retry-title">/);
  assert.match(block.text, /<button type="button" class="retry-button filled" data-retry>/);
});

test("a block's message can keep the type of the text it stands in for", () => {
  assert.match(
    renderRetryBlock("Couldn't load", "scout-note").text,
    /class="retry-title scout-note"/,
  );
});

test("one part that didn't load is why, after a warning icon, over an outlined Try again button", () => {
  const note = renderRetryNote("Couldn't load who started lately", "scout-note");

  assert.equal(readText(note), "Couldn't load who started lately Try again");
  assert.match(
    note.text,
    /<p class="retry-message scout-note"><svg class="retry-warning"[\s\S]*<\/svg><span>/,
  );
  assert.match(note.text, /<button type="button" class="retry-button" data-retry>/);
});
