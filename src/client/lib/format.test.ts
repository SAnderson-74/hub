import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, formatHour, formatRelative, greetingFor } from "./format";

describe("formatting", () => {
  it("formats sizes and durations", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(52 * 1024 * 1024)).toBe("52 MB");
    expect(formatDuration(30)).toBe("under a minute");
    expect(formatDuration(3_720)).toBe("1 h 2 min");
    expect(formatDuration(90_000)).toBe("1 d 1 h");
  });

  it("formats relative times, hours, and greetings", () => {
    const now = new Date("2026-09-16T12:00:00Z");
    expect(formatRelative(new Date("2026-09-16T11:59:30Z"), now)).toBe("just now");
    expect(formatRelative(new Date("2026-09-16T09:00:00Z"), now)).toBe("3 hours ago");
    expect(formatRelative(new Date("2026-09-15T12:00:00Z"), now)).toBe("yesterday");
    expect(formatHour(3)).toBe("3 AM");
    expect(greetingFor(8)).toBe("Good morning");
    expect(greetingFor(14)).toBe("Good afternoon");
    expect(greetingFor(22)).toBe("Good evening");
    expect(greetingFor(2)).toBe("Good evening");
  });
});
