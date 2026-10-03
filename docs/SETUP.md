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

1. Create a dataset for the app, for example `<POOL>/apps/hub`, with **Encryption** on (Datasets > Add Dataset > Advanced Options) unless the pool is already encrypted. The database is a plain SQLite file, so this is what protects it if a drive is removed or the server is stolen. Encryption can't be turned on for an existing dataset; see [Encrypting an existing dataset](#encrypting-an-existing-dataset). Then from a shell:
   ```bash
   H=/mnt/<POOL>/apps/hub
   mkdir -p $H/data $H/tailscale/state $H/tailscale/config $H/bin
   chown -R 568:568 $H/data
   chmod 700 $H/data
   R=https://raw.githubusercontent.com/<GITHUB_OWNER>/<REPO>/main/deploy/truenas
   curl -fsSL $R/serve.json -o $H/tailscale/config/serve.json
   curl -fsSL $R/update-hub.sh -o $H/bin/update-hub.sh
   chmod 700 $H/bin/update-hub.sh
   ```
   `568` is TrueNAS's built-in `apps` user; the app container runs as it. `chmod 700` keeps other accounts on the server out of the data folder; the app also keeps its files private itself.
2. Apps > Discover Apps > **⋮** > **Install via YAML**. Name the app `hub` and paste [`deploy/truenas/compose.yaml`](../deploy/truenas/compose.yaml) with every placeholder filled in:
   - `<TAILSCALE_AUTH_KEY>`: the key from step 2.3
   - `<YOUR_TAILSCALE_LOGIN>`: the login shown for your account in the Tailscale admin console
   - `<IANA_TIME_ZONE>`: for example `America/New_York`. It's the default until a time zone is picked in setup or Settings.
   - `<GITHUB_OWNER>/<REPO>`: lowercase
3. After the app is running, open `https://hub.<your-tailnet>.ts.net` from a device on your tailnet. A new install starts with setup: pick the modules you'll use and the time zone, and optionally start with example data (made-up names, removable later). The home screen should then show Sign-in: Tailscale. You can now clear the auth key from the YAML; the login is saved in `tailscale/state`.
4. System > Advanced Settings > **Cron Jobs** > Add: command `/mnt/<POOL>/apps/hub/bin/update-hub.sh`, run as `root`, schedule every 10 minutes (`*/10 * * * *`), hide standard output. Check its activity with `journalctl -t hub-update`.

Other Docker hosts work the same way: the compose file is standard, minus the TrueNAS paths and the `midclt` call in the update script.

## 4. Backups

The app writes `data/backups/nightly-YYYY-MM-DD.sqlite3` after the configured hour (default 3 AM, kept 14 days), a `pre-migrate-*.sqlite3` copy before every schema change (newest 10 kept), and a `pre-restore-*.sqlite3` copy before every restore (newest 10 kept).

1. **Snapshots:** Data Protection > Periodic Snapshot Tasks: the `apps/hub` dataset, hourly, keep 2 weeks.
2. **Offsite (Backblaze B2):**
   - In B2, create a **private** bucket. Under Lifecycle Settings, keep prior versions for 30 days.
   - Create an application key restricted to that bucket.
   - TrueNAS: Credentials > Backup Credentials > Cloud Credentials > Add, provider Backblaze B2, with that key.
   - Data Protection > Cloud Sync Tasks > Add: direction **Push**, transfer mode **Sync**, source `/mnt/<POOL>/apps/hub/data/backups` (never the live `hub.db`), daily at 04:30, **Remote Encryption** on.
   - Store the encryption password and salt in your password manager. Without them the offsite copies can't be read.
3. **Restoring:** Settings > Backups lists the backups. Choose **Restore** on one, or **Choose backup file** for a copy from elsewhere (like one downloaded from B2 and decrypted). Hub checks that the file is a readable Hub database, saves the current data as a `pre-restore-*` backup, and restarts. At startup it puts the backup in place and applies any newer migrations, and the page reloads when Hub is back. To undo a restore, restore the newest **Before a restore** backup.

   Do a restore drill once so you know it works: download a backup, restore it, then restore **Before a restore** to go back.

   To undo a bad migration, run the **Roll back** workflow to the build from before it first, then restore the matching **Before an update** (`pre-migrate-*`) backup. Otherwise the newer build applies the migration again at startup.

   If Hub won't start at all, restore by hand:
   ```bash
   # Stop the app in the TrueNAS UI first.
   cd /mnt/<POOL>/apps/hub/data
   mkdir -p replaced && mv hub.db hub.db-wal hub.db-shm replaced/ 2>/dev/null
   cp backups/<BACKUP_FILE>.sqlite3 hub.db && chown 568:568 hub.db
   # Start the app again.
   ```

