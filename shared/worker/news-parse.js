// Turning each outlet's feed into stories: RSS, Atom, a Google News sitemap, and ESPN's own JSON. A Worker has no XML
// parser, and these feeds are simple and regular, so each field is read by its tag.

const SUMMARY_LIMIT = 170;
// A sentence ends at a stop, but not at an initial, as in "C.J.", or an abbreviation, as in "No. 2".
const SENTENCE_END =
  /(?<!(?:^|[\s.])[A-Z]\.)(?<!\b(?:No|vs|St|Mr|Ms|Mrs|Dr|Jr|Sr|Jan|Feb|Aug|Sept|Oct|Nov|Dec)\.)(?<=[.!?\u201d])\s+/;

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
};

/** @param {string} text */
const decodeEntities = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
    if (name[0] === "#") {
      const code =
        name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
  });

const unwrapCdata = (text) => text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");

/**
 * The text inside the first `<name>` in `block`, CDATA unwrapped but markup and entities kept.
 * @param {string} block
 * @param {string} name
 */
function readTagContent(block, name) {
  const found = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return found ? unwrapCdata(found[1]) : "";
}

/**
 * An attribute of the first `<name ...>` in `block` whose attributes pass `isWanted`.
 * @param {string} block
 * @param {string} name
 * @param {string} attribute
 * @param {(tag: string) => boolean} [isWanted]
 */
function readTagAttribute(block, name, attribute, isWanted = () => true) {
  for (const [tag] of block.matchAll(new RegExp(`<${name}\\s[^>]*>`, "g"))) {
    if (!isWanted(tag)) continue;
    const found = tag.match(new RegExp(`\\s${attribute}="([^"]*)"`));
    if (found) return decodeEntities(found[1]);
  }
  return "";
}

/** @param {string} markup */
const readPlainText = (markup) =>
  decodeEntities(unwrapCdata(markup).replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/**
 * The summary's first sentences that fit in a line or two, with what an outlet's feed adds to every
 * story, like "The post ... appeared first on ...", taken off.
 * @param {string} markup
 */
export function shortenSummary(markup) {
  const text = readPlainText(markup)
    .replace(/\s*The post .* appeared first on .*$/, "")
    .replace(/\s*\[(\u2026|\.\.\.)\]$/, "\u2026");
  const sentences = text.split(SENTENCE_END).filter(Boolean);
  let summary = sentences[0] ?? "";
  for (const sentence of sentences.slice(1)) {
    if (summary.length + 1 + sentence.length > SUMMARY_LIMIT) break;
    summary += ` ${sentence}`;
  }
  return summary;
}

// Feeds escape a photo's path in a few places that browsers don't read back.
const cleanPhotoUrl = (url) =>
  url.replace(/%2F/gi, "/").replace(/%3D/gi, "=").replace(/%26/gi, "&");

// Agencies name their photos by themselves, so a photo without a credit can still be credited.
function readCreditFromUrl(url) {
  if (/GettyImages/i.test(url)) return "Getty Images";
  if (/USATSI|USATODAY/i.test(url)) return "USA TODAY Sports";
  if (/\bAP[_-]?\d/i.test(url)) return "AP";
  return "";
}

/**
 * @param {string} url
 * @param {string} credit
 * @returns {{ url: string, credit: string } | null}
 */
function describePhoto(url, credit) {
  if (!url) return null;
  const photoUrl = cleanPhotoUrl(url);
  return { url: photoUrl, credit: credit || readCreditFromUrl(photoUrl) };
}

const isImageTag = (tag) => !/\stype="(?!image)/.test(tag) && !/\smedium="(?!image)/.test(tag);

function readRssPhoto(item) {
  const media = readTagAttribute(item, "media:content", "url", isImageTag);
  if (media) return describePhoto(media, readPlainText(readTagContent(item, "media:credit")));
  const enclosure = readTagAttribute(item, "enclosure", "url", isImageTag);
  if (enclosure) return describePhoto(enclosure, "");
  const markup = `${readTagContent(item, "description")} ${readTagContent(item, "content:encoded")}`;
  return describePhoto(readTagAttribute(markup, "img", "src"), "");
}

/**
 * What an outlet's feed says about one story.
 * @typedef {object} FeedEntry
 * @property {string} url
 * @property {string} title
 * @property {string} summary
 * @property {string} author
 * @property {string} publishedAt an ISO time, or "" when the feed doesn't say
 * @property {{ url: string, credit: string } | null} photo
 * @property {string} [espnType] ESPN's own word for what the story is, like "Recap"
 */

const readIsoTime = (text) => {
  const ms = Date.parse(text.trim());
  return Number.isNaN(ms) ? "" : new Date(ms).toISOString();
};

/**
 * @param {string} xml
 * @returns {FeedEntry[]}
 */
export function parseRss(xml) {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map(([item]) => ({
    url: readPlainText(readTagContent(item, "link")),
    title: readPlainText(readTagContent(item, "title")),
    summary: shortenSummary(readTagContent(item, "description")),
    author: readPlainText(readTagContent(item, "dc:creator")),
    publishedAt: readIsoTime(readPlainText(readTagContent(item, "pubDate"))),
    photo: readRssPhoto(item),
  }));
}

/**
 * @param {string} xml
 * @returns {FeedEntry[]}
 */
export function parseAtom(xml) {
  return [...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/g)].map(([entry]) => ({
    url: readTagAttribute(entry, "link", "href", (tag) => !/\srel="(?!alternate)/.test(tag)),
    title: readPlainText(readTagContent(entry, "title")),
    summary: shortenSummary(readTagContent(entry, "summary") || readTagContent(entry, "content")),
    author: readPlainText(readTagContent(readTagContent(entry, "author"), "name")),
    publishedAt: readIsoTime(
      readTagContent(entry, "published") || readTagContent(entry, "updated"),
    ),
    photo: null,
  }));
}

/**
 * @param {{ articles?: any[] }} json
 * @returns {FeedEntry[]}
 */
export function parseEspnNews(json) {
  return (json.articles ?? []).map((article) => {
    const image = article.images?.[0];
    return {
      url: article.links?.web?.href ?? "",
      title: readPlainText(article.headline ?? ""),
      summary: shortenSummary(article.description ?? ""),
      author: readPlainText(article.byline ?? ""),
      publishedAt: readIsoTime(article.published ?? ""),
      photo: image?.url
        ? describePhoto(image.url, (image.credit ?? "").replace(/^Photo by /, ""))
        : null,
      espnType: article.type ?? "",
    };
  });
}

/**
 * A Google News sitemap, which says only each story's link, title, time, and photo.
 * @param {string} xml
 * @returns {FeedEntry[]}
 */
export function parseNewsSitemap(xml) {
  return [...xml.matchAll(/<url[\s>][\s\S]*?<\/url>/g)].map(([entry]) => ({
    url: readPlainText(readTagContent(entry, "loc")),
    title: readPlainText(readTagContent(entry, "news:title")),
    summary: "",
    author: "",
    publishedAt: readIsoTime(readPlainText(readTagContent(entry, "news:publication_date"))),
    photo: describePhoto(
      readPlainText(readTagContent(readTagContent(entry, "image:image"), "image:loc")),
      "",
    ),
  }));
}
