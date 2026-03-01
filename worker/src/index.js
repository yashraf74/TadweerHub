// AquaCycle API - Cloudflare Worker
// Routes: /api/users, /api/dropoffs, /api/stats, /api/leaderboard

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

async function initDB(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      points INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dropoffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      bottles INTEGER NOT NULL,
      location TEXT NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Init DB on first request
    try {
      await initDB(env.DB);
    } catch (e) {
      // Tables already exist, ignore
    }

    // ─── Users ───────────────────────────────────────────────

    // POST /api/users — register
    if (path === '/api/users' && method === 'POST') {
      const { name, email } = await request.json();
      if (!name || !email) return error('name and email required');
      try {
        const result = await env.DB.prepare(
          'INSERT INTO users (name, email) VALUES (?, ?) RETURNING *'
        ).bind(name, email).first();
        return json(result, 201);
      } catch (e) {
        if (e.message.includes('UNIQUE')) return error('Email already registered', 409);
        return error(e.message, 500);
      }
    }

    // GET /api/users — list all
    if (path === '/api/users' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM users ORDER BY points DESC').all();
      return json(results);
    }

    // GET /api/users/:id
    if (path.match(/^\/api\/users\/\d+$/) && method === 'GET') {
      const id = path.split('/')[3];
      const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
      if (!user) return error('User not found', 404);
      return json(user);
    }

    // ─── Drop-offs ────────────────────────────────────────────

    // POST /api/dropoffs — log a drop-off
    if (path === '/api/dropoffs' && method === 'POST') {
      const { user_id, bottles, location, notes } = await request.json();
      if (!user_id || !bottles || !location) return error('user_id, bottles, and location required');
      if (bottles < 1 || bottles > 10000) return error('bottles must be between 1 and 10000');

      const dropoff = await env.DB.prepare(
        'INSERT INTO dropoffs (user_id, bottles, location, notes) VALUES (?, ?, ?, ?) RETURNING *'
      ).bind(user_id, bottles, location, notes || null).first();

      // Award points: 1 point per bottle
      await env.DB.prepare('UPDATE users SET points = points + ? WHERE id = ?').bind(bottles, user_id).run();

      return json(dropoff, 201);
    }

    // GET /api/dropoffs?user_id=X — list drop-offs (optionally filtered by user)
    if (path === '/api/dropoffs' && method === 'GET') {
      const userId = url.searchParams.get('user_id');
      let query, args;
      if (userId) {
        query = `SELECT d.*, u.name as user_name FROM dropoffs d JOIN users u ON d.user_id = u.id WHERE d.user_id = ? ORDER BY d.created_at DESC`;
        args = [userId];
      } else {
        query = `SELECT d.*, u.name as user_name FROM dropoffs d JOIN users u ON d.user_id = u.id ORDER BY d.created_at DESC LIMIT 50`;
        args = [];
      }
      const { results } = await env.DB.prepare(query).bind(...args).all();
      return json(results);
    }

    // ─── Stats ────────────────────────────────────────────────

    // GET /api/stats — global stats
    if (path === '/api/stats' && method === 'GET') {
      const totals = await env.DB.prepare(`
        SELECT 
          COUNT(DISTINCT u.id) as total_users,
          COALESCE(SUM(d.bottles), 0) as total_bottles,
          COUNT(d.id) as total_dropoffs
        FROM users u
        LEFT JOIN dropoffs d ON u.id = d.user_id
      `).first();

      const bottles = Number(totals.total_bottles);
      return json({
        total_users: totals.total_users,
        total_bottles: bottles,
        total_dropoffs: totals.total_dropoffs,
        co2_saved_kg: +(bottles * 0.082).toFixed(2),       // ~82g CO2 per bottle
        water_saved_liters: +(bottles * 3.5).toFixed(1),   // ~3.5L water per bottle
        oil_saved_liters: +(bottles * 0.06).toFixed(2),    // ~60ml oil per bottle
      });
    }

    // GET /api/leaderboard — top 10 users by points
    if (path === '/api/leaderboard' && method === 'GET') {
      const { results } = await env.DB.prepare(`
        SELECT u.id, u.name, u.points,
          COUNT(d.id) as dropoff_count,
          COALESCE(SUM(d.bottles), 0) as total_bottles
        FROM users u
        LEFT JOIN dropoffs d ON u.id = d.user_id
        GROUP BY u.id
        ORDER BY u.points DESC
        LIMIT 10
      `).all();
      return json(results);
    }

    return error('Not found', 404);
  },
};
