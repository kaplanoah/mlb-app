import test from "node:test";
import assert from "node:assert/strict";
import { convertToText } from "#shared/html.js";
import { describeAsNotification } from "../shared/worker/notifications.js";
import { describeSeriesGame, describeSeriesWin } from "#shared/series-text.js";

const readGame = (own, theirs) =>
  convertToText(
    describeSeriesGame({
      result: "Fever beat the Aces 99-89",
      number: 2,
      series: "Semifinals",
      own,
      theirs,
    }),
  );

test("a series game's result and where the series stands join with a comma", () => {
  assert.equal(
    readGame(2, 0),
    "Fever beat the Aces 99-89 in Game\u00a02, lead the Semifinals 2\u20130",
  );
  assert.equal(
    readGame(1, 1),
    "Fever beat the Aces 99-89 in Game\u00a02, tie the Semifinals 1\u20131",
  );
  assert.equal(
    readGame(1, 2),
    "Fever beat the Aces 99-89 in Game\u00a02, trail the Semifinals 1\u20132",
  );
});

test("a series game's notification is one title, with no body", () => {
  const markup = describeSeriesGame({
    result: "Fever beat the Aces 99-89",
    number: 2,
    series: "Semifinals",
    own: 1,
    theirs: 1,
  });
  assert.deepEqual(describeAsNotification(markup, "game"), {
    title: "Fever beat the Aces 99-89 in Game\u00a02, tie the Semifinals 1\u20131",
    body: "",
    tag: "game",
  });
});

test("a game that wins its series says so, and its wins stay on one line", () => {
  const markup = String(
    describeSeriesWin({
      result: "Dodgers beat the Blue Jays 5-4",
      series: "World Series",
      own: 4,
      theirs: 3,
    }),
  );
  assert.equal(
    markup,
    'Dodgers beat the Blue Jays 5-4 to win the World Series <span class="series-score">4&ndash;3</span>',
  );
});
