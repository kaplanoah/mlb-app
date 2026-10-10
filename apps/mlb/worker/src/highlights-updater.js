import { createHighlightsJob } from "../../../../shared/worker/highlights-job.js";
import { listCurrentFinals } from "./game-details-updater.js";
import { fetchHighlights, nameHighlightsKey } from "./highlights.js";

// Keeps each of the current season's finals' highlights, as the shared job reads them over the
// hours after each game (highlights-job.js). A game from a season before is read on a tap.

// A game MLB hasn't timed yet ends about three hours after it starts.
const GAME_LENGTH_MS = 3 * 60 * 60 * 1000;

/** @param {any} game */
const findEnd = (game) =>
  game.end ? Date.parse(game.end) : Date.parse(game.start) + GAME_LENGTH_MS;

export const createHighlightsUpdater = () =>
  createHighlightsJob({
    listFinals: listCurrentFinals,
    findEnd,
    readHighlights: (context, game) => fetchHighlights(context.fetchImpl, game.id),
    nameKey: nameHighlightsKey,
  });
