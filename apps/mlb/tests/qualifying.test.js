import test from "node:test";
import assert from "node:assert/strict";
import {
  countClubGames,
  describeInningsToQualify,
  describePlateAppearancesToQualify,
} from "../page/js/qualifying.js";
import { session } from "../page/js/session.js";

test("a club's games are its wins and losses in the season the page shows, and unknown in another", () => {
  session.activeYear = 2026;
  session.standings = {
    divisions: {
      "AL Central": [{ id: "CWS", w: 60, l: 102 }],
      "AL West": [{ id: "ATH", w: 80, l: 79 }],
    },
  };
  assert.equal(countClubGames("CWS", 2026), 162);
  assert.equal(countClubGames("ATH", 2026), 159);
  assert.equal(countClubGames("CWS", 2027), null);
  assert.equal(countClubGames("SEA", 2026), null);
});

test("a starter's innings are written in thirds against the ones he needs", () => {
  assert.equal(
    describeInningsToQualify("Smith", "28.1", 162),
    "Smith has pitched 28 1/3 of the 162 innings needed to qualify",
  );
  assert.equal(
    describeInningsToQualify("He", null, 162),
    "He hasn't pitched the innings needed to qualify",
  );
});

test("a hitter needs 3.1 plate appearances for each of his club's games, to the nearest one", () => {
  assert.equal(
    describePlateAppearancesToQualify(210, 162),
    "He has 210 of the 502 plate appearances needed to qualify",
  );
  assert.equal(
    describePlateAppearancesToQualify(210, 159),
    "He has 210 of the 493 plate appearances needed to qualify",
  );
});
