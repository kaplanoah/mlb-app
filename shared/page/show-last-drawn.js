// Modules run only once all of them have loaded, and the browser can paint before then, so a page
// left to them would first show empty views. The page saves what each part it draws whole showed
// as it leaves the screen (last-seen.js), with the sheets it showed, and this plain script, loaded
// in the head, puts it back: the page calls showLastDrawn() right after its views, its sheets, and
// openLastTab(), before anything is painted, since a part on a hidden tab can't take back where it
// was scrolled.

// Storage can be empty or refuse access, as in a private window, so the page never depends on it.
/** @param {string} key */
function readSaved(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function readLastDrawn() {
  const saved = readSaved("lastDrawn");
  return saved && typeof saved === "object" ? saved : {};
}

// Only a part the page draws whole goes back, since a release may have changed the markup around
// it, and the page's modules redraw it from the season before it's ever used.
/**
 * @param {string} id
 * @param {any} part
 */
function isDrawnPart(id, part) {
  const element = document.getElementById(id);
  return !!element?.hasAttribute("data-last-drawn") && typeof part?.markup === "string";
}

/**
 * @param {Element} part
 * @param {number[]} path child indexes from the part
 */
function findByPath(part, path) {
  let element = part;
  for (const index of path) element = element?.children[index];
  return element;
}

/**
 * @param {Element} part
 * @param {unknown} scrolls
 */
function restoreScrolls(part, scrolls) {
  if (!Array.isArray(scrolls)) return;
  for (const { path, left } of scrolls) {
    const element = Array.isArray(path) ? findByPath(part, path) : null;
    if (element) element.scrollLeft = left;
  }
}

/**
 * @param {string} id
 * @param {{ markup: string, hidden: boolean, classes?: unknown, style?: unknown, scrolls?: unknown }} part
 */
function showPart(id, { markup, hidden, classes, style, scrolls }) {
  const element = /** @type {HTMLElement} */ (document.getElementById(id));
  element.innerHTML = markup;
  element.hidden = hidden === true;
  if (typeof classes === "string") element.classList.add(...classes.split(" ").filter(Boolean));
  if (typeof style === "string") element.setAttribute("style", style);
  restoreScrolls(element, scrolls);
}

/** @param {any} sheet */
function findSheetDialog(sheet) {
  const dialog = typeof sheet?.id === "string" ? document.getElementById(sheet.id) : null;
  return dialog instanceof HTMLDialogElement && !dialog.open ? dialog : null;
}

// A sheet that was showing is still there when the page comes back, so it shows without rising
// again, until the page's modules take it over (sheet.js's reopenSheets) or close it.
function showLastSheets() {
  const sheets = readSaved("openSheets");
  if (!Array.isArray(sheets)) return;
  for (const sheet of sheets) {
    const dialog = findSheetDialog(sheet);
    if (!dialog) continue;
    dialog.setAttribute("data-reopened", "");
    dialog.showModal();
    dialog.scrollTop = Number(sheet.scrollTop) || 0;
  }
}

// What the page last showed is a drawing of its own, so the note that its views are still empty
// goes with it.
function showLastDrawn() {
  const parts = Object.entries(readLastDrawn()).filter(([id, part]) => isDrawnPart(id, part));
  for (const [id, part] of parts) showPart(id, part);
  if (parts.length) document.getElementById("loadNote")?.remove();
  showLastSheets();
}
