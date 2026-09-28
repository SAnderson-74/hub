// Reading bank payees: who a payment-app transaction was with ("VENMO *JOHN SMITH" is
// John Smith), and a merchant's name without the noise banks add ("SQ *CORNER
// GROCERY 4412 SEATTLE WA" is Corner Grocery), so similar transactions group together.
// Pure, so imports, the server, and the browser all read payees the same way.

export type PaymentApp = "Venmo" | "Zelle" | "Cash App" | "Apple Cash";

export type Person = {
  app: PaymentApp;
  name: string;
  /** Paid to them (money out) or from them (money in). */
  direction: "to" | "from";
};

const APPS: ReadonlyArray<{ app: PaymentApp; pattern: RegExp }> = [
  { app: "Venmo", pattern: /\bvenmo\b/i },
  { app: "Zelle", pattern: /\bzelle\b/i },
  { app: "Cash App", pattern: /\bcash\s?app\b/i },
  { app: "Apple Cash", pattern: /\bapple\s?cash\b/i },
];

/** Words banks put between the app's name and the person's. */
const FILLER = new Set([
  "payment",
  "pmt",
  "p2p",
  "transfer",
  "xfer",
  "sent",
  "send",
  "received",
  "receive",
  "request",
  "money",
  "debit",
  "credit",
  "purchase",
  "inst",
  "instant",
  "web",
  "ach",
  "by",
  "for",
]);

/** Words that end a name, or mean there isn't one ("VENMO CASHOUT"). */
const NOT_A_NAME = new Set([
  "on",
  "conf",
  "confirmation",
  "ref",
  "reference",
  "id",
  "web",
  "ppd",
  "ccd",
  "trace",
  "memo",
  "transaction",
  "trn",
  "via",
  "at",
  "for",
  "cashout",
  "cash",
  "out",
  "bank",
  "account",
  "acct",
  "instant",
  "standard",
  "deposit",
  "withdrawal",
  "fee",
  "fees",
  "inc",
  "llc",
  "add",
  "funds",
  "transfer",
  "payment",
  "refund",
  "balance",
  "card",
]);

