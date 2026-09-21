// Guards the database migrations in ./drizzle:
//  - every SQL file is listed in the journal and vice versa
//  - statements that can destroy or rewrite data need an explicit review marker:
//      -- hub:reviewed-destructive: <why this is safe>
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = "drizzle";
const MARKER = /^--\s*hub:reviewed-destructive:\s*\S/m;
const RISKY = [
  [/\bDROP\s+TABLE\b/i, "DROP TABLE"],
  [/\bDROP\s+COLUMN\b/i, "DROP COLUMN"],
  [/\bALTER\s+TABLE\b[^;]*\bRENAME\b/i, "RENAME"],
  [/\bDELETE\s+FROM\b/i, "DELETE"],
  [/\bUPDATE\s+[`"\w]+\s+SET\b/i, "UPDATE"],
];

const problems = [];
const journalPath = join(dir, "meta", "_journal.json");
if (!existsSync(journalPath)) {
  problems.push(`Missing ${journalPath}. Run "npm run db:generate".`);
} else {
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  const tags = new Set(journal.entries.map((entry) => entry.tag));
  const files = readdirSync(dir).filter((name) => name.endsWith(".sql"));
  for (const tag of tags) {
    if (!files.includes(`${tag}.sql`))
      problems.push(`Journal lists ${tag} but ${tag}.sql is missing.`);
  }
  for (const file of files) {
    const tag = file.replace(/\.sql$/, "");
    if (!tags.has(tag))
      problems.push(
        `${file} is not in the journal. Generate migrations with drizzle-kit instead of writing them by hand.`,
      );
    const sql = readFileSync(join(dir, file), "utf8");
    const hits = RISKY.filter(([pattern]) => pattern.test(sql)).map(([, label]) => label);
    if (hits.length > 0 && !MARKER.test(sql)) {
      problems.push(
        `${file} contains ${hits.join(", ")}. Prefer additive changes. If this is intended, add a line "-- hub:reviewed-destructive: <reason>" and call it out in the pull request.`,
      );
    }
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`✗ ${problem}`);
  process.exit(1);
}
console.log("✓ Migrations look safe.");
