import test from "node:test";
import assert from "node:assert/strict";
import { buildNewsCards } from "../page/js/news-picks.js";
import { renderNews } from "../page/js/news-view.js";
import { checkInTimeZone, EASTERN } from "../../../tests/time-zone.js";

const NOW = Date.parse("2026-10-05T16:00:00Z");
const ALL_ON = { teamOutlets: true, paywalled: true };

/** @param {Partial<import("../page/js/news-picks.js").NewsStory>} fields */
const createStory = (fields) => ({
  id: "story",
  url: `https://example.com/${fields.id ?? "story"}`,
  title: "A story",
  summary: "What happened.",
  author: "",
  outlet: "ESPN",
  source: "espn",
  publishedAt: "2026-10-04T12:00:00.000Z",
  photo: null,
  kind: "report",
  teams: ["NYL"],
  ...fields,
});

const SWEEP = {
  id: "sweep",
  stories: [
    createStory({ id: "column", kind: "column", source: "athletic", author: "A" }),
    createStory({ id: "analysis", kind: "analysis", source: "ix", author: "B", teams: ["LVA"] }),
    createStory({ id: "report", kind: "report", teams: ["NYL", "MIN", "IND"] }),
  ],
};
const AWARD = {
  id: "award",
  stories: [createStory({ id: "award", publishedAt: "2026-10-05T12:00:00.000Z" })],
};

/** @param {ReturnType<typeof buildNewsCards>} cards */
const listShown = (cards) => cards.map((card) => [card.id, card.stories.map((story) => story.id)]);

// Each tag reads as a space, and the page's separator as a bar.
const readText = (markup) =>
  markup.text
    .replace(/<[^>]+>/g, " ")
    .replace(/&bull;/g, "|")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

test("a card leads with the news itself, then the story that adds the most, newest card first", () => {
  const cards = buildNewsCards([SWEEP, AWARD], ALL_ON);

  assert.deepEqual(listShown(cards), [
    ["award", ["award"]],
    ["sweep", ["report", "analysis"]],
  ]);
  assert.deepEqual(cards[1].teams, ["NYL", "MIN"]);
});

test("without The Athletic, its stories are left out, and a topic only it covered goes", () => {
  const athleticOnly = {
    id: "film",
    stories: [createStory({ id: "film", source: "athletic", kind: "analysis" })],
  };
  const sweep = {
    ...SWEEP,
    stories: SWEEP.stories.filter((story) => story.id !== "analysis"),
  };

  const cards = buildNewsCards([sweep, athleticOnly], { teamOutlets: true, paywalled: false });

  assert.deepEqual(listShown(cards), [["sweep", ["report"]]]);
});

test("without the team's own outlets, a story only they carry is left out, and the next best leads", () => {
  const topic = {
    id: "stewart",
    stories: [
      createStory({ id: "post", source: "nypost", teamFeed: "NYL", kind: "report" }),
      createStory({
        id: "espn",
        kind: "game",
        photo: { url: "https://example.com/p.jpg", credit: "AP" },
      }),
    ],
  };

  assert.deepEqual(listShown(buildNewsCards([topic], ALL_ON)), [["stewart", ["post", "espn"]]]);
  assert.deepEqual(listShown(buildNewsCards([topic], { teamOutlets: false, paywalled: true })), [
    ["stewart", ["espn"]],
  ]);
});

test("a story whose link isn't a web address is never shown, nor a photo whose address isn't", () => {
  const topic = {
    id: "odd",
    stories: [
      createStory({ id: "script", url: "javascript:alert(1)" }),
      createStory({ id: "plain", photo: { url: "javascript:alert(2)", credit: "AP" } }),
    ],
  };

  const markup = renderNews([topic], ALL_ON, NOW).text;

  assert.doesNotMatch(markup, /javascript:/);
  assert.match(markup, /href="https:\/\/example\.com\/plain"/);
  assert.doesNotMatch(markup, /<img/);
});

test("a card shows its teams, the lead's headline, writer, outlet, day, and summary, and the second story with its photo's credit", () => {
  const topic = {
    id: "dream",
    stories: [
      createStory({
        id: "lead",
        title: "Film review: How the Dream changed",
        author: "Michael Waterloo",
        outlet: "The IX",
        source: "ix",
        kind: "analysis",
        teams: ["ATL", "NYL"],
        publishedAt: "2026-10-05T13:00:00.000Z",
        photo: { url: "https://example.com/lead.jpg", credit: "USA TODAY Sports" },
      }),
      createStory({
        id: "second",
        title: "There's one key element",
        author: "Madeline Kenney",
        outlet: "NY Post",
        source: "nypost",
        kind: "feature",
        publishedAt: "2026-10-04T13:00:00.000Z",
        photo: { url: "https://example.com/second.jpg", credit: "via NY Post" },
      }),
    ],
  };

  const text = checkInTimeZone(EASTERN, () => readText(renderNews([topic], ALL_ON, NOW)));

  assert.equal(
    text,
    "This week Photo: USA TODAY Sports Dream Liberty Film review: How the Dream changed " +
      "Michael Waterloo | The IX | Today What happened. Read on The IX " +
      "More on this There's one key element Madeline Kenney | NY Post | Yesterday " +
      "Photo via NY Post What happened. Read on NY Post",
  );
});

test("a story's day is today, yesterday, its weekday within the week, and its date before that", () => {
  const readDay = (publishedAt) =>
    checkInTimeZone(EASTERN, () => {
      const topic = { id: "day", stories: [createStory({ outlet: "ESPN", publishedAt })] };
      return readText(renderNews([topic], ALL_ON, NOW)).match(/ESPN \| (\S+( \d+)?)/)?.[1];
    });

  assert.equal(readDay("2026-10-05T05:00:00.000Z"), "Today");
  assert.equal(readDay("2026-10-05T03:00:00.000Z"), "Yesterday");
  assert.equal(readDay("2026-10-01T15:00:00.000Z"), "Thu");
  assert.equal(readDay("2026-09-27T15:00:00.000Z"), "Sep 27");
});

test("a story's links open apart from the page, and neither they nor its photos tell the outlet the page's address", () => {
  const photo = { url: "https://example.com/photo.jpg", credit: "AP" };
  const topic = {
    id: "photos",
    stories: [
      createStory({ id: "lead", photo }),
      createStory({ id: "second", kind: "analysis", photo }),
    ],
  };
  const markup = renderNews([topic], ALL_ON, NOW).text;
  const links = markup.match(/<a\s[^>]*>/g) ?? [];
  const photos = markup.match(/<img\s[^>]*>/g) ?? [];

  assert.equal(links.length, 4);
  for (const link of links) assert.match(link, /target="_blank"\s+rel="noopener noreferrer"/);
  assert.equal(photos.length, 2);
  for (const image of photos) assert.match(image, /referrerpolicy="no-referrer"/);
});

test("with no news, or none from the outlets this device reads, the view says so", () => {
  const athleticOnly = { id: "a", stories: [createStory({ source: "athletic" })] };

  assert.equal(readText(renderNews([], ALL_ON, NOW)), "No news yet.");
  assert.equal(
    readText(renderNews([athleticOnly], { teamOutlets: true, paywalled: false }, NOW)),
    "No news yet.",
  );
});
