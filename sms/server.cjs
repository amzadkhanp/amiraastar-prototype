// AmiraASTAR SMS: local feature, test case, execution, and reporting tracker.
// Uses a dedicated SQLite database and binds to loopback by default.
require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.SMS_PORT || 8100);
const HOST = process.env.SMS_HOST || '127.0.0.1';
const DB_FILE = path.resolve(process.env.SMS_DATA_FILE || path.join(ROOT, 'data', 'amiraastar-sms.sqlite'));
const PAGE = path.join(__dirname, 'index.html');
const MAX_BODY = 1024 * 1024;
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
db.exec(`
  CREATE TABLE IF NOT EXISTS features (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    area TEXT NOT NULL DEFAULT 'General',
    priority TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('Critical','High','Medium','Low')),
    state TEXT NOT NULL DEFAULT 'Planned' CHECK(state IN ('Planned','In Progress','Ready for Review','Released','On Hold')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS test_cases (
    id INTEGER PRIMARY KEY,
    case_key TEXT NOT NULL UNIQUE,
    feature_id INTEGER NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    preconditions TEXT NOT NULL DEFAULT '',
    steps TEXT NOT NULL DEFAULT '',
    expected TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('Critical','High','Medium','Low')),
    automated INTEGER NOT NULL DEFAULT 0 CHECK(automated IN (0,1)),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS executions (
    id INTEGER PRIMARY KEY,
    case_id INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    result TEXT NOT NULL CHECK(result IN ('Pass','Fail','Blocked','Not Applicable')),
    executed_by TEXT NOT NULL,
    build TEXT NOT NULL DEFAULT '',
    environment TEXT NOT NULL DEFAULT 'Local',
    issue_ref TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    executed_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS executions_case_date ON executions(case_id, executed_at DESC);
  CREATE INDEX IF NOT EXISTS executions_result_date ON executions(result, executed_at DESC);
`);

const now = () => new Date().toISOString();
const text = (value, max, field, required = false) => {
  const result = String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
  if (required && !result) throw Object.assign(new Error(`${field} is required.`), { status: 400 });
  return result;
};
const enumValue = (value, allowed, fallback, field) => {
  const result = String(value || fallback);
  if (!allowed.includes(result)) throw Object.assign(new Error(`${field} is invalid.`), { status: 400 });
  return result;
};
const priorities = ['Critical', 'High', 'Medium', 'Low'];
const featureStates = ['Planned', 'In Progress', 'Ready for Review', 'Released', 'On Hold'];
const results = ['Pass', 'Fail', 'Blocked', 'Not Applicable'];

