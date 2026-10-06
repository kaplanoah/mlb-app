// What's new in the app, newest first, for the Updates box. A note goes here only when the repo's
// owner asks for one, timed as it ships.

import { html } from "#shared/html.js";

/** @type {import("#shared/updates.js").ReleaseNote[]} */
export const RELEASE_NOTES = [
  {
    at: "2026-10-06T04:37:00Z",
    text: html`Team rosters. Tap on a team in the bracket, standings, or a game's details page, then swipe left or tap <b>Roster</b>.`,
  },
  {
    at: "2026-10-05T03:31:00Z",
    text: "A News tab with WNBA stories and analysis from curated sources including ESPN, The Athletic, The IX, and beat writers. Configure teams and paywalled content in settings at the top right.",
  },
  {
    at: "2026-10-02T17:15:00Z",
    text: "Game details now include which channels it's playing on. Tap a game to view details.",
  },
];
