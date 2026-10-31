# AmiraASTAR local edition

AmiraASTAR is a local business app for rice, hardware inventory, auto spare parts, orders, staff workflows, expenses and maintenance. It includes a browser frontend and a same-origin Node.js API backed by SQLite. Payment processing is not included; orders use pay on delivery.

## Start on Windows

1. Install Node.js 24 or newer.
2. In PowerShell, run `.\setup-local.ps1` from this folder. On first run it securely prompts for an administrator username and password, saves them in the ignored `.env` file, and starts the app. Keep this window open.
3. Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

The first start creates the admin and `data/amiraastar.sqlite`. The bootstrap password is only used when there is no active administrator in the database. The app binds to this computer only. The server and browser must stay on this computer; this setup does not provide remote or multi-device access.

The seed catalog is example data. Before using the app for business, update products, stock, prices, agencies and delivery settings in the Admin screens. Confirm tax, return, privacy and record-keeping requirements for your business. There is no online payment integration, email/SMS delivery, or self-serve password recovery.

## Public deployment on Render

The repository includes `render.yaml` for a single-instance Node web service in Singapore, a persistent SQLite disk, `/api/health` checks, production cookies and proxy-aware login rate limits. Render terminates public HTTPS and forwards requests to the app. The persistent disk is necessary because Render's normal service filesystem is ephemeral; Render requires a paid web service for persistent disks. The selected `0.5c-512mb` compute plan is currently listed at $7/month, and the 1 GB disk adds about $0.25/month, before any domain or workspace charges.

1. Push the reviewed branch to GitHub.
2. In Render, create a new **Blueprint** from `amzadkhanp/amiraastar-prototype`, select branch `codex/production-amiraastar`, and review `render.yaml`.
3. When prompted, provide a unique `ADMIN_USERNAME` and a strong `ADMIN_PASSWORD`. Render stores these as service secrets; do not reuse the local admin password.
4. Create the service and wait for the `/api/health` check to pass. Render will show the public `https://amiraastar.onrender.com` URL (or a generated variant if that service name is unavailable). The store starts closed: visitors cannot sign up or order, and the example catalog is not exposed.
5. Sign in as admin, replace the example catalog and settings, review the store, and download a database backup.
6. In Render's environment settings, change `STORE_OPEN` to `true` and restart the service. This opens customer signup and ordering.

Keep the service at one instance while using SQLite. For multiple app instances or heavier traffic, migrate records and sessions to managed shared services before scaling. The public deployment starts with a new database; the local laptop database is not uploaded. Use the admin backup and a separately planned import if records need to move.

Deploying the app makes it publicly reachable. The public URL should not be shared with customers until the catalog, store policies and admin credentials are set for the business.

## Back up and restore

As admin, open **Security** and select **Download database backup**. The downloaded SQLite file contains account password hashes and business records; store it privately and keep more than one copy.

To restore a backup, stop the server with Ctrl+C, then run:

```powershell
node scripts/restore-backup.cjs "C:\path\to\amiraastar-backup.sqlite"
```

The restore command checks the SQLite integrity and AmiraASTAR data before replacing the database. It preserves the current database beside it with a `.before-restore-<timestamp>.sqlite` suffix. Start the app again with `node server.cjs` or `.\setup-local.ps1`.

## API reference

API writes use same-origin JSON requests and the HttpOnly `amira_session` cookie. There is no cross-origin API access.

| Method and path | Access | Purpose |
|---|---|---|
| `GET /api/health` | Local | Health and storage status |
| `GET /api/bootstrap` | Local | Public catalog and initial app state |
| `POST /api/login` | Public, rate limited | Sign in |
| `POST /api/signup` | Public, rate limited | Customer signup; employee signup waits for approval |
| `POST /api/invite/accept` | Public | Create an account from an admin invite |
| `GET /api/state` | Signed in | Get role-filtered app state |
| `PUT /api/state` | Signed in | Save permitted state changes with revision conflict detection |
| `POST /api/password` | Signed in | Change password |
| `POST /api/admin/users` | Admin | Create an account that must change its temporary password |
| `GET /api/admin/backup` | Admin | Download the SQLite database backup |
| `POST /api/logout` | Local | End the current session |

## Development

Rebuild the static artifact after frontend changes:

```powershell
node build.cjs
```

Start the SQLite-backed app:

```powershell
node server.cjs
```

`node serve.cjs` serves the browser-only preview for development. GitHub Pages also serves only that static preview; it is not the SQLite-backed app. Do not use the Pages preview to record real customer or business data.

## Data and security notes

- The app stores its database at `data/amiraastar.sqlite`; `.env` and SQLite files are ignored by Git.
- Passwords are stored as scrypt hashes. Session cookies are HttpOnly and SameSite Strict; API writes require same-origin requests.
- Role checks, stock checks, order totals, and order state transitions are enforced by the server.
- The default server is bound to `127.0.0.1`. In production mode it binds to `0.0.0.0`, marks cookies Secure and enables HSTS for use behind a TLS-terminating proxy.
- The SQLite server is designed for one Node process and one instance. Do not scale it horizontally without migrating state and sessions to shared services.
- Payment is parked: new orders are pay on delivery and no transaction is collected or marked paid by an online provider.
