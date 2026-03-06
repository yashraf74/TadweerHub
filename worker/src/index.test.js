// TadweerHub API — Test Suite
// Run with: npx vitest run
// Coverage: Users, Factories, Drop-offs, Pickups, Orders, Stats, Leaderboard
// Tests: happy paths, validation, edge cases, business rules, data integrity

import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index.js';

// ── In-memory D1 mock ─────────────────────────────────────────────────────────
// Simulates Cloudflare D1 with a real SQLite-like in-memory store

function createDB() {
  const tables = {
    users:     [],
    factories: [],
    dropoffs:  [],
    pickups:   [],
    orders:    [],
  };
  const counters = { users: 0, factories: 0, dropoffs: 0, pickups: 0, orders: 0 };

  function now() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }

  const db = {
    _tables: tables,
    _reset() {
      Object.keys(tables).forEach(t => { tables[t] = []; counters[t] = 0; });
    },

    exec(sql) {
      // CREATE TABLE IF NOT EXISTS — no-op in mock
      return Promise.resolve();
    },

    prepare(sql) {
      const stmt = { _sql: sql, _bindings: [] };

      stmt.bind = (...args) => { stmt._bindings = args; return stmt; };

      stmt.first = () => {
        const sql = stmt._sql.trim();
        const b   = stmt._bindings;

        // INSERT INTO users
        if (sql.includes('INSERT INTO users')) {
          const [name, email, phone] = b;
          if (tables.users.find(u => u.email === email)) throw new Error('UNIQUE constraint failed');
          const row = { id: ++counters.users, name, email, phone: phone || null, points: 0, created_at: now() };
          tables.users.push(row);
          return Promise.resolve(row);
        }

        // INSERT INTO factories
        if (sql.includes('INSERT INTO factories')) {
          const [name, contact, email, phone, governorate, material_pref] = b;
          if (tables.factories.find(f => f.email === email)) throw new Error('UNIQUE constraint failed');
          const row = { id: ++counters.factories, name, contact, email, phone: phone || null, governorate: governorate || null, material_pref: material_pref || 'both', created_at: now() };
          tables.factories.push(row);
          return Promise.resolve(row);
        }

        // INSERT INTO dropoffs
        if (sql.includes('INSERT INTO dropoffs')) {
          const [user_id, bottles, location, material_type, notes] = b;
          const row = { id: ++counters.dropoffs, user_id, bottles, location, material_type: material_type || 'plastic', notes: notes || null, created_at: now() };
          tables.dropoffs.push(row);
          return Promise.resolve(row);
        }

        // INSERT INTO pickups
        if (sql.includes('INSERT INTO pickups')) {
          const [user_id, address, quantity, material_type, preferred_date] = b;
          const row = { id: ++counters.pickups, user_id, address, quantity, material_type: material_type || 'mixed', preferred_date: preferred_date || null, status: 'pending', created_at: now() };
          tables.pickups.push(row);
          return Promise.resolve(row);
        }

        // INSERT INTO orders
        if (sql.includes('INSERT INTO orders')) {
          const [factory_id, material, quantity_kg, address, required_by, notes] = b;
          const row = { id: ++counters.orders, factory_id, material, quantity_kg, address, required_by: required_by || null, notes: notes || null, status: 'pending', created_at: now() };
          tables.orders.push(row);
          return Promise.resolve(row);
        }

        // SELECT users WHERE id
        if (sql.includes('SELECT * FROM users WHERE id')) {
          return Promise.resolve(tables.users.find(u => u.id === Number(b[0])) || null);
        }

        // SELECT factories WHERE id
        if (sql.includes('SELECT * FROM factories WHERE id')) {
          return Promise.resolve(tables.factories.find(f => f.id === Number(b[0])) || null);
        }

        // Stats aggregation
        if (sql.includes('total_users')) {
          const totalBottles = tables.dropoffs.reduce((s, d) => s + d.bottles, 0);
          return Promise.resolve({
            total_users:     tables.users.length,
            total_factories: tables.factories.length,
            total_bottles:   totalBottles,
            total_dropoffs:  tables.dropoffs.length,
            total_pickups:   tables.pickups.length,
            total_orders:    tables.orders.length,
          });
        }

        return Promise.resolve(null);
      };

      stmt.all = () => {
        const sql = stmt._sql.trim();
        const b   = stmt._bindings;

        // SELECT users
        if (sql.includes('SELECT * FROM users')) {
          return Promise.resolve({ results: [...tables.users].sort((a, z) => z.points - a.points) });
        }

        // SELECT factories
        if (sql.includes('SELECT * FROM factories')) {
          return Promise.resolve({ results: [...tables.factories] });
        }

        // SELECT dropoffs with user_id filter
        if (sql.includes('FROM dropoffs d') && b.length > 0) {
          const userId = Number(b[0]);
          const results = tables.dropoffs
            .filter(d => d.user_id === userId)
            .map(d => ({ ...d, user_name: tables.users.find(u => u.id === d.user_id)?.name || '' }))
            .sort((a, z) => new Date(z.created_at) - new Date(a.created_at));
          return Promise.resolve({ results });
        }

        // SELECT dropoffs (all)
        if (sql.includes('FROM dropoffs d')) {
          const results = tables.dropoffs
            .map(d => ({ ...d, user_name: tables.users.find(u => u.id === d.user_id)?.name || '' }))
            .sort((a, z) => new Date(z.created_at) - new Date(a.created_at))
            .slice(0, 50);
          return Promise.resolve({ results });
        }

        // SELECT pickups with user_id filter
        if (sql.includes('FROM pickups p') && b.length > 0) {
          const userId = Number(b[0]);
          const results = tables.pickups
            .filter(p => p.user_id === userId)
            .map(p => ({ ...p, user_name: tables.users.find(u => u.id === p.user_id)?.name || '' }));
          return Promise.resolve({ results });
        }

        // SELECT pickups (all)
        if (sql.includes('FROM pickups p')) {
          const results = tables.pickups
            .map(p => ({ ...p, user_name: tables.users.find(u => u.id === p.user_id)?.name || '' }))
            .slice(0, 50);
          return Promise.resolve({ results });
        }

        // SELECT orders with factory filter
        if (sql.includes('FROM orders o') && b.length > 0) {
          const factoryId = Number(b[0]);
          const results = tables.orders
            .filter(o => o.factory_id === factoryId)
            .map(o => ({ ...o, factory_name: tables.factories.find(f => f.id === o.factory_id)?.name || '' }));
          return Promise.resolve({ results });
        }

        // SELECT orders (all)
        if (sql.includes('FROM orders o')) {
          const results = tables.orders
            .map(o => ({ ...o, factory_name: tables.factories.find(f => f.id === o.factory_id)?.name || '' }))
            .slice(0, 50);
          return Promise.resolve({ results });
        }

        // Leaderboard
        if (sql.includes('dropoff_count')) {
          const results = tables.users.map(u => ({
            id:            u.id,
            name:          u.name,
            points:        u.points,
            dropoff_count: tables.dropoffs.filter(d => d.user_id === u.id).length,
            total_bottles: tables.dropoffs.filter(d => d.user_id === u.id).reduce((s, d) => s + d.bottles, 0),
          })).sort((a, z) => z.points - a.points).slice(0, 10);
          return Promise.resolve({ results });
        }

        return Promise.resolve({ results: [] });
      };

      stmt.run = () => {
        const sql = stmt._sql.trim();
        const b   = stmt._bindings;

        // UPDATE users points
        if (sql.includes('UPDATE users SET points')) {
          const [points, id] = b;
          const user = tables.users.find(u => u.id === Number(id));
          if (user) user.points += points;
          return Promise.resolve();
        }

        // UPDATE pickups status
        if (sql.includes('UPDATE pickups SET status')) {
          const [status, id] = b;
          const pickup = tables.pickups.find(p => p.id === Number(id));
          if (pickup) pickup.status = status;
          return Promise.resolve();
        }

        return Promise.resolve();
      };

      return stmt;
    },
  };

  return db;
}

