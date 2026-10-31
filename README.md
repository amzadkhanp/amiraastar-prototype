# AmiraASTAR

AmiraASTAR is a business app prototype for RiceMarket, hardware inventory and auto spare parts. This branch adds a local server edition with SQLite storage and server-side accounts while keeping the GitHub Pages preview available.

## Run the live app on this laptop

The live edition needs Node.js 24 or newer. It uses Node's built-in SQLite support, so it does not need an npm install.

1. Copy `.env.example` to `.env` and replace `ADMIN_USERNAME` and `ADMIN_PASSWORD` with your own values. Use a password with at least 10 characters, a letter and a number.
2. In PowerShell, open this folder and run:

   ```powershell
   node server.cjs
   ```

3. Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

The server creates the first admin and local database on its first run. Keep the server window open while using the app. It binds to this laptop only. Once the admin exists, the password in `.env` is not used again; the password hash is stored in SQLite. Customer accounts can sign up. Employee accounts need admin approval.

The live database is `data/amiraastar.sqlite`. It is ignored by Git and stays on this laptop. To back it up, stop the server with Ctrl+C, then copy that file to a safe location. Do not expose this local HTTP server to the internet; remote use needs a hosted server, HTTPS, and an operational backup plan.

## What changed in live mode

- The existing app screens and order flows are served from the Node app.
- Accounts use server-side scrypt password hashes and HttpOnly, same-site session cookies.
- App records persist in SQLite instead of `localStorage`.
- Customers receive only their own orders and account details; employees can handle orders and stock; admin controls remain admin-only on the server.
- Password changes, signup, employee approval, inventory, order placement and status updates are handled by the server.
- Payments remain simulated. The sample products and prices are examples to replace with your real catalogue.

The app does not import data previously saved by the browser-only prototype. Those browser records remain in that browser until you choose to export or remove them.

## GitHub Pages preview

GitHub Pages cannot run this Node server or its SQLite database. The Pages workflow still publishes the static prototype preview on `main`; it does not publish the live server edition. The live app in this branch runs on the laptop with `node server.cjs`.

## Project files

| Path | Purpose |
|---|---|
| `server.cjs` | Local HTTP server, authentication, role checks and SQLite persistence |
| `data/seed.json` | Example catalogue used to initialize a new database; contains no accounts |
| `src/100-live-mode.js` | Connects the existing UI to the local server when served in live mode |
| `src/original.html`, `src/*.js`, `src/patch.css` | Prototype source and app features |
| `build.cjs` | Builds `AmiraASTAR.html` from the app source |
| `.env.example` | First-run admin setup template |

## Rebuild the app

After changing app source, run:

```powershell
node build.cjs
```

`AmiraASTAR.html` is the generated build artifact. The static preview server is still available with `node serve.cjs`.
