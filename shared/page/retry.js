// What a sheet shows where a read of its Worker failed, with a Try again button, as retry.css
// draws it: a whole sheet or section that didn't load holds a centered block, and one part of it a
// note in that part's place. A tap on Try again, the phone coming back online, or the page coming
// back reads again, so the part shows its placeholders until the read answers.

import { html } from "./html.js";
import { watchTimeAway } from "./resume.js";

// Phosphor's arrow-clockwise, at its Regular weight.
const ARROW = html`<svg class="retry-icon" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
  <path
    d="M240,56v48a8,8,0,0,1-8,8H184a8,8,0,0,1,0-16H211.4L184.81,71.64l-.25-.24a80,80,0,1,0-1.67,114.78,8,8,0,0,1,11,11.63A95.44,95.44,0,0,1,128,224h-1.32A96,96,0,1,1,195.75,60L224,85.8V56a8,8,0,1,1,16,0Z"
  />
</svg>`;

// Phosphor's cloud-slash, at its Light weight.
const CLOUD_SLASH = html`<svg class="retry-art" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
  <path
    d="M52.44,36A6,6,0,0,0,43.56,44l40.18,44.2c-.45.87-.9,1.75-1.32,2.64A62,62,0,1,0,72,214h88a85.23,85.23,0,0,0,32.35-6.3L203.56,220a6,6,0,0,0,8.88-8.08ZM160,202H72a50,50,0,1,1,5.9-99.64A86.25,86.25,0,0,0,74,128a6,6,0,0,0,12,0,73.92,73.92,0,0,1,6.44-30.2l91.22,100.34A73.65,73.65,0,0,1,160,202Zm86-74a85.85,85.85,0,0,1-21.85,57.27,6,6,0,0,1-4.47,2,6,6,0,0,1-4.47-10,74,74,0,0,0-99-108.92,6,6,0,1,1-7.11-9.67A86,86,0,0,1,246,128Z"
  />
</svg>`;

// Phosphor's warning-circle, at its Regular weight, as in a line of text.
const WARNING = html`<svg class="retry-warning" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
  <path
    d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm-8-80V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z"
  />
</svg>`;

/** @param {{ isFilled?: boolean }} [options] the one in a centered block is filled */
export const renderRetryButton = ({ isFilled = false } = {}) =>
  html`<button type="button" class="retry-button${isFilled ? " filled" : ""}" data-retry>
    ${ARROW}<span>Try again</span>
  </button>`;

/**
 * Why something didn't load, after a warning icon.
 * @param {string} message
 * @param {string} [className] the class of the text it stands in for, so it keeps that text's type
 */
export const renderRetryMessage = (message, className) =>
  html`<p class="${["retry-message", className].filter(Boolean).join(" ")}">${WARNING}<span>${message}</span></p>`;

/**
 * In place of a whole sheet or section that didn't load: an icon, why, and a filled button,
 * centered.
 * @param {string} message
 * @param {string} [className] the class of the text it stands in for, so it keeps that text's size
 */
export const renderRetryBlock = (message, className) =>
  html`<div class="retry-block">
    ${CLOUD_SLASH}
    <p class="${["retry-title", className].filter(Boolean).join(" ")}">${message}</p>
    ${renderRetryButton({ isFilled: true })}
  </div>`;

/**
 * In place of one part that didn't load: why, with the button under it.
 * @param {string} message
 * @param {string} [className] the class of the text it stands in for
 */
export const renderRetryNote = (message, className) =>
  html`<div class="retry-note">${renderRetryMessage(message, className)}${renderRetryButton()}</div>`;

/**
 * Calls `retry` on a tap on a Try again button inside `holder`, and, while `holder` shows one, as
 * the phone comes back online or the page comes back.
 * @param {HTMLElement} holder
 * @param {() => void} retry
 */
export function watchRetries(holder, retry) {
  holder.addEventListener("click", (event) => {
    if (/** @type {Element} */ (event.target).closest("[data-retry]")) retry();
  });
  const retryIfShown = () => {
    if (holder.querySelector("[data-retry]")) retry();
  };
  addEventListener("online", retryIfShown);
  watchTimeAway(retryIfShown);
}
