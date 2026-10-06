import { test } from "node:test";
import assert from "node:assert/strict";
import { listOpenSheets, openSheet, reopenSheets, wireSheet } from "../shared/page/sheet.js";

/** @typedef {import("../shared/page/sheet.js").SheetKeeper} SheetKeeper */

// A stand-in for a dialog on a wide screen, where a sheet closes at once instead of sliding down.
/** @param {{ id?: string, open?: boolean, keeper?: SheetKeeper }} [options] */
function createDialog({ id = "sheetDialog", open = false, keeper } = {}) {
  globalThis.matchMedia = /** @type {any} */ (() => ({ matches: false }));
  const dialog = Object.assign(new EventTarget(), {
    id,
    open,
    scrollTop: 0,
    timesShown: 0,
    attributes: new Set(open ? ["data-reopened"] : []),
    style: { minHeight: "" },
    getBoundingClientRect: () => ({ height: 400 }),
    /** @param {string} name */
    setAttribute(name) {
      dialog.attributes.add(name);
    },
    showModal() {
      dialog.open = true;
      dialog.timesShown += 1;
    },
    close() {
      dialog.open = false;
      dialog.dispatchEvent(new Event("close"));
    },
    /** @param {string} name */
    removeAttribute(name) {
      dialog.attributes.delete(name);
    },
  });
  const doneButton = new EventTarget();
  wireSheet(/** @type {any} */ (dialog), { doneButton: /** @type {any} */ (doneButton), keeper });
  return { dialog, doneButton };
}

/** @param {{ id: string }[]} dialogs what the page's dialogs are */
function placeDialogs(dialogs) {
  globalThis.document = /** @type {any} */ ({
    getElementById: (/** @type {string} */ id) => dialogs.find((dialog) => dialog.id === id),
  });
}

/**
 * A sheet's code that shows what it's handed, or can't.
 * @param {unknown} shown
 * @param {(subject: any) => boolean} [reopen]
 */
const keepShown = (shown, reopen = () => true) => ({ read: () => shown, reopen });

test("a sheet opens at its top, and opening it again keeps it open there", () => {
  const { dialog } = createDialog();

  openSheet(/** @type {any} */ (dialog));
  dialog.scrollTop = 300;
  openSheet(/** @type {any} */ (dialog));
  assert.equal(dialog.open, true);
  assert.equal(dialog.timesShown, 1);
  assert.equal(dialog.scrollTop, 0);
  dialog.close();
});

test("Done and a click on the backdrop close the sheet", () => {
  const { dialog, doneButton } = createDialog();

  openSheet(/** @type {any} */ (dialog));
  doneButton.dispatchEvent(new Event("click"));
  assert.equal(dialog.open, false);
  openSheet(/** @type {any} */ (dialog));
  dialog.dispatchEvent(new Event("click"));
  assert.equal(dialog.open, false);
});

// A stand-in for a sheet on a phone, which a swipe down moves and closes.
function createPhoneSheet() {
  globalThis.matchMedia = /** @type {any} */ ((query) => ({ matches: query.includes("width") }));
  const dialog = Object.assign(new EventTarget(), {
    open: false,
    scrollTop: 0,
    style: { transform: "", minHeight: "" },
    getBoundingClientRect: () => ({ height: 400, width: 390 }),
    setAttribute() {},
    removeAttribute() {},
    showModal() {
      dialog.open = true;
    },
    animate() {
      /** @type {{ cancel: () => void, finished?: Promise<unknown> }} */
      const motion = { cancel() {} };
      motion.finished = Promise.resolve(motion);
      return motion;
    },
    close() {
      dialog.open = false;
      dialog.dispatchEvent(new Event("close"));
    },
  });
  wireSheet(/** @type {any} */ (dialog), { doneButton: /** @type {any} */ (new EventTarget()) });
  openSheet(/** @type {any} */ (dialog));
  /** @param {string} type @param {number} [clientY] */
  const touch = (type, clientY) => {
    const touches = clientY === undefined ? [] : [{ clientX: 0, clientY }];
    dialog.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { touches }));
  };
  return { dialog, touch };
}

