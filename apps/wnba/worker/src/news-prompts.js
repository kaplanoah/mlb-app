import { TEAMS } from "../../page/js/teams.js";

// What the news asks Claude. The labeling prompt and its examples were tuned against a week of
// stories the app's editor sorted by hand; change them only by checking a fresh week against it.

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
- retold: news a card already tells, without enough to go under it.

The feed shows each piece of news as one card: the story that tells it best, with a few others under it as More on this. You get the cards so far, each with its number, its lead, and the stories under it, then the new stories, numbered after them, in the order they came out.

When a new story tells news a card already tells, or an earlier new story does, give that number as same. Then:
- If it tells the news better than the card's lead, set lead to true. It leads the card, and the old lead goes under it. Reward quality, not speed: a deeper, better-reported, or better-written story should lead, whenever it came out.
- Otherwise keep it only if it earns a place under the card, and the bar rises with each story the card has. Under a lead alone, it needs something the lead lacks: new facts, the why, or the people's own words. Under a lead with one story under it, it must add something real that neither has. With two or more under the lead, it must be exceptional. Otherwise drop it as retold.
A new development in a card's story, like an injured player ruled out of the next game, leads that card: give its number as same and set lead to true, so the latest news leads and what came before goes under it.

For each new story, give:
- keep: true or false.
- why: when keep is false, one of the drop reasons above, or other.
- same: the number of the card or new story whose news it tells, only when it tells news one already does.
- lead: true when it should lead that card.
- teams: the codes of the WNBA teams the story is about, most central first, from: ${TEAM_LIST}.
- reason: one short sentence.

Answer with only a JSON array, one object per new story, in their order: {"id": 14, "keep": true, "same": 3, "lead": false, "teams": ["NYL"], "reason": "..."}. No other text.

Examples of how the app's editor decided:
${EDITOR_EXAMPLES.map(([verdict, story]) => `- ${verdict}: ${story}`).join("\n")}`;
