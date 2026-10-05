// What the page shows, read from the Worker's store and kept current as it changes.
export const session = {
  /** @type {ReturnType<typeof import("#shared/worker-store.js").createWorkerStore> | null} */
  db: null,
  year: new Date().getFullYear(),
  /** @type {any} */
  season: null,
  // The news topics, null when the store has none, and undefined until the store or the page's
  // last showing says.
  /** @type {{ topics: import("./news-picks.js").NewsTopic[] } | null | undefined} */
  news: undefined,
  /** @type {{ error?: string, detail?: string } | null} */
  status: null,
  problem: "",
};
