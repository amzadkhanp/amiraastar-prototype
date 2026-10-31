// Local, single-machine AmiraASTAR service. Database files never belong in Git.
require('node:sqlite'); // Fail early with a clear runtime requirement on older Node releases.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '127.0.0.1';
const SESSION_MS = 8 * 60 * 60 * 1000;
const HASH_N = 32768;
const HASH_R = 8;
const HASH_P = 1;
const HASH_BYTES = 64;
const FLOW = ['placed', 'confirmed', 'packed', 'delivered', 'cancelled'];
const VALID_ROLES = ['customer', 'employee', 'admin'];
const WHEELS = ['10', '20', '25'];
const MAX_BODY = 12 * 1024 * 1024;

loadLocalEnv(path.join(ROOT, '.env'));
fs.mkdirSync(DATA_DIR, { recursive: true });
const dbFile = path.join(DATA_DIR, 'amiraastar.sqlite');
const sql = new DatabaseSync(dbFile);
sql.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
sql.exec('CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1)');
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/seed.json'), 'utf8'));
if (!sql.prepare('SELECT id FROM app_state WHERE id = 1').get()) {
  sql.prepare('INSERT INTO app_state (id, json, revision) VALUES (1, ?, 1)').run(JSON.stringify(seed));
}

let revision = 1;
let state = readState();
const sessions = new Map();
const loginAttempts = new Map();
const signupAttempts = new Map();

function loadLocalEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || Object.hasOwn(process.env, m[1])) continue;
    const value = m[2].replace(/^(["'])(.*)\1$/, '$2');
    process.env[m[1]] = value;
  }
}

function readState() {
  const row = sql.prepare('SELECT json, revision FROM app_state WHERE id = 1').get();
  revision = Number(row.revision);
  return JSON.parse(row.json);
}

function persist(next) {
  sql.prepare('UPDATE app_state SET json = ?, revision = revision + 1 WHERE id = 1').run(JSON.stringify(next));
  state = next;
  revision += 1;
}

function persistAuditOnly() {
  sql.prepare('UPDATE app_state SET json = ? WHERE id = 1').run(JSON.stringify(state));
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function clean(value, max = 200) { return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
function imageData(value) {
  if (!value) return '';
  const data = String(value);
  return data.length <= 8 * 1024 * 1024 && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/]+={0,2}$/i.test(data) ? data : '';
}
function number(value, min = 0, max = 100000000) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}
function validUser(value) { return /^[a-z0-9_.]{3,20}$/.test(String(value)); }
function validEmail(value) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value)); }
function validPassword(value) { return typeof value === 'string' && value.length >= 10 && value.length <= 128 && /[a-z]/i.test(value) && /\d/.test(value); }
function validProfile(profile) {
  return {
    name: clean(profile && profile.name, 60),
    phone: clean(profile && profile.phone, 15),
    addr: clean(profile && profile.addr, 250),
    pin: clean(profile && profile.pin, 6)
  };
}
function passwordHash(password) {
  const salt = crypto.randomBytes(16);
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, HASH_BYTES, { N: HASH_N, r: HASH_R, p: HASH_P, maxmem: 64 * 1024 * 1024 }, (err, key) => {
    if (err) reject(err);
    else resolve(`scrypt$${HASH_N}$${HASH_R}$${HASH_P}$${salt.toString('base64')}$${key.toString('base64')}`);
  }));
}
function passwordMatches(password, stored) {
  const [kind, n, r, p, saltB64, hashB64] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !saltB64 || !hashB64) return Promise.resolve(false);
  const expected = Buffer.from(hashB64, 'base64');
  return new Promise((resolve, reject) => crypto.scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 }, (err, key) => {
    if (err) reject(err);
    else resolve(key.length === expected.length && crypto.timingSafeEqual(key, expected));
  }));
}
function createSession(user) {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { u: user.u, expires: Date.now() + SESSION_MS, revision });
  return token;
}
function publicUser(user) {
  if (!user) return null;
  return {
    u: user.u, role: user.role, name: user.name, email: user.email || '', phone: user.phone || '',
    addr: user.addr || '', pin: user.pin || '', status: user.status || 'active',
    mustChange: user.mustChange ? 1 : 0, defaultPw: 0
  };
}
function userByName(name) { return state.users.find((u) => u.u === name); }
function sessionFor(req) {
  const token = parseCookies(req.headers.cookie).amira_session;
  const session = token && sessions.get(token);
  if (!session || session.expires <= Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  const user = userByName(session.u);
  if (!user || user.status !== 'active') { sessions.delete(token); return null; }
  return { token, session, user };
}
function publicState(user) {
  const out = clone(state);
  out.users = user && user.role === 'admin' ? state.users.map(publicUser) : [];
  out.invites = user && user.role === 'admin' ? out.invites : [];
  out.spent = user && user.role === 'admin' ? out.spent : [];
  out.audit = user && user.role === 'admin' ? out.audit : [];
  out.lock = user && user.role === 'admin' ? loginLockView() : {};
  out.settings.demo = 0;
  if (!user) {
    out.orders = [];
    out.exp = [];
    out.maint = [];
    out.reviews = out.reviews.filter((r) => !r.hidden);
    out.wish = {};
  } else if (user.role === 'customer') {
    out.orders = out.orders.filter((o) => o.cust === user.u);
    out.exp = [];
    out.maint = [];
    out.reviews = out.reviews.filter((r) => !r.hidden);
    out.wish = userWish(out.wish, user.u);
  } else if (user.role === 'employee') {
    out.exp = out.exp.filter((x) => x.u === user.u);
    out.reviews = out.reviews.filter((r) => !r.hidden);
    out.wish = userWish(out.wish, user.u);
  }
  return out;
}
function userWish(wish, username) { return wish && wish[username] ? { [username]: clone(wish[username]) } : {}; }
function loginLockView() {
  const out = {};
  for (const [key, item] of loginAttempts) {
    if (item.until > Date.now()) out[key.split('|').pop()] = { n: 0, until: item.until };
  }
  return out;
}
function auditEvent(actor, action, detail, bad = 0) {
  state.audit.unshift({ t: Date.now(), u: actor ? actor.u : '-', a: action, d: clean(detail, 160), bad: bad ? 1 : 0 });
  state.audit = state.audit.slice(0, 300);
}
function setCookie(res, token, req) {
  const secure = Boolean(req.socket.encrypted);
  res.setHeader('Set-Cookie', `amira_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_MS / 1000)}${secure ? '; Secure' : ''}`);
}
function clearCookie(res, req) {
  const secure = Boolean(req.socket.encrypted);
  res.setHeader('Set-Cookie', `amira_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`);
}
function parseCookies(text = '') {
  const out = {};
  text.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function sendError(res, status, message, code) { sendJson(res, status, { error: message, code: code || 'request_failed' }); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Request body is too large.'), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Request body must be valid JSON.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
function requireSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
function rateLimit(table, key, limit, windowMs) {
  const now = Date.now(), old = table.get(key);
  const row = old && old.until > now ? old : { count: 0, until: now + windowMs };
  row.count += 1;
  table.set(key, row);
  return row.count <= limit ? null : Math.ceil((row.until - now) / 1000);
}
function requestIp(req) { return req.socket.remoteAddress || 'local'; }
function addSession(req, res, user) {
  const token = createSession(user);
  setCookie(res, token, req);
  return { user: publicUser(user), state: publicState(user), revision };
}
function validInputState(input) { return input && typeof input === 'object' && !Array.isArray(input); }
function itemFor(orderItem) {
  if (!orderItem || !['rice', 'hw', 'ap'].includes(orderItem.m)) return null;
  const product = state[orderItem.m].find((x) => x.id === Number(orderItem.id));
  if (!product || !product.on) return null;
  const q = number(orderItem.q, 1, 1000);
  if (!Number.isInteger(q)) return null;
  if (orderItem.m === 'rice') {
    const w = WHEELS.find((x) => x === String(orderItem.w));
    const v = w && product.v[w];
    if (!v || v.s < q) return null;
    return { m: 'rice', id: product.id, w: Number(w), name: clean(product.name, 80), label: `${w} kg`, q, price: number(v.p) };
  }
  if (product.s < q) return null;
  return { m: orderItem.m, id: product.id, w: 0, name: clean(product.name, 80), label: clean(product.unit, 40), q, price: number(product.p) };
}
function applyStockItem(item, amount) {
  if (item.m === 'rice') {
    const product = state.rice.find((x) => x.id === item.id);
    if (product && product.v[String(item.w)]) product.v[String(item.w)].s = number(product.v[String(item.w)].s + amount, 0, 10000000);
  } else {
    const product = state[item.m].find((x) => x.id === item.id);
    if (product) product.s = number(product.s + amount, 0, 10000000);
  }
}
function makeOrder(input, user, isStaff) {
  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (!rawItems.length || rawItems.length > 100) throw Object.assign(new Error('Add at least one available item.'), { status: 400 });
  const items = rawItems.map(itemFor);
  if (items.some((x) => !x)) throw Object.assign(new Error('An item is unavailable or no longer has enough stock. Please reload and try again.'), { status: 409 });
  const mod = items[0].m;
  if (items.some((x) => x.m !== mod)) throw Object.assign(new Error('Place orders for one catalogue at a time.'), { status: 400 });
  const qty = items.reduce((sum, x) => sum + x.q, 0);
  const sub = items.reduce((sum, x) => sum + x.q * x.price, 0);
  let disc = 0, coupon = '';
  const requested = clean(input.coupon, 20).toUpperCase();
  if (requested) {
    const c = state.coupons.find((x) => x.code === requested && x.on);
    const today = new Date().toISOString().slice(0, 10);
    if (c && (!c.exp || c.exp >= today) && sub >= number(c.min)) {
      coupon = c.code;
      disc = c.type === 'pct' ? Math.min(number(c.max) || Number.MAX_SAFE_INTEGER, Math.round(sub * number(c.value) / 100)) : Math.min(number(c.value), sub);
    }
  }
  const after = sub - disc;
  const fee = qty && after < number(state.settings.free) ? number(state.settings.fee) : 0;
  const now = Date.now();
  const agid = mod === 'rice' ? number(state.rice.find((x) => x.id === items[0].id).agency) : 0;
  const agency = state.agencies.find((x) => x.id === agid);
  const order = {
    id: state.next++, mod, ag: agid, agName: agency ? agency.name : '', brand: agency ? agency.brand : '',
    lab: mod === 'rice' ? { heads: 0, rate: number(state.settings.rate), paid: '' } : null,
    cust: user.u, custName: isStaff ? clean(input.custName || user.name, 60) : user.name,
    by: isStaff ? user.name : '', items, sub, disc, coupon, fee,
    gst: Math.round(after * (mod === 'rice' ? 0.05 : 0.18) / (1 + (mod === 'rice' ? 0.05 : 0.18))),
    total: after + fee, status: 'placed', addr: clean(input.addr, 300), phone: clean(input.phone, 15), pin: clean(input.pin, 6),
    pay: input.pay === 'UPI (demo)' ? 'UPI (demo)' : 'Pay on delivery', paid: 0,
    ts: now, date: new Date(now).toLocaleString('en-IN'), eta: now + 3 * 86400000, tl: [{ s: 'placed', t: now }]
  };
  if (!order.addr || (!isStaff && (!/^[6-9]\d{9}$/.test(order.phone) || !/^\d{6}$/.test(order.pin)))) {
    throw Object.assign(new Error('Enter a delivery address, mobile number and PIN code.'), { status: 400 });
  }
  items.forEach((item) => applyStockItem(item, -item.q));
  state.orders.unshift(order);
  return order;
}
function createOrderChanges(input, user, isStaff, idMap) {
  const incoming = Array.isArray(input.orders) ? input.orders : [];
  const existingIds = new Set(state.orders.map((x) => Number(x.id)));
  for (const candidate of incoming) {
    if (existingIds.has(Number(candidate.id))) continue;
    const order = makeOrder(candidate, user, isStaff);
    if (Number(candidate.id) !== order.id) idMap.push({ from: Number(candidate.id), to: order.id, collection: 'orders' });
    existingIds.add(order.id);
  }
}
function applyCustomerOrderChanges(input, user) {
  const incoming = new Map((Array.isArray(input.orders) ? input.orders : []).map((x) => [Number(x.id), x]));
  for (const order of state.orders) {
    if (order.cust !== user.u) continue;
    const submitted = incoming.get(Number(order.id));
    if (!submitted) continue;
    if (submitted.status === 'cancelled' && order.status === 'placed') {
      order.status = 'cancelled';
      order.tl = [...(order.tl || []), { s: 'cancelled', t: Date.now() }];
      order.items.forEach((item) => applyStockItem(item, item.q));
    }
    const deliveredAt = Number(order.deliveredAt || order.ts);
    if (submitted.ret && !order.ret && order.status === 'delivered' && Date.now() - deliveredAt <= 7 * 86400000) {
      order.ret = { st: 'requested', reason: clean(submitted.ret.reason, 40), note: clean(submitted.ret.note, 200), ts: Date.now() };
    }
  }
}
function employeeOrderChanges(input, user) {
  const incoming = new Map((Array.isArray(input.orders) ? input.orders : []).map((x) => [Number(x.id), x]));
  const transitions = { placed: ['confirmed', 'cancelled'], confirmed: ['packed', 'cancelled'], packed: ['delivered', 'cancelled'] };
  for (const order of state.orders) {
    const submitted = incoming.get(Number(order.id));
    if (!submitted) continue;
    if (FLOW.includes(submitted.status) && (transitions[order.status] || []).includes(submitted.status)) {
      if (submitted.status === 'cancelled' && order.status !== 'cancelled') order.items.forEach((item) => applyStockItem(item, item.q));
      order.status = submitted.status;
      order.tl = [...(order.tl || []), { s: submitted.status, t: Date.now() }];
      if (submitted.status === 'delivered') order.deliveredAt = Date.now();
    }
    if (order.lab && submitted.lab) {
      order.lab.heads = number(submitted.lab.heads, 0, 10000000);
      order.lab.rate = number(submitted.lab.rate, 0, 10000000);
      order.lab.paid = clean(submitted.lab.paid, 80);
    }
    if (submitted.ret && order.ret && order.ret.st === 'requested' && ['approved', 'rejected'].includes(submitted.ret.st)) {
      order.ret.st = submitted.ret.st;
      order.ret.by = user.name;
      order.ret.at = Date.now();
      if (submitted.ret.st === 'approved') order.items.forEach((item) => applyStockItem(item, item.q));
    }
  }
}
function mergeStaffStock(input) {
  for (const collection of ['rice', 'hw', 'ap']) {
    const submitted = new Map((Array.isArray(input[collection]) ? input[collection] : []).map((x) => [Number(x.id), x]));
    for (const item of state[collection]) {
      const changed = submitted.get(Number(item.id));
      if (!changed) continue;
      if (collection === 'rice') {
        for (const w of WHEELS) {
          if (changed.v && changed.v[w]) item.v[w].s = number(changed.v[w].s, 0, 10000000);
        }
        item.name = clean(changed.name || item.name, 80);
        item.note = clean(changed.note || item.note, 160);
      } else {
        item.s = number(changed.s, 0, 10000000);
        item.name = clean(changed.name || item.name, 80);
      }
    }
  }
}
function addStaffRows(input, user, idMap) {
  const currentExpenses = new Set(state.exp.map((x) => Number(x.id)));
  for (const candidate of Array.isArray(input.exp) ? input.exp : []) {
    if (currentExpenses.has(Number(candidate.id))) continue;
    const id = Math.max(1, number(state.nx, 1)) ; state.nx = id + 1;
    const row = {
      id, u: user.u, emp: user.u, empName: user.name,
      cat: ['Petrol', 'Food', 'Covers', 'Other'].includes(candidate.cat) ? candidate.cat : 'Other',
      vendor: clean(candidate.vendor, 120), details: clean(candidate.details || candidate.desc, 300),
      order: state.orders.some((o) => o.id === Number(candidate.order)) ? Number(candidate.order) : null,
      pod: imageData(candidate.pod), note: '',
      amount: number(candidate.amount, 0, 10000000), qty: number(candidate.qty, 0, 1000000),
      date: /^\d{4}-\d{2}-\d{2}$/.test(candidate.date) ? candidate.date : new Date().toISOString().slice(0, 10),
      ts: Date.now(), status: 'submitted', paidOn: ''
    };
    if (!row.amount) continue;
    state.exp.unshift(row);
    if (Number(candidate.id) !== id) idMap.push({ from: Number(candidate.id), to: id, collection: 'exp' });
    currentExpenses.add(id);
  }
  const existingMaint = new Set(state.maint.map((x) => Number(x.id)));
  for (const candidate of Array.isArray(input.maint) ? input.maint : []) {
    if (existingMaint.has(Number(candidate.id))) continue;
    const id = Math.max(1, number(state.nx, 1)); state.nx = id + 1;
    const agency = state.agencies.some((x) => x.id === Number(candidate.agency)) ? Number(candidate.agency) : Number(state.agencies[0] && state.agencies[0].id || 0);
    const item = {
      id, agency, date: /^\d{4}-\d{2}-\d{2}$/.test(candidate.date) ? candidate.date : new Date().toISOString().slice(0, 10),
      machine: state.machines.includes(candidate.machine) ? candidate.machine : 'Other',
      desc: clean(candidate.desc || candidate.note, 300), vendor: clean(candidate.vendor, 120),
      amount: number(candidate.amount, 0, 10000000), pod: imageData(candidate.pod), by: user.u, byName: user.name, ts: Date.now()
    };
    if (!item.amount) continue;
    state.maint.unshift(item);
    if (Number(candidate.id) !== id) idMap.push({ from: Number(candidate.id), to: id, collection: 'maint' });
    existingMaint.add(id);
  }
  if (Array.isArray(input.machines)) {
    const known = new Set(state.machines);
    for (const machine of input.machines) {
      const name = clean(machine, 60);
      if (name && !known.has(name) && state.machines.length < 100) { state.machines.push(name); known.add(name); }
    }
  }
}
function mergePersonal(input, user) {
  const profile = validProfile(input.profile || {});
  if (profile.name.length >= 2) Object.assign(user, profile);
  if (!state.wish[user.u]) state.wish[user.u] = [];
  if (input.wish && Array.isArray(input.wish[user.u])) state.wish[user.u] = input.wish[user.u].filter((key) => /^(rice|hw|ap):\d+$/.test(key)).slice(0, 100);
  if (Array.isArray(input.reviews)) {
    for (const candidate of input.reviews) {
      if (!candidate || !state.orders.some((o) => o.cust === user.u && o.status === 'delivered' && o.items.some((i) => `${i.m}:${i.id}` === candidate.k))) continue;
      const old = state.reviews.find((x) => x.u === user.u && x.k === candidate.k);
      const row = { k: clean(candidate.k, 20), u: user.u, name: user.name.split(' ')[0], stars: number(candidate.stars, 1, 5), text: clean(candidate.text, 300), ts: Date.now(), hidden: 0 };
      if (old) Object.assign(old, row); else state.reviews.unshift(row);
    }
  }
}
function mergeAdmin(input, user, profileInput) {
  const oldUsers = new Map(state.users.map((x) => [x.u, x]));
  const next = clone(input);
  next.users = (Array.isArray(input.users) ? input.users : []).filter((x) => x && validUser(x.u) && VALID_ROLES.includes(x.role)).map((x) => {
    const old = oldUsers.get(x.u);
    if (!old) return null; // User creation has a dedicated password-checked endpoint.
    return {
      ...old,
      role: x.role,
      status: ['active', 'pending'].includes(x.status) ? x.status : old.status,
      name: clean(x.name || old.name, 60), email: clean(x.email || '', 80).toLowerCase(),
      phone: clean(x.phone || '', 15), addr: clean(x.addr || '', 250), pin: clean(x.pin || '', 6),
      mustChange: x.mustChange ? 1 : 0
    };
  }).filter(Boolean);
  const ownUser = next.users.find((x) => x.u === user.u);
  if (ownUser && profileInput) Object.assign(ownUser, validProfile(profileInput));
  const admins = next.users.filter((x) => x.role === 'admin' && x.status === 'active');
  if (!admins.length) throw Object.assign(new Error('Keep at least one active admin account.'), { status: 400 });
  if (!next.users.some((x) => x.u === user.u && x.status === 'active')) throw Object.assign(new Error('You cannot remove or disable your own active admin account.'), { status: 400 });
  next.audit = state.audit;
  next.lock = state.lock;
  next.settings = next.settings || state.settings;
  next.settings.demo = 0;
  state = next;
}
function mergeEmployee(input, user, idMap) {
  mergePersonal(input, user);
  createOrderChanges(input, user, true, idMap);
  employeeOrderChanges(input, user);
  mergeStaffStock(input);
  addStaffRows(input, user, idMap);
  if (Array.isArray(input.reviews)) mergePersonal(input, user);
}
function mergeCustomer(input, user, idMap) {
  mergePersonal(input, user);
  createOrderChanges(input, user, false, idMap);
  applyCustomerOrderChanges(input, user);
}
function getOrderById(id) { return state.orders.find((x) => Number(x.id) === Number(id)); }
function healthPayload() { return { ok: true, storage: 'sqlite', revision }; }
function isAdmin(user) { return user && user.role === 'admin' && user.status === 'active'; }
function isEmployee(user) { return user && (user.role === 'employee' || user.role === 'admin') && user.status === 'active'; }
function rejectIfNotJson(req, res) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    sendError(res, 415, 'Send JSON to this endpoint.', 'json_required');
    return true;
  }
  return false;
}
function protectHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}
function serveApp(res) {
  const file = path.join(ROOT, 'AmiraASTAR.html');
  if (!fs.existsSync(file)) return sendError(res, 503, 'Build AmiraASTAR.html first with python build.py.', 'app_not_built');
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace('</head>', '<meta name="amira-mode" content="live">\n</head>');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(html) });
  res.end(html);
}