const seed = [
  { code:'SYS', name:'Local setup and data safety', area:'Operations', priority:'High', summary:'Run locally, persist data, and recover safely.', cases:[
    ['Server health and application load','Node.js 24 is available.','Start the server; open the app; request /api/health.','The app loads and health reports SQLite storage.','High'],
    ['Records survive a server restart','At least one test record exists.','Stop and restart the server; reopen the tracker.','Features, cases, and executions remain available.','High'],
    ['Backup restore preserves the previous database','A valid tracker backup is available.','Restore the backup in an isolated data directory.','The restored records match the backup; a pre-restore copy remains.','Critical'],
    ['Invalid backup is rejected safely','A corrupt or unrelated file is available.','Attempt to restore it in an isolated data directory.','Restore is rejected and current data remains intact.','Critical']
  ]},
  { code:'AUTH', name:'Accounts and access', area:'Security', priority:'Critical', summary:'Authentication, role permissions, onboarding, and password lifecycle.', cases:[
    ['Admin signs in with valid credentials','An active admin account exists in the isolated test database.','Submit valid admin credentials.','Admin session starts and admin navigation appears.','Critical'],
    ['Invalid sign-in is rejected','No active session exists.','Submit an unknown username or incorrect password.','A generic sign-in error appears; no session is created.','High'],
    ['Repeated sign-in failures are rate limited','A test account exists.','Submit repeated invalid credentials from the same client.','Further attempts are temporarily rate limited.','High'],
    ['Admin creates a user with a temporary password','Admin is signed in.','Create an employee account with valid details.','Account is created and must change its password at first sign-in.','High'],
    ['Employee signup waits for approval','Store is open.','Submit employee signup details as a public user.','Account is pending and cannot use staff functions until approved.','High'],
    ['Admin approves or rejects a pending employee','A pending employee exists.','Approve the account, then verify access; repeat with a second account and reject.','Approved employee can sign in; rejected account cannot.','High'],
    ['Admin password reset is one-time and forces change','Admin is signed in; another active account exists.','Reset the other account password and sign in as that account.','Temporary password is shown once; password change is required.','Critical'],
    ['Logout invalidates the session','A user is signed in.','Log out and request a protected endpoint.','Protected endpoint rejects the request.','High'],
    ['Role restrictions apply to direct API requests','Customer and employee sessions exist.','Attempt admin-only user, backup, price, and settings actions.','Server rejects unauthorized actions.','Critical']
  ]},
  { code:'STORE', name:'Store setup and catalog', area:'Commerce', priority:'High', summary:'Admin configures agencies, product visibility, pricing, and store availability.', cases:[
    ['Closed store blocks public signup and ordering','Production-style test configuration has STORE_OPEN=false.','Load public app; attempt customer signup and order creation.','Store notice appears; server rejects signup and order writes.','Critical'],
    ['Admin can configure a closed store','Store is closed; admin is signed in.','Add an agency and catalog item; update store settings.','Admin changes save while public ordering remains closed.','High'],
    ['Admin adds agency and rice types','Admin is signed in.','Create an agency; add rice types, price, and stock.','Agency and rice catalog appear with correct values.','High'],
    ['Admin changes customer-facing product visibility','A catalog item exists.','Hide the item, inspect as customer, then list it again.','Hidden item is not orderable; listed item is visible.','High'],
    ['Store open/closed state is enforced by the server','Public app state is available.','Toggle store state and call signup/order APIs directly.','Server behavior matches the configured state.','Critical']
  ]},
  { code:'INV', name:'Inventory and stock', area:'Operations', priority:'High', summary:'Rice, hardware, and auto parts stock, pricing, and audit history.', cases:[
    ['Admin updates rice price and stock','Rice catalog and agency exist.','Change a rice variety price and stock.','Admin view and customer catalog show the updated values.','High'],
    ['Admin adds hardware item and controls listing','Admin is signed in.','Add an item with category, unit, price, stock, and reorder level; hide it.','Item validates, saves, and is unavailable to customers while hidden.','High'],
    ['Employee can update stock but not price','Employee is signed in.','Change item stock; attempt to change its price or reorder level.','Stock update saves and is logged; restricted fields cannot be changed.','Critical'],
    ['Stock history records adjustments','An item exists.','Receive stock and make a stock count adjustment.','History records quantity, actor, timestamp, and reason.','High'],
    ['Reorder and out-of-stock states are accurate','Item has a configured reorder threshold.','Check stock at zero, below threshold, at threshold, and above it.','Status labels and alerts match configured stock rules.','Medium'],
    ['Parts search and vehicle filters work','Parts catalog has varied vehicle and model data.','Search by name, brand, number; filter vehicle/model; sort and filter stock.','Only matching parts appear in the requested order.','Medium'],
    ['Stock validation prevents negative or fractional quantities','Admin or employee is signed in.','Submit negative, fractional, blank, and over-limit quantities.','Invalid changes are rejected and stock is unchanged.','High']
  ]},
  { code:'ORDER', name:'Orders and fulfillment', area:'Commerce', priority:'Critical', summary:'Customer checkout, staff fulfillment, stock movement, and order history.', cases:[
    ['Customer places a valid order','Customer is signed in; store is open; item is in stock.','Add item to cart; enter valid address, phone, and PIN; place order.','Order is saved with correct item, totals, pay-on-delivery method, and status.','Critical'],
    ['Checkout totals include discount, delivery, and tax correctly','Products and a valid coupon are configured.','Place orders below and above the free-delivery threshold.','Subtotal, coupon discount, delivery, tax, and total are correct.','Critical'],
    ['Coupon validation covers invalid and boundary cases','Coupons include valid, expired, disabled, and minimum-spend cases.','Try each coupon and reduce cart below its minimum.','Only eligible coupons apply; invalid ones produce clear feedback.','High'],
    ['Customer cannot order more than current stock','A product has limited stock.','Add more than available quantity and submit an over-stock API request.','UI and server both reject the excess quantity.','Critical'],
    ['Staff progresses order through allowed states','A placed order exists.','Move it through confirmed, packed, and delivered.','Timeline and current status update at each valid transition.','High'],
    ['Invalid order status transition is rejected','An order is placed.','Attempt to skip required stages or reopen a terminal state.','Server rejects the transition and preserves order history.','High'],
    ['Cancellation restores stock exactly once','An eligible placed order exists.','Cancel it, then repeat cancellation.','Stock is restored once; duplicate cancellation has no extra effect.','Critical'],
    ['Return workflow respects eligibility and approval','A delivered order exists.','Request a timely return; approve it; repeat with an expired and an ineligible order.','Eligible request is processed; invalid requests are rejected; stock is adjusted once.','High'],
    ['Invoice and reorder use saved order data','A completed order exists.','Open/print invoice and select reorder.','Invoice reflects order snapshot; reorder includes only available items.','Medium']
  ]},
  { code:'FIN', name:'Expenses and payments', area:'Finance', priority:'High', summary:'Employee expense submission, admin review, payment tracking, and reports.', cases:[
    ['Employee submits valid expense','Employee is signed in.','Submit date, category, amount, payee, details, optional order, and receipt data if supported.','Expense appears as submitted and links to the correct order when selected.','High'],
    ['Invalid expense values are rejected','Employee is signed in.','Submit blank, negative, malformed, or out-of-range values.','Invalid expense is not saved and clear validation appears.','High'],
    ['Admin approves or rejects an expense','Submitted expense exists.','Approve one expense; reject another with a reason.','Statuses change correctly; rejected expense includes the reason.','High'],
    ['Approved expense is marked paid and reported','Approved expense exists.','Mark it paid; filter report by date, employee, and category.','Paid status and report totals match the expense records.','High']
  ]},
  { code:'MAINT', name:'Maintenance', area:'Operations', priority:'Medium', summary:'Machine repair records, agency charges, and maintenance reports.', cases:[
    ['Admin adds machine and staff logs repair','Admin creates a machine; staff is signed in.','Log repair date, machine, amount, vendor, and description.','Repair saves against the selected machine with correct details.','Medium'],
    ['Maintenance validation rejects incomplete records','Repair form is open.','Submit missing machine/date/description and invalid amount.','Invalid repair is rejected without creating a record.','Medium'],
    ['Maintenance report filters and totals are correct','Multiple repairs exist across machines and dates.','Filter by machine and date range.','Only matching repairs appear and totals reconcile.','Medium']
  ]},
  { code:'REPORT', name:'Reports and release readiness', area:'Quality', priority:'High', summary:'Business reports, audit checks, and release evidence.', cases:[
    ['Order report filters by date, app, and agency','Orders exist across apps and agencies.','Apply date, app, and agency filters.','Report rows and totals match the underlying orders.','High'],
    ['Security dashboard reflects actual live-mode controls','Live-mode test admin is signed in.','Review password, demo mode, storage, and browser protection checks.','Indicators and explanations match the server configuration.','High'],
    ['Report remains printable and exportable','Execution and business report data exists.','Print to PDF and export CSV; open both outputs.','Output includes applied filters, readable columns, and correct totals.','Medium']
  ]}
];

