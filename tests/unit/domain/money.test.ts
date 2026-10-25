import {
  MAX_AMOUNT_PAISE,
  MoneyError,
  addPaise,
  divRound,
  formatBasisPoints,
  formatINR,
  formatINRCompact,
  formatMoney,
  groupIndian,
  paiseToDecimalString,
  parseAmountInput,
  ratioBasisPoints,
  rupees,
  sumPaise,
} from "@/domain";

const parsed = (input: string) => {
  const r = parseAmountInput(input);
  return r.ok ? r.paise : r.error;
};

describe("parseAmountInput", () => {
  it.each([
    ["15", 1500],
    ["₹40", 4000],
    ["₹ 40", 4000],
    ["12.50", 1250],
    ["12.5", 1250],
    ["0.01", 1],
    [".5", 50],
    ["7.", 700],
    ["Rs 40", 4000],
    ["rs.40", 4000],
    ["INR 1,25,000", 12_500_000],
    ["125,000.75", 12_500_075],
    ["40/-", 4000],
    ["  ₹1,00,000.00  ", 10_000_000],
    ["007", 700],
    ["１５", 1500], // full-width digits from some mobile keyboards
  ])("parses %j → %i paise", (input, expected) => {
    expect(parsed(input)).toBe(expected);
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["₹", "empty"],
    ["abc", "invalid"],
    ["12.3.4", "invalid"],
    ["1e3", "invalid"],
    ["1,2,3", "invalid"],
    ["12,34", "invalid"],
    [".", "invalid"],
    ["0x10", "invalid"],
    ["12.345", "too_many_decimals"],
    ["0.005", "too_many_decimals"],
    ["-5", "negative"],
    ["−₹5", "negative"],
    ["₹-5", "negative"],
    ["0", "zero"],
    ["0.00", "zero"],
    ["10000000000", "too_large"],
    ["99999999999999999999", "too_large"],
  ])("rejects %j as %s", (input, error) => {
    expect(parsed(input)).toBe(error);
  });

  it("accepts the maximum and allows zero only when asked", () => {
    expect(parsed("9,99,99,99,999.99")).toBe(MAX_AMOUNT_PAISE);
    expect(parseAmountInput("0", { allowZero: true })).toEqual({ ok: true, paise: 0 });
  });

  it("returns a human message with every error", () => {
    const r = parseAmountInput("12.345");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/2 decimal/);
  });

  it("is exact where float parsing is not (0.1 + 0.2 style inputs)", () => {
    expect(addPaise(parsed("0.10") as number, parsed("0.20") as number)).toBe(30);
    expect(parsed("1.15")).toBe(115); // parseFloat("1.15") * 100 = 114.99999999999999
    expect(parsed("4.35")).toBe(435);
  });
});

describe("formatINR", () => {
  it.each([
    [0, "₹0"],
    [1, "₹0.01"],
    [99, "₹0.99"],
    [1500, "₹15"],
    [1250, "₹12.50"],
    [100_000, "₹1,000"],
    [12_500_000, "₹1,25,000"],
    [10_000_000_000, "₹10,00,00,000"],
    [9_999_999_999, "₹9,99,99,999.99"],
    [MAX_AMOUNT_PAISE, "₹9,99,99,99,999.99"],
    [-4000, "−₹40"],
    [-1, "−₹0.01"],
  ])("formats %i paise as %s", (paise, text) => {
    expect(formatINR(paise)).toBe(text);
  });

  it("supports always/never paise and explicit signs", () => {
    expect(formatINR(1500, { paise: "always" })).toBe("₹15.00");
    expect(formatINR(1250, { paise: "never" })).toBe("₹13"); // half-up
    expect(formatINR(1249, { paise: "never" })).toBe("₹12");
    expect(formatINR(-1250, { paise: "never" })).toBe("−₹13");
    expect(formatINR(-49, { paise: "never" })).toBe("₹0"); // no "−₹0"
    expect(formatINR(1500, { sign: "always" })).toBe("+₹15");
    expect(formatINR(0, { sign: "always" })).toBe("₹0");
  });

  it("groups other currencies the western way", () => {
    expect(formatMoney(12_500_000, { currency: "USD" })).toBe("$125,000");
    expect(formatMoney(12_500_050, { currency: "EUR" })).toBe("€125,000.50");
  });

  it("refuses non-integer paise instead of formatting a float", () => {
    expect(() => formatINR(10.5)).toThrow(MoneyError);
    expect(() => formatINR(Number.NaN)).toThrow(MoneyError);
  });

  it("groups digit strings the Indian way", () => {
    expect(groupIndian("1")).toBe("1");
    expect(groupIndian("999")).toBe("999");
    expect(groupIndian("1000")).toBe("1,000");
    expect(groupIndian("100000")).toBe("1,00,000");
    expect(groupIndian("1234567")).toBe("12,34,567");
  });
});

describe("formatINRCompact", () => {
  it.each([
    [95_000, "₹950"],
    [120_000, "₹1.2K"],
    [129_900, "₹1.2K"], // truncates, never rounds up
    [1_250_000, "₹12.5K"],
    [12_500_000, "₹1.25L"],
    [9_999_999, "₹99.9K"],
    [340_000_000, "₹34L"],
    [3_400_000_000, "₹3.4Cr"],
    [-120_000, "−₹1.2K"],
  ])("%i → %s", (paise, text) => {
    expect(formatINRCompact(paise)).toBe(text);
  });
});

describe("arithmetic", () => {
  it("divides exactly with explicit rounding", () => {
    expect(divRound(10, 3)).toBe(3);
    expect(divRound(5, 2)).toBe(3);
    expect(divRound(-5, 2)).toBe(-3);
    expect(divRound(10, 3, "ceil")).toBe(4);
    expect(divRound(10, 3, "floor")).toBe(3);
    expect(divRound(-10, 3, "floor")).toBe(-4);
    expect(divRound(-10, 3, "ceil")).toBe(-3);
    expect(divRound(9, -2)).toBe(-5);
    expect(() => divRound(1, 0)).toThrow(MoneyError);
    expect(() => divRound(1.5, 1)).toThrow(MoneyError);
  });

  it("computes shares in basis points and formats them", () => {
    expect(ratioBasisPoints(1, 3)).toBe(3333);
    expect(ratioBasisPoints(2, 3)).toBe(6667);
    expect(ratioBasisPoints(5, 0)).toBeNull();
    expect(formatBasisPoints(3333)).toBe("33.3%");
    expect(formatBasisPoints(10_000)).toBe("100%");
    expect(formatBasisPoints(1250, 2)).toBe("12.5%");
    expect(formatBasisPoints(-505)).toBe("−5.1%");
    expect(formatBasisPoints(4, 0)).toBe("0%");
  });

  it("sums without drift and detects overflow", () => {
    expect(sumPaise(Array.from({ length: 1000 }, () => 10))).toBe(10_000);
    expect(() => addPaise(Number.MAX_SAFE_INTEGER, 1)).toThrow(MoneyError);
    expect(rupees(40)).toBe(4000);
  });

  it("writes CSV decimals without symbols or grouping", () => {
    expect(paiseToDecimalString(12_550)).toBe("125.50");
    expect(paiseToDecimalString(5)).toBe("0.05");
    expect(paiseToDecimalString(-5)).toBe("-0.05");
    expect(paiseToDecimalString(12_500_000)).toBe("125000.00");
  });
});
