import { isSameJson } from "#shared/compare.js";
import { readEasternDay } from "#shared/days.js";
import { nameTeam } from "../../page/js/series.js";
import { describeResult, describeWin, isPlayoffFinal } from "../../page/js/win-text.js";
import {
  capNotifications,
  describeAsNotification,
} from "../../../../shared/worker/notifications.js";

// Keeps the current season's saved data up to date from the league, whether or not a page is
// open, and says which finished games and series are news. `docs` reads and writes the store's
// documents: read(key), list(collection), write(key, doc), and remove(key).

const SAVED_FIELDS = ["games", "series", "standings", "leaders"];
// A game or series found finished long after it ended, as after a gap in updates, isn't news.
const RECENT_MS = 12 * 60 * 60 * 1000;

const nameSeasonKey = (year) => `seasons/${year}`;

// The new year's season starts once it has games, or standings with games played. Until then the
// last one's stays current, so the new year doesn't start with an empty season.
const hasSeasonStarted = (snapshot) =>
  snapshot.games.length > 0 || snapshot.standings.some((row) => row.wins + row.losses > 0);

export async function loadCurrentSnapshot(loadSnapshot, now) {
  const { year } = readEasternDay(now);
  const upcoming = await loadSnapshot(year);
  return hasSeasonStarted(upcoming) ? upcoming : loadSnapshot(year - 1);
}

const STATE_ORDER = { pre: 0, live: 1, final: 2 };

// ESPN may not have every one of today's games, and one it lacks falls back to the schedule's
// copy, so while it stands in, no saved game goes back to an earlier state.
function keepFurtherGames(savedGames, games) {
  const savedById = new Map((savedGames ?? []).map((game) => [game.id, game]));
  return games.map((game) => {
    const saved = savedById.get(game.id);
    return saved && STATE_ORDER[saved.state] > STATE_ORDER[game.state] ? saved : game;
  });
}

// A game's end is the time ESPN logged its last play, once the snapshot has it. Until then it's
// when the Worker, checking while the game is live, first finds it final. A game found final
// without being seen live has no end.
function addEndTimes(savedGames, games, asOf) {
  const savedById = new Map((savedGames ?? []).map((game) => [game.id, game]));
  return games.map((game) => {
    if (game.state !== "final") return game;
    const saved = savedById.get(game.id);
    const end = game.end ?? saved?.end ?? (saved?.state === "live" ? asOf : null);
    return end ? { ...game, end } : game;
  });
}

// A feed that didn't answer leaves its saved field as it was. The games need both of theirs: the
// schedule alone can be behind on today's, and the scoreboard alone has only today's, unless ESPN
// stood in for the scoreboard. Series counted from games ESPN may lack wait for the bracket.
export async function saveSnapshot(docs, snapshot) {
  const key = nameSeasonKey(snapshot.season);
  const doc = (await docs.read(key)) ?? { year: snapshot.season };
  const missing = new Set(snapshot.missing);
  const isStandIn = missing.has("scoreboard") && !!snapshot.standIn;
  const hasGames = (!missing.has("scoreboard") || isStandIn) && !missing.has("schedule");
  const games = isStandIn ? keepFurtherGames(doc.games, snapshot.games) : snapshot.games;
  const saving = { ...snapshot, games: addEndTimes(doc.games, games, snapshot.asOf) };
  const answered = {
    games: hasGames,
    series: !missing.has("bracket") || (hasGames && !isStandIn),
    standings: !missing.has("standings"),
    leaders: !missing.has("players"),
  };
  const changed = SAVED_FIELDS.filter(
    (field) => answered[field] && !isSameJson(doc[field], saving[field]),
  );
  if (!changed.length) return;
  const fields = Object.fromEntries(changed.map((field) => [field, saving[field]]));
  await docs.write(key, { ...doc, ...fields, updatedAt: snapshot.asOf });
}

export const readUpdates = (docs, year) => docs.read(nameSeasonKey(year));

export function describeSnapshotStatus(snapshot) {
  const missing = snapshot.missing || [];
  return {
    error: missing.length ? "wnba_feeds_missing" : "",
    detail: missing.join(", "),
    standIn: snapshot.standIn || "",
  };
}

export const STATUS_FIELDS = { standIn: "" };

// A playoff final reads as the Updates box says it, and any other final as its result.
function describeFinal(game, games) {
  const markup = isPlayoffFinal(game)
    ? describeWin(game, games, nameTeam)
    : describeResult(game, nameTeam);
  return describeAsNotification(markup, `final:${game.id}`);
}

const isFinalGame = (game) => game?.state === "final";

/**
 * A notification for each game that finished since the last update, worded as the Updates box
 * words it.
 * @param {{ before: any, after: any, now: number }} change the saved season before and after
 */
export function listNotifications({ before, after, now }) {
  const wasFinal = new Set((before?.games ?? []).filter(isFinalGame).map((game) => game.id));
  const games = after?.games ?? [];
  const messages = games
    .filter((game) => isFinalGame(game) && !wasFinal.has(game.id))
    .filter((game) => Date.parse(game.start) >= now - RECENT_MS)
    .map((game) => describeFinal(game, games));
  return capNotifications(messages, (count) => `${count} more final scores`);
}