### Encrypting an existing dataset

If `apps/hub` was created without encryption (Datasets shows no lock icon on it or its pool):

1. Stop the app, then create a new encrypted dataset, for example `<POOL>/apps/hub-encrypted`. Store its passphrase or key in your password manager.
2. Copy everything across, keeping owners and permissions: `rsync -a /mnt/<POOL>/apps/hub/ /mnt/<POOL>/apps/hub-encrypted/`
3. Swap the names, so every path in the app, cron job, snapshot task, and cloud sync task stays the same:
   ```bash
   zfs rename <POOL>/apps/hub <POOL>/apps/hub-old
   zfs rename <POOL>/apps/hub-encrypted <POOL>/apps/hub
   ```
4. Start the app and check that your data is there. Then delete `hub-old` and its snapshots, which still hold unencrypted copies.

## 5. iPhone

1. Install Tailscale, sign in, and turn on **VPN On Demand** in its settings so the tunnel is there when you need it.
2. Open the app's URL in Safari > Share > **Add to Home Screen**. It opens full screen like a native app.
3. Optional: a Shortcut that sends a `hub-listing/v1` listing (see PLAN.md) straight to Resale. It runs on your phone over Tailscale, which signs it in as you, so there's no token to set up. In the Shortcuts app, make a new shortcut called "Add listing to Hub" with these actions:
   1. **Get Clipboard** (copy the listing from the writing assistant first).
   2. **Get Contents of URL**: URL `https://hub.<your-tailnet>.ts.net/api/resale/listing-import`, Method **POST**, Headers `Content-Type` = `application/json`, Request Body **File** set to the Clipboard.
   3. **Get Dictionary Value**: `message` from Contents of URL, then **Show Notification** with it. If something's wrong, Hub answers with `error` instead, so show that when `message` is empty.

   The same listing can also be pasted on the Resale page with **Paste listing**, which shows what will happen before it's added.
4. Optional: a Claude Project that reads receipt photos for Money. [CLAUDE_PROJECT.md](CLAUDE_PROJECT.md) has the setup and the instructions to paste in.

## 6. Home Assistant (optional)

