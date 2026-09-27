// Plain-language lessons on US federal taxes for a small resale business. General
// education, not tax advice. Every lesson names its sources and when it was last
// checked against them; update `reviewedOn` whenever a lesson is re-checked.

export type TaxSource = { title: string; url: string };

export type TaxBlock = { kind: "text"; text: string } | { kind: "list"; items: string[] };

export type TaxLesson = {
  id: string;
  title: string;
  /** One sentence, shown before the lesson is opened. */
  summary: string;
  body: TaxBlock[];
  sources: TaxSource[];
  /** When the lesson was last checked against its sources (YYYY-MM-DD). */
  reviewedOn: string;
};

const REVIEWED = "2026-09-27";

export const TAX_LESSONS: TaxLesson[] = [
  {
    id: "hobby-or-business",
    title: "Hobby or business?",
    summary: "Whether you sell to make a profit decides how resale money is taxed.",
    body: [
      {
        kind: "text",
        text: "The IRS treats an activity as a business when you do it to make a profit, and as a hobby when you do it for enjoyment without intending to profit. No single factor decides it. The IRS looks at things like whether you:",
      },
      {
        kind: "list",
        items: [
          "Run it in a businesslike way, with complete and accurate books and records.",
          "Put in the time and effort it takes to make it profitable.",
          "Depend on the income from it.",
          "Have losses because of things outside your control, or because you're just starting out.",
        ],
      },
      {
        kind: "text",
        text: "Hobby income still has to be reported, but hobby expenses can't be deducted, and a hobby loss can't offset other income. A business reports its profit or loss on Schedule C and can deduct its ordinary and necessary expenses.",
      },
    ],
    sources: [
      {
        title: "Know the difference between a hobby and a business",
        url: "https://www.irs.gov/newsroom/know-the-difference-between-a-hobby-and-a-business",
      },
      {
        title: "Tips for taxpayers who make money from a hobby",
        url: "https://www.irs.gov/newsroom/tips-for-taxpayers-who-make-money-from-a-hobby",
      },
    ],
    reviewedOn: REVIEWED,
  },
  {
    id: "personal-items",
    title: "Selling your own things",
    summary: "Selling personal belongings for less than you paid isn't taxable, but a gain is.",
    body: [
      {
        kind: "text",
        text: "Selling something you owned for personal use, like old furniture or clothes, for less than you paid means no tax is owed on it. The loss can't be deducted either.",
      },
      {
        kind: "text",
        text: "Selling a personal item for more than you paid is a gain, and the gain is taxable.",
      },
      {
        kind: "text",
        text: "Hub tracks items bought to resell. Keep personal sales apart from them, and keep what you paid for personal items when you can. If a Form 1099-K includes personal items sold at a loss, the IRS explains how to show that on your return so you aren't taxed on them.",
      },
    ],
    sources: [
      {
        title: "What to do with Form 1099-K",
        url: "https://www.irs.gov/businesses/what-to-do-with-form-1099-k",
      },
      {
        title: "Form 1099-K FAQs: What to do if you receive a Form 1099-K",
        url: "https://www.irs.gov/newsroom/form-1099-k-faqs-what-to-do-if-you-receive-a-form-1099-k",
      },
    ],
    reviewedOn: REVIEWED,
  },
  {
    id: "form-1099-k",
    title: "Form 1099-K",
    summary:
      "Payment apps and marketplaces report sales over $20,000 and 200 payments a year, but all income counts.",
    body: [
      {
        kind: "text",
        text: "Payment apps and online marketplaces send you and the IRS a Form 1099-K when, in one calendar year, your payments for goods or services total more than $20,000 and there are more than 200 of them. The One, Big, Beautiful Bill brought back this limit, replacing lower ones planned earlier.",
      },
      {
        kind: "text",
        text: "Payments you take by credit or debit card directly are reported on a Form 1099-K for any amount.",
      },
      {
        kind: "text",
        text: "The form changes what gets reported, not what's taxable. All income has to be reported, whether or not a form arrives.",
      },
      {
        kind: "text",
        text: "A Form 1099-K shows gross payments. What you paid for the items, fees, and shipping come off on your return, which is why Hub keeps them.",
      },
    ],
    sources: [
      {
        title: "IRS FAQs on the Form 1099-K threshold under the One, Big, Beautiful Bill",
        url: "https://www.irs.gov/newsroom/irs-issues-faqs-on-form-1099-k-threshold-under-the-one-big-beautiful-bill-dollar-limit-reverts-to-20000",
      },
      {
        title: "Understanding your Form 1099-K",
        url: "https://www.irs.gov/businesses/understanding-your-form-1099-k",
      },
    ],
    reviewedOn: REVIEWED,
  },
  {
    id: "schedule-c",
    title: "Profit on Schedule C",
    summary: "Business profit is sales, minus what the items sold cost you, minus other expenses.",
    body: [
      {
        kind: "text",
        text: "A sole proprietor reports a resale business on Schedule C (Form 1040): gross receipts from sales, minus the cost of goods sold, minus other business expenses.",
      },
      {
        kind: "text",
        text: "Cost of goods sold counts what you paid for the items you sold that year, not everything you bought. Items still on hand at the end of the year are inventory, and their cost counts when they sell.",
      },
      {
        kind: "text",
        text: "Hub's resale summary follows that pattern: each sold item's price, plus the fees, shipping, parts, and supplies recorded on it. Expenses that aren't tied to an item, like mileage, aren't in the summary, so keep records of those too.",
      },
    ],
    sources: [
      {
        title: "Instructions for Schedule C (Form 1040)",
        url: "https://www.irs.gov/instructions/i1040sc",
      },
      {
        title: "Publication 334, Tax Guide for Small Business",
        url: "https://www.irs.gov/publications/p334",
      },
    ],
    reviewedOn: REVIEWED,
  },
  {
    id: "self-employment-tax",
    title: "Self-employment tax",
    summary:
      "Business profit also owes Social Security and Medicare tax, 15.3%, once it reaches $400.",
    body: [
      {
        kind: "text",
        text: "Self-employed people pay their own Social Security and Medicare tax: 15.3% (12.4% for Social Security and 2.9% for Medicare) on 92.35% of net earnings from self-employment. It usually applies once those net earnings are $400 or more, and it's on top of income tax.",
      },
      {
        kind: "text",
        text: "Social Security tax stops at a yearly limit on wages and self-employment earnings combined: $176,100 for 2025 and $184,500 for 2026.",
      },
      {
        kind: "text",
        text: "Half of self-employment tax is deducted when figuring adjusted gross income, which lowers income tax. The tax itself is figured on Schedule SE.",
      },
    ],
    sources: [
      {
        title: "Topic no. 554, Self-employment tax",
        url: "https://www.irs.gov/taxtopics/tc554",
      },
      {
        title: "Self-employment tax (Social Security and Medicare taxes)",
        url: "https://www.irs.gov/businesses/small-businesses-self-employed/self-employment-tax-social-security-and-medicare-taxes",
      },
      {
        title: "Social Security contribution and benefit base",
        url: "https://www.ssa.gov/oact/cola/cbb.html",
      },
    ],
    reviewedOn: REVIEWED,
  },
  {
    id: "estimated-tax",
    title: "Estimated tax payments",
    summary: "Nothing is withheld from resale profit, so you may need to pay during the year.",
    body: [
      {
        kind: "text",
        text: "Tax is due as income is earned. With no withholding on resale profit, you generally have to make estimated payments if you expect to owe at least $1,000 when you file, after withholding and refundable credits.",
      },
      {
        kind: "text",
        text: "That's not needed when withholding and credits already cover the smaller of 90% of this year's tax or 100% of last year's. The second is 110% if last year's adjusted gross income was over $150,000 ($75,000 if married filing separately).",
      },
      {
        kind: "text",
        text: "For 2026, payments are due April 15, June 15, and September 15, 2026, and January 15, 2027. The January payment can be skipped by filing the 2026 return and paying what's due by February 1, 2027. A date that falls on a weekend or holiday moves to the next business day.",
      },
    ],
    sources: [
      {
        title: "About Form 1040-ES, Estimated Tax for Individuals",
        url: "https://www.irs.gov/forms-pubs/about-form-1040-es",
      },
      { title: "Estimated tax FAQs", url: "https://www.irs.gov/faqs/estimated-tax" },
      { title: "Publication 509, Tax Calendars", url: "https://www.irs.gov/publications/p509" },
    ],
    reviewedOn: REVIEWED,
  },
  {
    id: "records",
    title: "Keeping records",
    summary: "Keep records of what you paid and sold for at least three years after filing.",
    body: [
      {
        kind: "text",
        text: "Keep records that show income and expenses: what each item cost, what it sold for, and the fees and shipping. Hub keeps these for resale items; keep the receipts too.",
      },
      {
        kind: "list",
        items: [
          "Generally, three years after you file.",
          "Six years if income you left off was more than 25% of the gross income on the return.",
          "Seven years for a claim for a loss from worthless securities or a bad debt deduction.",
        ],
      },
      {
        kind: "text",
        text: "Before throwing records away, check whether a lender or insurer needs them longer.",
      },
    ],
    sources: [
      {
        title: "How long should I keep records?",
        url: "https://www.irs.gov/businesses/small-businesses-self-employed/how-long-should-i-keep-records",
      },
      { title: "Topic no. 305, Recordkeeping", url: "https://www.irs.gov/taxtopics/tc305" },
    ],
    reviewedOn: REVIEWED,
  },
];

/** Over a year since a lesson was checked: rules may have changed since. */
export function isStale(reviewedOn: string, today: string): boolean {
  const days =
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${reviewedOn}T00:00:00Z`)) / 86_400_000;
  return days > 365;
}
