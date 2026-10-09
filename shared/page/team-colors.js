// The colors two teams' sides take when they share a chart, each from the team's own two: its
// first and its other. When the first two look alike, the away team takes its other color, and
// only if neither of its colors will do does the home team take its other one too.

// How far apart two colors are in OKLab before one side reads apart from the other at a glance.
const SMALLEST_DISTANCE = 0.15;
// Which of the home and away teams' colors to try, in order.
const CHOICES = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
];

/** @param {number} channel from 0 to 1 */
const linearize = (channel) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

/**
 * @param {string} hex like #1c1c1c
 * @returns {[number, number, number]}
 */
export function readOklab(hex) {
  const [red, green, blue] = [1, 3, 5].map((start) =>
    linearize(parseInt(hex.slice(start, start + 2), 16) / 255),
  );
  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  return [
    0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short,
    1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short,
    0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short,
  ];
}

/**
 * @param {string} first
 * @param {string} second
 */
export function measureColorDistance(first, second) {
  const [firstPoint, secondPoint] = [readOklab(first), readOklab(second)];
  return Math.hypot(...firstPoint.map((value, index) => value - secondPoint[index]));
}

/**
 * @param {readonly string[]} awayColors the away team's first color, then its other
 * @param {readonly string[]} homeColors the home team's first color, then its other
 */
export function pickSideColors(awayColors, homeColors) {
  const [homeIndex, awayIndex] =
    CHOICES.find(
      ([homeChoice, awayChoice]) =>
        measureColorDistance(awayColors[awayChoice], homeColors[homeChoice]) >= SMALLEST_DISTANCE,
    ) ?? CHOICES[CHOICES.length - 1];
  return { away: awayColors[awayIndex], home: homeColors[homeIndex] };
}
