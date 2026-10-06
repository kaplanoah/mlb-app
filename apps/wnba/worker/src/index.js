import PAGE_FILES from "#page-files/wnba";
import { createAppWorker } from "../../../../shared/worker/app-worker.js";
import { createBoxScoreServer } from "./box-score.js";
import { createLeadServer } from "./lead.js";
import { createPreviewServer } from "./preview.js";
import { createRosterServer } from "./roster.js";
import { createSnapshotServer } from "./snapshot.js";
import { SeasonStore, forwardToStore } from "./store.js";

const snapshots = createSnapshotServer();
const boxScores = createBoxScoreServer();
const leads = createLeadServer();
const previews = createPreviewServer();
const rosters = createRosterServer();

export default createAppWorker({
  pageFiles: PAGE_FILES,
  serveSnapshot: (url) => snapshots.serveSnapshot(url),
  forwardToStore,
  reads: {
    "/box-score": (url) => boxScores.serveBoxScore(url),
    "/lead": (url) => leads.serveLead(url),
    "/preview": (url) => previews.servePreview(url),
    "/roster": (url) => rosters.serveRoster(url),
  },
});

export { SeasonStore };
