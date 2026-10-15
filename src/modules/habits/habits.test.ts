import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import { resetReminderTries, runReminders } from "../integrations/reminders.service";
import { timeEntries } from "../time/schema";
import {
  createHabit,
  deleteHabit,
  habitsToRemind,
  listHabits,
  setCheckin,
  updateHabit,
} from "./habits.service";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => t.close());

const clock = { now: new Date("2030-03-13T15:00:00Z"), timeZone: "UTC" };
const today = "2030-03-13";

describe("habits", () => {
  it("are checked off a day at a time, and grow stronger", () => {
    const habit = createHabit(t.db, { name: "Read 20 pages", remindAt: "21:00" }, clock);
    expect(habit).toMatchObject({
      name: "Read 20 pages",
      kind: "check",
      schedule: { kind: "daily" },
      startDate: today,
      strength: 0,
      streak: 0,
      scheduledToday: true,
      doneToday: false,
    });
    expect(habitsToRemind(t.db, clock).map((row) => row.id)).toEqual([habit.id]);

    const done = setCheckin(t.db, habit.id, today, true, clock);
    expect(done).toMatchObject({ doneToday: true, streak: 1 });
    expect(done.strength).toBeGreaterThan(0);
    expect(habitsToRemind(t.db, clock)).toEqual([]);
    // Checking off twice is the same as once; a past day can be filled in.
    setCheckin(t.db, habit.id, today, true, clock);
    expect(setCheckin(t.db, habit.id, "2030-03-12", true, clock).streak).toBe(2);
    expect(setCheckin(t.db, habit.id, today, false, clock)).toMatchObject({
      doneToday: false,
      streak: 1,
    });
    expect(() => setCheckin(t.db, habit.id, "2030-03-14", true, clock)).toThrow(/hasn't come yet/);
  });

  it("change schedule, archive, and go with their check-ins", () => {
    const habit = createHabit(t.db, { name: "Run" }, clock);
    setCheckin(t.db, habit.id, today, true, clock);
    const weekly = updateHabit(t.db, habit.id, { schedule: { kind: "weekly", times: 3 } }, clock);
    expect(weekly).toMatchObject({ streakUnit: "week", weekCount: 1, weekTarget: 3 });
    expect(updateHabit(t.db, habit.id, { archived: true }, clock).archived).toBe(true);
    const other = createHabit(t.db, { name: "Stretch" }, clock);
    expect(listHabits(t.db, clock).map((row) => row.name)).toEqual(["Stretch", "Run"]);
    deleteHabit(t.db, habit.id);
    expect(listHabits(t.db, clock).map((row) => row.id)).toEqual([other.id]);
  });

  it("include the study streak as a habit, checked off by course time", () => {
    const study = createHabit(t.db, { name: "Study", kind: "study" }, clock);
    expect(() => createHabit(t.db, { name: "Study again", kind: "study" }, clock)).toThrow(
      /already a study habit/,
    );
    expect(() => setCheckin(t.db, study.id, today, true, clock)).toThrow(/Log study time instead/);

    // 40 minutes on a course today and yesterday; the minimum is 30 by default.
    for (const day of ["2030-03-12", today]) {
      t.db
        .insert(timeEntries)
        .values({
          startedAt: new Date(`${day}T10:00:00Z`),
          endedAt: new Date(`${day}T10:40:00Z`),
          minutes: 40,
          subjectType: "course",
          subjectId: 1,
        })
        .run();
    }
    const [row] = listHabits(t.db, clock);
    expect(row).toMatchObject({
      kind: "study",
      doneToday: true,
      streak: 2,
      study: { todayMinutes: 40, minimum: 30 },
    });
    // Study from before the habit was added still shows.
    expect(row?.days.find((day) => day.date === "2030-03-12")?.state).toBe("done");
  });

  it("are reached through the API", async () => {
    const created = await body(
      await t.api.habits.$post({
        json: { name: "Meditate", schedule: { kind: "days", days: [4, 0, 2, 2] } },
      }),
    );
    expect(created.schedule).toEqual({ kind: "days", days: [0, 2, 4] });
    expect(
      (await failure(await t.api.habits.$post({ json: { name: "", schedule: { kind: "daily" } } })))
        .status,
    ).toBe(400);
    expect(
      (
        await failure(
          await t.api.habits.$post({
            json: { name: "Too often", schedule: { kind: "weekly", times: 9 } },
          }),
        )
      ).status,
    ).toBe(400);
    const param = { param: { id: String(created.id) } };
    expect((await t.api.habits[":id"].$delete(param)).status).toBe(204);
    expect((await failure(await t.api.habits[":id"].$get(param))).status).toBe(404);
  });
});

describe("habit reminders", () => {
  it("go out at the habit's time while it's still to do, once a day", async () => {
    resetReminderTries();
    await body(
      await t.api.settings.$put({
        json: {
          homeAssistant: {
            summaryUrl: "",
            reminderUrl: "http://192.0.2.10:8123/api/webhook/hub-test",
            summaryMinutes: 15,
          },
          reminders: {
            digest: { enabled: false, time: "07:30" },
            dueSoon: { enabled: false, time: "18:00", days: 1 },
            streak: { enabled: false, time: "20:00" },
          },
        },
      }),
    );
    const habit = createHabit(t.db, { name: "Stretch", remindAt: "21:00" }, clock);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(null, { status: 200 }));
    const at = (time: string) => new Date(`${today}T${time}:00Z`);

    await runReminders(t.db, { timeZone: "UTC" }, at("20:59"));
    expect(fetchMock).not.toHaveBeenCalled();
    await runReminders(t.db, { timeZone: "UTC" }, at("21:01"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      kind: "habit",
      title: "Time for Stretch",
    });
    await runReminders(t.db, { timeZone: "UTC" }, at("21:05"));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Done already: no reminder the next day either.
    const tomorrow = "2030-03-14";
    setCheckin(t.db, habit.id, tomorrow, true, {
      now: new Date(`${tomorrow}T15:00:00Z`),
      timeZone: "UTC",
    });
    await runReminders(t.db, { timeZone: "UTC" }, new Date(`${tomorrow}T21:01:00Z`));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
