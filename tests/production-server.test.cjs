const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function launchProductionServer(t, { storeOpen = false } = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amiraastar-production-test-'));
  const expectedParent = `${path.resolve(os.tmpdir())}${path.sep}`;
  assert.ok(path.resolve(tempRoot).startsWith(expectedParent), 'test database must stay under the OS temp directory');
  const dataDir = path.join(tempRoot, 'data');
  const port = await freePort();
  const child = spawn(process.execPath, ['server.cjs'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), DATA_DIR: dataDir,
      STORE_OPEN: storeOpen ? 'true' : 'false', ADMIN_USERNAME: 'testadmin', ADMIN_PASSWORD: 'TestAdmin2026!'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([once(child, 'exit'), pause(3000)]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited before health check:\n${output}`);
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return { base, output: () => output };
    } catch { /* the server is still starting */ }
    await pause(80);
  }
  throw new Error(`server did not become healthy:\n${output}`);
}

async function request(base, pathname, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  const setCookie = response.headers.get('set-cookie') || '';
  return { response, data, cookie: setCookie.split(';')[0] };
}

test('production server gates a closed store and enforces account security', async (t) => {
  const { base } = await launchProductionServer(t);

  const health = await request(base, '/api/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.data.storage, 'sqlite');

  const bootstrap = await request(base, '/api/bootstrap');
  assert.equal(bootstrap.data.state.runtime.storeOpen, false);
  assert.equal(bootstrap.data.state.rice.length, 0);
  assert.equal(bootstrap.data.state.hw.length, 0);
  assert.equal(bootstrap.data.state.ap.length, 0);
  assert.equal(bootstrap.data.state.agencies.length, 0);
  assert.ok(Object.values(bootstrap.data.state.cards).every((card) => card.on === 0));

  const closedSignup = await request(base, '/api/signup', {
    method: 'POST',
    body: { username: 'closedbuyer', email: 'closedbuyer@example.test', name: 'Closed Buyer', password: 'CustomerTemp2026!' }
  });
  assert.equal(closedSignup.response.status, 503);
  assert.equal(closedSignup.data.code, 'store_closed');

  const adminLogin = await request(base, '/api/login', {
    method: 'POST', body: { username: 'testadmin', password: 'TestAdmin2026!' }
  });
  assert.equal(adminLogin.response.status, 200);
  assert.match(adminLogin.response.headers.get('set-cookie'), /HttpOnly/);
  assert.match(adminLogin.response.headers.get('set-cookie'), /SameSite=Strict/);
  assert.match(adminLogin.response.headers.get('set-cookie'), /Secure/);

  const adminState = await request(base, '/api/state', { cookie: adminLogin.cookie });
  assert.equal(adminState.response.status, 200);
  assert.ok(adminState.data.state.rice.length > 0, 'admin can inspect the seed catalog during setup');

  const customerCreate = await request(base, '/api/admin/users', {
    method: 'POST', cookie: adminLogin.cookie,
    body: { username: 'closedbuyer', email: 'closedbuyer@example.test', name: 'Closed Buyer', role: 'customer', password: 'CustomerTemp2026!' }
  });
  assert.equal(customerCreate.response.status, 201);
  const customerLogin = await request(base, '/api/login', {
    method: 'POST', body: { username: 'closedbuyer', password: 'CustomerTemp2026!' }
  });
  assert.equal(customerLogin.response.status, 200);
  const forcedGate = await request(base, '/api/state', { cookie: customerLogin.cookie });
  assert.equal(forcedGate.response.status, 403);
  assert.equal(forcedGate.data.code, 'password_change_required');
  const changedPassword = await request(base, '/api/password', {
    method: 'POST', cookie: customerLogin.cookie,
    body: { current: 'CustomerTemp2026!', password: 'BuyerChosen2027!' }
  });
  assert.equal(changedPassword.response.status, 200);

  const attemptedState = structuredClone(changedPassword.data.state);
  attemptedState.orders.push({ id: -1, items: [{ m: 'rice', id: 1, w: 10, q: 1 }], addr: '1 Test Street', phone: '9876543210', pin: '560001' });
  const closedOrder = await request(base, '/api/state', {
    method: 'PUT', cookie: customerLogin.cookie,
    body: { state: attemptedState, revision: changedPassword.data.revision }
  });
  assert.equal(closedOrder.response.status, 503);
  assert.equal(closedOrder.data.code, 'store_closed');
  const afterOrderAttempt = await request(base, '/api/state', { cookie: customerLogin.cookie });
  assert.equal(afterOrderAttempt.response.status, 200);
  assert.equal(afterOrderAttempt.data.state.orders.length, 0, 'a rejected order does not persist');

  const employeeCreate = await request(base, '/api/admin/users', {
    method: 'POST', cookie: adminLogin.cookie,
    body: { username: 'resetworker', email: 'resetworker@example.test', name: 'Reset Worker', role: 'employee', password: 'InitialWorker2026!' }
  });
  assert.equal(employeeCreate.response.status, 201);
  const oldEmployeeLogin = await request(base, '/api/login', {
    method: 'POST', body: { username: 'resetworker', password: 'InitialWorker2026!' }
  });
  assert.equal(oldEmployeeLogin.response.status, 200);
  const reset = await request(base, '/api/admin/users/reset-password', {
    method: 'POST', cookie: adminLogin.cookie, body: { username: 'resetworker' }
  });
  assert.equal(reset.response.status, 200);
  assert.ok(reset.data.temporaryPassword);
  const revoked = await request(base, '/api/state', { cookie: oldEmployeeLogin.cookie });
  assert.equal(revoked.response.status, 401);
  const temporaryLogin = await request(base, '/api/login', {
    method: 'POST', body: { username: 'resetworker', password: reset.data.temporaryPassword }
  });
  assert.equal(temporaryLogin.response.status, 200);
  const resetGate = await request(base, '/api/state', { cookie: temporaryLogin.cookie });
  assert.equal(resetGate.response.status, 403);
  assert.equal(resetGate.data.code, 'password_change_required');
  const finishReset = await request(base, '/api/password', {
    method: 'POST', cookie: temporaryLogin.cookie,
    body: { current: reset.data.temporaryPassword, password: 'WorkerChosen2027!' }
  });
  assert.equal(finishReset.response.status, 200);
  const backup = await request(base, '/api/admin/backup', { cookie: adminLogin.cookie });
  assert.equal(backup.response.status, 200);
  assert.equal(backup.data.subarray(0, 16).toString('binary'), 'SQLite format 3\u0000');
});

test('an invalid item in an open-store state save rolls back earlier order and stock changes', async (t) => {
  const { base } = await launchProductionServer(t, { storeOpen: true });
  const signup = await request(base, '/api/signup', {
    method: 'POST',
    body: { username: 'rollbackbuyer', email: 'rollbackbuyer@example.test', name: 'Rollback Buyer', password: 'RollbackBuyer2026!' }
  });
  assert.equal(signup.response.status, 201);
  const cookie = signup.cookie;
  let state = signup.data.state;
  const revision = signup.data.revision;
  const product = state.rice[0];
  const wheel = Object.keys(product.v).find((key) => product.v[key].s > 0);
  assert.ok(wheel, 'test catalog must have stock for a rice variant');
  const initialStock = product.v[wheel].s;

  const order = (id, productId) => ({
    id,
    items: [{ m: 'rice', id: productId, w: Number(wheel), q: 1 }],
    addr: '1 Test Street', phone: '9876543210', pin: '560001'
  });
  state.orders.push(order(-10, product.id));
  const placed = await request(base, '/api/state', { method: 'PUT', cookie, body: { state, revision } });
  assert.equal(placed.response.status, 200);
  const afterPlacement = await request(base, '/api/state', { cookie });
  assert.equal(afterPlacement.response.status, 200);
  assert.equal(afterPlacement.data.state.orders.length, 1);
  assert.equal(afterPlacement.data.state.orders[0].pay, 'Pay on delivery');
  assert.equal(afterPlacement.data.state.orders[0].paid, 0);
  assert.equal(afterPlacement.data.state.rice[0].v[wheel].s, initialStock - 1);

  const beforeFailure = afterPlacement.data.state;
  const revisionBeforeFailure = afterPlacement.data.revision;
  const stockBeforeFailure = beforeFailure.rice[0].v[wheel].s;
  const attempted = structuredClone(beforeFailure);
  attempted.orders.push(order(-11, product.id), order(-12, 999999));
  const rejected = await request(base, '/api/state', {
    method: 'PUT', cookie,
    body: { state: attempted, revision: revisionBeforeFailure, profile: { name: 'Must Roll Back' } }
  });
  assert.equal(rejected.response.status, 409);

  const afterFailure = await request(base, '/api/state', { cookie });
  assert.equal(afterFailure.response.status, 200);
  assert.equal(afterFailure.data.revision, revisionBeforeFailure);
  assert.equal(afterFailure.data.state.orders.length, 1);
  assert.equal(afterFailure.data.state.rice[0].v[wheel].s, stockBeforeFailure);
  assert.equal(afterFailure.data.user.name, 'Rollback Buyer');
});
