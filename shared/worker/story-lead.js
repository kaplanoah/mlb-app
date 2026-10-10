// The first lines of a story an outlet publishes as HTML, as plain text for a game's Highlights
// section: its first sentences, as many as it takes to read past a dateline and a one-line opener,
// so the lead reads as a few sentences.

const LEAD_LENGTH = 200;
const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
};

/** @param {string} text */
const decodeEntities = (text) =>
  text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
    if (name[0] !== "#") return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
    const code =
      name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
  });

/** @param {string} html */
const listParagraphs = (html) =>
  html
    .split(/<\/p>|<br\s*\/?>|\n\s*\n/i)
    .map((paragraph) => decodeEntities(paragraph.replace(/<[^>]*>/g, " ")))
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

/** @param {string} paragraph */
const listSentences = (paragraph) => paragraph.split(/(?<=[.!?]["'\u201d\u2019]?)\s+/);

/**
 * @param {string | null | undefined} html
 * @returns {string}
 */
export function readStoryLead(html) {
  const lead = [];
  for (const sentence of listParagraphs(html ?? "").flatMap(listSentences)) {
    lead.push(sentence);
    if (lead.join(" ").length >= LEAD_LENGTH) break;
  }
  return lead.join(" ");
}