async function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/health') return sendJson(res, 200, healthPayload());
  if (req.method === 'GET' && pathname === '/api/bootstrap') return sendJson(res, 200, { user: null, state: publicState(null), revision });
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Allow': 'GET, POST, PUT, OPTIONS' }); return res.end(); }
  if (!requireSameOrigin(req)) return sendError(res, 403, 'This request origin is not allowed.', 'origin_denied');
  if (req.method === 'GET' && pathname === '/api/state') {
    const auth = sessionFor(req);
    if (!auth) return sendError(res, 401, 'Sign in to continue.', 'unauthorized');
    auth.session.revision = revision;
    return sendJson(res, 200, { user: publicUser(auth.user), state: publicState(auth.user), revision });
  }
  if (!['POST', 'PUT'].includes(req.method)) return sendError(res, 404, 'Not found.');
  if (rejectIfNotJson(req, res)) return;
  let body;
  try { body = await readBody(req); } catch (err) { return sendError(res, err.status || 400, err.message); }

  if (req.method === 'POST' && pathname === '/api/login') {
    const username = clean(body.username, 20).toLowerCase();
    const key = `${requestIp(req)}|${username}`;
    const wait = loginAttempts.get(key);
    if (wait && wait.until > Date.now()) return sendError(res, 429, 'Too many sign-in attempts. Try again later.', 'locked');
    const user = userByName(username);
    const valid = user ? await passwordMatches(String(body.password || ''), user.password) : false;
    if (!valid) {
      const sec = rateLimit(loginAttempts, key, 5, 15 * 60 * 1000);
    auditEvent(user, 'login-failed', username, 1); persistAuditOnly();
      return sendError(res, sec ? 429 : 401, sec ? 'Too many sign-in attempts. Try again later.' : 'Username or password is incorrect.', sec ? 'locked' : 'invalid_login');
    }
    if (user.status === 'pending') return sendError(res, 403, 'Your employee account is waiting for admin approval.', 'pending');
    loginAttempts.delete(key);
    auditEvent(user, 'login', 'signed in'); persistAuditOnly();
    return sendJson(res, 200, addSession(req, res, user));
  }
  if (req.method === 'POST' && pathname === '/api/signup') {
    const key = requestIp(req);
    const wait = rateLimit(signupAttempts, key, 5, 60 * 60 * 1000);
    if (wait) return sendError(res, 429, 'Too many account requests from this device. Try later.', 'rate_limited');
    const username = clean(body.username, 20).toLowerCase();
    const email = clean(body.email, 80).toLowerCase();
    const name = clean(body.name, 60);
    const role = body.role === 'employee' ? 'employee' : 'customer';
    const phone = clean(body.phone, 15);
    const password = String(body.password || '');
    if (!name || !validUser(username) || !validEmail(email)) return sendError(res, 400, 'Enter a valid name, email and username.', 'invalid_signup');
    if (!validPassword(password)) return sendError(res, 400, 'Use a password with at least 10 characters, including a letter and a number.', 'weak_password');
    if (state.users.some((u) => u.u === username || u.email === email)) return sendError(res, 409, 'That username or email is already registered.', 'account_exists');
    const user = { u: username, role, name, email, phone, addr: '', pin: '', status: role === 'employee' ? 'pending' : 'active', mustChange: 0, password: await passwordHash(password), createdAt: Date.now() };
    state.users.push(user);
    auditEvent(user, 'signup', `${username} created an account`); persist(state);
    if (user.status === 'pending') return sendJson(res, 201, { pending: true, user: publicUser(user), state: publicState(null), revision });
    return sendJson(res, 201, addSession(req, res, user));
  }
  if (req.method === 'POST' && pathname === '/api/invite/accept') {
    const suppliedCode = clean(body.code, 160);
    let code = suppliedCode.toUpperCase();
    if (!state.invites.some((x) => x.code === code)) {
      try { const decoded = JSON.parse(Buffer.from(suppliedCode, 'base64url').toString('utf8')); code = clean(decoded.c, 20).toUpperCase(); } catch { /* use entered code */ }
    }
    const invite = state.invites.find((x) => x.code === code);
    const username = clean(body.username, 20).toLowerCase();
    const name = clean(body.name, 60), password = String(body.password || '');
    if (!invite || !VALID_ROLES.includes(invite.role) || state.spent.includes(invite.code)) return sendError(res, 400, 'That invite is invalid or has already been used.', 'invalid_invite');
    if (!validUser(username) || !name || !validPassword(password)) return sendError(res, 400, 'Enter a valid name, username and a password with at least 10 characters, including a number.', 'invalid_account');
    if (state.users.some((u) => u.u === username || u.email === invite.email)) return sendError(res, 409, 'That username or email is already registered.', 'account_exists');
    const user = { u: username, role: invite.role, name, email: invite.email, phone: '', addr: '', pin: '', status: 'active', mustChange: 0, password: await passwordHash(password), createdAt: Date.now() };
    state.users.push(user);
    state.spent.push(invite.code);
    state.invites = state.invites.filter((x) => x.code !== invite.code);
    auditEvent(user, 'invite-accepted', `${username} joined as ${user.role}`); persist(state);
    return sendJson(res, 201, addSession(req, res, user));
  }
  if (req.method === 'POST' && pathname === '/api/logout') {
    const auth = sessionFor(req);
    if (auth) { auditEvent(auth.user, 'logout', 'signed out'); persistAuditOnly(); sessions.delete(auth.token); }
    clearCookie(res, req);
    return sendJson(res, 200, { ok: true });
  }

  const auth = sessionFor(req);
  if (!auth) return sendError(res, 401, 'Sign in to continue.', 'unauthorized');
  if (req.method === 'POST' && pathname === '/api/password') {
    const old = String(body.current || ''), next = String(body.password || '');
    if (!await passwordMatches(old, auth.user.password)) return sendError(res, 400, 'Your current password is not correct.', 'wrong_password');
    if (!validPassword(next) || next.toLowerCase().includes(auth.user.u)) return sendError(res, 400, 'Use a different password with at least 10 characters, including a letter and a number.', 'weak_password');
    auth.user.password = await passwordHash(next);
    auth.user.mustChange = 0;
    auditEvent(auth.user, 'password-changed', 'password changed'); persist(state);
    auth.session.revision = revision;
    for (const [token, session] of sessions) if (session.u === auth.user.u && token !== auth.token) sessions.delete(token);
    return sendJson(res, 200, { user: publicUser(auth.user), state: publicState(auth.user), revision });
  }
  if (req.method === 'POST' && pathname === '/api/admin/users') {
    if (!isAdmin(auth.user)) return sendError(res, 403, 'Admin access is required.', 'forbidden');
    const username = clean(body.username, 20).toLowerCase(), email = clean(body.email, 80).toLowerCase();
    const role = VALID_ROLES.includes(body.role) ? body.role : 'customer';
    const name = clean(body.name, 60), password = String(body.password || '');
    if (!name || !validUser(username) || (email && !validEmail(email))) return sendError(res, 400, 'Enter a valid name, username and email.', 'invalid_user');
    if (!validPassword(password)) return sendError(res, 400, 'Use a password with at least 10 characters, including a letter and a number.', 'weak_password');
    if (state.users.some((u) => u.u === username || (email && u.email === email))) return sendError(res, 409, 'That username or email is already registered.', 'account_exists');
    const user = { u: username, role, name, email, phone: clean(body.phone, 15), addr: '', pin: '', status: 'active', mustChange: 1, password: await passwordHash(password), createdAt: Date.now() };
    state.users.push(user);
    auditEvent(auth.user, 'user-created', `${username} as ${role}`); persist(state);
    auth.session.revision = revision;
    return sendJson(res, 201, { user: publicUser(auth.user), state: publicState(auth.user), revision });
  }
  if (req.method === 'PUT' && pathname === '/api/state') {
    if (!validInputState(body.state)) return sendError(res, 400, 'The app data is not valid.', 'invalid_state');
    if (Number(body.revision) !== revision || Number(auth.session.revision) !== revision) {
      auth.session.revision = revision;
      return sendJson(res, 409, { error: 'Data changed in another session. The latest version has been loaded.', code: 'stale_state', user: publicUser(auth.user), state: publicState(auth.user), revision });
    }
    const input = body.state;
    const idMap = [];
    if (isAdmin(auth.user)) {
      const requestedLocks = input.lock || {};
      for (const username of Object.keys(loginLockView())) {
        if (requestedLocks[username]) continue;
        for (const key of loginAttempts.keys()) {
          if (key.split('|').pop() === username) loginAttempts.delete(key);
        }
        auditEvent(auth.user, 'unlock', username);
      }
      mergeAdmin(input, auth.user, body.profile);
    }
    else if (isEmployee(auth.user)) mergeEmployee({ ...input, profile: body.profile }, auth.user, idMap);
    else mergeCustomer({ ...input, profile: body.profile }, auth.user, idMap);
    state.settings.demo = 0;
    const currentUser = userByName(auth.user.u);
    auditEvent(currentUser, 'data-updated', 'app data saved');
    persist(state);
    auth.session.revision = revision;
    return sendJson(res, 200, { revision, idMap, user: publicUser(currentUser) });
  }
  return sendError(res, 404, 'Not found.');
}

