import { choosePollDelay } from "../../page/js/snapshot.js";
import PAGE_FILES from "#page-files/wnba";
import { readReleaseCommit } from "../../../../shared/worker/app-worker.js";
import { createSeasonStore } from "../../../../shared/worker/season-store.js";
import * as SeasonUpdater from "./season-updater.js";
import { createNewsJob } from "./news-updater.js";
import { createPlayerJob } from "./player-updater.js";
import { createSnapshotServer } from "./snapshot.js";
import { createWatchedGameLoader } from "./watched-games.js";

export { forwardToStore, readStoreDoc } from "../../../../shared/worker/season-store.js";

export const SeasonStore = createSeasonStore({
  release: readReleaseCommit(PAGE_FILES),
  createLoadSnapshot: (storage) => createSnapshotServer({ storage }).loadSnapshot,
  loadCurrentSnapshot: SeasonUpdater.loadCurrentSnapshot,
  readUpdates: SeasonUpdater.readUpdates,
  saveSnapshot: SeasonUpdater.saveSnapshot,
  describeSnapshotStatus: SeasonUpdater.describeSnapshotStatus,
  statusFields: SeasonUpdater.STATUS_FIELDS,
  choosePollDelay,
  listNotifications: SeasonUpdater.listNotifications,
  detailsCollection: "games",
  createLoadDetails: () => createWatchedGameLoader(),
  backgroundJobs: { news: createNewsJob(), players: createPlayerJob() },
});
