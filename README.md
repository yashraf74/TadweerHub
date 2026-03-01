# AquaCycle 🌊♻️

A full-stack water bottle recycling tracking platform. Users register, log bottle drop-offs, earn points, and compete on a leaderboard — all in real time.

---

## Tech Stack

| Layer | Technology | Cost |
|---|---|---|
| Frontend | Vanilla HTML/CSS/JS | Free |
| Backend API | Cloudflare Workers | Free |
| Database | Cloudflare D1 (SQLite) | Free |
| Hosting | Cloudflare Pages | Free |
| CI/CD | GitHub → Cloudflare Pages | Free |

**Total cost: $0/month**

---

## Project Structure

```
aquacycle/
├── frontend/
│   └── index.html        ← The entire frontend (single file)
└── worker/
    ├── src/
    │   └── index.js      ← Cloudflare Worker API
    ├── wrangler.toml      ← Worker config
    └── package.json
```

---

## Deployment Guide

### Step 1 — Push to GitHub

1. Create a new GitHub repository (e.g. `aquacycle`)
2. Push this entire project folder to it:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/aquacycle.git
git push -u origin main
```

---

### Step 2 — Set up the Cloudflare Worker + D1 Database

You need Node.js installed for this step.

```bash
cd worker
npm install
```

**Login to Cloudflare:**
```bash
npx wrangler login
```

**Create your D1 database:**
```bash
npx wrangler d1 create aquacycle-db
```

This prints something like:
```
[[d1_databases]]
binding = "DB"
database_name = "aquacycle-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Copy the `database_id` into `wrangler.toml`** — replace `YOUR_D1_DATABASE_ID`.

**Deploy the Worker:**
```bash
npx wrangler deploy
```

Your API is now live at:
`https://aquacycle-api.YOUR_SUBDOMAIN.workers.dev`

---

### Step 3 — Update the API URL in the frontend

Open `frontend/index.html` and find this line near the bottom (in the `<script>` tag):

```javascript
const API = 'https://aquacycle-api.YOUR_SUBDOMAIN.workers.dev';
```

Replace it with your actual Worker URL from Step 2.

Commit and push:
```bash
git add frontend/index.html
git commit -m "Set API URL"
git push
```

---

### Step 4 — Deploy frontend to Cloudflare Pages

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Click **Pages** → **Create a project** → **Connect to Git**
3. Select your GitHub repo
4. Configure the build:
   - **Framework preset**: None
   - **Build command**: *(leave empty)*
   - **Build output directory**: `frontend`
5. Click **Save and Deploy**

Your site is live at `https://aquacycle.pages.dev` (or a custom domain if you add one).

**Every future `git push` to `main` will auto-redeploy both the frontend and trigger Cloudflare Pages to rebuild.**

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/users` | Register a new user |
| `GET` | `/api/users` | List all users |
| `GET` | `/api/users/:id` | Get user by ID |
| `POST` | `/api/dropoffs` | Log a bottle drop-off |
| `GET` | `/api/dropoffs?user_id=X` | Get drop-offs (optional filter) |
| `GET` | `/api/stats` | Global impact statistics |
| `GET` | `/api/leaderboard` | Top 10 users by points |

### Example: Register a user
```bash
curl -X POST https://your-worker.workers.dev/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Sara Ahmed", "email": "sara@example.com"}'
```

### Example: Log a drop-off
```bash
curl -X POST https://your-worker.workers.dev/api/dropoffs \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "bottles": 15, "location": "Faculty of Engineering"}'
```

---

## Features

- **User registration & sign-in** (email-based, no password required for demo)
- **Drop-off logging** with location selection and optional notes
- **Live global stats**: bottles recycled, CO₂ saved, water conserved
- **Real-time activity feed** showing recent drop-offs
- **Leaderboard** ranking members by points
- **Points system**: 1 point per bottle recycled
- **Auto-refresh** every 30 seconds
- **Responsive** — works on mobile and desktop

---

## Customisation Notes

Once you have the full use cases from the project owner, easy things to change:

- **Locations list** — edit the `<select>` options in `index.html`
- **Points formula** — change `1 point per bottle` in `worker/src/index.js`
- **Impact calculations** — CO₂, water, and oil savings are in the `/api/stats` route
- **Color scheme** — all colors are CSS variables at the top of `index.html`
- **Add more fields** — e.g. bottle type, photo upload, etc.
