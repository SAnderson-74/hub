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
- The repository and container image contain no personal data or secrets. Data stays in the SQLite file on the host.
