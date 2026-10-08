// A game's box score for its sheet, from the Worker, which answers a final's from the store and
// reads MLB for any other.

import { fetchFromWorker } from "#shared/worker-fetch.js";

const FETCH_TIMEOUT_MS = 15 * 1000;
// A box score read as a finger comes down on its game serves the sheet that opens on the tap.
const REUSE_MS = 5 * 1000;

/** @param {string} id */
export const fetchBoxScore = (id) =>
  fetchFromWorker(`box-score?id=${encodeURIComponent(id)}`, {
    reuseMs: REUSE_MS,
    timeoutMs: FETCH_TIMEOUT_MS,
    isExpected: (body) => body.id === id,
  });
