import { describe, expect, it } from "vitest";
import {
  columnsReady,
  guessBankColumns,
  headerKey,
  isOfx,
  parseBankAmount,
  parseBankDate,
  readBankCsv,
  readOfx,
} from "./bankImport";
import { parseCsv } from "./csv";

const plain = { flipSigns: false, dayFirst: false };

describe("guessBankColumns", () => {
  it("finds a signed amount column, or money out and money in", () => {
    expect(guessBankColumns(["Date", "Description", "Amount", "Category"])).toEqual({
      date: 0,
      payee: 1,
      amount: 2,
      category: 3,
    });
    expect(guessBankColumns(["Posting Date", "Details", "Debit", "Credit", "Memo"])).toEqual({
      date: 0,
      payee: 1,
      outflow: 2,
      inflow: 3,
      memo: 4,
    });
  });

  it("says when the date and an amount are chosen", () => {
    expect(columnsReady({ date: 0, amount: 1 })).toBe(true);
    expect(columnsReady({ date: 0, inflow: 1 })).toBe(true);
    expect(columnsReady({ amount: 1 })).toBe(false);
    expect(columnsReady({ date: 0 })).toBe(false);
  });

  it("keys a layout by its headers, ignoring case and spaces around them", () => {
    expect(headerKey(["Date ", "AMOUNT"])).toBe(headerKey(["date", "Amount"]));
    expect(headerKey(["Date", "Amount"])).not.toBe(headerKey(["Amount", "Date"]));
  });
});

describe("parseBankDate", () => {
  it("reads ISO, US, day-first, month-name, and OFX dates", () => {
    expect(parseBankDate("2030-01-31")).toBe("2030-01-31");
    expect(parseBankDate("01/31/2030")).toBe("2030-01-31");
    expect(parseBankDate("31/01/2030", true)).toBe("2030-01-31");
    expect(parseBankDate("31.01.30", true)).toBe("2030-01-31");
    expect(parseBankDate("Jan 31, 2030")).toBe("2030-01-31");
    expect(parseBankDate("20300131")).toBe("2030-01-31");
    expect(parseBankDate("20300131120000.000[-5:EST]")).toBe("2030-01-31");
    expect(parseBankDate("203001311200")).toBe("2030-01-31");
  });

  it("rejects dates that don't exist or can't be read", () => {
    expect(parseBankDate("31/01/2030")).toBeNull();
    expect(parseBankDate("20300231")).toBeNull();
    expect(parseBankDate("yesterday")).toBeNull();
  });
});

describe("parseBankAmount", () => {
  it("reads signs the ways banks write them", () => {
    expect(parseBankAmount("-42.50")).toBe(-4_250);
    expect(parseBankAmount("+15")).toBe(1_500);
    expect(parseBankAmount("$1,234.56")).toBe(123_456);
    expect(parseBankAmount("-$1,234.56")).toBe(-123_456);
    expect(parseBankAmount("(42.50)")).toBe(-4_250);
    expect(parseBankAmount("42.50-")).toBe(-4_250);
    expect(parseBankAmount("USD 12")).toBe(1_200);
    expect(parseBankAmount(" 7.5 ")).toBe(750);
  });

  it("rejects anything else", () => {
    for (const text of ["", "abc", "1.234,56", "--5", "12.345", "(5"]) {
      expect(parseBankAmount(text)).toBeNull();
    }
  });
});

describe("readBankCsv", () => {
  it("reads a signed amount column, and flips signs when asked", () => {
    const table = parseCsv(
      "Date,Description,Amount,Category\n2030-01-05,Corner grocery,-42.50,Groceries\n2030-01-06,Example Employer,1500,\n",
    );
    const columns = guessBankColumns(table[0] ?? []);
    expect(readBankCsv(table, columns, plain)).toEqual({
      transactions: [
        {
          date: "2030-01-05",
          amountCents: -4_250,
          payee: "Corner grocery",
          memo: "",
          category: "Groceries",
        },
        { date: "2030-01-06", amountCents: 150_000, payee: "Example Employer", memo: "" },
      ],
      problems: [],
    });
    const flipped = readBankCsv(table, columns, { flipSigns: true, dayFirst: false });
    expect(flipped.transactions.map((row) => row.amountCents)).toEqual([4_250, -150_000]);
  });

  it("combines money out and money in columns", () => {
    const table = parseCsv(
      'Date,Details,Debit,Credit\n01/05/2030,Coffee,4.25,\n01/06/2030,Refund,,"1,000.00"\n',
    );
    const read = readBankCsv(table, guessBankColumns(table[0] ?? []), plain);
    expect(read.transactions.map((row) => [row.payee, row.amountCents])).toEqual([
      ["Coffee", -425],
      ["Refund", 100_000],
    ]);
  });

  it("reports rows it can't read, numbered as in the file", () => {
    const table = parseCsv(
      "Date,Payee,Amount\nsoon,A,1\n2030-01-02,B,lots\n2030-01-03,C,0\n,D,5\n2030-01-04,E,-1\n",
    );
    const read = readBankCsv(table, guessBankColumns(table[0] ?? []), plain);
    expect(read.transactions.map((row) => row.payee)).toEqual(["E"]);
    expect(read.problems).toEqual([
      { row: 1, message: 'The date "soon" isn\'t one Hub can read.' },
      { row: 2, message: 'The amount "lots" isn\'t one Hub can read.' },
      { row: 3, message: "The amount is $0." },
      { row: 4, message: "No date." },
    ]);
  });
});

const OFX1 = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>000000000<ACCTID>0000000000<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20300101<DTEND>20300131
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20300105120000.000[-5:EST]
<TRNAMT>-42.50
<FITID>2030010501
<NAME>CORNER GROCERY &amp; DELI
<MEMO>Card purchase
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20300106
<TRNAMT>1500.00
<FITID>2030010602
<MEMO>PAYROLL DEPOSIT
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>2030
<TRNAMT>-1.00
<FITID>bad
</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

const OFX2 = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="220"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20300107</DTPOSTED><TRNAMT>-9,99</TRNAMT><FITID>X-1</FITID><NAME>Streaming service</NAME></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("readOfx", () => {
  it("reads OFX 1 statements with the bank's ids, skipping unreadable ones", () => {
    expect(isOfx(OFX1)).toBe(true);
    expect(readOfx(OFX1)).toEqual({
      transactions: [
        {
          date: "2030-01-05",
          amountCents: -4_250,
          payee: "CORNER GROCERY & DELI",
          memo: "Card purchase",
          externalId: "2030010501",
        },
        {
          date: "2030-01-06",
          amountCents: 150_000,
          payee: "PAYROLL DEPOSIT",
          memo: "",
          externalId: "2030010602",
        },
      ],
      problems: [{ row: 3, message: 'The date "2030" isn\'t one Hub can read.' }],
    });
  });

  it("reads OFX 2 (XML) statements", () => {
    expect(isOfx(OFX2)).toBe(true);
    expect(readOfx(OFX2).transactions).toEqual([
      {
        date: "2030-01-07",
        amountCents: -999,
        payee: "Streaming service",
        memo: "",
        externalId: "X-1",
      },
    ]);
  });

  it("isn't fooled by a CSV", () => {
    expect(isOfx("Date,Amount\n2030-01-01,5")).toBe(false);
    expect(readOfx("Date,Amount\n2030-01-01,5").transactions).toEqual([]);
  });
});
