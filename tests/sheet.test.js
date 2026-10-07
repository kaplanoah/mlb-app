import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { listOpenSheets, openSheet, reopenSheets, wireSheet } from "../shared/page/sheet.js";

/** @typedef {import("../shared/page/sheet.js").SheetKeeper} SheetKeeper */
/** @typedef {import("../shared/page/sheet.js").SheetParts} SheetParts */

/** @type {FakeElement | null} */
let focused = null;

// Just enough of an element for sheet.js: its family, attributes, and what it can be asked.
class FakeElement extends EventTarget {
  /** @param {{ id?: string, tag?: string, className?: string }} [options] */
  constructor({ id = "", tag = "div", className = "" } = {}) {
    super();
    this.id = id;
    this.tag = tag;
    this.className = className;
    /** @type {FakeElement[]} */
    this.children = [];
    /** @type {FakeElement | null} */
    this.parentElement = null;
    /** @type {Map<string, string>} */
    this.attributes = new Map();
    this.hidden = false;
    this.inert = false;
    this.tabIndex = 0;
    this.scrollTop = 0;
    this.offsetWidth = 390;
    this.textContent = "";
    this.style = { zIndex: "", transform: "" };
    /** @type {Set<string>} */
    this.classes = new Set();
    this.classList = {
      add: (/** @type {string[]} */ ...names) => names.forEach((name) => this.classes.add(name)),
      remove: (/** @type {string[]} */ ...names) =>
        names.forEach((name) => this.classes.delete(name)),
      contains: (/** @type {string} */ name) => this.classes.has(name),
    };
  }

  /**
   * @template {FakeElement} T
   * @param {T} child
   */
  append(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  /**
   * @param {string} name
   * @param {string} value
   */
  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  /** @param {string} name */
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  /** @param {string} name */
  hasAttribute(name) {
    return this.attributes.has(name);
  }

  /** @param {string} name */
  removeAttribute(name) {
    this.attributes.delete(name);
  }

  /** @param {string} selector "dialog" or one class */
  matches(selector) {
    return selector === this.tag || selector === `.${this.className}`;
  }

  /** @param {string} selector */
  closest(selector) {
    for (let element = /** @type {FakeElement | null} */ (this); element;) {
      if (element.matches(selector)) return element;
      element = element.parentElement;
    }
    return null;
  }

  /**
   * @param {string} selector ":scope > .x" for a child, or ".x" for any element inside
   * @returns {FakeElement | null}
   */
  querySelector(selector) {
    const isOwn = selector.startsWith(":scope > ");
    const wanted = isOwn ? selector.slice(":scope > ".length) : selector;
    for (const child of this.children) {
      if (child.matches(wanted)) return child;
      const found = isOwn ? null : child.querySelector(wanted);
      if (found) return found;
    }
    return null;
  }

  /** @param {FakeElement | null} other */
  contains(other) {
    for (let element = other; element; element = element.parentElement)
      if (element === this) return true;
    return false;
  }

  focus() {
    focused = this;
  }
}

class FakeDialog extends FakeElement {
  /** @param {string} id */
  constructor(id) {
    super({ id, tag: "dialog" });
    this.open = false;
    this.timesShown = 0;
  }

  showModal() {
    this.open = true;
    this.timesShown += 1;
  }

  close() {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  }
}

function createBackButton() {
  const button = new FakeElement();
  button.append(new FakeElement({ className: "sheet-back-label" }));
  return button;
}

/** @param {FakeElement} button */
function readBackLabel(button) {
  if (button.hidden) return null;
  return { text: button.children[0].textContent, ariaLabel: button.getAttribute("aria-label") };
}

/**
 * @param {FakeElement} root
 * @param {string} id
 * @returns {FakeElement | null}
 */
function findById(root, id) {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findById(child, id);
    if (found) return found;
  }
  return null;
}

/**
 * A dialog with a row of sheets, each with a close and a back button, on a wide screen, where a
 * dialog closes at once instead of sliding down, and sheets settle at once unless `isMoving`.
 * @param {string[]} ids
 * @param {Record<string, Partial<SheetParts>>} [partsById]
 * @param {{ isMoving?: boolean }} [options]
 */
