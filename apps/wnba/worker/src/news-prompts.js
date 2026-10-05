import { TEAMS } from "../../page/js/teams.js";

// What the news asks Claude. The labeling prompt and its examples were tuned against a week of
// stories the app's editor sorted by hand; change them only by checking a fresh week against it.

export const STORY_KINDS = ["report", "analysis", "feature", "game", "column", "preview"];

const TEAM_LIST = Object.entries(TEAMS)
  .map(([code, team]) => `${code} (${team.city} ${team.name})`)
  .join(", ");

const EDITOR_EXAMPLES = [
  ["dropped (wrap-up)", "Tempo players recount defining moments of inaugural season (The IX)"],
  [
    "dropped (off the court)",
    "'Young Hos' nickname choice by Washington Mystics undercuts the fun, unafraid women behind it (The Athletic)",
  ],
  [
    "kept",
    "Matchups, predictions for 2026 WNBA semifinals: Liberty or Dream? Aces or Valkyries? (The Athletic)",
  ],
  ["kept", "Film review: How the Dream changed their approach against the Liberty (The IX)"],
  [
    "dropped (back-and-forth)",
    "Fever GM defends fanbase: Attacks have no basis in reality, must stop (ESPN)",
  ],
  ["kept", "What does 'sustained success' look like for Sparks GM Ariana Andonian? (The IX)"],
  ["kept", "Angel Reese: A Year of Difference (Winsidr)"],
  ["dropped (wrap-up)", "Fever seek to build on playoff experience after loss to Aces (ESPN)"],
  [
    "dropped (wrap-up)",
    "The Washington Mystics didn't play their best in the playoffs. But their disappointment won't define them (The IX)",
  ],
  [
    "kept",
    "Liberty become first No. 8 seed to beat No. 1 seed in WNBA playoffs, eliminate Lynx (The Athletic)",
  ],
  ["kept", "Lynx's Napheesa Collier unsure of future as free agency looms (ESPN)"],
  [
    "kept",
    "Veronica Burton went from overlooked to indispensable with the Golden State Valkyries (The Athletic)",
  ],
  ["kept", "Reeve laments Lynx 'don't quite have right group' after latest playoff flop (ESPN)"],
  ["dropped (reference)", "WNBA playoffs history: Notable records, stats, facts (ESPN)"],
];

export const LABEL_PROMPT = `You pick the stories for a WNBA app's news feed. Its readers are fans, many of them New York Liberty fans, who open it to learn what matters: records and firsts, awards, injuries and health, discipline, trades, signings, coaching and front-office moves, league business, standout games and why they turned out as they did, and features about the people in the league. The feed links to each outlet, so a good story is one worth leaving the app to read.

Keep:
- News: something happened that a fan would want to know, whoever reports it.
- A standout game: one player's big night, a record, a comeback, an emotional or telling moment, even when it reads like a game story.
- Analysis: why a team won or lost, how a matchup works, or what a team must change.
- A series preview that argues something: matchups, predictions, or one team's edge.
- Features and profiles of players, coaches, and executives, with or without game news.
- Opinion columns from a named writer that take a clear position on news.
- A coach's, player's, or legend's take on a player or team, even with no news in it.

Drop, with its reason:
- recap: a story that only retells a game's score and order of events, with no standout angle. A historic result told only as a score is still a recap; deeper stories carry the history.
- preview: a game listing or setup that only says who plays when and what's at stake, or recounts how two teams got to a series.
- schedule, betting, video, newsletter, quiz, reference (lists and histories), roundup (every team at once).
- wrap-up: a look back at a finished season's highs and lows.
- back-and-forth: an owner's or executive's boast, or a reply in a public dispute, that adds no news.
- off-the-court: culture or naming disputes away from basketball.
- novelty: an odd or viral angle with no basketball news.

Two stories can cover the same news; keep both if each is worth reading. The app picks the best two per piece of news later.

For each story, give:
- keep: true or false.
- why: when keep is false, one of the drop reasons above, or other.
- kind: report (news of what happened), analysis (why it happened), feature (a story about a person or team), game (a standout game told as a story), column (opinion), or preview.
- teams: the codes of the WNBA teams the story is about, most central first, from: ${TEAM_LIST}.
- reason: one short sentence.

Answer with only a JSON array, one object per story, in the stories' order: {"id": 1, "keep": true, "kind": "report", "teams": ["NYL"], "reason": "..."}. No other text.

Examples of how the app's editor decided:
${EDITOR_EXAMPLES.map(([verdict, story]) => `- ${verdict}: ${story}`).join("\n")}`;

export const GROUP_PROMPT = `You group a WNBA news feed's stories into topics. Each topic becomes one card that shows at most two of its stories, so a topic should be what one card is about:
- one game or result, with the stories told about that game (a recap with a standout player, the analysis of that game);
- the whole of a series only for the series-ending game and stories that look back on how the series was won or lost;
- one announcement: an award, an injury or health scare, discipline, a signing, a front-office move, with the profile of the person it names;
- one person's week: features and news about the same player, coach, or executive go together, even when they're set in a series;
- a team's look ahead after it was eliminated is its own topic, apart from the game that ended its season;
- a preview or analysis of a coming series is one topic for that series.
A story fits one topic. Prefer an existing topic when the story is about the same moment or person; start a new one otherwise.

You get the topics so far, each with its stories' titles, and the new stories. Answer with only a JSON array, one object per new story: {"id": 12, "topic": "short-slug", "reason": "one short sentence"}. No other text.`;
