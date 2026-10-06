import fs from "node:fs";
import path from "node:path";
import {
  nameGameLogRequest,
  nameTeamGameLogRequest,
  nameTotalsRequest,
} from "../../worker/src/player.js";
import { FEED_HEADERS } from "../../worker/src/wnba.js";

// Records what a player's sheet reads for the players and seasons named: every player's totals in
// each season's regular season, every team's games in it and its playoffs, and each player's game
// logs, each trimmed to the columns the sheet reads. Run with NODE_USE_ENV_PROXY=1 behind a proxy.

const SEASON_TYPES = ["Regular Season", "Playoffs"];
const COLUMNS = [
  "PLAYER_ID",
  "PLAYER_NAME",
  "TEAM_ID",
  "GAME_ID",
  "GAME_DATE",
  "WL",
  "GP",
  "MIN",
  "PTS",
  "REB",
  "AST",
  "STL",
  "BLK",
  "FGM",
  "FGA",
  "FG3M",
  "FG3A",
  "FTM",
  "FTA",
  "PLUS_MINUS",
];

async function fetchJson(url) {
  const response = await fetch(url, { headers: FEED_HEADERS });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response.json();
}

/** The answer, with only the columns the sheet reads. */
function trimColumns(answer) {
  return {
    resultSets: answer.resultSets.map((table) => {
      const kept = table.headers.flatMap((header, index) =>
        COLUMNS.includes(header) ? [index] : [],
      );
      return {
        name: table.name,
        headers: kept.map((index) => table.headers[index]),
        rowSet: table.rowSet.map((row) => kept.map((index) => row[index])),
      };
    }),
  };
}

const readJson = async (url) => trimColumns(await fetchJson(url));

async function recordFixture(name, playerSeasons) {
  const totals = {};
  const teamGames = {};
  const gameLogs = {};
  for (const season of new Set(playerSeasons.map(([, season]) => season))) {
    totals[season] = await readJson(nameTotalsRequest(season));
    for (const seasonType of SEASON_TYPES)
      teamGames[`${season}:${seasonType}`] = await readJson(
        nameTeamGameLogRequest(season, seasonType),
      );
  }
  for (const [id, season] of playerSeasons)
    for (const seasonType of SEASON_TYPES)
      gameLogs[`${id}:${season}:${seasonType}`] = await readJson(
        nameGameLogRequest(id, season, seasonType),
      );
  const file = path.join(import.meta.dirname, `${name}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({ recordedAt: new Date().toISOString(), totals, teamGames, gameLogs }),
  );
  console.log(`Wrote ${file}`);
}

const [name, ...pairs] = process.argv.slice(2);
const playerSeasons = pairs.map((pair) => {
  const [id, season] = pair.split(":");
  return /** @type {[string, number]} */ ([id, Number(season)]);
});
const isValid = playerSeasons.every(([id, season]) => /^\d+$/.test(id) && Number.isInteger(season));
if (!name || !playerSeasons.length || !isValid) {
  console.error(
    "usage: node apps/wnba/tests/fixtures/record-players.js <name> <player id:season> [...]",
  );
  process.exit(1);
}
recordFixture(name, playerSeasons).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
