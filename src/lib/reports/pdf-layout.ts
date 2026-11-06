import "server-only";

/** Page geometry, colours, fonts and the page writer the parent report PDF is drawn with. */
import { join } from "node:path";

import { type PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";

// A4 in points. Black on white with one accent: this is meant to be printed.
export const WIDTH = 595.28;
const HEIGHT = 841.89;
export const MARGIN = 44;
export const CONTENT = WIDTH - MARGIN * 2;
const INK = rgb(0.11, 0.11, 0.15);
export const MUTED = rgb(0.42, 0.42, 0.48);
const LINE = rgb(0.86, 0.86, 0.9);
export const ACCENT = rgb(0.36, 0.2, 0.82);
export const BAR = rgb(0.74, 0.68, 0.96);

export const FONT_DIR = join(process.cwd(), "node_modules", "geist", "dist", "fonts", "geist-sans");

/** Keeps only characters the embedded font can draw, so one emoji can't fail the whole export. */
export function drawable(font: PDFFont, value: string) {
  const known = new Set(font.getCharacterSet());
  return [...value.replace(/[\r\n\t]+/g, " ")]
    .map((char) => (known.has(char.codePointAt(0)!) ? char : "?"))
    .join("");
}

/** Draws top to bottom, starting a new page when the next block won't fit. */
export class Sheet {
  page: PDFPage;
  y = HEIGHT - MARGIN;
  constructor(
    private doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    private onNewPage: () => void,
  ) {
    this.page = doc.addPage([WIDTH, HEIGHT]);
  }

  ensure(height: number) {
    if (this.y - height >= MARGIN + 24) return false;
    this.page = this.doc.addPage([WIDTH, HEIGHT]);
    this.y = HEIGHT - MARGIN;
    this.onNewPage();
    return true;
  }

  text(
    value: string,
    x: number,
    y: number,
    options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) {
    this.page.drawText(drawable(options.font ?? this.regular, value), {
      x,
      y,
      size: options.size ?? 9.5,
      font: options.font ?? this.regular,
      color: options.color ?? INK,
    });
  }

  right(value: string, right: number, y: number, options: Parameters<Sheet["text"]>[3] = {}) {
    const font = options.font ?? this.regular;
    const size = options.size ?? 9.5;
    this.text(value, right - font.widthOfTextAtSize(value, size), y, options);
  }

  rule(y = this.y) {
    this.page.drawLine({
      start: { x: MARGIN, y },
      end: { x: WIDTH - MARGIN, y },
      thickness: 0.5,
      color: LINE,
    });
  }

  heading(value: string) {
    this.ensure(46);
    this.y -= 22;
    this.text(value, MARGIN, this.y, { size: 12, font: this.bold });
    this.y -= 8;
    this.rule();
    this.y -= 15;
  }

  /** Breaks words onto lines that fit. */
  wrap(value: string, width: number, size: number, font = this.regular) {
    const lines: string[] = [];
    let line = "";
    for (const word of value.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > width) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  fit(value: string, width: number, size = 8.5) {
    if (this.regular.widthOfTextAtSize(value, size) <= width) return value;
    let cut = value;
    while (cut && this.regular.widthOfTextAtSize(`${cut}…`, size) > width) cut = cut.slice(0, -1);
    return `${cut}…`;
  }
}