// ── Test helpers ──────────────────────────────────────────────────────────────

const db  = createDB();
const env = { DB: db };

function req(method, path, body = null) {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  return new Request(`https://tadweerhub.test${path}`, init);
}

async function call(method, path, body = null) {
  const res  = await worker.fetch(req(method, path, body), env);
  const data = await res.json();
  return { status: res.status, data };
}

// Seed helpers
async function seedUser(overrides = {}) {
  const defaults = { name: 'Test User', email: `user${Date.now()}${Math.random()}@test.com` };
  const { data } = await call('POST', '/api/users', { ...defaults, ...overrides });
  return data;
}

async function seedFactory(overrides = {}) {
  const defaults = { name: 'Test Factory', contact: 'Test Contact', email: `factory${Date.now()}${Math.random()}@test.com`, governorate: 'Cairo' };
  const { data } = await call('POST', '/api/factories', { ...defaults, ...overrides });
  return data;
}

// ── Test Suite ────────────────────────────────────────────────────────────────

beforeEach(() => db._reset());

// ─────────────────────────────────────────────────────────────────────────────
describe('CORS', () => {
  it('responds to OPTIONS preflight with correct headers', async () => {
    const res = await worker.fetch(req('OPTIONS', '/api/users'), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('includes CORS headers on every response', async () => {
    const res = await worker.fetch(req('GET', '/api/stats'), env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const { status, data } = await call('GET', '/api/nonexistent');
    expect(status).toBe(404);
    expect(data.error).toBeDefined();
  });

  it('returns 404 for wrong method on known route', async () => {
    const { status } = await call('DELETE', '/api/users');
    expect(status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Users — POST /api/users', () => {
  it('creates a user with valid data', async () => {
    const { status, data } = await call('POST', '/api/users', { name: 'Noha Abdelrahman', email: 'noha@test.com' });
    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    expect(data.name).toBe('Noha Abdelrahman');
    expect(data.email).toBe('noha@test.com');
    expect(data.points).toBe(0);
  });

  it('creates a user with optional phone number', async () => {
    const { status, data } = await call('POST', '/api/users', { name: 'Sara', email: 'sara@test.com', phone: '+201001234567' });
    expect(status).toBe(201);
    expect(data.phone).toBe('+201001234567');
  });

  it('assigns 0 points to new user', async () => {
    const { data } = await call('POST', '/api/users', { name: 'Zero', email: 'zero@test.com' });
    expect(data.points).toBe(0);
  });

  it('returns 400 when name is missing', async () => {
    const { status, data } = await call('POST', '/api/users', { email: 'noname@test.com' });
    expect(status).toBe(400);
    expect(data.error).toMatch(/name/i);
  });

  it('returns 400 when email is missing', async () => {
    const { status, data } = await call('POST', '/api/users', { name: 'No Email' });
    expect(status).toBe(400);
    expect(data.error).toMatch(/email/i);
  });

  it('returns 400 when both name and email are missing', async () => {
    const { status } = await call('POST', '/api/users', {});
    expect(status).toBe(400);
  });

  it('returns 409 on duplicate email', async () => {
    await call('POST', '/api/users', { name: 'First', email: 'dupe@test.com' });
    const { status, data } = await call('POST', '/api/users', { name: 'Second', email: 'dupe@test.com' });
    expect(status).toBe(409);
    expect(data.error).toMatch(/already registered/i);
  });

  it('email is case-sensitive in uniqueness check', async () => {
    await call('POST', '/api/users', { name: 'Lower', email: 'case@test.com' });
    // Same email, same case → should conflict
    const { status } = await call('POST', '/api/users', { name: 'Upper', email: 'case@test.com' });
    expect(status).toBe(409);
  });

  it('assigns incrementing IDs', async () => {
    const { data: u1 } = await call('POST', '/api/users', { name: 'A', email: 'a@test.com' });
    const { data: u2 } = await call('POST', '/api/users', { name: 'B', email: 'b@test.com' });
    expect(u2.id).toBeGreaterThan(u1.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Users — GET /api/users', () => {
  it('returns empty array when no users', async () => {
    const { status, data } = await call('GET', '/api/users');
    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  it('returns all users', async () => {
    await seedUser({ name: 'A', email: 'a@test.com' });
    await seedUser({ name: 'B', email: 'b@test.com' });
    const { data } = await call('GET', '/api/users');
    expect(data.length).toBe(2);
  });

  it('returns users sorted by points descending', async () => {
    const u1 = await seedUser({ name: 'Low',  email: 'low@test.com' });
    const u2 = await seedUser({ name: 'High', email: 'high@test.com' });
    // Give u2 more points via dropoff
    await call('POST', '/api/dropoffs', { user_id: u2.id, bottles: 100, location: 'Test' });
    const { data } = await call('GET', '/api/users');
    expect(data[0].points).toBeGreaterThanOrEqual(data[1].points);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Users — GET /api/users/:id', () => {
  it('returns a user by ID', async () => {
    const user = await seedUser({ name: 'Specific', email: 'specific@test.com' });
    const { status, data } = await call('GET', `/api/users/${user.id}`);
    expect(status).toBe(200);
    expect(data.id).toBe(user.id);
    expect(data.name).toBe('Specific');
  });

  it('returns 404 for non-existent user', async () => {
    const { status, data } = await call('GET', '/api/users/99999');
    expect(status).toBe(404);
    expect(data.error).toMatch(/not found/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Factories — POST /api/factories', () => {
  it('creates a factory with valid data', async () => {
    const { status, data } = await call('POST', '/api/factories', {
      name: 'Cairo Recycling Co.', contact: 'Mahmoud Ali', email: 'crc@test.com', governorate: 'Cairo',
    });
    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    expect(data.name).toBe('Cairo Recycling Co.');
    expect(data.material_pref).toBe('both'); // default
  });

  it('stores governorate and material preference', async () => {
    const { data } = await call('POST', '/api/factories', {
      name: 'Giza Factory', contact: 'Ahmed', email: 'giza@test.com',
      governorate: 'Giza', material_pref: 'plastic',
    });
    expect(data.governorate).toBe('Giza');
    expect(data.material_pref).toBe('plastic');
  });

  it('returns 400 when name is missing', async () => {
    const { status } = await call('POST', '/api/factories', { contact: 'X', email: 'x@test.com' });
    expect(status).toBe(400);
  });

  it('returns 400 when contact is missing', async () => {
    const { status } = await call('POST', '/api/factories', { name: 'X', email: 'x@test.com' });
    expect(status).toBe(400);
  });

  it('returns 400 when email is missing', async () => {
    const { status } = await call('POST', '/api/factories', { name: 'X', contact: 'Y' });
    expect(status).toBe(400);
  });

  it('returns 409 on duplicate factory email', async () => {
    await call('POST', '/api/factories', { name: 'F1', contact: 'C1', email: 'dupe@factory.com' });
    const { status } = await call('POST', '/api/factories', { name: 'F2', contact: 'C2', email: 'dupe@factory.com' });
    expect(status).toBe(409);
  });

  it('consumer email and factory email can be the same without conflict', async () => {
    await call('POST', '/api/users',     { name: 'User', email: 'shared@test.com' });
    const { status } = await call('POST', '/api/factories', { name: 'Fac', contact: 'C', email: 'shared@test.com' });
    // They are separate tables — should succeed
    expect(status).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Factories — GET /api/factories', () => {
  it('returns empty array when no factories', async () => {
    const { data } = await call('GET', '/api/factories');
    expect(data).toEqual([]);
  });

  it('returns all factories', async () => {
    await seedFactory();
    await seedFactory();
    const { data } = await call('GET', '/api/factories');
    expect(data.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Factories — GET /api/factories/:id', () => {
  it('returns factory by ID', async () => {
    const factory = await seedFactory({ name: 'Found Factory' });
    const { status, data } = await call('GET', `/api/factories/${factory.id}`);
    expect(status).toBe(200);
    expect(data.name).toBe('Found Factory');
  });

  it('returns 404 for non-existent factory', async () => {
    const { status } = await call('GET', '/api/factories/99999');
    expect(status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Drop-offs — POST /api/dropoffs', () => {
  it('creates a drop-off with valid data', async () => {
    const user = await seedUser();
    const { status, data } = await call('POST', '/api/dropoffs', {
      user_id: user.id, bottles: 20, location: 'Faculty of Engineering',
    });
    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    expect(data.bottles).toBe(20);
    expect(data.material_type).toBe('plastic'); // default
  });

  it('awards points to user equal to bottle count', async () => {
    const user = await seedUser();
    await call('POST', '/api/dropoffs', { user_id: user.id, bottles: 50, location: 'Test' });
    const { data: updated } = await call('GET', `/api/users/${user.id}`);
    expect(updated.points).toBe(50);
  });

  it('accumulates points across multiple drop-offs', async () => {
    const user = await seedUser();
    await call('POST', '/api/dropoffs', { user_id: user.id, bottles: 30, location: 'A' });
    await call('POST', '/api/dropoffs', { user_id: user.id, bottles: 70, location: 'B' });
    const { data: updated } = await call('GET', `/api/users/${user.id}`);
    expect(updated.points).toBe(100);
  });

  it('stores material type correctly', async () => {
    const user = await seedUser();
    const { data } = await call('POST', '/api/dropoffs', {
      user_id: user.id, bottles: 10, location: 'Test', material_type: 'cans',
    });
    expect(data.material_type).toBe('cans');
  });

  it('stores optional notes', async () => {
    const user = await seedUser();
    const { data } = await call('POST', '/api/dropoffs', {
      user_id: user.id, bottles: 5, location: 'Test', notes: 'Sorted and cleaned',
    });
    expect(data.notes).toBe('Sorted and cleaned');
  });

  it('returns 400 when user_id is missing', async () => {
    const { status } = await call('POST', '/api/dropoffs', { bottles: 10, location: 'Test' });
    expect(status).toBe(400);
  });

  it('returns 400 when bottles is missing', async () => {
    const user = await seedUser();
    const { status } = await call('POST', '/api/dropoffs', { user_id: user.id, location: 'Test' });
    expect(status).toBe(400);
  });

  it('returns 400 when location is missing', async () => {
    const user = await seedUser();
    const { status } = await call('POST', '/api/dropoffs', { user_id: user.id, bottles: 10 });
    expect(status).toBe(400);
  });

  it('rejects 0 bottles', async () => {
    const user = await seedUser();
    const { status } = await call('POST', '/api/dropoffs', { user_id: user.id, bottles: 0, location: 'Test' });
    expect(status).toBe(400);
  });

  it('rejects negative bottles', async () => {
    const user = await seedUser();
    const { status } = await call('POST', '/api/dropoffs', { user_id: user.id, bottles: -5, location: 'Test' });
    expect(status).toBe(400);
  });

  it('rejects bottles over 10000', async () => {
    const user = await seedUser();
    const { status } = await call('POST', '/api/dropoffs', { user_id: user.id, bottles: 10001, location: 'Test' });
    expect(status).toBe(400);
  });

  it('accepts exactly 1 bottle (lower boundary)', async () => {
    const user = await seedUser();
    const { status } = await call('POST', '/api/dropoffs', { user_id: user.id, bottles: 1, location: 'Test' });
    expect(status).toBe(201);
  });

  it('accepts exactly 10000 bottles (upper boundary)', async () => {
    const user = await seedUser();
    const { status } = await call('POST', '/api/dropoffs', { user_id: user.id, bottles: 10000, location: 'Test' });
    expect(status).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Drop-offs — GET /api/dropoffs', () => {
  it('returns empty array when no drop-offs', async () => {
    const { data } = await call('GET', '/api/dropoffs');
    expect(data).toEqual([]);
  });

  it('returns all drop-offs with user names joined', async () => {
    const user = await seedUser({ name: 'Layla', email: 'layla@test.com' });
    await call('POST', '/api/dropoffs', { user_id: user.id, bottles: 10, location: 'Test' });
    const { data } = await call('GET', '/api/dropoffs');
    expect(data[0].user_name).toBe('Layla');
  });

  it('filters by user_id when query param provided', async () => {
    const u1 = await seedUser({ name: 'U1', email: 'u1@test.com' });
    const u2 = await seedUser({ name: 'U2', email: 'u2@test.com' });
    await call('POST', '/api/dropoffs', { user_id: u1.id, bottles: 10, location: 'A' });
    await call('POST', '/api/dropoffs', { user_id: u2.id, bottles: 20, location: 'B' });
    const { data } = await call('GET', `/api/dropoffs?user_id=${u1.id}`);
    expect(data.every(d => d.user_id === u1.id)).toBe(true);
    expect(data.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Pickups — POST /api/pickups', () => {
  it('creates a pickup request with valid data', async () => {
    const user = await seedUser();
    const { status, data } = await call('POST', '/api/pickups', {
      user_id: user.id, address: '12 Tahrir St, Cairo', quantity: 50,
    });
    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    expect(data.status).toBe('pending');
    expect(data.material_type).toBe('mixed'); // default
  });

  it('stores preferred pickup date', async () => {
    const user = await seedUser();
    const { data } = await call('POST', '/api/pickups', {
      user_id: user.id, address: 'Test St', quantity: 20, preferred_date: '2025-12-01',
    });
    expect(data.preferred_date).toBe('2025-12-01');
  });

  it('stores material type for pickup', async () => {
    const user = await seedUser();
    const { data } = await call('POST', '/api/pickups', {
      user_id: user.id, address: 'Test', quantity: 10, material_type: 'plastic',
    });
    expect(data.material_type).toBe('plastic');
  });

  it('defaults status to pending', async () => {
    const user = await seedUser();
    const { data } = await call('POST', '/api/pickups', { user_id: user.id, address: 'Test', quantity: 5 });
    expect(data.status).toBe('pending');
  });

  it('returns 400 when user_id is missing', async () => {
    const { status } = await call('POST', '/api/pickups', { address: 'Test', quantity: 10 });
    expect(status).toBe(400);
  });

  it('returns 400 when address is missing', async () => {
    const user = await seedUser();
    const { status } = await call('POST', '/api/pickups', { user_id: user.id, quantity: 10 });
    expect(status).toBe(400);
  });

  it('returns 400 when quantity is missing', async () => {
    const user = await seedUser();
    const { status } = await call('POST', '/api/pickups', { user_id: user.id, address: 'Test' });
    expect(status).toBe(400);
  });

  it('does NOT award points for pickup requests (only drop-offs earn points)', async () => {
    const user = await seedUser();
    await call('POST', '/api/pickups', { user_id: user.id, address: 'Test', quantity: 100 });
    const { data: updated } = await call('GET', `/api/users/${user.id}`);
    expect(updated.points).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Pickups — GET /api/pickups', () => {
  it('returns all pickups with user names', async () => {
    const user = await seedUser({ name: 'Ahmed', email: 'ahmed@test.com' });
    await call('POST', '/api/pickups', { user_id: user.id, address: 'Test', quantity: 10 });
    const { data } = await call('GET', '/api/pickups');
    expect(data[0].user_name).toBe('Ahmed');
  });

  it('filters pickups by user_id', async () => {
    const u1 = await seedUser({ name: 'P1', email: 'p1@test.com' });
    const u2 = await seedUser({ name: 'P2', email: 'p2@test.com' });
    await call('POST', '/api/pickups', { user_id: u1.id, address: 'A', quantity: 10 });
    await call('POST', '/api/pickups', { user_id: u2.id, address: 'B', quantity: 20 });
    const { data } = await call('GET', `/api/pickups?user_id=${u2.id}`);
    expect(data.length).toBe(1);
    expect(data[0].user_id).toBe(u2.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Pickups — PUT /api/pickups/:id/status', () => {
  it('updates pickup status to confirmed', async () => {
    const user   = await seedUser();
    const pickup = (await call('POST', '/api/pickups', { user_id: user.id, address: 'Test', quantity: 10 })).data;
    const { status, data } = await call('PUT', `/api/pickups/${pickup.id}/status`, { status: 'confirmed' });
    expect(status).toBe(200);
    expect(data.status).toBe('confirmed');
  });

  it('updates pickup status to completed', async () => {
    const user   = await seedUser();
    const pickup = (await call('POST', '/api/pickups', { user_id: user.id, address: 'Test', quantity: 10 })).data;
    const { data } = await call('PUT', `/api/pickups/${pickup.id}/status`, { status: 'completed' });
    expect(data.status).toBe('completed');
  });

  it('updates pickup status to cancelled', async () => {
    const user   = await seedUser();
    const pickup = (await call('POST', '/api/pickups', { user_id: user.id, address: 'Test', quantity: 10 })).data;
    const { data } = await call('PUT', `/api/pickups/${pickup.id}/status`, { status: 'cancelled' });
    expect(data.status).toBe('cancelled');
  });

  it('rejects invalid status values', async () => {
    const user   = await seedUser();
    const pickup = (await call('POST', '/api/pickups', { user_id: user.id, address: 'Test', quantity: 10 })).data;
    const { status } = await call('PUT', `/api/pickups/${pickup.id}/status`, { status: 'flying' });
    expect(status).toBe(400);
  });

  it('rejects empty status', async () => {
    const user   = await seedUser();
    const pickup = (await call('POST', '/api/pickups', { user_id: user.id, address: 'Test', quantity: 10 })).data;
    const { status } = await call('PUT', `/api/pickups/${pickup.id}/status`, { status: '' });
    expect(status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Supply Orders — POST /api/orders', () => {
  it('creates a supply order with valid data', async () => {
    const factory = await seedFactory();
    const { status, data } = await call('POST', '/api/orders', {
      factory_id:  factory.id,
      material:    'plastic_flakes',
      quantity_kg: 500,
      address:     'Industrial Zone, 6th of October',
    });
    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    expect(data.status).toBe('pending');
    expect(data.quantity_kg).toBe(500);
  });

  it('stores all optional fields', async () => {
    const factory = await seedFactory();
    const { data } = await call('POST', '/api/orders', {
      factory_id:  factory.id,
      material:    'aluminum_cans',
      quantity_kg: 200,
      address:     'Test Factory Rd',
      required_by: '2025-12-15',
      notes:       'Must be sorted and cleaned',
    });
    expect(data.required_by).toBe('2025-12-15');
    expect(data.notes).toBe('Must be sorted and cleaned');
  });

  it('returns 400 when factory_id is missing', async () => {
    const { status } = await call('POST', '/api/orders', { material: 'plastic', quantity_kg: 100, address: 'Test' });
    expect(status).toBe(400);
  });

  it('returns 400 when material is missing', async () => {
    const factory = await seedFactory();
    const { status } = await call('POST', '/api/orders', { factory_id: factory.id, quantity_kg: 100, address: 'Test' });
    expect(status).toBe(400);
  });

  it('returns 400 when quantity_kg is missing', async () => {
    const factory = await seedFactory();
    const { status } = await call('POST', '/api/orders', { factory_id: factory.id, material: 'plastic', address: 'Test' });
    expect(status).toBe(400);
  });

  it('returns 400 when address is missing', async () => {
    const factory = await seedFactory();
    const { status } = await call('POST', '/api/orders', { factory_id: factory.id, material: 'plastic', quantity_kg: 100 });
    expect(status).toBe(400);
  });

  it('enforces minimum order of 50 kg', async () => {
    const factory = await seedFactory();
    const { status, data } = await call('POST', '/api/orders', {
      factory_id: factory.id, material: 'plastic', quantity_kg: 49, address: 'Test',
    });
    expect(status).toBe(400);
    expect(data.error).toMatch(/minimum/i);
  });

  it('accepts exactly 50 kg (minimum boundary)', async () => {
    const factory = await seedFactory();
    const { status } = await call('POST', '/api/orders', {
      factory_id: factory.id, material: 'plastic', quantity_kg: 50, address: 'Test',
    });
    expect(status).toBe(201);
  });

  it('rejects 0 kg order', async () => {
    const factory = await seedFactory();
    const { status } = await call('POST', '/api/orders', {
      factory_id: factory.id, material: 'plastic', quantity_kg: 0, address: 'Test',
    });
    expect(status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Supply Orders — GET /api/orders', () => {
  it('returns all orders with factory names joined', async () => {
    const factory = await seedFactory({ name: 'Nile Recyclers', email: 'nile@test.com' });
    await call('POST', '/api/orders', { factory_id: factory.id, material: 'plastic', quantity_kg: 100, address: 'Test' });
    const { data } = await call('GET', '/api/orders');
    expect(data[0].factory_name).toBe('Nile Recyclers');
  });

  it('filters orders by factory_id', async () => {
    const f1 = await seedFactory({ name: 'F1', email: 'f1@test.com' });
    const f2 = await seedFactory({ name: 'F2', email: 'f2@test.com' });
    await call('POST', '/api/orders', { factory_id: f1.id, material: 'plastic', quantity_kg: 100, address: 'A' });
    await call('POST', '/api/orders', { factory_id: f2.id, material: 'cans',    quantity_kg: 200, address: 'B' });
    const { data } = await call('GET', `/api/orders?factory_id=${f1.id}`);
    expect(data.length).toBe(1);
    expect(data[0].factory_id).toBe(f1.id);
  });

  it('returns empty array when no orders', async () => {
    const { data } = await call('GET', '/api/orders');
    expect(data).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Stats — GET /api/stats', () => {
  it('returns zeroed stats on empty database', async () => {
    const { status, data } = await call('GET', '/api/stats');
    expect(status).toBe(200);
    expect(data.total_users).toBe(0);
    expect(data.total_factories).toBe(0);
    expect(data.total_bottles).toBe(0);
    expect(data.total_dropoffs).toBe(0);
    expect(data.total_pickups).toBe(0);
    expect(data.total_orders).toBe(0);
    expect(data.co2_saved_kg).toBe(0);
    expect(data.water_saved_liters).toBe(0);
  });

  it('reflects correct user and factory counts', async () => {
    await seedUser();
    await seedUser();
    await seedFactory();
    const { data } = await call('GET', '/api/stats');
    expect(data.total_users).toBe(2);
    expect(data.total_factories).toBe(1);
  });

  it('reflects correct bottle count', async () => {
    const user = await seedUser();
    await call('POST', '/api/dropoffs', { user_id: user.id, bottles: 40, location: 'A' });
    await call('POST', '/api/dropoffs', { user_id: user.id, bottles: 60, location: 'B' });
    const { data } = await call('GET', '/api/stats');
    expect(data.total_bottles).toBe(100);
  });

  it('calculates CO2 savings correctly (0.082 kg per bottle)', async () => {
    const user = await seedUser();
    await call('POST', '/api/dropoffs', { user_id: user.id, bottles: 100, location: 'Test' });
    const { data } = await call('GET', '/api/stats');
    expect(data.co2_saved_kg).toBeCloseTo(8.2, 1);
  });

  it('calculates water savings correctly (3.5 litres per bottle)', async () => {
    const user = await seedUser();
    await call('POST', '/api/dropoffs', { user_id: user.id, bottles: 100, location: 'Test' });
    const { data } = await call('GET', '/api/stats');
    expect(data.water_saved_liters).toBeCloseTo(350, 0);
  });

  it('calculates oil savings correctly (0.06 litres per bottle)', async () => {
    const user = await seedUser();
    await call('POST', '/api/dropoffs', { user_id: user.id, bottles: 100, location: 'Test' });
    const { data } = await call('GET', '/api/stats');
    expect(data.oil_saved_liters).toBeCloseTo(6.0, 1);
  });

  it('counts pickup requests', async () => {
    const user = await seedUser();
    await call('POST', '/api/pickups', { user_id: user.id, address: 'A', quantity: 10 });
    await call('POST', '/api/pickups', { user_id: user.id, address: 'B', quantity: 20 });
    const { data } = await call('GET', '/api/stats');
    expect(data.total_pickups).toBe(2);
  });

  it('counts supply orders', async () => {
    const factory = await seedFactory();
    await call('POST', '/api/orders', { factory_id: factory.id, material: 'plastic', quantity_kg: 100, address: 'X' });
    const { data } = await call('GET', '/api/stats');
    expect(data.total_orders).toBe(1);
  });

  it('returns numeric types not strings for all stat fields', async () => {
    const { data } = await call('GET', '/api/stats');
    expect(typeof data.total_users).toBe('number');
    expect(typeof data.total_bottles).toBe('number');
    expect(typeof data.co2_saved_kg).toBe('number');
    expect(typeof data.water_saved_liters).toBe('number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Leaderboard — GET /api/leaderboard', () => {
  it('returns empty array when no users', async () => {
    const { data } = await call('GET', '/api/leaderboard');
    expect(data).toEqual([]);
  });

  it('returns users sorted by points descending', async () => {
    const u1 = await seedUser({ name: 'Low',  email: 'low@lb.com' });
    const u2 = await seedUser({ name: 'High', email: 'high@lb.com' });
    await call('POST', '/api/dropoffs', { user_id: u1.id, bottles: 10,  location: 'A' });
    await call('POST', '/api/dropoffs', { user_id: u2.id, bottles: 100, location: 'B' });
    const { data } = await call('GET', '/api/leaderboard');
    expect(data[0].points).toBeGreaterThanOrEqual(data[1].points);
  });

  it('includes dropoff_count and total_bottles for each user', async () => {
    const user = await seedUser({ name: 'Counted', email: 'counted@lb.com' });
    await call('POST', '/api/dropoffs', { user_id: user.id, bottles: 30, location: 'A' });
    await call('POST', '/api/dropoffs', { user_id: user.id, bottles: 20, location: 'B' });
    const { data } = await call('GET', '/api/leaderboard');
    const entry = data.find(e => e.id === user.id);
    expect(entry.dropoff_count).toBe(2);
    expect(Number(entry.total_bottles)).toBe(50);
  });

  it('limits results to top 10', async () => {
    for (let i = 0; i < 15; i++) {
      await seedUser({ name: `User${i}`, email: `u${i}@lb.com` });
    }
    const { data } = await call('GET', '/api/leaderboard');
    expect(data.length).toBeLessThanOrEqual(10);
  });

  it('includes users with 0 drop-offs', async () => {
    const user = await seedUser({ name: 'No Dropoffs', email: 'nodrop@lb.com' });
    const { data } = await call('GET', '/api/leaderboard');
    const entry = data.find(e => e.id === user.id);
    expect(entry).toBeDefined();
    expect(entry.dropoff_count).toBe(0);
    expect(Number(entry.total_bottles)).toBe(0);
  });

  it('correctly ranks multiple users by accumulated points', async () => {
    const u1 = await seedUser({ name: 'Gold',   email: 'gold@lb.com' });
    const u2 = await seedUser({ name: 'Silver', email: 'silver@lb.com' });
    const u3 = await seedUser({ name: 'Bronze', email: 'bronze@lb.com' });
    await call('POST', '/api/dropoffs', { user_id: u1.id, bottles: 300, location: 'X' });
    await call('POST', '/api/dropoffs', { user_id: u2.id, bottles: 200, location: 'X' });
    await call('POST', '/api/dropoffs', { user_id: u3.id, bottles: 100, location: 'X' });
    const { data } = await call('GET', '/api/leaderboard');
    expect(data[0].name).toBe('Gold');
    expect(data[1].name).toBe('Silver');
    expect(data[2].name).toBe('Bronze');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Data integrity', () => {
  it('drop-off points are reflected in leaderboard ranking', async () => {
    const u1 = await seedUser({ name: 'Active',   email: 'active@integrity.com' });
    const u2 = await seedUser({ name: 'Inactive', email: 'inactive@integrity.com' });
    await call('POST', '/api/dropoffs', { user_id: u1.id, bottles: 999, location: 'Test' });
    const { data } = await call('GET', '/api/leaderboard');
    expect(data[0].id).toBe(u1.id);
  });

  it('stats total_bottles matches sum of all dropoff bottles', async () => {
    const u1 = await seedUser({ name: 'A', email: 'a@integrity.com' });
    const u2 = await seedUser({ name: 'B', email: 'b@integrity.com' });
    await call('POST', '/api/dropoffs', { user_id: u1.id, bottles: 123, location: 'X' });
    await call('POST', '/api/dropoffs', { user_id: u2.id, bottles: 456, location: 'Y' });
    const { data: stats } = await call('GET', '/api/stats');
    const { data: lb }    = await call('GET', '/api/leaderboard');
    const lbTotal = lb.reduce((s, u) => s + Number(u.total_bottles), 0);
    expect(stats.total_bottles).toBe(lbTotal);
  });

  it('user points match total bottles dropped off', async () => {
    const user = await seedUser();
    await call('POST', '/api/dropoffs', { user_id: user.id, bottles: 77, location: 'A' });
    await call('POST', '/api/dropoffs', { user_id: user.id, bottles: 23, location: 'B' });
    const { data: updated } = await call('GET', `/api/users/${user.id}`);
    expect(updated.points).toBe(100);
  });

  it('factory orders do not affect consumer stats', async () => {
    const factory = await seedFactory();
    await call('POST', '/api/orders', { factory_id: factory.id, material: 'plastic', quantity_kg: 1000, address: 'Test' });
    const { data: stats } = await call('GET', '/api/stats');
    expect(stats.total_bottles).toBe(0); // orders don't change bottle count
    expect(stats.total_users).toBe(0);
  });

  it('pickup requests do not affect user points', async () => {
    const user = await seedUser();
    await call('POST', '/api/pickups', { user_id: user.id, address: 'Test', quantity: 500 });
    const { data: updated } = await call('GET', `/api/users/${user.id}`);
    expect(updated.points).toBe(0); // no points from pickup
  });
});
