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

/** @param {any} saved */
function findLastSheet(saved) {
  const sheet = typeof saved?.id === "string" ? document.getElementById(saved.id) : null;
  const dialog = sheet?.closest("dialog");
  return sheet && dialog && !dialog.open ? { sheet, dialog } : null;
}

/**
 * Names the sheet a sheet was opened from on its back button, as sheet.js does.
 * @param {HTMLElement} sheet
 * @param {unknown} backLabel
 */
function labelBackButton(sheet, backLabel) {
  const backButton = /** @type {HTMLElement | null} */ (sheet.querySelector(".sheet-back"));
  const label = backButton?.querySelector(".sheet-back-label");
  if (!backButton || !label || typeof backLabel !== "string") return;
  label.textContent = backLabel;
  backButton.setAttribute("aria-label", `Back to ${backLabel}`);
  backButton.hidden = false;
}

/**
 * Puts a dialog's sheets back in its row, in the order they opened, and shows the last of them.
 * @param {HTMLDialogElement} dialog
 * @param {{ sheet: HTMLElement, saved: any }[]} sheets
 */
function showLastDialog(dialog, sheets) {
  const row = dialog.querySelector(":scope > .sheet-row");
  sheets.forEach(({ sheet, saved }, index) => {
    if (sheet === dialog) return;
    sheet.hidden = false;
    sheet.style.order = String(index);
    labelBackButton(sheet, saved.backLabel);
  });
  dialog.setAttribute("data-reopened", "");
  dialog.showModal();
  if (row) row.scrollLeft = (sheets.length - 1) * row.clientWidth;
  for (const { sheet, saved } of sheets) sheet.scrollTop = Number(saved.scrollTop) || 0;
}

// A sheet that was showing is still there when the page comes back, so it shows without rising
// again, beside any it was opened from, until the page's modules take it over (sheet.js's
// reopenSheets) or close it.
function showLastSheets() {
  const saved = readSaved("openSheets");
  if (!Array.isArray(saved)) return;
  /** @type {Map<HTMLDialogElement, { sheet: HTMLElement, saved: any }[]>} */
  const dialogs = new Map();
  for (const each of saved) {
    const found = findLastSheet(each);
    if (found)
      dialogs.set(found.dialog, [
        ...(dialogs.get(found.dialog) ?? []),
        { sheet: found.sheet, saved: each },
      ]);
  }
  for (const [dialog, sheets] of dialogs) showLastDialog(dialog, sheets);
}

// What the page last showed is a drawing of its own, so the note that its views are still empty
// goes with it.
function showLastDrawn() {
  const parts = Object.entries(readLastDrawn()).filter(([id, part]) => isDrawnPart(id, part));
  for (const [id, part] of parts) showPart(id, part);
  if (parts.length) document.getElementById("loadNote")?.remove();
  showLastSheets();
}
