import { test } from "node:test";
import assert from "node:assert/strict";
import { listOpenSheets, openSheet, reopenSheets, wireSheet } from "../shared/page/sheet.js";

/** @typedef {import("../shared/page/sheet.js").SheetKeeper} SheetKeeper */
/** @typedef {import("../shared/page/sheet.js").SheetParts} SheetParts */

const ROW_WIDTH = 390;

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
    this.scrollLeft = 0;
    this.clientWidth = ROW_WIDTH;
    this.textContent = "";
    this.style = { order: "", transform: "" };
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

// A row scrolls at once, as it does when less motion is asked for, and says so, or, held, stays
// put until moved.
class FakeRow extends FakeElement {
  constructor() {
    super({ className: "sheet-row" });
    this.isHeld = false;
  }

  /** @param {{ left: number }} options */
  scrollTo({ left }) {
    if (!this.isHeld) this.moveTo(left);
  }

  /** @param {number} left */
  moveTo(left) {
    this.scrollLeft = left;
    this.dispatchEvent(new Event("scroll"));
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
 * A dialog with a row of sheets, each with Done and a back button, on a wide screen, where a dialog closes at once instead of sliding down.
 * @param {string[]} ids
 * @param {Record<string, Partial<SheetParts>>} [partsById]
 */
function createRowDialog(ids, partsById = {}) {
  globalThis.matchMedia = /** @type {any} */ (
    (query) => ({ matches: query.includes("reduced-motion") })
  );
  const dialog = new FakeDialog("sheetDialog");
  globalThis.document = /** @type {any} */ ({
    get activeElement() {
      return focused;
    },
    getElementById: (/** @type {string} */ id) => findById(dialog, id),
  });
  const row = dialog.append(new FakeRow());
  /** @typedef {{ sheet: FakeElement, doneButton: FakeElement, backButton: FakeElement }} FakeSheet */
  const sheets = /** @type {Record<string, FakeSheet>} */ (
    Object.fromEntries(
      ids.map((id) => {
        const sheet = row.append(new FakeElement({ id, tag: "section", className: "sheet-page" }));
        sheet.hidden = true;
        sheet.setAttribute("aria-labelledby", `${id}Title`);
        const parts = {
          doneButton: new FakeElement(),
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

test("Done and a click on the backdrop close the dialog, and its sheets leave the row", () => {
  const { dialog, row, sheets } = createRowDialog(["gameSheet"]);

  open(sheets.gameSheet.sheet);
  click(sheets.gameSheet.doneButton);
  assert.equal(dialog.open, false);
  assert.deepEqual(listInRow(row), []);
  open(sheets.gameSheet.sheet);
  click(dialog);
  assert.equal(dialog.open, false);
});

test("a sheet opened from another comes in after it, with a back button that names it, and only the one shown can be reached", () => {
  const { dialog, row, sheets } = createRowDialog(["gameSheet", "teamSheet"], {
    gameSheet: { name: "Game" },
  });

  open(sheets.gameSheet.sheet);
  open(sheets.teamSheet.sheet);

  assert.deepEqual(listInRow(row), ["gameSheet", "teamSheet"]);
  assert.deepEqual(
    [sheets.gameSheet.sheet.style.order, sheets.teamSheet.sheet.style.order],
    ["0", "1"],
  );
  assert.equal(row.scrollLeft, ROW_WIDTH);
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

test("back scrolls to the sheet before and takes the one it left out of the row, which lets go of what it showed", () => {
  /** @type {string[]} */
  const forgotten = [];
  const { dialog, row, sheets } = createRowDialog(["gameSheet", "teamSheet"], {
    teamSheet: { forget: () => forgotten.push("team") },
  });
  open(sheets.gameSheet.sheet);
  open(sheets.teamSheet.sheet);

  click(sheets.teamSheet.backButton);

  assert.equal(row.scrollLeft, 0);
  assert.equal(findReachable(row), "gameSheet");
  assert.deepEqual(listInRow(row), ["gameSheet"]);
  assert.deepEqual(forgotten, ["team"]);
  dialog.close();
});

test("a sheet opened again after a step back away from it, before the row has come to rest, stays for the row to go to", () => {
  const { dialog, row, sheets } = createRowDialog(["gameSheet", "teamSheet"]);
  open(sheets.gameSheet.sheet);
  open(sheets.teamSheet.sheet);
  row.isHeld = true;
  row.moveTo(1);
  assert.equal(findReachable(row), "gameSheet");

  open(sheets.teamSheet.sheet);
  row.moveTo(0);
  assert.deepEqual(listInRow(row), ["gameSheet", "teamSheet"]);
  row.moveTo(ROW_WIDTH);
  assert.equal(findReachable(row), "teamSheet");
  dialog.close();
});

test("a sheet opened from one with a sheet waiting after it takes its place, and the one waiting lets go of what it showed", () => {
  /** @type {string[]} */
  const forgotten = [];
  /** @type {Record<string, any>} */
  const sheets = {};
  const created = createRowDialog(["teamSheet", "rosterSheet", "playerSheet"], {
    teamSheet: { prepareNext: () => sheets.rosterSheet.sheet },
    rosterSheet: { forget: () => forgotten.push("roster") },
  });
  Object.assign(sheets, created.sheets);
  const { dialog, row } = created;
  open(sheets.teamSheet.sheet);

  open(sheets.playerSheet.sheet);

  assert.deepEqual(listInRow(row), ["teamSheet", "playerSheet"]);
  assert.deepEqual(forgotten, ["roster"]);
  assert.equal(findReachable(row), "playerSheet");
  dialog.close();
});

test("a sheet that names its next one has it wait after it for a swipe, again after a step back from it", () => {
  /** @type {Record<string, any>} */
  const sheets = {};
  const created = createRowDialog(["teamSheet", "rosterSheet"], {
    teamSheet: { name: "Team", prepareNext: () => sheets.rosterSheet.sheet },
    rosterSheet: { name: "Roster" },
  });
  Object.assign(sheets, created.sheets);
  const { dialog, row } = created;

  open(sheets.teamSheet.sheet);
  assert.deepEqual(listInRow(row), ["teamSheet", "rosterSheet"]);
  assert.equal(findReachable(row), "teamSheet");
  assert.deepEqual(readBackLabel(sheets.rosterSheet.backButton), {
    text: "Team",
    ariaLabel: "Back to Team",
  });

  row.scrollTo({ left: ROW_WIDTH });
  assert.equal(findReachable(row), "rosterSheet");
  click(sheets.rosterSheet.backButton);
  assert.deepEqual(listInRow(row), ["teamSheet", "rosterSheet"]);
  assert.equal(findReachable(row), "teamSheet");
  dialog.close();
});

test("a row partway between two sheets settles on neither, and one a pixel off settles on the nearer, keeping the sheet it left until it comes to rest", () => {
  const { dialog, row, sheets } = createRowDialog(["gameSheet", "teamSheet"]);
  open(sheets.gameSheet.sheet);
  open(sheets.teamSheet.sheet);

  row.scrollTo({ left: ROW_WIDTH / 2 });
  assert.equal(findReachable(row), "teamSheet");
  row.scrollTo({ left: 1 });
  assert.equal(findReachable(row), "gameSheet");
  assert.deepEqual(listInRow(row), ["gameSheet", "teamSheet"]);
  row.scrollTo({ left: 0 });
  assert.deepEqual(listInRow(row), ["gameSheet"]);
  dialog.close();
});

// A stand-in for settings on a phone, a dialog that is its own sheet, which a swipe down moves and
// closes.
function createPhoneSheet() {
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
  wireSheet(/** @type {any} */ (dialog), { doneButton: /** @type {any} */ (new EventTarget()) });
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
    Array(2).fill({ duration: 500, easing: "cubic-bezier(0.32, 0.72, 0, 1)" }),
  );
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
  const { dialog, sheets } = createRowDialog(["gameSheet", "teamSheet", "rosterSheet"], {
    gameSheet: { keeper: keepShown({ id: "game-1" }), name: "Game" },
    teamSheet: { keeper: keepShown({ team: "NY" }), name: "Team" },
  });
  open(sheets.gameSheet.sheet);
  open(sheets.teamSheet.sheet);
  open(sheets.rosterSheet.sheet);
  click(sheets.rosterSheet.backButton);
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
  const { dialog, row } = createRowDialog(["gameSheet", "teamSheet", "rosterSheet"], {
    gameSheet: { keeper: keepShown(null, (subject) => reopened.push(subject) > 0) },
    teamSheet: { keeper: keepShown(null, () => false) },
    rosterSheet: { keeper: keepShown(null) },
  });
  dialog.open = true;
  dialog.setAttribute("data-reopened", "");

  reopenSheets([
    { id: "gameSheet", scrollTop: 120, subject: { id: "game-1" } },
    { id: "teamSheet", scrollTop: 0, subject: { team: "NY" } },
    { id: "rosterSheet", scrollTop: 0, subject: { team: "NY" } },
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

test("a page that loads again puts back a sheet after the one it was opened from, with the row on it", () => {
  const { dialog, row, sheets } = createRowDialog(["gameSheet", "teamSheet"], {
    gameSheet: { keeper: keepShown(null), name: "Game" },
    teamSheet: { keeper: keepShown(null) },
  });
  dialog.open = true;

  reopenSheets([
    { id: "gameSheet", scrollTop: 0, subject: null },
    { id: "teamSheet", scrollTop: 0, subject: null },
  ]);

  assert.equal(row.scrollLeft, ROW_WIDTH);
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
