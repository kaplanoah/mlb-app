import { isSameJson } from "#shared/compare.js";
import { addDays, readEasternDay } from "#shared/days.js";
import { listClubs, readClubId, readMlbTeamId } from "../../page/js/snapshot.js";
import { fetchMlbJson } from "./mlb.js";
import { countSlateFinals } from "./pitcher-updater.js";
import {
  describeRoster,
  indexSeasonStats,
  listRosterRequest,
  listSeasonStatsRequest,
  nameRosterKey,
} from "./rosters.js";
import { createFeedKeeper } from "../../../../shared/worker/feed-keeper.js";
import { describeError } from "../../../../shared/worker/responses.js";

// Keeps each club's roster for the current season, so its sheet's Roster section reads only the
// store. A club's roster changes only with a transaction, which MLB lists for the whole league in
// one request, so each run reads that list once it's old, and reads again only the rosters of the
// clubs with a transaction it hasn't seen, a few clubs a run, and every club's once a day in case
// one was missed. Every player's numbers are read as a game ends, and each club's roster is saved
// again only when it changed.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const RUN_DELAY_MS = 5 * MINUTE_MS;
const CLUBS_PER_RUN = 6;
const ROSTER_MAX_AGE_MS = 24 * HOUR_MS;
const LEAGUE_NAME = "MLB";

const FEEDS = {
  rosterStats: { maxAgeMs: 6 * HOUR_MS, changesWithGames: true },
  transactions: { maxAgeMs: 30 * MINUTE_MS, changesWithGames: false },
};

/** @typedef {import("../../../../shared/worker/season-store.js").JobContext} JobContext */
/**
 * When each club's roster was read, which clubs have a transaction since, and the transactions
 * seen so far, none before the list is first read.
 * @typedef {{ readAt: Record<string, number>, changed: string[], seen: number[] | null }} RosterReads
 */

/** @param {number} season */
const nameReadsKey = (season) => `roster-reads:${season}`;

/**
 * @param {number} season
 * @param {string} club
 */
const nameAnswerKey = (season, club) => `roster-answer:${season}:${club}`;

/**
 * Every transaction across MLB and the minors, from yesterday through today.
 * @param {string} today
 */
export const listTransactionsRequest = (today) =>
  `/api/v1/transactions?sportId=1&startDate=${addDays(today, -1)}&endDate=${today}` +
  "&fields=transactions,id,fromTeam,toTeam";

/**
 * The page's clubs on either side of a transaction.
 * @param {any} transaction
 */
const listTransactionClubs = (transaction) =>
  [transaction.fromTeam?.id, transaction.toTeam?.id].map(readClubId).filter(Boolean);

/**
 * The clubs whose roster a transaction not seen before may have changed.
 * @param {any[]} transactions
 * @param {Set<number>} seen
 */
const listChangedClubs = (transactions, seen) =>
  transactions.filter((transaction) => !seen.has(transaction.id)).flatMap(listTransactionClubs);

/**
 * The clubs whose roster to read this run: those never read first, then those with a transaction
 * since, then those read longest ago once a day has passed.
 * @param {RosterReads} reads
 * @param {number} now
 */
function listDueClubs(reads, now) {
  const clubs = listClubs();
  const unread = clubs.filter((club) => reads.readAt[club] === undefined);
  const changed = clubs.filter((club) => reads.changed.includes(club) && !unread.includes(club));
  const old = clubs
    .filter((club) => now - (reads.readAt[club] ?? now) >= ROSTER_MAX_AGE_MS)
    .sort((first, second) => reads.readAt[first] - reads.readAt[second]);
  return [...new Set([...unread, ...changed, ...old])].slice(0, CLUBS_PER_RUN);
}

/**
 * Logs a read that failed, and answers null in its place.
 * @param {string} what
 */
const logFailure = (what) => (/** @type {unknown} */ error) => {
  console.error(`Reading ${what} failed: ${describeError(error)}`);
  return null;
};

