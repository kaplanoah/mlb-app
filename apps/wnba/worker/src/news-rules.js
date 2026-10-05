// What the news drops without asking Claude: what a story's link, ESPN's own word for it, or a
// plain title already says isn't news. Anything these can't tell goes to Claude.

const ESPN_TYPE_DROPS = { Media: "video", Preview: "preview", Recap: "recap" };

/** @type {[RegExp, string][]} */
const URL_DROPS = [
  [/\/video\//, "video"],
  [/-the-pulse\/?$|\/newsletter\//, "newsletter"],
  [/trivia|quiz/, "quiz"],
];

/** @type {[RegExp, string][]} */
const TITLE_DROPS = [
  [/\bodds\b|\bbetting\b|\bpicks against\b|\bbest bets?\b/i, "betting"],
  [/\bschedule\b|where to watch|watch guide|games today/i, "schedule"],
  [/scores from last night|scores, results|game highlights/i, "recap"],
  [/guides? for every|power rankings/i, "roundup"],
  [/\btrivia\b|\bquiz\b/i, "quiz"],
];

/**
 * Why a story isn't news, or null when only Claude can say.
 * @param {{ url: string, title: string, espnType?: string }} story
 */
export function readRuleDrop(story) {
  if (ESPN_TYPE_DROPS[story.espnType]) return ESPN_TYPE_DROPS[story.espnType];
  const byUrl = URL_DROPS.find(([pattern]) => pattern.test(story.url));
  if (byUrl) return byUrl[1];
  const byTitle = TITLE_DROPS.find(([pattern]) => pattern.test(story.title));
  return byTitle ? byTitle[1] : null;
}
