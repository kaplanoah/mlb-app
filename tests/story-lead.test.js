import test from "node:test";
import assert from "node:assert/strict";
import { readStoryLead } from "../shared/worker/story-lead.js";

test("a story's lead is its first sentences, past 200 characters, as plain text", () => {
  const story = [
    "<p>SAN DIEGO -- Didn&rsquo;t matter how. The Padres only needed to find a way.",
    "",
    "They trailed two games to none and faced elimination on Tuesday night in this instant classic of a National League Division Series against Milwaukee. They had no Mason Miller and no Adrian Morejon.</p>",
    "<p>But when the dust had settled, the Padres had done exactly that.</p>",
  ].join("\n");

  assert.equal(
    readStoryLead(story),
    "SAN DIEGO -- Didn\u2019t matter how. The Padres only needed to find a way. They trailed two games to none and faced elimination on Tuesday night in this instant classic of a National League Division Series against Milwaukee.",
  );
});

test("a lead drops the story's tags, like a player's name linked to his page, but keeps their words", () => {
  const story =
    '<p>Ace <forge-entity title="Michael King" code="player">Michael King</forge-entity> &amp; the bullpen held on.</p>';

  assert.equal(readStoryLead(story), "Ace Michael King & the bullpen held on.");
});

test("a story with nothing in it has no lead", () => {
  assert.equal(readStoryLead(""), "");
  assert.equal(readStoryLead(null), "");
});

test("a lead ends with the sentence that takes it past 200 characters", () => {
  const sentence = (number) =>
    `Sentence ${number} runs on for a while to be about sixty letters long.`;
  const story = `<p>${[1, 2, 3, 4, 5].map(sentence).join(" ")}</p>`;

  assert.equal(readStoryLead(story), [1, 2, 3, 4].map(sentence).join(" "));
});
