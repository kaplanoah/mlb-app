import test from "node:test";
import assert from "node:assert/strict";
import { renderNews } from "../../../shared/page/news-view.js";
import { NEWS_LEAGUE } from "../page/js/news-league.js";

const NOW = Date.parse("2026-10-09T20:00:00Z");
const ALL_ON = { teamOutlets: true, paywalled: true };

/** @param {Record<string, any>} fields */
const createStory = (fields) => ({
  id: fields.id,
  url: `https://example.com/${fields.id}`,
  title: `Story ${fields.id}`,
  summary: "What happened.",
  author: "",
  outlet: "ESPN",
  source: "espn",
  publishedAt: "2026-10-09T12:00:00.000Z",
  photo: null,
  teams: [],
  ...fields,
});

/** @param {Record<string, any>[]} stories */
const renderStories = (stories, choices = ALL_ON) =>
  renderNews(
    stories.map((lead) => ({ lead: createStory(lead), more: [] })),
    choices,
    NOW,
    NEWS_LEAGUE,
  ).text;

test("a story names its clubs with their dots, and leaves out a code that isn't a club's", () => {
  const markup = renderStories([{ id: "mets", teams: ["NYL", "NYM"] }]);

  assert.match(markup, /data-team="NYM"/);
  assert.match(markup, /class="dot"/);
  assert.doesNotMatch(markup, /NYL/);
});

test("without the Mets' own outlets or The Athletic, their stories are left out", () => {
  const stories = [
    { id: "post", source: "nypost", outlet: "NY Post", teamFeed: "NYM" },
    { id: "athletic", source: "athletic", outlet: "The Athletic" },
    { id: "espn" },
  ];

  const withoutMets = renderStories(stories, { teamOutlets: false, paywalled: true });
  assert.doesNotMatch(withoutMets, /Story post/);
  assert.match(withoutMets, /Story athletic/);
  const withoutAthletic = renderStories(stories, { teamOutlets: true, paywalled: false });
  assert.match(withoutAthletic, /Story post/);
  assert.doesNotMatch(withoutAthletic, /Story athletic/);
  assert.match(withoutAthletic, /Story espn/);
});
