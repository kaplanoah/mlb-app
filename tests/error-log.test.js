import { test } from "node:test";
import assert from "node:assert/strict";
import { describeError, describeRejection } from "../shared/page/error-log.js";

test("an error names its file by its own name, and its line and column", () => {
  const event = /** @type {ErrorEvent} */ ({
    message: "TypeError: list is null",
    filename: "https://example.com/key/c9c63e6/js/games-view.js",
    lineno: 12,
    colno: 7,
  });
  assert.equal(describeError(event), "TypeError: list is null at games-view.js:12:7");
});

test("an error from nowhere the page can name says only what it was", () => {
  const event = /** @type {ErrorEvent} */ ({
    message: "Script error.",
    filename: "",
    lineno: 0,
    colno: 0,
  });
  assert.equal(describeError(event), "Script error.");
});

test("a failed promise names its error's kind and message, or what it failed with", () => {
  const withError = /** @type {PromiseRejectionEvent} */ ({ reason: new RangeError("too far") });
  const withText = /** @type {PromiseRejectionEvent} */ ({ reason: "offline" });
  assert.equal(describeRejection(withError), "a promise failed: RangeError: too far");
  assert.equal(describeRejection(withText), "a promise failed: offline");
});