function createRowDialog(ids, partsById = {}, { isMoving = false } = {}) {
  globalThis.matchMedia = /** @type {any} */ (
    (query) => ({ matches: query.includes("reduced-motion") && !isMoving })
  );
  const dialog = new FakeDialog("sheetDialog");
  globalThis.document = /** @type {any} */ ({
    get activeElement() {
      return focused;
    },
    getElementById: (/** @type {string} */ id) => findById(dialog, id),
  });
  const row = dialog.append(new FakeElement({ className: "sheet-row" }));
  /** @typedef {{ sheet: FakeElement, closeButton: FakeElement, backButton: FakeElement }} FakeSheet */
  const sheets = /** @type {Record<string, FakeSheet>} */ (
    Object.fromEntries(
      ids.map((id) => {
        const sheet = row.append(new FakeElement({ id, tag: "section", className: "sheet-page" }));
        sheet.hidden = true;
        sheet.setAttribute("aria-labelledby", `${id}Title`);
        const parts = {
          closeButton: new FakeElement(),
          backButton: createBackButton(),
          ...partsById[id],
        };
        wireSheet(/** @type {any} */ (sheet), /** @type {any} */ (parts));
        return [id, { sheet, ...parts }];
      }),
    )
  );
  return { dialog, row, sheets };
}

/** @param {EventTarget} target */
const click = (target) => target.dispatchEvent(new Event("click"));

/** @param {FakeElement} row */
const listInRow = (row) => row.children.filter((sheet) => !sheet.hidden).map((sheet) => sheet.id);

/** @param {FakeElement} row */
const findReachable = (row) => row.children.find((sheet) => !sheet.hidden && !sheet.inert)?.id;

/** @param {FakeElement} row */
const readPlaces = (row) =>
  Object.fromEntries(
    row.children
      .filter((sheet) => !sheet.hidden)
      .map((sheet) => [sheet.id, { zIndex: sheet.style.zIndex, transform: sheet.style.transform }]),
  );

/**
 * A sheet's code that shows what it's handed, or can't.
 * @param {unknown} shown
 * @param {(subject: any) => boolean} [reopen]
 */
const keepShown = (shown, reopen = () => true) => ({ read: () => shown, reopen });

/** @param {FakeElement} sheet */
const open = (sheet) => openSheet(/** @type {any} */ (sheet));

test("a sheet opens its dialog with it alone in the row, at its top, and opening it again keeps it open there", () => {
  const { dialog, row, sheets } = createRowDialog(["gameSheet", "teamSheet"]);
  const { sheet } = sheets.gameSheet;

  open(sheet);
  sheet.scrollTop = 300;
  open(sheet);
  assert.equal(dialog.open, true);
  assert.equal(dialog.timesShown, 1);
  assert.equal(sheet.scrollTop, 0);
  assert.deepEqual(listInRow(row), ["gameSheet"]);
  assert.equal(dialog.getAttribute("aria-labelledby"), "gameSheetTitle");
  dialog.close();
});

test("the close button and a click on the backdrop close the dialog, and its sheets leave the row", () => {
  const { dialog, row, sheets } = createRowDialog(["gameSheet"]);

  open(sheets.gameSheet.sheet);
  click(sheets.gameSheet.closeButton);
  assert.equal(dialog.open, false);
  assert.deepEqual(listInRow(row), []);
  open(sheets.gameSheet.sheet);
  click(dialog);
  assert.equal(dialog.open, false);
});

test("a sheet opened from another comes in over it, with a back button that names it, and only the one shown can be reached", () => {
  const { dialog, row, sheets } = createRowDialog(["gameSheet", "teamSheet"], {
    gameSheet: { name: "Game" },
  });

  open(sheets.gameSheet.sheet);
  open(sheets.teamSheet.sheet);

  assert.deepEqual(listInRow(row), ["gameSheet", "teamSheet"]);
  assert.deepEqual(readPlaces(row), {
    gameSheet: { zIndex: "0", transform: "translateX(-30%)" },
    teamSheet: { zIndex: "1", transform: "" },
  });
  assert.equal(findReachable(row), "teamSheet");
  assert.equal(focused, sheets.teamSheet.sheet);
  assert.equal(dialog.getAttribute("aria-labelledby"), "teamSheetTitle");
  assert.deepEqual(readBackLabel(sheets.teamSheet.backButton), {
    text: "Game",
    ariaLabel: "Back to Game",
  });
  assert.equal(readBackLabel(sheets.gameSheet.backButton), null);
  dialog.close();
});

test("back goes to the sheet before and takes the one it left out of the row, which lets go of what it showed", () => {
  /** @type {string[]} */
  const forgotten = [];
  const { dialog, row, sheets } = createRowDialog(["gameSheet", "teamSheet"], {
    teamSheet: { forget: () => forgotten.push("team") },
  });
  open(sheets.gameSheet.sheet);
  open(sheets.teamSheet.sheet);

  click(sheets.teamSheet.backButton);

  assert.deepEqual(readPlaces(row), { gameSheet: { zIndex: "0", transform: "" } });
  assert.equal(findReachable(row), "gameSheet");
  assert.deepEqual(forgotten, ["team"]);
  dialog.close();
});

