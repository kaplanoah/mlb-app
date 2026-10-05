import { isSameJson } from "#shared/compare.js";
import { readEasternDay } from "#shared/days.js";
import * as Readings from "./readings.js";
import { guessSeasonYear, hasSpringStarted } from "../../page/js/session.js";
import * as MLBSnapshot from "../../page/js/snapshot.js";

// Keeps the current season's saved data up to date from MLB, whether or not a page is open.
// `docs` reads and writes the store's documents: read(key), list(collection), write(key, doc),
// and remove(key).

// Before April the new season starts on the day MLB says spring training does.
export async function loadCurrentSnapshot(loadSnapshot, now) {
  const guess = guessSeasonYear(now);
  const { year } = readEasternDay(now);
  if (year !== guess) {
    const upcoming = await loadSnapshot(year);
    if (hasSpringStarted(upcoming.springStart, now)) return upcoming;
  }
  return loadSnapshot(guess);
}

const nameSeasonKey = (year) => `seasons/${year}`;

const SAVED_FIELDS = [
  "version",
  "teams",
  "series",
  "projected",
  "springStart",
  "standings",
  "slate",
];

// A field is saved only when the feed it comes from answered, so a partial read leaves it as the
// last full one had it.
function listAnsweredFields(snapshot) {
  const hasField = MLBSnapshot.hasKnownField(snapshot);
  const answered = {
    version: true,
    teams: hasField,
    series: hasField,
    projected: hasField,
    springStart: !!snapshot.springStart,
    standings: !!snapshot.standings,
    slate: !!snapshot.slate,
  };
  return SAVED_FIELDS.filter((field) => answered[field]);
}

function collectChangedFields(doc, snapshot, log) {
  const changed = listAnsweredFields(snapshot).filter(
    (field) => !isSameJson(doc[field], snapshot[field]),
  );
  const fields = Object.fromEntries(changed.map((field) => [field, snapshot[field]]));
  if (!isSameJson(doc.log, log)) fields.log = log;
  return fields;
}

// The season's one record, which the page reads whole: its field, standings, games, and updates,
// rebuilt from the readings as each update saves them.
async function saveSeason(docs, year, snapshot, parts) {
  const doc = (await docs.read(nameSeasonKey(year))) ?? { year };
  const log = Readings.composeLog(doc.log ?? [], parts, snapshot.log);
  const fields = collectChangedFields(doc, snapshot, log);
  if (!Object.keys(fields).length) return;
  await docs.write(nameSeasonKey(year), { ...doc, ...fields, updatedAt: snapshot.asOf });
}

// A snapshot without standings came from a partial answer, not a change in them.
async function saveReading(docs, year, snapshot) {
  const collection = Readings.nameReadingsCollection(year);
  const parts = Readings.sortParts(await docs.list(collection));
  if (!snapshot.standings) return parts;
  const dayName = Readings.readReadingDay(snapshot);
  const changed = Readings.addReading(parts, dayName, Readings.createReading(snapshot));
  if (!changed) return parts;
  await docs.write(`${collection}/${changed.id}`, changed);
  return Readings.sortParts([...parts.filter((part) => part.id !== changed.id), changed]);
}

// The season's record already holds the expired parts' updates, so the parts can go.
async function removeExpiredReadings(docs, year, snapshot, parts) {
  const expired = Readings.findExpiredParts(parts, Readings.readReadingDay(snapshot));
  const collection = Readings.nameReadingsCollection(year);
  for (const part of expired) await docs.remove(`${collection}/${part.id}`);
}

async function saveStandings(docs, year, snapshot) {
  if (!snapshot.standings) return;
  const key = `standings/${year}`;
  const stored = await docs.read(key);
  if (stored && isSameJson(stored.divisions, snapshot.standings.divisions)) return;
  await docs.write(key, { ...snapshot.standings, updatedAt: snapshot.asOf });
}

// The page's live scores, saved whole whenever more than the time of the read changed.
async function saveLive(docs, year, snapshot) {
  const key = `live/${year}`;
  const { asOf: _asOf, ...current } = snapshot;
  const { asOf: _storedAsOf, ...stored } = (await docs.read(key)) ?? {};
  if (!isSameJson(stored, current)) await docs.write(key, snapshot);
}

export async function saveSnapshot(docs, snapshot) {
  const year = snapshot.season;
  const parts = await saveReading(docs, year, snapshot);
  await saveSeason(docs, year, snapshot, parts);
  await removeExpiredReadings(docs, year, snapshot, parts);
  await saveStandings(docs, year, snapshot);
  await saveLive(docs, year, snapshot);
}

// The updates the page would list: the saved log with what the readings rebuild.
export async function readUpdates(docs, year) {
  const doc = await docs.read(nameSeasonKey(year));
  const parts = Readings.sortParts(await docs.list(Readings.nameReadingsCollection(year)));
  return Readings.composeLog(doc?.log || [], parts);
}

export function describeSnapshotStatus(snapshot) {
  const missing = snapshot.missing || [];
  return { error: missing.length ? "mlb_fields_missing" : "", detail: missing.join(", ") };
}
