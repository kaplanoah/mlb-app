import { html, setHtml } from "./html.js";

// The settings' Season picker: the seasons the store keeps, newest first, with the shown one always
// among them. It shows only once there's another season to pick.

/**
 * The years of the seasons the store keeps, newest first.
 * @param {{ id: string }[]} docs the store's `seasons` collection
 * @returns {string[]}
 */
export const listSeasonYears = (docs) =>
  docs
    .map((doc) => doc.id)
    .filter((id) => /^\d{4}$/.test(id))
    .sort()
    .reverse();

/**
 * @param {HTMLSelectElement} picker
 * @param {string[]} years
 * @param {number} shownYear
 */
export function fillSeasonPicker(picker, years, shownYear) {
  const shown = String(shownYear);
  const listed = [...new Set([shown, ...years])].sort().reverse();
  const options = listed.map(
    (year) => html`<option value="${year}" ${year === shown ? "selected" : ""}>${year}</option>`,
  );
  setHtml(picker, html`${options}`);
  /** @type {HTMLElement} */ (picker.closest(".control-row")).hidden = listed.length < 2;
}