async function bootstrapAdmin() {
  if (state.users.some((u) => u.role === 'admin' && u.status === 'active')) return;
  const username = clean(process.env.ADMIN_USERNAME, 20).toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!validUser(username) || !validPassword(password) || password.toLowerCase().startsWith('replace-with-')) {
    throw new Error('No active admin exists. Set ADMIN_USERNAME and ADMIN_PASSWORD in .env (10+ characters with a letter and number) and restart.');
  }
  if (state.users.some((u) => u.u === username)) throw new Error('ADMIN_USERNAME already belongs to a non-admin account. Choose another name.');
  const user = {
    u: username, role: 'admin', name: clean(process.env.ADMIN_NAME || 'AmiraASTAR Admin', 60),
    email: clean(process.env.ADMIN_EMAIL || '', 80).toLowerCase(), phone: '', addr: '', pin: '',
    status: 'active', mustChange: 0, password: await passwordHash(password), createdAt: Date.now()
  };
  state.users.push(user);
  auditEvent(user, 'admin-created', 'initial admin created');
  persist(state);
  console.log(`Created the initial admin account: ${username}`);
}

const server = http.createServer(async (req, res) => {
  protectHeaders(res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    try { await handleApi(req, res, url.pathname); }
    catch (err) {
      if (!res.headersSent) sendError(res, err.status || 500, err.status ? err.message : 'The request could not be completed.', err.status ? undefined : 'server_error');
      else res.destroy();
      if (!err.status) console.error('API error:', err.stack || err);
    }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, 405, 'Method not allowed.');
  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/AmiraASTAR.html') return serveApp(res);
  return sendError(res, 404, 'Not found.');
});

bootstrapAdmin().then(() => {
  server.listen(PORT, HOST, () => console.log(`AmiraASTAR local app: http://${HOST}:${PORT}/`));
}).catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
  sql.close();
});

process.on('SIGINT', () => { server.close(); sql.close(); process.exit(0); });
process.on('SIGTERM', () => { server.close(); sql.close(); process.exit(0); });
