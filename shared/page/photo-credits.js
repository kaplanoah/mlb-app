// A News photo's credit wraps before the agency it came through only while each part fits on a line
// of its own. A part that would wrap inside itself leaves the credit to wrap as one text instead, into
// lines of even length, which takes fewer lines.

const FLOWING = "credit-flow";

/** @param {Element} element */
function countLines(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const lineTops = [...range.getClientRects()]
    .filter((rect) => rect.width > 0)
    .map((rect) => Math.round(rect.top));
  return new Set(lineTops).size;
}

/** @param {Element} credit */
const hasWrappedPart = (credit) =>
  [...credit.querySelectorAll(".credit-part")].some((part) => countLines(part) > 1);

/**
 * Lets each credit in `list` that is split in parts wrap as one text where a part doesn't fit on a
 * line of its own. Each credit goes back to its parts first, so they're all measured in one layout.
 * @param {HTMLElement} list
 */
export function fitPhotoCredits(list) {
  if (list.clientWidth === 0) return;
  const credits = [...list.querySelectorAll(".news-photo-credit:has(.credit-part)")];
  for (const credit of credits) credit.classList.remove(FLOWING);
  const flowing = credits.filter(hasWrappedPart);
  for (const credit of flowing) credit.classList.add(FLOWING);
}

/**
 * Fits the credits in `list` again whenever its width changes, and whenever a font loads, since a
 * credit measured in a stand-in font may fit differently in its own.
 * @param {HTMLElement} list
 */
export function watchPhotoCredits(list) {
  let width = 0;
  new ResizeObserver(([entry]) => {
    if (entry.contentRect.width === width) return;
    width = entry.contentRect.width;
    fitPhotoCredits(list);
  }).observe(list);
  document.fonts.addEventListener("loadingdone", () => fitPhotoCredits(list));
}
