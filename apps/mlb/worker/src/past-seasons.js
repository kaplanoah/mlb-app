import { hasSchedule, savePastSeason } from "./season-updater.js";

// Fills in each season before the current one that the store keeps without its standings, as one
// followed only until it ended was, or without its games, as one saved before the store kept them
// was, so the page reads every season whole from the store. One season a run, newest first, and
// once a past season is whole, it isn't read again.

const DAY_MS = 24 * 60 * 60 * 1000;

const hasStandings = (season) => !!season.standings;

/** @returns {import("../../../../shared/worker/season-store.js").BackgroundJob} */
export function createPastSeasonsJob() {
  return {
    chooseDelay: () => DAY_MS,
    async run({ docs, loadSnapshot }) {
      const current = await docs.read("live/current");
      if (!current) return;
      const past = (await docs.list("seasons"))
        .filter((season) => season.year < current.season)
        .sort((first, second) => second.year - first.year);
      for (const season of past) {
        if (hasStandings(season) && (await hasSchedule(docs, season.year))) continue;
        const snapshot = await loadSnapshot(season.year);
        if (!snapshot.missing.length) await savePastSeason(docs, snapshot);
        return;
      }
    },
  };
}
