Serving the frontend from the API (recommended for local testing)

- The API now serves the static site files from the repository root. This means you can run the server and open `http://localhost:3000/` and it will serve your `index.html` and other static pages. This avoids CORS and makes the flow simple for local testing.

Local test checklist

1. Copy `.env.example` to `.env` and fill in values (do NOT commit `.env`):

```
PATREON_CLIENT_ID=your_client_id_here
PATREON_CLIENT_SECRET=your_client_secret_here
PATREON_REDIRECT_URI=http://localhost:3000/auth/patreon/callback
PATREON_ALLOWED_TIER_NAME=Hwei Apprentice
# Optional: PATREON_ALLOWED_TIER_ID=your_tier_id_here
SESSION_SECRET=some-random-secret
FRONTEND_URL=http://localhost:3000
PORT=3000
```

2. Install and run:

```bash
cd api
npm install
npm run dev
```

3. Open `http://localhost:3000/` in your browser and click "Login with Patreon" (the button in the header links to `/auth/patreon`).

4. After approving Patreon, you should be redirected back to `http://localhost:3000/` only if the Patreon account is currently entitled to the configured tier. You can verify authentication by visiting `http://localhost:3000/api/me`.

If you prefer to serve the static site separately (different port), tell me and I can add CORS with credentials support so the frontend at another origin can call `/api/me`.
# HweiGuide Patreon OAuth API

Small Express server to handle Patreon OAuth (authorization code grant), restrict the site to a specific Patreon tier, and provide a minimal `/api/me` endpoint for the frontend.

Setup

1. Copy `.env.example` to `.env` and fill in `PATREON_CLIENT_ID`, `PATREON_CLIENT_SECRET`, `PATREON_REDIRECT_URI`, `PATREON_ALLOWED_TIER_NAME` (or `PATREON_ALLOWED_TIER_ID`), and `SESSION_SECRET`.
2. Install dependencies:

```bash
cd api
npm install
```

3. Run locally:

```bash
npm run dev
```

Endpoints

- `GET /auth/patreon` — redirect to Patreon authorize URL
- `GET /auth/patreon/callback` — OAuth callback, exchanges code, fetches identity, verifies the required tier, stores session
- `POST /auth/patreon/refresh` — exchange refresh token for new access token
- `GET /api/me` — returns `{ authenticated, user }` for the current session
- `GET /logout` — destroy session

Notes

- This implementation stores tokens in server session (in-memory). For production use a persistent, encrypted store and HTTPS.
- The protected site files are served through Express, so visitors who do not have the required Patreon tier cannot fetch the guide HTML, JS, CSS, images, or shared partials directly.
- `PATREON_ALLOWED_TIER_ID` is the safest option because Patreon tier titles can be renamed. If both are set, the tier ID is used.
- Keep `PATREON_CLIENT_SECRET` and creator tokens out of source control and use environment/secret manager.
