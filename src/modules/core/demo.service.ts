import { eq } from "drizzle-orm";
import type { HTTPException } from "hono/http-exception";
import type { Db, Queryable } from "../../server/db/client";
import { log } from "../../server/log";
import { accountCreateSchema, bookCreateSchema, transactionCreateSchema } from "../../shared/books";
import {
  gearCreateSchema,
  leadCreateSchema,
  noteCreateSchema,
  phaseCreateSchema,
  skillCreateSchema,
  stepCreateSchema,
} from "../../shared/business";
import {
  assessmentCreateSchema,
  courseCreateSchema,
  termCreateSchema,
} from "../../shared/education";
import { goalCreateSchema, milestoneCreateSchema } from "../../shared/goals";
import { addDays } from "../../shared/recurrence";
import { itemCreateSchema, platformCreateSchema } from "../../shared/resale";
import { projectCreateSchema, taskCreateSchema } from "../../shared/tasks";
import {
  createGear,
  createLead,
  createNote,
  createPhase,
  createSkill,
  createStep,
  deleteGear,
  deleteLead,
  deleteNote,
  deletePhase,
  deleteSkill,
  deleteStep,
} from "../business/business.service";
import {
  createAssessment,
  createCourse,
  createTerm,
  deleteTerm,
  listTerms,
} from "../education/education.service";
import { createGoal, createMilestone, deleteGoal } from "../goals/goals.service";
import { setBudget } from "../money/budget.service";
import { createCard, deleteCard } from "../money/cards.service";
import {
  createAccount,
  createBook,
  createTransaction,
  deleteAccount,
  deleteBook,
  deleteTransaction,
  listCategories,
} from "../money/money.service";
import { saveRewards } from "../money/rewards.service";
import { createTransfer } from "../money/transfers.service";
import { createItem, createPlatform, deleteItem, deletePlatform } from "../resale/resale.service";
import { createProject, deleteProject } from "../tasks/projects.service";
import { createTask, deleteTask } from "../tasks/tasks.service";
import { createEntry, deleteEntry } from "../time/time.service";
import { settings } from "./schema";

// Example data with neutral names, for trying Hub out and for screenshots. Dates are
// relative to today, so it always looks current. Everything made is recorded, so
// "Remove example data" takes away exactly that and nothing added since.

/** Kept apart from the settings the browser reads and writes. */
const DEMO_KEY = "demoData";

const DEMO_KINDS = [
  "project",
  "task",
  "goal",
  "term",
  "time_entry",
  "platform",
  "resale_item",
  "book",
  "account",
  "card",
  "transaction",
  "phase",
  "step",
  "gear",
  "skill",
  "lead",
  "note",
] as const;
type DemoKind = (typeof DEMO_KINDS)[number];
type DemoRef = { kind: DemoKind; id: number };

function readRefs(db: Queryable): DemoRef[] {
  const row = db.select().from(settings).where(eq(settings.key, DEMO_KEY)).get();
  return Array.isArray(row?.value) ? (row.value as DemoRef[]) : [];
}

function writeRefs(db: Db, refs: DemoRef[]) {
  const now = new Date();
  if (refs.length === 0) {
    db.delete(settings).where(eq(settings.key, DEMO_KEY)).run();
    return;
  }
  db.insert(settings)
    .values({ key: DEMO_KEY, value: refs, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value: refs, updatedAt: now } })
    .run();
}

/** Whether example data is in place. */
export function hasDemoData(db: Queryable): boolean {
  return readRefs(db).length > 0;
}

