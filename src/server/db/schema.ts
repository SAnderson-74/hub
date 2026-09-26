// Re-exports every module's tables so the Drizzle client is fully typed.
// When you add src/modules/<name>/schema.ts, add one export line here.
export * from "../../modules/core/schema";
export * from "../../modules/goals/schema";
export * from "../../modules/tasks/schema";
export * from "../../modules/time/schema";