/** What one store keeps between runs, while it stays in memory, and how it runs. */
function createStoreKeeper() {
  /** @type {ReturnType<typeof createFeedKeeper> | null} */
  let keeper = null;
  // Each roster as the job last saved it, so a run compares without reading the store.
  /** @type {Map<string, any>} */
  const saved = new Map();

  /**
   * @param {JobContext} context
   * @param {string} path
   */
  const fetchJson = (context, path) => fetchMlbJson(context.fetchImpl, path, null);

  /**
   * @param {string} name which feed's limits apply
   * @param {string} key what the answer is kept under
   * @param {() => Promise<any>} load
   */
  const readFeed = (name, key, load) =>
    /** @type {ReturnType<typeof createFeedKeeper>} */ (keeper).readFeed(name, key, load);

  /**
   * @param {JobContext} context
   * @param {number} season
   */
  const readSeasonStats = (context, season) =>
    Promise.all(
      [listSeasonStatsRequest(season, "hitting"), listSeasonStatsRequest(season, "pitching")].map(
        (path) => readFeed("rosterStats", path, () => fetchJson(context, path)),
      ),
    );

  /**
   * @param {JobContext} context
   * @param {number} season
   */
  async function readTransactions(context, season) {
    const today = readEasternDay(context.now()).date;
    const answer = await readFeed("transactions", String(season), () =>
      fetchJson(context, listTransactionsRequest(today)),
    );
    return answer?.transactions ?? [];
  }

  /**
   * Notes the transactions not seen before, and the clubs they may have changed.
   * @param {RosterReads} reads
   * @param {any[]} transactions
   * @returns {RosterReads}
   */
  function noteTransactions(reads, transactions) {
    const changed = reads.seen ? listChangedClubs(transactions, new Set(reads.seen)) : [];
    return {
      ...reads,
      changed: [...new Set([...reads.changed, ...changed])],
      seen: transactions.map((transaction) => transaction.id),
    };
  }

  /**
   * Reads the due clubs' rosters, keeping each answer, and notes when each was read. A roster MLB
   * doesn't answer is read on a later run.
   * @param {JobContext} context
   * @param {number} season
   * @param {RosterReads} reads
   * @returns {Promise<RosterReads>}
   */
  async function readDueRosters(context, season, reads) {
    const due = listDueClubs(reads, context.now());
    const results = await Promise.allSettled(
      due.map((club) =>
        fetchJson(context, listRosterRequest(/** @type {number} */ (readMlbTeamId(club)), season)),
      ),
    );
    const readAt = { ...reads.readAt };
    let changed = reads.changed;
    for (const [index, result] of results.entries()) {
      const club = due[index];
      if (result.status === "rejected") {
        console.error(`Reading ${club}'s roster failed: ${describeError(result.reason)}`);
        continue;
      }
      await context.storage.put(nameAnswerKey(season, club), result.value);
      readAt[club] = context.now();
      changed = changed.filter((each) => each !== club);
    }
    return { ...reads, readAt, changed };
  }

  /**
   * @param {JobContext} context
   * @param {string} key
   * @param {any} doc
   */
  async function saveDoc(context, key, doc) {
    if (!saved.has(key)) saved.set(key, await context.docs.read(key));
    if (isSameJson(saved.get(key), doc)) return;
    await context.docs.write(key, doc);
    saved.set(key, doc);
  }

  /**
   * Saves each club's roster that has been read, with every player's numbers as they are now.
   * @param {JobContext} context
   * @param {number} season
   * @param {[any, any]} stats
   */
  async function saveRosters(context, season, [hittingTable, pitchingTable]) {
    const hitting = indexSeasonStats(hittingTable);
    const pitching = indexSeasonStats(pitchingTable);
    for (const club of listClubs()) {
      const roster = await context.storage.get(nameAnswerKey(season, club));
      if (!roster) continue;
      await saveDoc(
        context,
        nameRosterKey(club),
        describeRoster({ club, season, roster, hitting, pitching }),
      );
    }
  }

  /**
   * @param {JobContext} context
   * @param {number} season
   */
  async function updateRosters(context, season) {
    const stored = await context.storage.get(nameReadsKey(season));
    /** @type {RosterReads} */
    let reads = stored ?? { readAt: {}, changed: [], seen: null };
    const transactions = await readTransactions(context, season).catch(logFailure("transactions"));
    if (transactions) reads = noteTransactions(reads, transactions);
    reads = await readDueRosters(context, season, reads);
    if (!isSameJson(stored, reads)) await context.storage.put(nameReadsKey(season), reads);
    const stats = await readSeasonStats(context, season).catch(
      logFailure("every player's numbers"),
    );
    if (stats) await saveRosters(context, season, stats);
  }

  /** @param {JobContext} context */
  async function run(context) {
    keeper ??= createFeedKeeper({
      feeds: FEEDS,
      leagueName: LEAGUE_NAME,
      now: context.now,
      storage: context.storage,
    });
    const season = (await context.docs.read("live/current"))?.season;
    if (!Number.isInteger(season)) return;
    await keeper.noteFinalCount(countSlateFinals(await context.docs.read(`seasons/${season}`)));
    await updateRosters(context, season).catch(logFailure(`${season}'s rosters`));
  }

  return { run };
}

export function createRosterJob() {
  // One job serves every store made from its module, as each test makes its own, so each store
  // keeps its own reads.
  /** @type {WeakMap<JobContext["docs"], ReturnType<typeof createStoreKeeper>>} */
  const keepers = new WeakMap();
  return {
    chooseDelay: () => RUN_DELAY_MS,
    /** @param {JobContext} context */
    run(context) {
      if (!keepers.has(context.docs)) keepers.set(context.docs, createStoreKeeper());
      return /** @type {ReturnType<typeof createStoreKeeper>} */ (keepers.get(context.docs)).run(
        context,
      );
    },
  };
}
