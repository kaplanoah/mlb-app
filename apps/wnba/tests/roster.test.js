import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TEAMS } from "../page/js/teams.js";
import {
  createRosterServer,
  describeRoster,
  findDebut,
  nameRosterRequest,
  nameSeasonsRequest,
} from "../worker/src/roster.js";

// The Liberty's, the Dream's, the Aces', and the Fever's rosters as ESPN had them, with each player's seasons.
const ROSTERS = JSON.parse(
  readFileSync(`${import.meta.dirname}/fixtures/2026-10-06-espn-rosters.json`, "utf8"),
);

/** @param {string} team */
function listAnswers(team) {
  const { roster, seasons } = ROSTERS.teams[team];
  return {
    [nameRosterRequest(TEAMS[team].espnId)]: roster,
    ...Object.fromEntries(
      Object.entries(seasons).map(([id, answer]) => [nameSeasonsRequest(id), answer]),
    ),
  };
}

/** @param {Record<string, any>} answers */
function createFetch(answers) {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url);
    return url in answers
      ? new Response(JSON.stringify(answers[url]))
      : new Response("Not found", { status: 404 });
  };
  return { fetchImpl, asked };
}

/** @param {Record<string, any>} answers */
const askForRoster = async (answers, team) => {
  const response = await createRosterServer({
    fetchImpl: createFetch(answers).fetchImpl,
  }).serveRoster(new URL(`https://wnba.test/roster?team=${team}`));
  return { status: response.status, body: await response.json() };
};

/** @param {any} roster */
const findPlayer = (roster, lastName) =>
  roster.players.find((player) => player.lastName === lastName);

test("a team's roster lists each player's number, position, height, age, college or country, whether she's out, and her first season, with the head coach", async () => {
  const { status, body } = await askForRoster(listAnswers("NYL"), "NYL");

  assert.equal(status, 200);
  assert.equal(body.team, "NYL");
  assert.equal(body.coach, "Chris DeMarco");
  assert.equal(body.players.length, 15);
  assert.deepEqual(findPlayer(body, "Stewart"), {
    id: "2998928",
    number: "30",
    firstName: "Breanna",
    lastName: "Stewart",
    position: "F",
    height: `6'4"`,
    age: 32,
    college: "UConn",
    country: "USA",
    isOut: false,
    debut: 2016,
  });
  assert.equal(findPlayer(body, "Balogun").isOut, true);
  assert.deepEqual(
    [findPlayer(body, "Allen").college, findPlayer(body, "Allen").country],
    [null, "Australia"],
  );
  assert.deepEqual(
    [findPlayer(body, "Astier").college, findPlayer(body, "Astier").country],
    [null, null],
  );
});

test("a player's first season is the earliest ESPN lists her in", () => {
  const items = ["2026", "2019", "2023"].map((year) => ({
    $ref: `http://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/seasons/${year}?lang=en`,
  }));
  assert.equal(findDebut({ items }), 2019);
  assert.equal(findDebut({ items: [] }), null);
  assert.equal(findDebut(null), null);
});

test("a player whose seasons don't answer has no first season, and the rest of the roster still shows", async () => {
  const answers = listAnswers("ATL");
  const { roster } = ROSTERS.teams.ATL;
  const missing = roster.athletes[0];
  delete answers[nameSeasonsRequest(missing.id)];

  const { status, body } = await askForRoster(answers, "ATL");

  assert.equal(status, 200);
  assert.equal(body.coach, "Karl Smesko");
  assert.equal(findPlayer(body, missing.lastName).debut, null);
  assert.equal(
    body.players.filter((player) => player.debut !== null).length,
    roster.athletes.length - 1,
  );
});

test("a roster asked for no team, or one ESPN doesn't answer, says why", async () => {
  assert.deepEqual(await askForRoster(listAnswers("NYL"), "XYZ"), {
    status: 400,
    body: { error: "team must name a WNBA team" },
  });
  const failed = await askForRoster({}, "NYL");
  assert.equal(failed.status, 502);
  assert.match(failed.body.error, /^Couldn't read ESPN: ESPN answered 404/);
});

test("a roster read again soon reuses the one just read", async () => {
  const { fetchImpl, asked } = createFetch(listAnswers("NYL"));
  const server = createRosterServer({ fetchImpl, now: () => 0 });
  await server.loadRoster("NYL");
  const reads = asked.length;
  await server.loadRoster("NYL");
  assert.equal(asked.length, reads);
});

test("each player's first season comes from her seasons, and a roster without them still describes her", () => {
  const { roster } = ROSTERS.teams.NYL;
  const described = describeRoster("NYL", roster, new Map());
  assert.ok(described.players.every((player) => player.debut === null));
  assert.equal(described.players.length, roster.athletes.length);
});