/** Adds the example data. `today` is in Hub's time zone. */
export function seedDemo(db: Db, actor: string, today: string, now = new Date()): void {
  const refs: DemoRef[] = [];
  const note = <T extends { id: number }>(kind: DemoKind, made: T): T => {
    refs.push({ kind, id: made.id });
    return made;
  };
  const day = (offset: number) => addDays(today, offset);
  /** The first of the month `offset` months from this one. */
  const monthStart = (offset: number) => {
    const [year = 0, month = 1] = today.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
  };

  // Recorded even if something fails partway, so whatever was made can be removed.
  try {
    // Tasks
    const home = note(
      "project",
      createProject(db, projectCreateSchema.parse({ name: "Home" }), actor),
    );
    const side = note(
      "project",
      createProject(db, projectCreateSchema.parse({ name: "Side business" }), actor),
    );
    const tasks: Array<[string, Record<string, unknown>]> = [
      [
        "Replace the smoke detector batteries",
        { projectId: home.id, dueDate: day(0), priority: 2 },
      ],
      ["Book a dentist visit", { projectId: home.id, dueDate: day(3) }],
      ["Sort the garage", { projectId: home.id, status: "doing" }],
      ["Renew the car registration", { projectId: home.id, dueDate: day(12), priority: 1 }],
      ["Pay the phone bill", { projectId: home.id, dueDate: day(-1), status: "done" }],
      ["Draft the price list", { projectId: side.id, dueDate: day(5), priority: 1 }],
      ["Water the plants", { dueDate: day(-1) }],
    ];
    const madeTasks = tasks.map(([title, fields]) =>
      note("task", createTask(db, taskCreateSchema.parse({ title, ...fields }), actor)),
    );

    // Goals
    const fund = note(
      "goal",
      createGoal(
        db,
        goalCreateSchema.parse({
          title: "Emergency fund",
          targetDate: day(180),
          progressMode: "amount",
          targetCents: 300_000,
          currentCents: 85_000,
        }),
        actor,
      ),
    );
    createMilestone(
      db,
      fund.id,
      milestoneCreateSchema.parse({ title: "First $1,000", targetDate: day(30) }),
      actor,
    );
    const run = note(
      "goal",
      createGoal(db, goalCreateSchema.parse({ title: "Run a 10K", targetDate: day(90) }), actor),
    );
    createMilestone(
      db,
      run.id,
      milestoneCreateSchema.parse({ title: "Run 5K without stopping", targetDate: day(21) }),
      actor,
    );

    // Courses
    const termName = "Example term";
    const term = createTerm(
      db,
      termCreateSchema.parse({
        name: termName,
        startDate: day(-30),
        endDate: day(90),
        creditGoal: 6,
      }),
    ).find((entry) => entry.name === termName);
    if (!term) throw new Error("Expected the example term");
    note("term", term);
    for (const [code, title, status, plannedStart, plannedEnd] of [
      ["ABC101", "Introduction to Networks", "in_progress", day(-30), day(35)],
      ["ABC102", "Database Basics", "not_started", day(30), day(90)],
    ] as const) {
      createCourse(
        db,
        courseCreateSchema.parse({
          termId: term.id,
          code,
          title,
          credits: 3,
          status,
          plannedStart,
          plannedEnd,
        }),
        actor,
        today,
      );
    }
    const courses = listTerms(db).find((entry) => entry.id === term.id)?.courses ?? [];
    const networks = courses.find((course) => course.code === "ABC101");
    if (networks) {
      for (const label of ["Quiz 1", "Lab report", "Final project"]) {
        createAssessment(db, networks.id, assessmentCreateSchema.parse({ label }), actor);
      }
      // A few days of study, so the streak has something to show.
      for (const [offset, minutes] of [
        [-3, 40],
        [-2, 35],
        [-1, 50],
      ] as const) {
        const start = new Date(now.getTime() + offset * 86_400_000);
        start.setUTCHours(17, 0, 0, 0);
        note(
          "time_entry",
          createEntry(
            db,
            {
              startedAt: start,
              endedAt: new Date(start.getTime() + minutes * 60_000),
              note: "Reading and practice",
              subject: { type: "course", id: networks.id },
            },
            now,
          ),
        );
      }
    }
    const garage = madeTasks[2];
    if (garage) {
      const start = new Date(now.getTime() - 26 * 3_600_000);
      note(
        "time_entry",
        createEntry(
          db,
          {
            startedAt: start,
            endedAt: new Date(start.getTime() + 45 * 60_000),
            subject: { type: "task", id: garage.id },
          },
          now,
        ),
      );
    }

    // Resale
    const platforms = createPlatform(db, platformCreateSchema.parse({ name: "Local classifieds" }));
    const platform = platforms.find((entry) => entry.name === "Local classifieds");
    if (platform) note("platform", platform);
    const items: Array<Record<string, unknown>> = [
      {
        title: "Road bike",
        status: "listed",
        category: "Bikes",
        purchasedOn: day(-20),
        purchaseCents: 12_000,
        purchasePlatformId: platform?.id ?? null,
      },
      {
        title: "Desk lamp, brass",
        status: "sold",
        category: "Home",
        purchasedOn: day(-40),
        purchaseCents: 800,
        soldOn: day(-10),
        saleCents: 3_500,
        salePlatformId: platform?.id ?? null,
      },
      {
        title: "Film camera",
        status: "acquired",
        category: "Cameras",
        purchasedOn: day(-5),
        purchaseCents: 2_500,
      },
    ];
    for (const item of items) {
      note("resale_item", createItem(db, itemCreateSchema.parse(item), actor, today));
    }

    // Money
    const book = note(
      "book",
      createBook(
        db,
        bookCreateSchema.parse({ name: "Example book", kind: "personal", starterCategories: true }),
      ),
    );
    const checking = note(
      "account",
      createAccount(
        db,
        accountCreateSchema.parse({
          bookId: book.id,
          name: "Everyday checking",
          kind: "checking",
          institution: "Example Bank",
          openingBalanceCents: 150_000,
        }),
      ),
    );
    const rewards = note(
      "account",
      createAccount(
        db,
        accountCreateSchema.parse({
          bookId: book.id,
          name: "Rewards card",
          kind: "credit_card",
          institution: "Example Bank",
        }),
      ),
    );
    const debitCard = note(
      "card",
      createCard(db, { accountId: checking.id, name: "Everyday debit", last4: "1234" }).card,
    );
    const rewardsCard = note(
      "card",
      createCard(db, { accountId: rewards.id, name: "Rewards card", last4: "4321" }).card,
    );
    const categoryId = new Map(
      listCategories(db, book.id).map((category) => [category.name, category.id]),
    );
    // 1% back, more on dining and groceries, and a store bonus. Removed with the card.
    saveRewards(db, rewardsCard.id, {
      kind: "cash_back",
      baseRate: 100,
      rates: [
        { contains: "StreamCo", rate: 500 },
        { categoryId: categoryId.get("Dining out") ?? null, rate: 300 },
        { categoryId: categoryId.get("Groceries") ?? null, rate: 200 },
      ],
    });
    // Six months of a typical month, by day of the month, up to today. Pay and rent
    // land on the 1st, so even early in a month the budget and cash flow have something.
    // Everyday spending goes on the rewards card, paid off from checking on the 28th.
    type PaidWith = "checking" | "debit" | "credit";
    const month: Array<[number, number, string, string, PaidWith]> = [
      [1, 420_000, "Example Employer payroll", "Paycheck", "checking"],
      [1, -145_000, "Example Property Management", "Housing", "checking"],
      [2, -8_640, "Corner Grocery", "Groceries", "credit"],
      [6, -4_210, "Pizza Place", "Dining out", "credit"],
      [9, -2_400, "Venmo to Jane Doe", "Dining out", "checking"],
      [11, -11_800, "City Power and Water", "Utilities", "checking"],
      [13, -1_599, "StreamCo", "Subscriptions", "credit"],
      [15, -9_315, "Corner Grocery", "Groceries", "credit"],
      [19, -6_400, "Corner Gas", "Transportation", "debit"],
      [23, -7_120, "Corner Grocery", "Groceries", "debit"],
      [27, -3_150, "Pizza Place", "Dining out", "credit"],
    ];
    const fixed = new Set(["Paycheck", "Housing", "Subscriptions"]);
    // Oldest month first; everyday spending moves a little from month to month.
    const swings = [1.06, 0.94, 1.1, 0.97, 1.03, 1];
    for (const [index, swing] of swings.entries()) {
      const start = monthStart(index - swings.length + 1);
      let charged = 0;
      for (const [dayOfMonth, cents, payee, category, paidWith] of month) {
        const date = addDays(start, dayOfMonth - 1);
        if (date > today) continue;
        const amountCents = fixed.has(category) ? cents : Math.round(cents * swing);
        if (paidWith === "credit") charged -= amountCents;
        note(
          "transaction",
          createTransaction(
            db,
            transactionCreateSchema.parse({
              accountId: paidWith === "credit" ? rewards.id : checking.id,
              date,
              amountCents,
              payee,
              categoryId: categoryId.get(category) ?? null,
              cardId:
                paidWith === "checking" ? null : paidWith === "debit" ? debitCard.id : undefined,
              ...(payee.startsWith("Venmo") ? { counterparty: "Jane Doe" } : {}),
            }),
          ),
        );
      }
      const payday = addDays(start, 27);
      if (charged > 0 && payday <= today) {
        note(
          "transaction",
          createTransfer(db, {
            fromAccountId: checking.id,
            toAccountId: rewards.id,
            date: payday,
            amountCents: charged,
          }).from,
        );
      }
    }
    // One store run that was partly groceries and partly household things.
    const groceries = categoryId.get("Groceries");
    const shopping = categoryId.get("Shopping");
    if (groceries && shopping) {
      note(
        "transaction",
        createTransaction(
          db,
          transactionCreateSchema.parse({
            accountId: rewards.id,
            date: today,
            amountCents: -6_480,
            payee: "Example Store",
            splits: [
              { categoryId: groceries, amountCents: -4_130 },
              { categoryId: shopping, amountCents: -2_350, memo: "Paper towels and soap" },
            ],
          }),
        ),
      );
    }
    // Budgets from the first of those months on; dining out runs over in some months.
    for (const [category, amountCents] of [
      ["Housing", 145_000],
      ["Groceries", 30_000],
      ["Dining out", 10_000],
      ["Utilities", 13_000],
      ["Transportation", 8_000],
      ["Subscriptions", 2_000],
    ] as const) {
      const id = categoryId.get(category);
      if (id) setBudget(db, { categoryId: id, month: monthStart(-5).slice(0, 7), amountCents });
    }

    // Business
    const phase = note("phase", createPhase(db, phaseCreateSchema.parse({ name: "Set up" })));
    for (const [title, offset] of [
      ["Register the business name", 14],
      ["Open a business bank account", 21],
    ] as const) {
      note(
        "step",
        createStep(
          db,
          stepCreateSchema.parse({
            phaseId: phase.id,
            title,
            dueOn: day(offset),
            estimateCents: 5_000,
          }),
        ),
      );
    }
    note(
      "gear",
      createGear(
        db,
        gearCreateSchema.parse({ name: "Laptop", category: "Computers", costCents: 90_000 }),
      ),
    );
    note(
      "skill",
      createSkill(db, skillCreateSchema.parse({ name: "First aid", kind: "certification" })),
    );
    note(
      "lead",
      createLead(
        db,
        leadCreateSchema.parse({
          name: "Example Bakery",
          nextStep: "Send a quote",
          nextStepOn: day(4),
          valueCents: 60_000,
        }),
      ),
    );
    note(
      "note",
      createNote(
        db,
        noteCreateSchema.parse({
          title: "Pricing ideas",
          body: "Start with an hourly rate, then offer packages.",
        }),
      ),
    );
  } finally {
    writeRefs(db, [...readRefs(db), ...refs]);
  }
}

