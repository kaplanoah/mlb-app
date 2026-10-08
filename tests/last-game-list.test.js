import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chooseGameList,
  readLastGameList,
  saveLastGameList,
} from "../shared/page/last-game-list.js";

const NOW = Date.parse("2026-10-02T01:00:00Z");
const MINUTE_MS = 60 * 1000;

/** @param {Partial<Storage>} storage */
const useStorage = (storage) =>
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });

const refuseAccess = () => {
  throw new Error("Access denied");
};

test("the Games view opens on the list it was left on less than two minutes ago", () => {
  const left = { list: "previous", leftAt: NOW - 2 * MINUTE_MS + 1 };
  assert.equal(chooseGameList(left, NOW), "previous");
});

test("the Games view opens on Today once it was left two minutes ago or more", () => {
  const left = { list: "next", leftAt: NOW - 2 * MINUTE_MS };
  assert.equal(chooseGameList(left, NOW), "today");
});

test("the Games view opens on Today with no list kept, or one it doesn't have", () => {
  assert.equal(chooseGameList(null, NOW), "today");
  assert.equal(chooseGameList({ list: "standings", leftAt: NOW }, NOW), "today");
});

test("the Games list it was left on is read back with the time it was left", (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: NOW });
  const saved = new Map();
  useStorage({
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
  });

  saveLastGameList("next");

  assert.deepEqual(readLastGameList(), { list: "next", leftAt: NOW });
});

test("storage that refuses access keeps no Games list", () => {
  useStorage({ getItem: refuseAccess, setItem: refuseAccess });

  assert.doesNotThrow(() => saveLastGameList("next"));
  assert.equal(readLastGameList(), null);
});
