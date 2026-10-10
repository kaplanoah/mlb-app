// A finished game's highlights for its sheet, from the Worker, which answers from the store and
// reads MLB for a game the store doesn't keep.

import { fetchFromWorker } from "#shared/worker-fetch.js";

const FETCH_TIMEOUT_MS = 15 * 1000;
// Highlights post over hours, so a sheet opened again in the next minute reuses them.
const REUSE_MS = 60 * 1000;

/** @param {string} id */
export const fetchHighlights = (id) =>
  fetchFromWorker(`highlights?id=${encodeURIComponent(id)}`, {
    reuseMs: REUSE_MS,
    timeoutMs: FETCH_TIMEOUT_MS,
    isExpected: (body) => body.id === id && Array.isArray(body.plays),
  });
