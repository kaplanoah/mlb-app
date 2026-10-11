// What's new in the app, newest first, for the Updates box. A note goes here only when the repo's
// owner asks for one, timed as it ships.

import { html } from "#shared/html.js";

/** @type {import("#shared/updates.js").ReleaseNote[]} */
export const RELEASE_NOTES = [
  {
    at: "2026-10-11T01:46:00Z",
    text: html`Freeform search for games. Tap <b>Search</b> on the games page and type a team, city, ballpark, pitcher, or things like "games this weekend" or "Mets at Phillies".`,
  },
  {
    at: "2026-10-10T19:49:00Z",
    text: html`Game highlights for finished games, including recap videos and big play clips. Tap a game, then tap <b>Highlights</b> or swipe left.`,
  },
];
