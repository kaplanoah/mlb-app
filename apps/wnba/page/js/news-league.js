import { renderClub } from "./clubs.js";
import { TEAMS } from "./teams.js";

// What the WNBA hands the shared News view: its teams' dots and names, and its paid outlet.

/** @type {import("#shared/news-view.js").NewsLeague} */
export const NEWS_LEAGUE = {
  renderTeam: (team) => (team in TEAMS ? renderClub(team) : null),
  paywalledSources: ["athletic"],
};
