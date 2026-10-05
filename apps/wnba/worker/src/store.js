import { choosePollDelay } from "../../page/js/snapshot.js";
import { createSeasonStore } from "../../../../shared/worker/season-store.js";
import * as SeasonUpdater from "./season-updater.js";
import { createNewsJob } from "./news-updater.js";
import { createSnapshotServer } from "./snapshot.js";
import { createWatchedGameLoader } from "./watched-games.js";

export { forwardToStore } from "../../../../shared/worker/season-store.js";

export const SeasonStore = createSeasonStore({
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
  backgroundJobs: { news: createNewsJob() },
});
