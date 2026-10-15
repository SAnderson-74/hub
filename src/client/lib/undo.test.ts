import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteLater, flushDelete, type LaterDelete, UNDO_MS, undoDelete, useUndo } from "./undo";

type Row = { id: number; title: string };

let client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData<Row[]>(
    ["things", "list"],
    [
      { id: 1, title: "Keep" },
      { id: 2, title: "Go" },
    ],
  );
});
afterEach(() => {
  // Leaves nothing waiting for the next test.
  undoDelete();
  vi.useRealTimers();
  client.clear();
});

const titles = () => client.getQueryData<Row[]>(["things", "list"])?.map((row) => row.title);

// useUndo is a store hook; outside React, it returns the snapshot a component would read.
vi.mock("react", () => ({
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => ReturnType<typeof useUndo>) =>
    snapshot(),
}));
const read = () => useUndo();

function request(overrides: Partial<LaterDelete> = {}): LaterDelete {
  return {
    message: "Deleted Go",
    restoredMessage: "Restored Go",
    hide: {
      keys: [["things"]],
      remove: (data) => (data as Row[]).filter((row) => row.id !== 2),
    },
    commit: vi.fn(async () => undefined),
    flush: vi.fn(),
    ...overrides,
  };
}

describe("undo after deleting", () => {
  it("hides the thing at once and sends the delete after a few seconds", async () => {
    const later = request();
    deleteLater(client, later);
    expect(titles()).toEqual(["Keep"]);
    expect(read()).toEqual({ kind: "pending", message: "Deleted Go" });
    expect(later.commit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(UNDO_MS);
    expect(later.commit).toHaveBeenCalledOnce();
    expect(read()).toEqual({ kind: "idle" });
  });

  it("puts it back on Undo, and never sends the delete", async () => {
    const later = request();
    deleteLater(client, later);
    undoDelete();
    expect(titles()).toEqual(["Keep", "Go"]);
    expect(read()).toEqual({ kind: "notice", error: false, message: "Restored Go" });
    await vi.advanceTimersByTimeAsync(UNDO_MS * 2);
    expect(later.commit).not.toHaveBeenCalled();
  });

  it("keeps it hidden when the list refetches while the delete waits", async () => {
    const query = client.getQueryCache().find({ queryKey: ["things", "list"] });
    deleteLater(client, request());
    // A refetch from the server, which still has it.
    query?.setState({
      data: [
        { id: 1, title: "Keep" },
        { id: 2, title: "Go" },
      ],
    });
    client.getQueryCache().notify({
      type: "updated",
      query: query as never,
      action: { type: "success", data: [], dataUpdatedAt: Date.now() } as never,
    });
    expect(titles()).toEqual(["Keep"]);
  });

  it("brings it back and says why when the delete fails", async () => {
    const later = request({ commit: vi.fn(async () => Promise.reject(new Error("Offline."))) });
    deleteLater(client, later);
    await vi.advanceTimersByTimeAsync(UNDO_MS);
    expect(titles()).toEqual(["Keep", "Go"]);
    expect(read()).toEqual({
      kind: "notice",
      error: true,
      message: "Couldn't delete Go. Offline.",
    });
  });

  it("sends a waiting delete when another starts, or when the page closes", async () => {
    const first = request();
    deleteLater(client, first);
    const second = request({ message: "Deleted Keep" });
    deleteLater(client, second);
    expect(first.commit).toHaveBeenCalledOnce();
    expect(read()).toEqual({ kind: "pending", message: "Deleted Keep" });

    flushDelete();
    expect(second.flush).toHaveBeenCalledOnce();
    expect(second.commit).not.toHaveBeenCalled();
    expect(read()).toEqual({ kind: "idle" });
  });
});
