import { savePastSeason } from "./season-updater.js";

// Fills in the record of each season before the current one that was saved without its standings,
// as one followed only until it ended was, so the page reads every season from its record. Once a
// past season's record is whole, it isn't read again.

const DAY_MS = 24 * 60 * 60 * 1000;

const isWhole = (season) => !!season.standings;

/** @returns {import("../../../../shared/worker/season-store.js").BackgroundJob} */
export function createPastSeasonsJob() {
  return {
    chooseDelay: () => DAY_MS,
    async run({ docs, loadSnapshot }) {
      const current = await docs.read("live/current");
      if (!current) return;
      const unfinished = (await docs.list("seasons")).filter(
        (season) => season.year < current.season && !isWhole(season),
      );
      for (const { year } of unfinished) {
        const snapshot = await loadSnapshot(year);
        if (!snapshot.missing.length) await savePastSeason(docs, snapshot);
      }
    },
  };
}
