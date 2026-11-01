import { MAX_PARSE_LENGTH, parseEntries, toLocalDate } from "@/domain";

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

  it("reads the Hindi day words aaj, kal and parso", () => {
    const date = (text: string) => parse(text)[0]!.date;
    expect(date("aaj tea 15")).toBe(TODAY);
    expect(date("tea 15 kal")).toBe("2026-11-03");
    expect(date("parso bus 20")).toBe("2026-11-02");
    expect(date("Kal chai 15")).toBe("2026-11-03");
    expect(date("PARSO bus 20")).toBe("2026-11-02");
    expect(date("parson bus 20")).toBe("2026-11-02"); // how speech often spells it
    expect(parse("aaj tea 15")[0]!.dateFromText).toBe(true);
    expect(parse("aaj tea 15")[0]!.issues).toEqual([]);
  });

  it("treats kal as yesterday and flags which word the date came from", () => {
    const word = (text: string) => parse(text).map((e) => e.dateWord);
    expect(word("kal tea 15")).toEqual(["kal"]);
    expect(word("parso tea 15")).toEqual(["parso"]);
    expect(word("parson tea 15")).toEqual(["parso"]);
    // Only the words that can mean two days are flagged.
    expect(word("aaj tea 15")).toEqual([null]);
    expect(word("tea 15 yesterday")).toEqual([null]);
    expect(word("tea 15")).toEqual([null]);
    // Never a future date, so it can't trip the future-date block.
    expect(parse("kal tea 15")[0]!.issues).toEqual([]);
  });

  it("applies Hindi day words across entries like any other date", () => {
    expect(brief("kal tea 15, bus 20")).toEqual([
      ["Tea", 1500, "2026-11-03", ""],
      ["Bus", 2000, "2026-11-03", ""],
    ]);
    expect(parse("kal tea 15, bus 20").map((e) => e.dateWord)).toEqual(["kal", "kal"]);
    expect(brief("aaj tea 15, kal bus 20, parso snacks 35").map((e) => e[2])).toEqual([
      TODAY,
      "2026-11-03",
      "2026-11-02",
    ]);
    expect(brief("kal tea 15 bus 20").map((e) => [e[0], e[2]])).toEqual([
      ["Tea", "2026-11-03"],
      ["Bus", "2026-11-03"],
    ]);
  });

  it("keeps Hindi day words out of the description and the amount", () => {
    expect(brief("kal raat ka dinner 200")).toEqual([["Dinner", 20000, "2026-11-03", ""]]);
    expect(brief("aaj subah ki chai 15")).toEqual([["Chai", 1500, TODAY, ""]]);
    expect(brief("kal lunch 40 at canteen")[0]![0]).toBe("Lunch");
    expect(parse("kal lunch 40 at canteen")[0]!.merchant).toBe("Canteen");
    // Only the whole word counts: these are ordinary descriptions.
    expect(brief("kalakand 60")).toEqual([["Kalakand", 6000, TODAY, ""]]);
    expect(brief("parsley 20")).toEqual([["Parsley", 2000, TODAY, ""]]);
    expect(parse("kalakand 60")[0]!.dateWord).toBeNull();
  });

  // [text, [[description, paise, date, issues], …]]. TODAY is the fixed Wednesday above.
  const Y = "2026-11-03";
  it.each<[string, [string | null, number | null, string, string][]]>([
    // Multi-item
    ["rs 20 coffee", [["Coffee", 2000, TODAY, ""]]],
    ["coffee rs 20", [["Coffee", 2000, TODAY, ""]]],
    [
      "tea 15\nbus 20",
      [
        ["Tea", 1500, TODAY, ""],
        ["Bus", 2000, TODAY, ""],
      ],
    ],
    [
      "tea 15 and bus 20",
      [
        ["Tea", 1500, TODAY, ""],
        ["Bus", 2000, TODAY, ""],
      ],
    ],
    [
      "tea 15; bus 20",
      [
        ["Tea", 1500, TODAY, ""],
        ["Bus", 2000, TODAY, ""],
      ],
    ],
    [
      "tea 15,bus 20",
      [
        ["Tea", 1500, TODAY, ""],
        ["Bus", 2000, TODAY, ""],
      ],
    ],
    [
      "tea 15 tea 20",
      [
        ["Tea", 1500, TODAY, ""],
        ["Tea", 2000, TODAY, ""],
      ],
    ],
    ["bread and butter 40", [["Bread and butter", 4000, TODAY, ""]]],
    // Currency formats
    ["rs20 coffee", [["Coffee", 2000, TODAY, ""]]],
    ["Rs.20 coffee", [["Coffee", 2000, TODAY, ""]]],
    ["RS 20 coffee", [["Coffee", 2000, TODAY, ""]]],
    ["inr20 coffee", [["Coffee", 2000, TODAY, ""]]],
    ["INR 20 coffee", [["Coffee", 2000, TODAY, ""]]],
    ["₹20 coffee", [["Coffee", 2000, TODAY, ""]]],
    ["₹ 20 coffee", [["Coffee", 2000, TODAY, ""]]],
    ["coffee 20rs", [["Coffee", 2000, TODAY, ""]]],
    ["coffee 20 rs", [["Coffee", 2000, TODAY, ""]]],
    ["coffee 20/-", [["Coffee", 2000, TODAY, ""]]],
    ["coffee 20.50", [["Coffee", 2050, TODAY, ""]]],
    ["coffee 0.05", [["Coffee", 5, TODAY, ""]]],
    ["fees 1,25,000", [["Fees", 12500000, TODAY, ""]]],
    // A word that merely contains the letters isn't a currency.
    ["mrs 20", [["Mrs", 2000, TODAY, ""]]],
    // Dates
    ["auto 60 on monday", [["Auto", 6000, "2026-11-02", ""]]],
    ["auto 60 monday", [["Auto", 6000, "2026-11-02", ""]]],
    ["auto 60 on Monday", [["Auto", 6000, "2026-11-02", ""]]],
    ["auto 60 on mon", [["Auto", 6000, "2026-11-02", ""]]],
    ["auto 60 on tues", [["Auto", 6000, "2026-11-03", ""]]],
    ["auto 60 on wed", [["Auto", 6000, TODAY, ""]]],
    ["auto 60 last wed", [["Auto", 6000, "2026-10-28", ""]]],
    ["auto 60 last monday", [["Auto", 6000, "2026-11-02", ""]]],
    ["auto 60 today", [["Auto", 6000, TODAY, ""]]],
    ["auto 60 yesterday", [["Auto", 6000, Y, ""]]],
    ["yesterday auto 60", [["Auto", 6000, Y, ""]]],
    ["auto 60 tomorrow", [["Auto", 6000, "2026-11-05", "future_date"]]],
    // Short weekdays need "on": these are things, not days.
    ["sun glasses 200", [["Sun glasses", 20000, TODAY, ""]]],
    ["sat mat 200", [["Sat mat", 20000, TODAY, ""]]],
    // Ambiguous: flagged, never guessed
    ["tea", [["Tea", null, TODAY, "missing_amount"]]],
    ["tea 0", [["Tea", null, TODAY, "invalid_amount"]]],
    ["tea 15.555", [["Tea", null, TODAY, "invalid_amount"]]],
    ["2 tea 30", [["2 tea", 3000, TODAY, "ambiguous_amount"]]],
    ["tea $5", [["Tea", 500, TODAY, "other_currency"]]],
    ["refund 50 shoes", [["Refund shoes", 5000, TODAY, "needs_full_form|unclear_item"]]],
    ["tea 15 bus", [["Tea bus", 1500, TODAY, "unclear_item"]]],
    ["lunch 40 dinner", [["Lunch dinner", 4000, TODAY, "unclear_item"]]],
    ["lunch ₹40 dinner", [["Lunch dinner", 4000, TODAY, "unclear_item"]]],
    // Words after the price that only describe it aren't doubts.
    ["lunch 40 with friends", [["Lunch with friends", 4000, TODAY, ""]]],
    ["paid 40 lunch", [["Lunch", 4000, TODAY, ""]]],
    ["spent 40 on lunch", [["Lunch", 4000, TODAY, ""]]],
    // Garbage: nothing throws, nothing gets a made-up amount
    ["asdf qwer", [["Asdf qwer", null, TODAY, "missing_amount"]]],
    ["<script>alert(1)</script>", [["<script>alert(1)</script>", null, TODAY, "missing_amount"]]],
    ["-5", [["-5", null, TODAY, "missing_amount"]]],
    ["1e5 tea", [["1e5 tea", null, TODAY, "missing_amount"]]],
    ["12345678901234567", [[null, null, TODAY, "invalid_amount"]]],
    ["₹", [["₹", null, TODAY, "missing_amount"]]],
  ])("parses %j", (text, expected) => {
    expect(brief(text)).toEqual(expected);
  });

  it("ignores text with no content, and survives input at the length limit", () => {
    for (const blank of ["", "   ", "\n\n", ",,,", ";;;", "...", "!!!", "yesterday", "kal"]) {
      expect(parse(blank)).toEqual([]);
    }
    expect(parse(`tea 15, ${"x".repeat(MAX_PARSE_LENGTH * 2)}`).length).toBe(2);
    expect(parse("tea 15, ".repeat(1_000)).every((e) => e.amountPaise === 1500)).toBe(true);
  });

  it("returns nothing for empty text and is repeatable", () => {
    expect(parse("   ")).toEqual([]);
    expect(parse("yesterday")).toEqual([]);
    expect(parse("tea 15, bus 20")).toEqual(parse("tea 15, bus 20"));
  });
});

