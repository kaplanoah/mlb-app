// What's new in the app, newest first, for the Updates box. A note goes here only when the repo's
// owner asks for one, timed as it ships.

import { html } from "#shared/html.js";

/** @type {import("#shared/updates.js").ReleaseNote[]} */
export const RELEASE_NOTES = [
  {
    at: "2026-10-07T14:41:00Z",
    text: html`Version 5 rebuilds how the app moves: the tab bar, the Games lists, and every sheet, built plainly so iPhones draw them every time. If anything ever looks blank, turn on Diagnostics in settings, tap <b>Record</b>, then <b>Share report</b>, and send what it shares.`,
  },
];