function seedIfEmpty() {
  if (db.prepare('SELECT COUNT(*) AS n FROM features').get().n) return;
  const addFeature = db.prepare('INSERT INTO features(code,name,summary,area,priority,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
  const addCase = db.prepare('INSERT INTO test_cases(case_key,feature_id,title,preconditions,steps,expected,priority,automated,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  const stamp = now();
  db.exec('BEGIN');
  try {
    for (const feature of seed) {
      const result = addFeature.run(feature.code, feature.name, feature.summary, feature.area, feature.priority, 'Planned', stamp, stamp);
      for (let i = 0; i < feature.cases.length; i++) {
        const [title, preconditions, steps, expected, priority] = feature.cases[i];
        addCase.run(`${feature.code}-${String(i + 1).padStart(3, '0')}`, Number(result.lastInsertRowid), title, preconditions, steps, expected, priority, 0, 1, stamp, stamp);
      }
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
seedIfEmpty();

function send(res, status, payload, type = 'application/json; charset=utf-8') {
  const body = type.startsWith('application/json') ? JSON.stringify(payload) : payload;
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(body);
}
function error(res, status, message) { send(res, status, { error: message }); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (Buffer.byteLength(raw) > MAX_BODY) { reject(Object.assign(new Error('Request is too large.'), { status: 413 })); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(Object.assign(new Error('Send valid JSON.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
function input(req, res) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    error(res, 415, 'Send JSON to this endpoint.'); return false;
  }
  return true;
}
function featureInput(body, existing = {}) {
  return {
    code: text(body.code ?? existing.code, 20, 'Feature ID', true).toUpperCase().replace(/[^A-Z0-9_-]/g, '-'),
    name: text(body.name ?? existing.name, 100, 'Feature name', true),
    summary: text(body.summary ?? existing.summary, 1000, 'Summary'),
    area: text(body.area ?? existing.area, 50, 'Area') || 'General',
    priority: enumValue(body.priority ?? existing.priority, priorities, 'Medium', 'Priority'),
    state: enumValue(body.state ?? existing.state, featureStates, 'Planned', 'Feature state')
  };
}
function caseInput(body, existing = {}) {
  const featureId = Number(body.feature_id ?? existing.feature_id);
  if (!Number.isSafeInteger(featureId) || !db.prepare('SELECT id FROM features WHERE id=?').get(featureId)) throw Object.assign(new Error('Choose an existing feature.'), { status: 400 });
  return {
    case_key: text(body.case_key ?? existing.case_key, 30, 'Case ID', true).toUpperCase().replace(/[^A-Z0-9_-]/g, '-'),
    feature_id: featureId,
    title: text(body.title ?? existing.title, 180, 'Test case title', true),
    preconditions: text(body.preconditions ?? existing.preconditions, 2000, 'Preconditions'),
    steps: text(body.steps ?? existing.steps, 4000, 'Steps'),
    expected: text(body.expected ?? existing.expected, 2000, 'Expected result', true),
    priority: enumValue(body.priority ?? existing.priority, priorities, 'Medium', 'Priority'),
    automated: body.automated === undefined ? Number(existing.automated || 0) : (body.automated ? 1 : 0),
    active: body.active === undefined ? Number(existing.active ?? 1) : (body.active ? 1 : 0)
  };
}
function route(req, res, url) {
  const method = req.method;
  const pathname = url.pathname;
  if (method === 'GET' && pathname === '/api/features') {
    return send(res, 200, db.prepare(`SELECT f.*, COUNT(DISTINCT c.id) AS case_count,
      COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN c.id END) AS executed_count
      FROM features f LEFT JOIN test_cases c ON c.feature_id=f.id AND c.active=1
      LEFT JOIN executions e ON e.case_id=c.id GROUP BY f.id ORDER BY f.id`).all());
  }
  if (method === 'GET' && pathname === '/api/cases') {
    return send(res, 200, db.prepare(`SELECT c.*, f.code AS feature_code, f.name AS feature_name,
      (SELECT e.result FROM executions e WHERE e.case_id=c.id ORDER BY e.executed_at DESC,e.id DESC LIMIT 1) AS latest_result,
      (SELECT e.executed_at FROM executions e WHERE e.case_id=c.id ORDER BY e.executed_at DESC,e.id DESC LIMIT 1) AS latest_at
      FROM test_cases c JOIN features f ON f.id=c.feature_id ORDER BY f.id,c.case_key`).all());
  }
  if (method === 'GET' && pathname === '/api/executions') {
    const filters = [];
    const args = [];
    if (url.searchParams.get('feature')) { filters.push('f.id=?'); args.push(Number(url.searchParams.get('feature'))); }
    if (url.searchParams.get('result')) { filters.push('e.result=?'); args.push(enumValue(url.searchParams.get('result'), results, '', 'Result')); }
    if (url.searchParams.get('from')) { filters.push('date(e.executed_at)>=date(?)'); args.push(url.searchParams.get('from')); }
    if (url.searchParams.get('to')) { filters.push('date(e.executed_at)<=date(?)'); args.push(url.searchParams.get('to')); }
    if (url.searchParams.get('build')) { filters.push('e.build LIKE ?'); args.push(`%${url.searchParams.get('build').slice(0,80)}%`); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    return send(res, 200, db.prepare(`SELECT e.*, c.case_key,c.title AS case_title,f.id AS feature_id,f.code AS feature_code,f.name AS feature_name
      FROM executions e JOIN test_cases c ON c.id=e.case_id JOIN features f ON f.id=c.feature_id ${where}
      ORDER BY e.executed_at DESC,e.id DESC LIMIT 1000`).all(...args));
  }
  if (method === 'GET' && pathname === '/api/summary') {
    const overall = db.prepare(`SELECT COUNT(*) AS total_cases,
      SUM(CASE WHEN latest.result='Pass' THEN 1 ELSE 0 END) AS pass,
      SUM(CASE WHEN latest.result='Fail' THEN 1 ELSE 0 END) AS fail,
      SUM(CASE WHEN latest.result='Blocked' THEN 1 ELSE 0 END) AS blocked,
      SUM(CASE WHEN latest.result='Not Applicable' THEN 1 ELSE 0 END) AS na,
      SUM(CASE WHEN latest.result IS NULL THEN 1 ELSE 0 END) AS not_run
      FROM test_cases c LEFT JOIN (SELECT e.case_id,e.result,ROW_NUMBER() OVER(PARTITION BY e.case_id ORDER BY e.executed_at DESC,e.id DESC) AS rn FROM executions e) latest
      ON latest.case_id=c.id AND latest.rn=1 WHERE c.active=1`).get();
    const featureStats = db.prepare(`SELECT f.id,f.code,f.name,f.area,f.priority,f.state,COUNT(c.id) AS total,
      SUM(CASE WHEN latest.result='Pass' THEN 1 ELSE 0 END) AS pass,
      SUM(CASE WHEN latest.result='Fail' THEN 1 ELSE 0 END) AS fail,
      SUM(CASE WHEN latest.result='Blocked' THEN 1 ELSE 0 END) AS blocked,
      SUM(CASE WHEN latest.result IS NULL THEN 1 ELSE 0 END) AS not_run
      FROM features f LEFT JOIN test_cases c ON c.feature_id=f.id AND c.active=1
      LEFT JOIN (SELECT e.case_id,e.result,ROW_NUMBER() OVER(PARTITION BY e.case_id ORDER BY e.executed_at DESC,e.id DESC) AS rn FROM executions e) latest
      ON latest.case_id=c.id AND latest.rn=1 GROUP BY f.id ORDER BY f.id`).all();
    const runs = db.prepare('SELECT COUNT(*) AS n FROM executions').get().n;
    const latest = db.prepare(`SELECT e.*,c.case_key,c.title AS case_title,f.code AS feature_code,f.name AS feature_name FROM executions e
      JOIN test_cases c ON c.id=e.case_id JOIN features f ON f.id=c.feature_id ORDER BY e.executed_at DESC,e.id DESC LIMIT 8`).all();
    return send(res, 200, { ...overall, features:featureStats, total_runs:runs, latest });
  }
  if (method === 'POST' && pathname === '/api/features') {
    if (!input(req,res)) return;
    return readBody(req).then(body => {
      const f = featureInput(body); const stamp = now();
      const result = db.prepare('INSERT INTO features(code,name,summary,area,priority,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(f.code,f.name,f.summary,f.area,f.priority,f.state,stamp,stamp);
      send(res,201,{ id:Number(result.lastInsertRowid),...f });
    }).catch(err=>error(res,err.status||409,err.status?err.message:'Feature ID already exists.'));
  }
  let match = pathname.match(/^\/api\/features\/(\d+)$/);
  if (match && method === 'PUT') {
    if (!input(req,res)) return;
    return readBody(req).then(body=>{
      const existing=db.prepare('SELECT * FROM features WHERE id=?').get(Number(match[1]));
      if(!existing)return error(res,404,'Feature not found.');
      const f=featureInput(body,existing); db.prepare('UPDATE features SET code=?,name=?,summary=?,area=?,priority=?,state=?,updated_at=? WHERE id=?').run(f.code,f.name,f.summary,f.area,f.priority,f.state,now(),existing.id);
      send(res,200,{id:existing.id,...f});
    }).catch(err=>error(res,err.status||409,err.status?err.message:'Feature ID already exists.'));
  }
  if (match && method === 'DELETE') {
    const result=db.prepare('DELETE FROM features WHERE id=?').run(Number(match[1]));
    return result.changes ? send(res,200,{ok:true}) : error(res,404,'Feature not found.');
  }
  if (method === 'POST' && pathname === '/api/cases') {
    if(!input(req,res))return;
    return readBody(req).then(body=>{
      const c=caseInput(body);const stamp=now();
      const result=db.prepare('INSERT INTO test_cases(case_key,feature_id,title,preconditions,steps,expected,priority,automated,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(c.case_key,c.feature_id,c.title,c.preconditions,c.steps,c.expected,c.priority,c.automated,c.active,stamp,stamp);
      send(res,201,{id:Number(result.lastInsertRowid),...c});
    }).catch(err=>error(res,err.status||409,err.status?err.message:'Test case ID already exists.'));
  }
  match = pathname.match(/^\/api\/cases\/(\d+)$/);
  if (match && method === 'PUT') {
    if(!input(req,res))return;
    return readBody(req).then(body=>{
      const existing=db.prepare('SELECT * FROM test_cases WHERE id=?').get(Number(match[1]));
      if(!existing)return error(res,404,'Test case not found.');
      const c=caseInput(body,existing);db.prepare('UPDATE test_cases SET case_key=?,feature_id=?,title=?,preconditions=?,steps=?,expected=?,priority=?,automated=?,active=?,updated_at=? WHERE id=?').run(c.case_key,c.feature_id,c.title,c.preconditions,c.steps,c.expected,c.priority,c.automated,c.active,now(),existing.id);
      send(res,200,{id:existing.id,...c});
    }).catch(err=>error(res,err.status||409,err.status?err.message:'Test case ID already exists.'));
  }
  if (match && method === 'DELETE') {
    const result=db.prepare('DELETE FROM test_cases WHERE id=?').run(Number(match[1]));
    return result.changes ? send(res,200,{ok:true}) : error(res,404,'Test case not found.');
  }
  if (method === 'POST' && pathname === '/api/executions') {
    if(!input(req,res))return;
    return readBody(req).then(body=>{
      const caseId=Number(body.case_id);
      if(!Number.isSafeInteger(caseId)||!db.prepare('SELECT id FROM test_cases WHERE id=? AND active=1').get(caseId))return error(res,400,'Choose an active test case.');
      const result=enumValue(body.result,results,'','Result');
      const executedBy=text(body.executed_by,80,'Executed by',true);
      const stamp=now();
      const run=db.prepare('INSERT INTO executions(case_id,result,executed_by,build,environment,issue_ref,notes,executed_at) VALUES(?,?,?,?,?,?,?,?)').run(caseId,result,executedBy,text(body.build,80,'Build'),text(body.environment,80,'Environment')||'Local',text(body.issue_ref,120,'Issue reference'),text(body.notes,3000,'Notes'),stamp);
      send(res,201,{id:Number(run.lastInsertRowid),case_id:caseId,result,executed_by:executedBy,build:text(body.build,80,'Build'),environment:text(body.environment,80,'Environment')||'Local',issue_ref:text(body.issue_ref,120,'Issue reference'),notes:text(body.notes,3000,'Notes'),executed_at:stamp});
    }).catch(err=>error(res,err.status||400,err.message||'Could not record execution.'));
  }
  if (pathname.startsWith('/api/')) return error(res,404,'API route not found.');
  if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    if(!fs.existsSync(PAGE))return error(res,503,'Tracker page is missing.');
    return send(res,200,fs.readFileSync(PAGE,'utf8'),'text/html; charset=utf-8');
  }
  return error(res,404,'Page not found.');
}
const server=http.createServer((req,res)=>{
  let url;
  try{url=new URL(req.url,`http://${req.headers.host||'localhost'}`);}catch{return error(res,400,'Invalid request URL.');}
  try{Promise.resolve(route(req,res,url)).catch(err=>{console.error(err);if(!res.headersSent)error(res,500,'The tracker could not complete that request.');});}
  catch(err){console.error(err);error(res,500,'The tracker could not complete that request.');}
});
server.listen(PORT,HOST,()=>console.log(`AmiraASTAR SMS is running at http://${HOST}:${PORT}/`));
function close(){server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(1),5000).unref();}
process.on('SIGINT',close);process.on('SIGTERM',close);