describe("day words against the Asia/Kolkata clock", () => {
  // How the review reads text: the instant is turned into the user's day, then parsed.
  const datesAt = (instant: string, timeZone = "Asia/Kolkata") => {
    const today = toLocalDate(Date.parse(instant), timeZone);
    const words = ["today", "aaj", "yesterday", "kal", "parso"];
    return [today, ...words.map((word) => parseEntries(`${word} tea 15`, today)[0]!.date)];
  };

  it.each([
    // [instant (UTC), today, today, aaj, yesterday, kal, parso]
    // IST midnight is 18:30 UTC: one second either side of it.
    ["2026-10-31T18:29:59Z", "2026-10-31", "2026-10-30", "2026-10-29"],
    ["2026-10-31T18:30:00Z", "2026-11-01", "2026-10-31", "2026-10-30"],
    // The UTC date lags IST until 05:30 IST: reading the day in UTC would be a day early here.
    ["2026-10-31T23:59:59Z", "2026-11-01", "2026-10-31", "2026-10-30"],
    ["2026-11-01T00:00:00Z", "2026-11-01", "2026-10-31", "2026-10-30"],
    // Across a year end and a leap day.
    ["2026-12-31T18:29:59Z", "2026-12-31", "2026-12-30", "2026-12-29"],
    ["2026-12-31T18:30:00Z", "2027-01-01", "2026-12-31", "2026-12-30"],
    ["2028-02-29T18:30:00Z", "2028-03-01", "2028-02-29", "2028-02-28"],
  ])("at %s", (instant, today, yesterday, dayBefore) => {
    expect(datesAt(instant)).toEqual([today, today, today, yesterday, yesterday, dayBefore]);
  });

  it("follows the user's timezone, whatever the instant is in UTC", () => {
    expect(datesAt("2026-10-31T18:30:00Z", "Asia/Kolkata")[0]).toBe("2026-11-01");
    expect(datesAt("2026-10-31T18:30:00Z", "UTC")[0]).toBe("2026-10-31");
    expect(datesAt("2026-10-31T18:30:00Z", "America/New_York")[0]).toBe("2026-10-31");
  });
});
