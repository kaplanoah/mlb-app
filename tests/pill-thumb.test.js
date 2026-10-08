import { test } from "node:test";
import assert from "node:assert/strict";
import { showPillName } from "../shared/page/pill-thumb.js";

// A stand-in for a pill: its tab list's classes, and its names' tabs, Today shown.
function createPill() {
  const createClassList = () => {
    const names = new Set();
    return {
      names,
      contains: (name) => names.has(name),
      toggle: (name, isOn) => (isOn ? names.add(name) : names.delete(name)),
    };
  };
  const tabs = ["previous", "today", "next"].map((key) => {
    const attributes = new Map([["aria-selected", String(key === "today")]]);
    const classList = createClassList();
    if (key === "today") classList.toggle("active", true);
    return {
      dataset: { tab: key },
      classList,
      tabIndex: key === "today" ? 0 : -1,
      setAttribute: (name, value) => attributes.set(name, value),
      getAttribute: (name) => attributes.get(name),
    };
  });
  const classList = createClassList();
  const tabList = /** @type {any} */ ({ classList, querySelectorAll: () => tabs });
  const readChosen = () => tabs.filter((tab) => tab.getAttribute("aria-selected") === "true");
  return { tabList, tabs, classList, readChosen };
}

test("a handoff chooses the new name and marks the pill handing off, so its fills fade", () => {
  const pill = createPill();

  showPillName(pill.tabList, "next", { isHandoff: true });

  assert.deepEqual(
    pill.readChosen().map((tab) => tab.dataset.tab),
    ["next"],
  );
  assert.equal(pill.tabs[2].tabIndex, 0);
  assert.equal(pill.tabs[1].tabIndex, -1);
  assert.equal(pill.classList.contains("is-handing-off"), true);
});

test("a pill shown at once chooses the new name without a handoff, so it jumps", () => {
  const pill = createPill();
  showPillName(pill.tabList, "next", { isHandoff: true });

  showPillName(pill.tabList, "previous");

  assert.deepEqual(
    pill.readChosen().map((tab) => tab.dataset.tab),
    ["previous"],
  );
  assert.equal(pill.classList.contains("is-handing-off"), false);
});

test("choosing the name already chosen leaves a handoff under way to finish", () => {
  const pill = createPill();
  showPillName(pill.tabList, "next", { isHandoff: true });

  showPillName(pill.tabList, "next");

  assert.equal(pill.classList.contains("is-handing-off"), true);
});
