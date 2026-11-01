import { parseEntries } from "@/domain";

const TODAY = "2026-11-04"; // a Wednesday
const parse = (text: string) => parseEntries(text, TODAY);
const brief = (text: string) =>
  parse(text).map((e) => [e.description, e.amountPaise, e.date, e.issues.join("|")]);

describe("parseEntries", () => {
  it("reads the two spec examples", () => {
    expect(brief("tea 15, bus 20, snacks 35")).toEqual([
      ["Tea", 1500, TODAY, ""],
      ["Bus", 2000, TODAY, ""],
      ["Snacks", 3500, TODAY, ""],
    ]);
    expect(brief("₹40 lunch and ₹15 tea yesterday")).toEqual([
      ["Lunch", 4000, "2026-11-03", ""],
      ["Tea", 1500, "2026-11-03", ""],
    ]);
  });

  it("recognises amounts however they're written, in exact paise", () => {
    expect(brief("rs 40 lunch")[0]![1]).toBe(4000);
    expect(brief("Rs. 40 lunch")[0]![1]).toBe(4000);
    expect(brief("lunch 40rs")[0]![1]).toBe(4000);
    expect(brief("lunch 40/-")[0]![1]).toBe(4000);
    expect(brief("lunch 40 rupees")[0]![1]).toBe(4000);
    expect(brief("lunch inr 40")[0]![1]).toBe(4000);
    expect(brief("lunch 12.50")[0]![1]).toBe(1250);
    expect(brief("fees 1,250")[0]![1]).toBe(125000);
    expect(brief("fees 1,25,000")[0]![1]).toBe(12500000);
    expect(brief("laptop 1.5k")[0]![1]).toBe(150000);
    expect(brief("0.29 thing")[0]![1]).toBe(29);
  });

  it("splits entries without separators, as speech arrives", () => {
    expect(brief("tea 15 bus 20 snacks 35").map((e) => e[0])).toEqual(["Tea", "Bus", "Snacks"]);
    expect(brief("15 tea 20 bus").map((e) => [e[0], e[1]])).toEqual([
      ["Tea", 1500],
      ["Bus", 2000],
    ]);
    expect(brief("tea fifteen bus twenty").map((e) => [e[0], e[1]])).toEqual([
      ["Tea", 1500],
      ["Bus", 2000],
    ]);
    expect(brief("lunch two hundred fifty")[0]![1]).toBe(25000);
    expect(brief("lunch one fifty")[0]![1]).toBe(15000);
    expect(brief("rent two thousand five hundred")[0]![1]).toBe(250000);
    expect(brief("tea fifteen rupees and bus twenty rupees").map((e) => e[1])).toEqual([
      1500, 2000,
    ]);
  });

  it("keeps 'and' inside one item, and separates by line, semicolon and full stop", () => {
    expect(brief("bread and butter 40")).toEqual([["Bread and butter", 4000, TODAY, ""]]);
    expect(brief("tea 15\nbus 20; snacks 35. lunch 60").map((e) => e[0])).toEqual([
      "Tea",
      "Bus",
      "Snacks",
      "Lunch",
    ]);
  });

  it("drops filler words and picks out the merchant", () => {
    expect(brief("spent 40 on lunch")[0]![0]).toBe("Lunch");
    expect(brief("paid 200 for the books")[0]![0]).toBe("Books");
    const entry = parse("tea 15 at canteen")[0]!;
    expect([entry.description, entry.merchant]).toEqual(["Tea", "Canteen"]);
  });

  it("understands dates and applies them sensibly", () => {
    const date = (text: string) => parse(text)[0]!.date;
    expect(date("tea 15 day before yesterday")).toBe("2026-11-02");
    expect(date("tea 15 3 days ago")).toBe("2026-11-01");
    expect(date("tea 15 two days ago")).toBe("2026-11-02");
    expect(date("tea 15 last night")).toBe("2026-11-03");
    expect(date("tea 15 on monday")).toBe("2026-11-02");
    expect(date("tea 15 wednesday")).toBe(TODAY);
    expect(date("tea 15 last wednesday")).toBe("2026-10-28");
    expect(date("tea 15 on 24 oct")).toBe("2026-10-24");
    expect(date("tea 15 oct 24th")).toBe("2026-10-24");
    expect(date("tea 15 24/10")).toBe("2026-10-24");
    expect(date("tea 15 24/10/2025")).toBe("2025-10-24");
    expect(date("tea 15 2026-10-24")).toBe("2026-10-24");
    // No year and later in the calendar than today: last year's, never a future guess.
    expect(date("tea 15 25 dec")).toBe("2025-12-25");

    const yesterday = "2026-11-03";
    expect(parse("yesterday tea 15, bus 20").map((e) => e.date)).toEqual([yesterday, yesterday]);
    expect(parse("tea 15, bus 20, yesterday").map((e) => e.date)).toEqual([yesterday, yesterday]);
    expect(parse("tea 15 yesterday, bus 20 today").map((e) => e.date)).toEqual([yesterday, TODAY]);
    expect(parse("tea 15").map((e) => e.dateFromText)).toEqual([false]);
    expect(parse("tea 15 yesterday").map((e) => e.dateFromText)).toEqual([true]);
  });

  it("doesn't mistake dates or times for amounts", () => {
    expect(brief("24/10 tea 15")[0]!.slice(0, 2)).toEqual(["Tea", 1500]);
    expect(brief("tea 15 at 5pm")).toEqual([["Tea", 1500, TODAY, ""]]);
    expect(brief("tea 15 at 5:30 pm")[0]![1]).toBe(1500);
  });

  it("flags what it isn't sure about instead of guessing", () => {
    expect(brief("tea")).toEqual([["Tea", null, TODAY, "missing_amount"]]);
    expect(brief("tea, bus 20").map((e) => e[3])).toEqual(["missing_amount", ""]);
    expect(brief("tea 0")[0]![3]).toBe("invalid_amount");
    expect(brief("tea 15.555")[0]![3]).toBe("invalid_amount");
    expect(brief("2 samosa 30")).toEqual([["2 samosa", 3000, TODAY, "ambiguous_amount"]]);
    expect(brief("tea $5")[0]![3]).toBe("other_currency");
    expect(brief("tea 5 dollars")[0]![3]).toBe("other_currency");
    expect(brief("tea 15 tomorrow")[0]![3]).toBe("future_date");
    expect(brief("refund 50 for shoes")[0]![3]).toBe("needs_full_form");
    expect(brief("moved 500 to bank")[0]![3]).toBe("needs_full_form");
  });

  it("uses a currency mark to tell a price from a quantity", () => {
    expect(brief("2 samosa ₹30")).toEqual([["2 samosa", 3000, TODAY, ""]]);
    expect(brief("two samosa 30")).toEqual([["Two samosa", 3000, TODAY, ""]]);
  });

  it("recognises money coming in", () => {
    const pay = parse("received 2000 pocket money from dad")[0]!;
    expect([pay.type, pay.description, pay.merchant, pay.amountPaise]).toEqual([
      "income",
      "Pocket money",
      "Dad",
      200000,
    ]);
    expect(parse("salary 5000")[0]!.type).toBe("income");
    expect(parse("got 500 from uncle")[0]!.type).toBe("income");
    expect(parse("got coffee 20")[0]!.type).toBe("expense");
  });

  it("returns nothing for empty text and is repeatable", () => {
    expect(parse("   ")).toEqual([]);
    expect(parse("yesterday")).toEqual([]);
    expect(parse("tea 15, bus 20")).toEqual(parse("tea 15, bus 20"));
  });
});
