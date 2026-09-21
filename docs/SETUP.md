# Setup

From an empty GitHub account to the app on your phone's home screen. Placeholders look like `<POOL>`; replace them with your own values and keep those values out of the repository.

## 1. GitHub

1. **Hide your email first.** GitHub > Settings > Emails: turn on **Keep my email addresses private** and **Block command line pushes that expose my email**. Copy the `…@users.noreply.github.com` address shown there, then in the project folder run:
   ```bash
   git config user.email "<ID+USERNAME>@users.noreply.github.com"
   git config user.name "<GITHUB_USERNAME>"
   ```
2. Create a **public** repository (no README), then push:
   ```bash
   git init -b main
   git add .
   git commit -m "Foundation"
   git remote add origin https://github.com/<GITHUB_OWNER>/<REPO>.git
   git push -u origin main
   ```
3. Settings > General > Pull Requests: allow **squash merging** only and turn on **Automatically delete head branches**.
4. Settings > Rules > Rulesets > **New branch ruleset** for the default branch:
   - Require a pull request before merging (0 approvals, since you merge your own)
   - Require status checks to pass: `Lint, types, unit tests`, `Browser tests (iPhone + desktop)`, `Container image builds`
   - Block force pushes
5. Settings > Code security: turn on **Private vulnerability reporting**, **Dependabot alerts**, and **Secret protection / push protection** if offered.
6. The push to `main` runs CI, then **Release image** publishes `ghcr.io/<github_owner>/<repo>`. Open your profile > Packages > the package > Package settings, and change visibility to **Public** so the server can pull it without credentials. The image holds code only.

## 2. Tailscale

1. Admin console > DNS: turn on **MagicDNS** and **HTTPS Certificates**. Certificate names are published in public Certificate Transparency logs, so keep a neutral machine name like `hub`.
2. Admin console > Access controls: add the `tagOwners` block from [`deploy/tailscale/policy.hujson`](../deploy/tailscale/policy.hujson). The rest of that file is optional hardening; read its comments before replacing an allow-all rule.
3. Settings > Keys > **Generate auth key**: not reusable, not ephemeral, pre-approved, tag `tag:hub`. You only need it for the first start.

## 3. TrueNAS (25.10 or later)

1. Create a dataset for the app, for example `<POOL>/apps/hub`, then from a shell:
   ```bash
   H=/mnt/<POOL>/apps/hub
   mkdir -p $H/data $H/tailscale/state $H/tailscale/config $H/bin
   chown -R 568:568 $H/data
   R=https://raw.githubusercontent.com/<GITHUB_OWNER>/<REPO>/main/deploy/truenas
   curl -fsSL $R/serve.json -o $H/tailscale/config/serve.json
   curl -fsSL $R/update-hub.sh -o $H/bin/update-hub.sh
   chmod 700 $H/bin/update-hub.sh
   ```
   `568` is TrueNAS's built-in `apps` user; the app container runs as it.
2. Apps > Discover Apps > **⋮** > **Install via YAML**. Name the app `hub` and paste [`deploy/truenas/compose.yaml`](../deploy/truenas/compose.yaml) with every placeholder filled in:
   - `<TAILSCALE_AUTH_KEY>`: the key from step 2.3
   - `<YOUR_TAILSCALE_LOGIN>`: the login shown for your account in the Tailscale admin console
   - `<IANA_TIME_ZONE>`: for example `America/New_York`
   - `<GITHUB_OWNER>/<REPO>`: lowercase
3. After the app is running, open `https://hub.<your-tailnet>.ts.net` from a device on your tailnet. The home screen should show Sign-in: Tailscale. You can now clear the auth key from the YAML; the login is saved in `tailscale/state`.
4. System > Advanced Settings > **Cron Jobs** > Add: command `/mnt/<POOL>/apps/hub/bin/update-hub.sh`, run as `root`, schedule every 10 minutes (`*/10 * * * *`), hide standard output. Check its activity with `journalctl -t hub-update`.

Other Docker hosts work the same way: the compose file is standard, minus the TrueNAS paths and the `midclt` call in the update script.

## 4. Backups

The app writes `data/backups/nightly-YYYY-MM-DD.sqlite3` after the configured hour (default 3 AM, kept 14 days) and a `pre-migrate-*.sqlite3` copy before every schema change (newest 10 kept).

1. **Snapshots:** Data Protection > Periodic Snapshot Tasks: the `apps/hub` dataset, hourly, keep 2 weeks.
2. **Offsite (Backblaze B2):**
   - In B2, create a **private** bucket. Under Lifecycle Settings, keep prior versions for 30 days.
   - Create an application key restricted to that bucket.
   - TrueNAS: Credentials > Backup Credentials > Cloud Credentials > Add, provider Backblaze B2, with that key.
   - Data Protection > Cloud Sync Tasks > Add: direction **Push**, transfer mode **Sync**, source `/mnt/<POOL>/apps/hub/data/backups` (never the live `hub.db`), daily at 04:30, **Remote Encryption** on.
   - Store the encryption password and salt in your password manager. Without them the offsite copies can't be read.
3. **Restore drill** (do it once so you know it works):
   ```bash
   # Stop the app in the TrueNAS UI first.
   cd /mnt/<POOL>/apps/hub/data
   mkdir -p replaced && mv hub.db hub.db-wal hub.db-shm replaced/ 2>/dev/null
   cp backups/<BACKUP_FILE>.sqlite3 hub.db && chown 568:568 hub.db
   # Start the app again.
   ```
   If you restore a `pre-migrate-*` file, also run the **Roll back** workflow to the build that was running before that migration.

## 5. iPhone

1. Install Tailscale, sign in, and turn on **VPN On Demand** in its settings so the tunnel is there when you need it.
2. Open the app's URL in Safari > Share > **Add to Home Screen**. It opens full screen like a native app.

## 6. Changing the app with Claude Code

1. In the Claude app (or at claude.ai/code), connect GitHub and pick this repository. The default cloud environment works; `CLAUDE.md` and the session hook do the rest.
2. Describe the change in plain words, or ask for "the next step in docs/PLAN.md". Keep personal details out of prompts; the repository is public.
3. Claude opens a pull request. When the checks are green, look over **Files changed** (and the screenshots in the `browser-test-results` artifact for UI work), then **Squash and merge**.
4. Within about 10 minutes the new version appears in Settings > About.

Optional: to let Claude run the browser tests inside its own sessions, create a cloud environment with **Custom** network access, include the default list, and add `cdn.playwright.dev` and `playwright.download.prss.microsoft.com`.

## 7. When something goes wrong

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "Open this app through its Tailscale address" | Opened by IP, or from a tagged device | Use `https://hub.<tailnet>.ts.net` from your own device |
| "This Tailscale account doesn't have access" | `HUB_OWNER_LOGIN` doesn't match your login | Fix the value in the app's YAML and redeploy |
| Certificate or connection error | HTTPS certificates off, or tunnel down | Step 2.1; check the `ts` container logs |
| New version never arrives | Cron job or package visibility | `journalctl -t hub-update`; confirm the package is public |
| App container keeps restarting | Config error or permissions | `docker logs ix-hub-hub-1`; check `data` is owned by 568 |
| Bad release | A bug slipped through | Actions > **Roll back** with the previous build id |
