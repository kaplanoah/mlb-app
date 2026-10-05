import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { keepOnDevice, readFromDevice } from "../shared/page/device-storage.js";

/** @param {Partial<Storage>} storage */
const useStorage = (storage) =>
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });

/** @param {Map<string, string>} saved */
const useSavedStorage = (saved) =>
  useStorage({
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
  });

const refuseAccess = () => {
  throw new Error("Access denied");
};

afterEach(() => {
  delete (/** @type {any} */ (globalThis).localStorage);
});

test("what a device keeps is saved as JSON under its key", () => {
  const saved = new Map();
  useSavedStorage(saved);

  keepOnDevice("rankings", { 2026: ["NYY", "LAD"] });

  assert.equal(saved.get("rankings"), '{"2026":["NYY","LAD"]}');
});

test("what a device kept on an earlier load reads back", () => {
  useSavedStorage(new Map([["updatesSeenAt", "1759300000000"]]));

  assert.equal(readFromDevice("updatesSeenAt"), 1759300000000);
});

test("a key with nothing kept, or with what isn't JSON, reads as null", () => {
  useSavedStorage(new Map([["broken", "{"]]));

  assert.equal(readFromDevice("missing"), null);
  assert.equal(readFromDevice("broken"), null);
});

test("each read goes to storage, so a change from another tab shows", () => {
  const saved = new Map([["newsChoices", '{"paywalled":true}']]);
  useSavedStorage(saved);
  assert.deepEqual(readFromDevice("newsChoices"), { paywalled: true });

  saved.set("newsChoices", '{"paywalled":false}');

  assert.deepEqual(readFromDevice("newsChoices"), { paywalled: false });
});

test("a device whose storage refuses access keeps what's chosen until the page reloads", () => {
  useStorage({ getItem: refuseAccess, setItem: refuseAccess });

  assert.equal(readFromDevice("openedStories"), null);
  keepOnDevice("openedStories", { "https://example.com/story": 1 });

  assert.deepEqual(readFromDevice("openedStories"), { "https://example.com/story": 1 });
});
