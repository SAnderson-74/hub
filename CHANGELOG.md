# Changelog

Hub's releases. Every merge to `main` also ships as a build, shown in Settings > About as the version plus its build id (like `1.0.0+a1b2c3d`).

## 1.0.0 (2026-10-03)

The first full release: everything in [the plan](docs/PLAN.md), phases 0 through 4.

- **Foundation:** Tailscale identity sign-in, a strict Content-Security-Policy, SQLite with generated additive migrations, a backup before every migration, nightly backups, a release workflow with one-click rollback, and a TrueNAS deployment with automatic updates.
- **Tasks:** projects, list and board views, subtasks, priorities, tags, and recurring tasks.
- **Time:** several timers at once, manual entries, and a weekly chart.
- **Goals:** milestones, target dates, progress from tasks, milestones, amounts, or savings accounts, and a timeline.
- **Courses:** terms, credits, assessments, planned windows with a pacing timeline, a study streak, and `hub-education/v1` imports.
- **Resale:** items from sourcing to sold, costs, listings and price history, profit charts, a buy calculator, CSV import, and `hub-listing/v1` pastes and Shortcuts.
- **Money:** books, accounts, categories, CSV and OFX/QFX imports with duplicate detection and undo, rules, transfers, sorting help that keeps names from payment apps, budgets, cash flow, net worth, and balance snapshots.
- **Taxes:** a plain-language US federal guide with sources, a resale income summary, and a set-aside estimate.
- **Business:** a phased setup checklist with costs, gear, skills and certifications, a rate calculator, leads, and notes.
- **Integrations:** a Home Assistant summary, a reminder scheduler (daily digest, due soon, streak at risk), and an optional token-protected calendar feed.
- **Setup:** first-run setup for modules and time zone, modules that can be turned off, removable example data, backup restore, and imports gathered in Settings.
- **Docs:** README screenshots from the example data (`npm run screenshots`), a feature overview, and this changelog.
