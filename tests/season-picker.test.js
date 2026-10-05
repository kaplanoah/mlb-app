import test from "node:test";
import assert from "node:assert/strict";
import { listSeasonYears } from "../shared/page/season-picker.js";

test("the seasons the store keeps list newest first, leaving out anything that isn't a year", () => {
  const docs = [{ id: "2025" }, { id: "2027" }, { id: "notes" }, { id: "2026" }];

  assert.deepEqual(listSeasonYears(docs), ["2027", "2026", "2025"]);
});
