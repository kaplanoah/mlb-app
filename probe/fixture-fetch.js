// Probe only: the league refuses callers outside Cloudflare, so the Worker run by wrangler dev on
// a runner answers its feeds from the recorded afternoon of 2026-09-30, with every date moved to
// today, so the Games view's Today list holds that afternoon's games. ESPN and everything else
// still go to the network.
import afternoon from "./afternoon.json";
import games from "./games.json";

const realFetch = globalThis.fetch;
const DAY = 86400000;
const RECORDED_DAY = "2026-09-30";

const readEasternDay = (time) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(time);

function shiftText(text) {
  const shift = Math.round((Date.parse(readEasternDay(Date.now())) - Date.parse(RECORDED_DAY)) / DAY);
  const shiftDate = (year, month, day) => {
    const moved = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)) + shift * DAY);
    return [
      String(moved.getUTCFullYear()),
      String(moved.getUTCMonth() + 1).padStart(2, "0"),
      String(moved.getUTCDate()).padStart(2, "0"),
    ];
  };
  return text
    .replace(/\b(20\d\d)-(\d\d)-(\d\d)/g, (_, year, month, day) =>
      shiftDate(year, month, day).join("-"),
    )
    .replace(/\b(\d\d)\/(\d\d)\/(20\d\d)/g, (_, month, day, year) => {
      const [movedYear, movedMonth, movedDay] = shiftDate(year, month, day);
      return `${movedMonth}/${movedDay}/${movedYear}`;
    })
    .replace(/\b(20\d\d)(0[1-9]|1[0-2])([0-2]\d|3[01])\//g, (_, year, month, day) =>
      `${shiftDate(year, month, day).join("")}/`,
    );
}

const FIXTURES = [
  [/todaysScoreboard_10\.json$/, () => shiftText(JSON.stringify(afternoon.responses.scoreboard))],
  [/scheduleLeagueV2_10\.json$/, () => shiftText(JSON.stringify(afternoon.responses.schedule))],
  [/\/stats\/playoffbracket$/, () => shiftText(JSON.stringify(afternoon.responses.bracket))],
  [/\/stats\/leaguestandingsv3$/, () => JSON.stringify(afternoon.responses.standings)],
  [/\/stats\/leaguedashplayerstats$/, () => JSON.stringify(games.preview.players)],
];

const isLeagueHost = (hostname) =>
  hostname.endsWith("wnba.com") || hostname.endsWith("amazonaws.com");

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (!isLeagueHost(url.hostname)) return realFetch(input, init);
  const fixture = FIXTURES.find(([pattern]) => pattern.test(url.pathname));
  if (!fixture) return new Response("probe: no fixture", { status: 503 });
  return new Response(fixture[1](), { headers: { "content-type": "application/json" } });
};