test("with motion, a sheet opened from another slides in from the right edge over it, the one under it going a little way left, and is the one shown once the slide ends", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const { dialog, row, sheets } = createRowDialog(
    ["gameSheet", "teamSheet"],
    {},
    { isMoving: true },
  );
  open(sheets.gameSheet.sheet);

  open(sheets.teamSheet.sheet);
  assert.deepEqual(readPlaces(row), {
    gameSheet: { zIndex: "0", transform: "translateX(-30%)" },
    teamSheet: { zIndex: "1", transform: "" },
  });
  assert.ok(row.classList.contains("is-sliding"));
  assert.equal(findReachable(row), "gameSheet");

  mock.timers.tick(500);
  assert.ok(!row.classList.contains("is-sliding"));
  assert.equal(findReachable(row), "teamSheet");
  dialog.close();
  mock.timers.reset();
});

test("with motion, a sheet opened while the one over it slides away takes its place, and the one leaving lets go of what it showed", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  /** @type {string[]} */
  const forgotten = [];
  const { dialog, row, sheets } = createRowDialog(
    ["gameSheet", "teamSheet", "playerSheet"],
    { teamSheet: { forget: () => forgotten.push("team") } },
    { isMoving: true },
  );
  open(sheets.gameSheet.sheet);
  open(sheets.teamSheet.sheet);
  mock.timers.tick(500);

  click(sheets.teamSheet.backButton);
  open(sheets.playerSheet.sheet);
  mock.timers.tick(500);

  assert.deepEqual(listInRow(row), ["gameSheet", "playerSheet"]);
  assert.deepEqual(forgotten, ["team"]);
  assert.equal(findReachable(row), "playerSheet");
  dialog.close();
  mock.timers.reset();
});

test("with motion, a sheet opened again while it slides away stays, and slides back in", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  /** @type {string[]} */
  const forgotten = [];
  const { dialog, row, sheets } = createRowDialog(
    ["gameSheet", "teamSheet"],
    { teamSheet: { forget: () => forgotten.push("team") } },
    { isMoving: true },
  );
  open(sheets.gameSheet.sheet);
  open(sheets.teamSheet.sheet);
  mock.timers.tick(500);

  click(sheets.teamSheet.backButton);
  open(sheets.teamSheet.sheet);
  mock.timers.tick(500);

  assert.deepEqual(listInRow(row), ["gameSheet", "teamSheet"]);
  assert.deepEqual(forgotten, []);
  assert.equal(findReachable(row), "teamSheet");
  dialog.close();
  mock.timers.reset();
});

// A stand-in for settings on a phone, a dialog that is its own sheet, which a swipe down moves and
// closes, with any of `parts` beside its close button.
/** @param {Partial<SheetParts>} [parts] */
function createPhoneSheet(parts = {}) {
  globalThis.matchMedia = /** @type {any} */ ((query) => ({ matches: query.includes("width") }));
  globalThis.document = /** @type {any} */ ({ activeElement: null });
  /** @type {KeyframeAnimationOptions[]} */
  const motions = [];
  const dialog = Object.assign(new FakeDialog("settingsDialog"), {
    getAnimations: () => [],
    /**
     * @param {Keyframe[]} _keyframes
     * @param {KeyframeAnimationOptions} options
     */
    animate(_keyframes, options) {
      motions.push(options);
      /** @type {{ cancel: () => void, finished?: Promise<unknown> }} */
      const motion = { cancel() {} };
      motion.finished = Promise.resolve(motion);
      return motion;
    },
  });
  wireSheet(/** @type {any} */ (dialog), {
    closeButton: /** @type {any} */ (new EventTarget()),
    ...parts,
  });
  open(dialog);
  /**
   * @param {string} type
   * @param {number} [clientY]
   */
  const touch = (type, clientY) => {
    const touches = clientY === undefined ? [] : [{ clientX: 0, clientY }];
    dialog.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { touches }));
  };
  return { dialog, touch, motions };
}

test("on a phone, a swipe down that scrolls the sheet back to its top goes on to move the sheet and close it, at the pace and easing of the phone's own sheets", async () => {
  const { dialog, touch, motions } = createPhoneSheet();
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
  assert.deepEqual(
    motions.map(({ duration, easing }) => ({ duration, easing })),
    [{ duration: 500, easing: "cubic-bezier(0.32, 0.72, 0, 1)" }],
  );
});

