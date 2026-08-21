/**
 * Vertical correction for text drawn by html2canvas.
 *
 * html2canvas positions a run of text by taking the rect the browser reports
 * for it and adding its own measurement of where the baseline sits inside that
 * rect (FontMetrics.parseMetrics, an offsetTop trick with a 1px image on the
 * baseline, plus a literal +2). That measurement does not agree with the
 * browser's own font ascent, so every piece of text lands lower in the capture
 * than it does on the page — by roughly 5px at font-size 10 and 18px at
 * font-size 40.
 *
 * The card used to compensate with a hand-tuned offset per field key (-8 for
 * 'row', -25 for 'row_no', -15 for 'block'/'bib'/'first_name', -9 for the
 * rest). Those numbers had no relation to font size, which is what the error
 * actually tracks, so some fields were over-corrected by 9-11px and the spacing
 * between neighbouring fields came out wrong even when each one was "close".
 *
 * Measured instead. The error is exactly the difference between the two
 * baselines, is independent of line-height, and holds across families, weights
 * and sizes to within a pixel:
 *
 *   error = html2canvasBaseline(family, size) - fontBoundingBoxAscent
 *
 * So we replicate html2canvas's own measurement and subtract the browser's.
 */

// The 1x1 transparent GIF html2canvas uses as its baseline marker.
const SMALL_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const offsetCache = new Map<string, number>();
let measureCtx: CanvasRenderingContext2D | null = null;

/**
 * html2canvas 1.4.1 FontMetrics.parseMetrics, reproduced. Kept deliberately
 * faithful — including the `+ 2` — because the point is to land on the same
 * number html2canvas will use, not on a better one.
 */
const html2canvasBaseline = (fontFamily: string, fontSize: string): number => {
  const container = document.createElement('div');
  const img = document.createElement('img');
  const span = document.createElement('span');

  container.style.visibility = 'hidden';
  container.style.fontFamily = fontFamily;
  container.style.fontSize = fontSize;
  container.style.margin = '0';
  container.style.padding = '0';
  container.style.whiteSpace = 'nowrap';
  document.body.appendChild(container);

  img.src = SMALL_IMAGE;
  img.width = 1;
  img.height = 1;
  img.style.margin = '0';
  img.style.padding = '0';
  img.style.verticalAlign = 'baseline';

  span.style.fontFamily = fontFamily;
  span.style.fontSize = fontSize;
  span.style.margin = '0';
  span.style.padding = '0';
  span.appendChild(document.createTextNode('Hidden Text'));

  container.appendChild(span);
  container.appendChild(img);
  const baseline = img.offsetTop - span.offsetTop + 2;
  document.body.removeChild(container);

  return baseline;
};

/**
 * How far below its on-page position html2canvas will draw text in this font.
 * Subtract it from the field's top to make the capture match the page.
 */
export const getCaptureTextOffset = (
  fontFamily: string,
  fontWeight: string,
  fontSizePx: number,
): number => {
  if (!fontFamily || !Number.isFinite(fontSizePx) || fontSizePx <= 0) return 0;

  const key = `${fontFamily}|${fontWeight}|${fontSizePx}`;
  const cached = offsetCache.get(key);
  if (cached !== undefined) return cached;

  if (!measureCtx) {
    measureCtx = document.createElement('canvas').getContext('2d');
  }
  if (!measureCtx) return 0;

  measureCtx.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
  const ascent = measureCtx.measureText('Hg').fontBoundingBoxAscent;
  // Older browsers don't report fontBoundingBox*; better no correction than a
  // NaN one.
  if (!Number.isFinite(ascent)) return 0;

  const offset = html2canvasBaseline(fontFamily, `${fontSizePx}px`) - ascent;
  offsetCache.set(key, offset);
  return offset;
};

/**
 * Same, for a field that is already on the page — reads the typography that is
 * actually rendered, so scale-to-fit fields get the offset for the size they
 * shrank to rather than the size they were configured at.
 */
export const getCaptureTextOffsetForElement = (el: Element | null): number => {
  if (!el) return 0;
  const cs = window.getComputedStyle(el);
  return getCaptureTextOffset(cs.fontFamily, cs.fontWeight, parseFloat(cs.fontSize));
};
