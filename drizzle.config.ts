import { defineConfig } from "drizzle-kit";

// Every module keeps its tables in src/modules/<module>/schema.ts.
// `npm run db:generate` turns schema changes into SQL files in ./drizzle.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/modules/*/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: "./data/hub.db",
  },
  strict: true,
  verbose: true,
});