test("on a phone, a swipe down a sheet's section scrolled down scrolls the section, and moves the sheet only once the section is at its top", () => {
  const section = new FakeElement();
  section.scrollTop = 300;
  const { dialog, touch } = createPhoneSheet({ findScroller: () => /** @type {any} */ (section) });

  touch("touchstart", 100);
  touch("touchmove", 200);
  assert.equal(dialog.style.transform, "");
  section.scrollTop = 0;
  touch("touchmove", 230);
  assert.equal(dialog.style.transform, "translateY(30px)");
  dialog.close();
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

test("the sheets showing are listed up to the shown one, with where each is scrolled, what each shows, and what its back button calls the one before", () => {
  const { dialog, sheets } = createRowDialog(["gameSheet", "teamSheet", "playerSheet"], {
    gameSheet: { keeper: keepShown({ id: "game-1" }), name: "Game" },
    teamSheet: { keeper: keepShown({ team: "NY" }), name: "Team" },
  });
  open(sheets.gameSheet.sheet);
  open(sheets.teamSheet.sheet);
  open(sheets.playerSheet.sheet);
  click(sheets.playerSheet.backButton);
  sheets.gameSheet.sheet.scrollTop = 240;

  assert.deepEqual(listOpenSheets(), [
    { id: "gameSheet", scrollTop: 240, subject: { id: "game-1" }, backLabel: null },
    { id: "teamSheet", scrollTop: 0, subject: { team: "NY" }, backLabel: "Game" },
  ]);

  dialog.close();
  assert.deepEqual(listOpenSheets(), []);
});

test("a page that loads again puts back each sheet it showed, up to the first that can't show what it did, and closes a dialog none of whose sheets can", () => {
  /** @type {unknown[]} */
  const reopened = [];
  const { dialog, row } = createRowDialog(["gameSheet", "teamSheet", "playerSheet"], {
    gameSheet: { keeper: keepShown(null, (subject) => reopened.push(subject) > 0) },
    teamSheet: { keeper: keepShown(null, () => false) },
    playerSheet: { keeper: keepShown(null) },
  });
  dialog.open = true;
  dialog.setAttribute("data-reopened", "");

  reopenSheets([
    { id: "gameSheet", scrollTop: 120, subject: { id: "game-1" } },
    { id: "teamSheet", scrollTop: 0, subject: { team: "NY" } },
    { id: "playerSheet", scrollTop: 0, subject: { team: "NY" } },
    { id: "goneSheet", scrollTop: 0, subject: null },
    null,
  ]);

  assert.deepEqual(reopened, [{ id: "game-1" }]);
  assert.equal(dialog.open, true);
  assert.deepEqual(listInRow(row), ["gameSheet"]);
  assert.equal(findReachable(row), "gameSheet");
  assert.deepEqual(
    listOpenSheets().map(({ id }) => id),
    ["gameSheet"],
  );
  dialog.close();
  assert.ok(!dialog.hasAttribute("data-reopened"));

  dialog.open = true;
  reopenSheets([{ id: "teamSheet", scrollTop: 0, subject: { team: "NY" } }]);
  assert.equal(dialog.open, false);
});

test("a page that loads again puts back a sheet over the one it was opened from, and shows it", () => {
  const { dialog, row, sheets } = createRowDialog(["gameSheet", "teamSheet"], {
    gameSheet: { keeper: keepShown(null), name: "Game" },
    teamSheet: { keeper: keepShown(null) },
  });
  dialog.open = true;

  reopenSheets([
    { id: "gameSheet", scrollTop: 0, subject: null },
    { id: "teamSheet", scrollTop: 0, subject: null },
  ]);

  assert.deepEqual(readPlaces(row), {
    gameSheet: { zIndex: "0", transform: "translateX(-30%)" },
    teamSheet: { zIndex: "1", transform: "" },
  });
  assert.equal(findReachable(row), "teamSheet");
  assert.equal(readBackLabel(sheets.teamSheet.backButton)?.text, "Game");
  dialog.close();
});

test("saved sheets that can't be read leave every dialog as it is", () => {
  const { dialog } = createRowDialog(["gameSheet"]);
  dialog.open = true;

  reopenSheets("{not json");
  reopenSheets({ id: "gameSheet" });
  assert.equal(dialog.open, true);
  assert.deepEqual(listOpenSheets(), []);
});
