import { createNewsJob } from "../../../../shared/worker/news-updater.js";
import { createRuleDrop } from "../../../../shared/worker/news-rules.js";
import { TEAMS } from "../../page/js/teams.js";
import { readWnbaNews } from "./news-feeds.js";
import { LABEL_PROMPT } from "./news-prompts.js";

// The WNBA's news, which the shared news job keeps from its outlets, judged by its prompt.

/** @param {{ readFeeds?: typeof readWnbaNews }} [options] */
export const createWnbaNewsJob = ({ readFeeds = readWnbaNews } = {}) =>
  createNewsJob({
    readFeeds,
    prompt: LABEL_PROMPT,
    teamCodes: Object.keys(TEAMS),
    readRuleDrop: createRuleDrop(),
  });