const NAME_WORD = /^[a-z][a-z'.-]*$/i;

/** "JOHN SMITH" or "john o'brien-lee" as "John Smith", "John O'Brien-Lee". Mixed case is kept. */
export function nameCase(name: string): string {
  if (name !== name.toUpperCase() && name !== name.toLowerCase()) return name;
  return name
    .toLowerCase()
    .replace(
      /(^|[\s'-])([a-z])/g,
      (_, before: string, letter: string) => before + letter.toUpperCase(),
    );
}

/** Up to four name-like words from the start of `text`, or null. */
function leadingName(text: string): string | null {
  // A star, bar, or semicolon ends the name: "CASH APP*JANE DOE*SAN FRANCISCO CA".
  const [first = ""] = text.split(/[*|;#]/);
  const words: string[] = [];
  for (const word of first.trim().split(/\s+/)) {
    const clean = word.replace(/[,:.]+$/, "");
    if (!NAME_WORD.test(clean) || NOT_A_NAME.has(clean.toLowerCase())) break;
    words.push(clean);
    if (words.length === 4) break;
  }
  const name = words.join(" ");
  return name.replace(/[^a-z]/gi, "").length >= 2 ? name : null;
}

/** After the app's name: skip separators and filler words, noting "to" or "from". */
function afterApp(text: string): { rest: string; direction: "to" | "from" | null } {
  let rest = text;
  let direction: "to" | "from" | null = null;
  for (;;) {
    const trimmed = rest.replace(/^[\s*:\-–—/|,.]+/, "");
    const word = /^([a-z0-9]+)\b/i.exec(trimmed)?.[1]?.toLowerCase();
    if (word === "to" || word === "from") {
      direction = word;
    } else if (!word || !FILLER.has(word)) {
      return { rest: trimmed, direction };
    }
    rest = trimmed.slice(word.length);
  }
}

/**
 * Who a payment-app transaction was with, from the bank's payee (or, failing that,
 * its memo), or null when it isn't one or doesn't say. The direction comes from the
 * text when it says "to" or "from", and otherwise from the amount's sign.
 */
export function findPerson(payee: string, memo: string, amountCents: number): Person | null {
  const found = APPS.map(({ app, pattern }) => ({ app, match: pattern.exec(payee) })).find(
    (entry) => entry.match !== null,
  );
  if (!found?.match) return null;
  const bySign = amountCents < 0 ? "to" : "from";
  const after = payee.slice(found.match.index + found.match[0].length);

  // "Zelle payment to John Smith Conf# 1a2b" or "VENMO *JOHN SMITH".
  const said = /\b(to|from)\s+([a-z][^*|;#]*)/i.exec(after);
  const saidName = said?.[2] ? leadingName(said[2]) : null;
  if (said && saidName) {
    return {
      app: found.app,
      name: nameCase(saidName),
      direction: said[1]?.toLowerCase() as "to" | "from",
    };
  }
  const { rest, direction } = afterApp(after);
  const name = leadingName(rest);
  if (name) return { app: found.app, name: nameCase(name), direction: direction ?? bySign };

  // Some banks put the person in the memo: "Payment to John Smith", or just "JOHN SMITH".
  const inMemo = /\b(to|from)\s+([a-z][^*|;#]*)/i.exec(memo);
  const memoName = inMemo?.[2] ? leadingName(inMemo[2]) : null;
  if (inMemo && memoName) {
    return {
      app: found.app,
      name: nameCase(memoName),
      direction: inMemo[1]?.toLowerCase() as "to" | "from",
    };
  }
  const bare = memo.trim();
  if (bare && bare === bare.toUpperCase() && leadingName(bare) === bare) {
    return { app: found.app, name: nameCase(bare), direction: bySign };
  }
  return null;
}

/** "Venmo to John Smith" */
export const personNote = (person: Person) => `${person.app} ${person.direction} ${person.name}`;

/**
 * The memo with who it was with in front, unless it already says: an empty memo, or
 * one that's just the name, becomes the note; anything else follows it.
 */
export function memoWithPerson(memo: string, person: Person): string {
  const note = personNote(person);
  const trimmed = memo.trim();
  const lower = trimmed.toLowerCase();
  if (trimmed === "" || lower === person.name.toLowerCase()) return note;
  if (lower.includes(note.toLowerCase())) return memo;
  return `${note} · ${trimmed}`;
}

// Merchants

/** Card processors that put their name before the merchant's: "SQ *", "TST*". */
const PROCESSORS = new Set([
  "sq",
  "sqc",
  "tst",
  "sp",
  "pp",
  "py",
  "ic",
  "dd",
  "ck",
  "paypal",
  "pypl",
  "in",
  "apl",
  "goo",
  "bp",
  "fs",
  "wm",
  "par",
  "cke",
  "lvl",
  "pos",
]);

/** What banks put before the merchant. Longest first, since the first that fits is removed. */
const BANK_PREFIXES = [
  /^purchase authorized on \d{1,2}\/\d{1,2}\s*/,
  /^recurring (?:payment|purchase|debit)\s*/,
  /^(?:debit|check ?card|visa|mc|pos|card) (?:card )?(?:purchase|payment|debit|withdrawal)\s*/,
  /^(?:ach|electronic|online|preauthorized|pre-authorized) (?:debit|credit|payment|withdrawal|transfer)\s*/,
  /^point of sale\s*/,
  /^(?:purchase|pos|checkcard|debit)\s+/,
];

const NOISE_WORDS = new Set([
  "inc",
  "llc",
  "ltd",
  "co",
  "corp",
  "store",
  "stores",
  "the",
  "us",
  "usa",
  "www",
  "online",
  "purchase",
  "debit",
  "credit",
  "card",
  "pos",
  "ach",
  "recurring",
  "autopay",
  "ppd",
  "ccd",
  "id",
  "web",
  "com",
  "net",
  "org",
]);

const STATES = new Set(
  "al ak az ar ca co ct de dc fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy".split(
    " ",
  ),
);

/** First words of two-word city names: "LOS GATOS CA". */
const CITY_STARTS = new Set([
  "los",
  "san",
  "santa",
  "new",
  "st",
  "saint",
  "fort",
  "ft",
  "las",
  "el",
  "la",
  "palm",
  "west",
  "east",
  "north",
  "south",
  "salt",
  "grand",
  "long",
  "palo",
  "mountain",
  "redwood",
  "menlo",
  "daly",
  "overland",
]);

/** The merchant's words, lowercase, without processors, numbers, or where it was. */
export function merchantWords(payee: string): string[] {
  let text = payee.toLowerCase().replace(/&amp;/g, "&").trim();
  for (const prefix of BANK_PREFIXES) text = text.replace(prefix, "");

  // "SQ *CORNER GROCERY": the merchant follows the processor. "AMAZON.COM*2K3L": the
  // merchant comes first and an order number follows.
  const star = text.indexOf("*");
  if (star !== -1) {
    const before = text.slice(0, star).trim();
    text = PROCESSORS.has(before) ? text.slice(star + 1) : before || text.slice(star + 1);
  }
  text = text
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, " ") // phone numbers
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ") // dates
    .replace(/#\S*/g, " ")
    .replace(/\.(?:com|net|org|co|io)\b/g, " ")
    .replace(/'/g, "")
    .replace(/[^a-z0-9&]+/g, " ");

  const words = text
    .split(" ")
    .filter((word) => word.length > 1 && !/\d/.test(word) && !NOISE_WORDS.has(word));
  // "… SEATTLE WA": drop the state, the city before it, and a city's first word.
  if (words.length >= 2 && STATES.has(words.at(-1) ?? "")) {
    words.pop();
    if (words.length >= 2) words.pop();
    if (words.length >= 2 && CITY_STARTS.has(words.at(-1) ?? "")) words.pop();
  }
  return words;
}

const titleCase = (words: readonly string[]) =>
  words
    .map((word) => (word === "&" ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");

export type PayeeGroup = {
  /** Same key, same group: "merchant:corner grocery", "person:venmo:john smith". */
  key: string;
  /** "Corner Grocery", "Venmo: John Smith". */
  name: string;
  /** Text a rule could look for in the payee to find more like it. */
  ruleText: string;
};

/** Which group a transaction belongs in, for sorting similar ones together. */
export function payeeGroup(transaction: {
  payee: string;
  memo: string;
  amountCents: number;
  counterparty?: string | null;
}): PayeeGroup {
  const person = findPerson(transaction.payee, transaction.memo, transaction.amountCents);
  const name = transaction.counterparty?.trim() || person?.name;
  if (person || transaction.counterparty) {
    const app = person?.app ?? APPS.find(({ pattern }) => pattern.test(transaction.payee))?.app;
    if (name) {
      return {
        key: `person:${(app ?? "").toLowerCase()}:${name.toLowerCase()}`,
        name: app ? `${app}: ${name}` : name,
        ruleText: name,
      };
    }
  }
  const words = merchantWords(transaction.payee);
  if (words.length === 0) {
    const raw = transaction.payee.trim();
    return { key: `payee:${raw.toLowerCase()}`, name: raw || "No payee", ruleText: raw };
  }
  const shown = words.slice(0, 4);
  return {
    key: `merchant:${words.slice(0, 2).join(" ")}`,
    name: titleCase(shown),
    ruleText: words.slice(0, 2).join(" "),
  };
}
