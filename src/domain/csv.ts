/**
 * CSV writing. Text cells can hold anything a user typed, so a leading =, +, -, @, tab or carriage
 * return gets an apostrophe: a spreadsheet would otherwise run it as a formula. Numbers are passed
 * as `{ number }` so a negative amount stays a number.
 */
type CsvCell = string | { number: string };

const BOM = String.fromCharCode(0xfeff);
const FORMULA_START = /^[=+\-@\t\r]/;

function encode(cell: CsvCell): string {
  const text = typeof cell === "string" ? cell.replace(FORMULA_START, "'$&") : cell.number;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** CRLF rows with a byte-order mark, which is what Excel needs to read ₹ correctly. */
export function csvDocument(header: readonly string[], rows: readonly (readonly CsvCell[])[]) {
  return `${BOM}${[header, ...rows].map((row) => row.map(encode).join(",")).join("\r\n")}\r\n`;
}