Hub can send Home Assistant a summary (study streak, today's tasks, and dates coming up in the next two weeks) every 15, 30, or 60 minutes, and reminders for it to pass on to your phone. Both arrive through webhooks, so nothing needs installing in Home Assistant.

1. Make two webhook IDs: long random strings, one for the summary and one for reminders. A password manager's generator works. Anyone who knows an ID can send to it, so treat them like passwords.
2. Add sensors that fill in from the summary. In Home Assistant's `configuration.yaml`, then restart Home Assistant or reload template entities:

   ```yaml
   template:
     - triggers:
         - trigger: webhook
           webhook_id: <SUMMARY_WEBHOOK_ID>
           allowed_methods: [POST]
           local_only: true
       sensor:
         - name: Hub study streak
           unique_id: hub_study_streak
           unit_of_measurement: days
           state: "{{ trigger.json.study_streak.days }}"
           attributes:
             status: "{{ trigger.json.study_streak.state }}"
             summary: "{{ trigger.json.study_streak.summary }}"
         - name: Hub tasks today
           unique_id: hub_tasks_today
           state: "{{ trigger.json.tasks_today.open }}"
           attributes:
             overdue: "{{ trigger.json.tasks_today.overdue }}"
             summary: "{{ trigger.json.tasks_today.summary }}"
             titles: "{{ trigger.json.tasks_today.titles }}"
         - name: Hub summary
           unique_id: hub_summary
           state: "{{ trigger.json.message[:255] }}"
           attributes:
             upcoming: "{{ trigger.json.upcoming }}"
   ```

3. Add an automation that turns reminders into phone notifications. Settings > Automations & scenes > **Create automation** > ⋮ > **Edit in YAML**, replace `<your_phone>` with your phone's notify service, and save:

   ```yaml
   alias: Hub reminders
   mode: queued
   triggers:
     - trigger: webhook
       webhook_id: <REMINDER_WEBHOOK_ID>
       allowed_methods: [POST]
       local_only: true
   actions:
     - action: notify.mobile_app_<your_phone>
       data:
         title: "{{ trigger.json.title }}"
         message: "{{ trigger.json.message }}"
   ```

4. In Hub, open Settings > **Home Assistant** and enter `http://<HOME_ASSISTANT_IP>:8123/api/webhook/<SUMMARY_WEBHOOK_ID>` and the same with the reminder ID. Save, then use **Send summary now** and **Send a test reminder**. The sensors show up in Home Assistant under Developer tools > States, and the test reminder on your phone.

**Reminders.** Settings > **Reminders** chooses what Hub sends to the reminder webhook, and when (in Hub's time zone):

- **Daily digest**: today's tasks, what's due in the next three days, and the study streak. Skipped when nothing is due.
- **Due soon**: tasks, goals, milestones, business steps, and lead follow-ups due today or within the days you pick. Each is reminded once per due date.
- **Study streak at risk**: when there's a streak and today's minimum isn't met yet.

Each goes out once a day. If Hub is down or Home Assistant doesn't answer at that time, Hub tries again every 15 minutes for up to three hours, then skips that day. The panel shows what each reminder would say right now, even before the webhook is set up. Every reminder carries a `kind` (`digest`, `due_soon`, `streak`, or `test`), so an automation can treat them differently, for example with a condition on `{{ trigger.json.kind == 'streak' }}`.

**Reaching Home Assistant.** Use its local network IP address, like `http://192.0.2.10:8123`. Hub reaches your network through the TrueNAS host, which Home Assistant counts as local, and webhooks accept only local requests by default (`local_only: true`). Names like `homeassistant.local` often don't resolve inside containers, so use the IP. If Home Assistant is reachable only over Tailscale, add the optional grant at the end of `deploy/tailscale/policy.hujson` and use its Tailscale address; if the webhook then doesn't fire, Home Assistant may not count that address as local, so set `local_only: false`.

**Checking it.** Settings > Home Assistant > **See what the summary sends** shows the exact JSON, so you can add more sensors from it. Hub reports what Home Assistant answered; an answer in the 200s means it accepted the request. If Hub says it was sent but nothing changes in Home Assistant, check that the webhook ID matches and look in Home Assistant's logs.

## 7. Calendar feed (optional)

Hub can publish its dated things (open tasks, active goals and their milestones, business steps, and lead follow-ups) as a calendar to subscribe to. Each shows as an all-day event, from two months back to a year ahead, and calendars check for changes about once an hour.

1. Settings > **Calendar feed** > **Turn on calendar feed**.
2. **iPhone:** Settings > Apps > Calendar > Calendar Accounts > Add Account > Other > **Add Subscribed Calendar**, and paste the address. Adding it there keeps it on the phone, which reaches Hub over Tailscale. If asked where to keep it, choose On My iPhone, not iCloud: iCloud's servers can't reach Hub.
3. **Mac:** Calendar > File > **New Calendar Subscription**, paste the address, and set Location to On My Mac.

Google Calendar and other web calendars can't subscribe, because their servers can't reach Hub over Tailscale. The address works like a password, so keep it private; **Get a new address** stops the old one, and **Turn off** stops the feed.

## 8. Changing the app with Claude Code

1. In the Claude app (or at claude.ai/code), connect GitHub and pick this repository. The default cloud environment works; `CLAUDE.md` and the session hook do the rest.
2. Describe the change in plain words, or ask for "the next step in docs/PLAN.md". Keep personal details out of prompts; the repository is public.
3. Claude opens a pull request. When the checks are green, look over **Files changed** (and the screenshots in the `browser-test-results` artifact for UI work), then **Squash and merge**.
4. Within about 10 minutes the new version appears in Settings > About, as the release plus a build id (like `1.0.0+a1b2c3d`). The build id is what the **Roll back** workflow asks for.

Optional: to let Claude run the browser tests inside its own sessions, create a cloud environment with **Custom** network access, include the default list, and add `cdn.playwright.dev` and `playwright.download.prss.microsoft.com`.

## 9. When something goes wrong

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "Open this app through its Tailscale address" | Opened by IP, or from a tagged device | Use `https://hub.<tailnet>.ts.net` from your own device |
| "This Tailscale account doesn't have access" | `HUB_OWNER_LOGIN` doesn't match your login | Fix the value in the app's YAML and redeploy |
| Certificate or connection error | HTTPS certificates off, or tunnel down | Step 2.1; check the `ts` container logs |
| New version never arrives | Cron job or package visibility | `journalctl -t hub-update`; confirm the package is public |
| App container keeps restarting | Config error or permissions | `docker logs ix-hub-hub-1`; check `data` is owned by 568 |
| Bad release | A bug slipped through | Actions > **Roll back** with the previous build id |
