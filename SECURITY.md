# Security

## Reporting a problem

Please use GitHub's private vulnerability reporting (Security tab > Report a vulnerability) instead of opening a public issue.

## Security model

- The app listens on `127.0.0.1` inside a network namespace it shares with a Tailscale container. No ports are published on the host or LAN.
- Tailscale Serve terminates HTTPS and adds identity headers. It strips identity headers sent by clients, and it adds none for tagged devices. The app admits only the login in `HUB_OWNER_LOGIN`.
- Requests that change data are rejected when the browser marks them cross-site, because identity comes from the network rather than a cookie.
- A strict Content-Security-Policy allows scripts, styles, and fonts only from the app.
- The app container runs as a non-root user with a read-only filesystem, no Linux capabilities, and `no-new-privileges`.
- Development sign-in (`HUB_AUTH_MODE=dev`) refuses to start when `NODE_ENV=production`.
- API answers are sent with `Cache-Control: no-store`, so browsers don't keep copies of your data on disk. Browser storage holds only view choices and form defaults.
- The app sets a private umask and makes its data folder `700` and its files `600` at startup, so other accounts on the host can't read the database or backups.
- The app makes outbound requests only to Home Assistant webhook addresses entered in Settings, to send the summary and reminders there. It doesn't follow redirects, and it never logs the addresses (a webhook ID works like a password) or what it sends. With the addresses empty, it makes none.
- The repository and container image contain no personal data or secrets. Data stays in the SQLite file on the host. The file itself isn't encrypted; put it on an encrypted dataset (see docs/SETUP.md), and keep offsite backups encrypted before upload.
