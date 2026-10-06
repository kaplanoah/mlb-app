import fs from "node:fs";
import path from "node:path";
import { TEAMS } from "../../page/js/teams.js";
import { nameRosterRequest, nameSeasonsRequest } from "../../worker/src/roster.js";
import { ESPN_HEADERS } from "../../worker/src/wnba.js";

// Records what a team's Roster page reads from ESPN for the teams named: each roster, and each of
// its players' seasons, trimmed to what the Worker reads.

async function fetchJson(url) {
  const response = await fetch(url, { headers: ESPN_HEADERS });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response.json();
}

const trimAthlete = (athlete) => ({
  id: athlete.id,
  firstName: athlete.firstName,
  lastName: athlete.lastName,
  displayName: athlete.displayName,
  jersey: athlete.jersey,
  position: athlete.position && { abbreviation: athlete.position.abbreviation },
  displayHeight: athlete.displayHeight,
  age: athlete.age,
  college: athlete.college && { name: athlete.college.name, shortName: athlete.college.shortName },
  birthPlace: athlete.birthPlace && { country: athlete.birthPlace.country },
  injuries: (athlete.injuries ?? []).map(({ status }) => ({ status })),
});

const trimRoster = ({ athletes, coach }) => ({
  athletes: athletes.map(trimAthlete),
  coach: (coach ?? []).map(({ firstName, lastName }) => ({ firstName, lastName })),
});

const trimSeasons = ({ items }) => ({ items: items.map(({ $ref }) => ({ $ref })) });

async function recordTeam(code) {
  const roster = await fetchJson(nameRosterRequest(TEAMS[code].espnId));
  const seasons = await Promise.all(
    roster.athletes.map(async (athlete) => [
      athlete.id,
      trimSeasons(await fetchJson(nameSeasonsRequest(athlete.id))),
    ]),
  );
  return [code, { roster: trimRoster(roster), seasons: Object.fromEntries(seasons) }];
}

async function recordFixture(name, codes) {
  const teams = Object.fromEntries(await Promise.all(codes.map(recordTeam)));
  const file = path.join(import.meta.dirname, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify({ recordedAt: new Date().toISOString(), teams }));
  console.log(`Wrote ${file}`);
}

const [name, ...codes] = process.argv.slice(2);
if (!name || !codes.length || !codes.every((code) => Object.hasOwn(TEAMS, code))) {
  console.error("usage: node apps/wnba/tests/fixtures/record-roster.js <name> <team> [team ...]");
  process.exit(1);
}
recordFixture(name, codes).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