test("on a phone, a swipe down that scrolls the sheet back to its top goes on to move the sheet and close it", async () => {
  const { dialog, touch } = createPhoneSheet();
  dialog.scrollTop = 300;

  touch("touchstart", 100);
  touch("touchmove", 200);
  assert.equal(dialog.style.transform, "");
  dialog.scrollTop = 0;
  touch("touchmove", 230);
  assert.equal(dialog.style.transform, "translateY(30px)");
  touch("touchmove", 400);
  touch("touchend");
  await new Promise((resolve) => setTimeout(resolve));
  assert.equal(dialog.open, false);
});

test("on a phone, a swipe at the sheet's top that goes up first moves the sheet from its highest point", () => {
  const { dialog, touch } = createPhoneSheet();

  touch("touchstart", 300);
  touch("touchmove", 260);
  assert.equal(dialog.style.transform, "");
  touch("touchmove", 310);
  assert.equal(dialog.style.transform, "translateY(50px)");
  dialog.close();
});

test("the sheets showing are listed in the order they opened, with where each is scrolled and what each shows, and Done closes them all", () => {
  const { dialog: game, doneButton: gameDone } = createDialog({
    id: "gameDialog",
    keeper: keepShown({ id: "game-1" }),
  });
  const { dialog: team } = createDialog({ id: "teamDialog", keeper: keepShown({ team: "NY" }) });
  const { dialog: settings } = createDialog({ id: "settingsDialog" });

  openSheet(/** @type {any} */ (team));
  openSheet(/** @type {any} */ (game));
  openSheet(/** @type {any} */ (settings));
  game.scrollTop = 240;
  assert.deepEqual(listOpenSheets(), [
    { id: "teamDialog", scrollTop: 0, subject: { team: "NY" }, backLabel: null },
    { id: "gameDialog", scrollTop: 240, subject: { id: "game-1" }, backLabel: null },
    { id: "settingsDialog", scrollTop: 0, subject: null, backLabel: null },
  ]);

  gameDone.dispatchEvent(new Event("click"));
  assert.deepEqual(
    [team, game, settings].map((dialog) => dialog.open),
    [false, false, false],
  );
  assert.deepEqual(listOpenSheets(), []);
});

test("a page that loads again has each sheet it put back open show what it showed, and closes those that can't", () => {
  /** @type {unknown[]} */
  const reopened = [];
  const { dialog: game } = createDialog({
    id: "gameDialog",
    open: true,
    keeper: keepShown(null, (subject) => reopened.push(subject) > 0),
  });
  const { dialog: team } = createDialog({
    id: "teamDialog",
    open: true,
    keeper: keepShown(null, () => false),
  });
  const { dialog: matchup } = createDialog({
    id: "matchupDialog",
    open: true,
    keeper: keepShown(null, () => {
      throw new TypeError("an earlier release's subject");
    }),
  });
  const { dialog: settings } = createDialog({ id: "settingsDialog", open: true });
  placeDialogs([game, team, matchup, settings]);

  reopenSheets([
    { id: "settingsDialog", scrollTop: 0, subject: null },
    { id: "gameDialog", scrollTop: 120, subject: { id: "game-1" } },
    { id: "teamDialog", scrollTop: 0, subject: { team: "NY" } },
    { id: "matchupDialog", scrollTop: 0, subject: { game: {} } },
    { id: "goneDialog", scrollTop: 0, subject: null },
    null,
  ]);

  assert.deepEqual(reopened, [{ id: "game-1" }]);
  assert.deepEqual(
    [game, team, matchup, settings].map((dialog) => dialog.open),
    [true, false, false, true],
  );
  assert.deepEqual(
    listOpenSheets().map(({ id }) => id),
    ["settingsDialog", "gameDialog"],
  );
  game.close();
  settings.close();
});

test("a sheet put back open rises again only once it has closed", () => {
  const { dialog } = createDialog({ id: "gameDialog", open: true, keeper: keepShown(null) });
  placeDialogs([dialog]);

  reopenSheets([{ id: "gameDialog", scrollTop: 0, subject: null }]);
  assert.ok(dialog.attributes.has("data-reopened"));
  dialog.close();
  assert.ok(!dialog.attributes.has("data-reopened"));
});

test("saved sheets that can't be read leave every sheet as it is", () => {
  const { dialog } = createDialog({ id: "gameDialog", open: true, keeper: keepShown(null) });
  placeDialogs([dialog]);

  reopenSheets("{not json");
  reopenSheets({ id: "gameDialog" });
  assert.equal(dialog.open, true);
  assert.deepEqual(listOpenSheets(), []);
});
