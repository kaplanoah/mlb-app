/**
 * Every player's game logs in a season as the league answers them in one read, from the few
 * players' logs a fixture recorded, keyed as 1627668:2026:Playoffs.
 * @param {Record<string, any>} gameLogs
 * @param {number} season
 * @param {string} seasonType
 */
export function joinGameLogs(gameLogs, season, seasonType) {
  const logs = Object.entries(gameLogs)
    .filter(([key]) => key.endsWith(`:${season}:${seasonType}`))
    .map(([, answer]) => answer.resultSets[0]);
  return {
    resultSets: [
      {
        name: "PlayerGameLogs",
        headers: logs[0].headers,
        rowSet: logs.flatMap((log) => log.rowSet),
      },
    ],
  };
}