const DELETERS: Record<DemoKind, (db: Db, id: number, actor: string) => void> = {
  project: deleteProject,
  task: deleteTask,
  goal: deleteGoal,
  term: deleteTerm,
  time_entry: (db, id) => deleteEntry(db, id),
  platform: (db, id) => void deletePlatform(db, id),
  resale_item: deleteItem,
  book: (db, id) => deleteBook(db, id),
  account: (db, id) => deleteAccount(db, id),
  card: (db, id) => deleteCard(db, id),
  transaction: (db, id) => deleteTransaction(db, id),
  phase: (db, id) => deletePhase(db, id),
  step: (db, id) => deleteStep(db, id),
  gear: (db, id) => deleteGear(db, id),
  skill: (db, id) => deleteSkill(db, id),
  lead: (db, id) => deleteLead(db, id),
  note: (db, id) => deleteNote(db, id),
};

/**
 * Removes the example data, newest first so things inside go before what holds
 * them. Anything that can't go because of what was added since, like an example
 * account with a new transaction, stays.
 */
export function removeDemo(db: Db, actor: string): { removed: number; kept: number } {
  const refs = readRefs(db);
  let removed = 0;
  let kept = 0;
  for (const ref of [...refs].reverse()) {
    try {
      DELETERS[ref.kind](db, ref.id, actor);
      removed += 1;
    } catch (error) {
      const status = (error as Partial<HTTPException>).status;
      // Already gone (deleted by hand, or with what held it) counts as removed.
      if (status === 404) removed += 1;
      else if (status === 409) kept += 1;
      else throw error;
    }
  }
  if (kept > 0) log.info("Example data partly kept", { kept });
  writeRefs(db, []);
  return { removed, kept };
}
