# TadweerHub 🌿♻️

A full-stack plastic and aluminum recycling platform bridging consumers and recycling factories across Egypt. Consumers log drop-offs, request home pickups, and earn rewards. Factories register to access clean, sorted supply and place delivery orders.

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
tadweerhub/
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

1. Create a new GitHub repository (e.g. `TadweerHub`)
2. Push this entire project folder to it:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/TadweerHub.git
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
npx wrangler d1 create tadweerhub-db
```

This prints something like:
```
[[d1_databases]]
binding = "DB"
database_name = "tadweerhub-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Copy the `database_id` into `wrangler.toml`** — replace `YOUR_D1_DATABASE_ID`.

**Deploy the Worker:**
```bash
npx wrangler deploy
```

Your API is now live at:
`https://tadweerhub-api.YOUR_SUBDOMAIN.workers.dev`

---

### Step 3 — Update the API URL in the frontend

Open `frontend/index.html` and find this line near the bottom (in the `<script>` tag):

```javascript
const API = 'https://tadweerhub-api.YOUR_SUBDOMAIN.workers.dev';
```

Replace it with your actual Worker URL from Step 2.

Commit and push:
```bash
git add frontend/index.html
git commit -m "Connect frontend to API"
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

Your site is live at `https://tadweerhub.pages.dev` (or a custom domain if you add one).

**Every future `git push` to `main` will auto-redeploy the frontend automatically.**

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/users` | Register a new consumer |
| `GET` | `/api/users` | List all consumers |
| `GET` | `/api/users/:id` | Get consumer by ID |
| `POST` | `/api/factories` | Register a new factory |
| `GET` | `/api/factories` | List all factories |
| `GET` | `/api/factories/:id` | Get factory by ID |
| `POST` | `/api/dropoffs` | Log a drop-off |
| `GET` | `/api/dropoffs?user_id=X` | Get drop-offs (optional filter) |
| `POST` | `/api/pickups` | Request a home pickup |
| `GET` | `/api/pickups?user_id=X` | Get pickup requests (optional filter) |
| `PUT` | `/api/pickups/:id/status` | Update pickup status |
| `POST` | `/api/orders` | Submit a factory supply order |
| `GET` | `/api/orders?factory_id=X` | Get supply orders (optional filter) |
| `GET` | `/api/stats` | Global platform statistics |
| `GET` | `/api/leaderboard` | Top 10 collectors by points |

## Running Tests
```bash
cd worker
npm install
npm test
```

To run in watch mode during development:
```bash
npm run test:watch
```
```

---

**`.gitignore`** — yes, add coverage output so it doesn't get committed:
```
node_modules/
coverage/

### Example: Register a consumer
```bash
curl -X POST https://tadweerhub-api.YOUR_SUBDOMAIN.workers.dev/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Sara Ahmed", "email": "sara@example.com", "phone": "+201001234567"}'
```

### Example: Log a drop-off
```bash
curl -X POST https://tadweerhub-api.YOUR_SUBDOMAIN.workers.dev/api/dropoffs \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "bottles": 15, "location": "Faculty of Engineering", "material_type": "plastic"}'
```

### Example: Request a home pickup
```bash
curl -X POST https://tadweerhub-api.YOUR_SUBDOMAIN.workers.dev/api/pickups \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "address": "12 Tahrir St, Cairo", "quantity": 30, "material_type": "mixed"}'
```

### Example: Register a factory
```bash
curl -X POST https://tadweerhub-api.YOUR_SUBDOMAIN.workers.dev/api/factories \
  -H "Content-Type: application/json" \
  -d '{"name": "Cairo Recycling Co.", "contact": "Mahmoud Ali", "email": "info@cairorecycling.com", "governorate": "Cairo", "material_pref": "plastic"}'
```

### Example: Submit a supply order
```bash
curl -X POST https://tadweerhub-api.YOUR_SUBDOMAIN.workers.dev/api/orders \
  -H "Content-Type: application/json" \
  -d '{"factory_id": 1, "material": "plastic_flakes", "quantity_kg": 500, "address": "Industrial Zone, 6th of October"}'
```

---

## Features

**Consumer Side**
- Registration & email-based sign-in
- Drop-off logging with material type and location
- Home pickup requests with address, date, and quantity
- Live global impact stats: bottles collected, CO₂ saved, water conserved
- Real-time activity feed
- Points leaderboard

**Factory Side**
- Factory registration with governorate and material preferences
- Supply overview dashboard (available bottles, pending pickups, active collectors)
- Supply delivery order form (material type, quantity in KG, delivery address)
- Live pickup requests feed

**General**
- Auto-refresh every 30 seconds
- Fully responsive — desktop and mobile
- Hamburger menu on mobile

---

## Customisation Notes

- **Drop-off locations list** — edit the `<select>` options in `index.html`
- **Points formula** — change `1 point per bottle` in `worker/src/index.js`
- **Impact calculations** — CO₂, water, and oil savings are in the `/api/stats` route
- **Color scheme** — all colors are CSS variables at the top of `index.html`
- **Logo** — replace the `LOGO HERE` placeholder divs in the navbar and footer with an `<img>` tag
