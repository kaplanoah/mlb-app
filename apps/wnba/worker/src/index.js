import PAGE_FILES from "#page-files/wnba";
import { createAppWorker } from "../../../../shared/worker/app-worker.js";
import { createBoxScoreServer } from "./box-score.js";
import { createLeadServer } from "./lead.js";
import { createPlayerServer } from "./player.js";
import { createPreviewServer } from "./preview.js";
import { createRosterServer } from "./roster.js";
import { createSnapshotServer } from "./snapshot.js";
import { SeasonStore, forwardToStore, readStoreDoc } from "./store.js";

const snapshots = createSnapshotServer();
const boxScores = createBoxScoreServer();
const leads = createLeadServer();
const previews = createPreviewServer();
const rosters = createRosterServer();
const players = createPlayerServer({ loadRoster: rosters.loadRoster });

export default createAppWorker({
  pageFiles: PAGE_FILES,
  serveSnapshot: (url) => snapshots.serveSnapshot(url),
  forwardToStore,
  reads: {
    "/box-score": (url, env) => boxScores.serveBoxScore(url, (key) => readStoreDoc(env, key)),
    "/lead": (url, env) => leads.serveLead(url, (key) => readStoreDoc(env, key)),
    "/player": (url, env) => players.servePlayer(url, (key) => readStoreDoc(env, key)),
    "/preview": (url, env) => previews.servePreview(url, (key) => readStoreDoc(env, key)),
    "/roster": (url, env) => rosters.serveRoster(url, (key) => readStoreDoc(env, key)),
  },
});

export { SeasonStore };
