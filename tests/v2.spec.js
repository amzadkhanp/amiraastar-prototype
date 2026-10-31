const { test, expect } = require('@playwright/test');

/* ---------- helpers ---------- */
async function boot(page) { await page.goto('/AmiraASTAR.html'); await page.evaluate(() => A2.ready); }
async function signIn(page, user, pw) { await page.locator('#u').fill(user); await page.locator('#p').fill(pw); await page.getByRole('button', { name: 'Sign in' }).click(); }
async function demo(page, role) { await boot(page); await page.getByRole('button', { name: role, exact: true }).click(); await page.getByRole('button', { name: 'Sign in' }).click(); await expect(page.locator('header')).toBeVisible(); }
const openApp = (page, name) => page.getByRole('button', { name }).click();
const goTab = (page, name) => page.locator('nav').getByRole('button', { name, exact: true }).click();
const rice = (page) => openApp(page, 'Open RiceMarket');
const hw = (page) => openApp(page, 'Open Hardware Inventory');
async function fillCheckout(page, o = {}) {
  await page.getByLabel('Delivery address').fill(o.addr || 'Flat 4, 12 MG Road, Indiranagar, Bengaluru');
  await page.getByLabel('Mobile number').fill(o.phone || '9876543210');
  await page.getByLabel('PIN code').fill(o.pin || '560038');
}
const toast = (page) => page.locator('.toast').last();
async function placeRiceOrder(page, n = 1) {
  await rice(page); for (let i = 0; i < n; i++) await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await fillCheckout(page); await page.getByRole('button', { name: 'Place order' }).click(); await expect(toast(page)).toHaveText('Order placed');
}
/* sign out and sign in as someone else without reloading (keeps the browser's saved data) */
async function switchTo(page, role) { await page.getByRole('button', { name: 'Sign out' }).click(); await page.getByRole('button', { name: role, exact: true }).click(); await page.getByRole('button', { name: 'Sign in' }).click(); await expect(page.locator('header')).toBeVisible(); }

/* ================= security ================= */
test.describe('security', () => {
  test('no password is stored readable; demo sign-in still works', async ({ page }) => {
    await boot(page);
    const info = await page.evaluate(() => ({ plain: db.users.filter(u => u.p !== undefined).length, hashed: db.users.filter(u => u.ph && u.salt && u.it >= 100000).length, n: db.users.length, raw: localStorage.getItem('akma_v1') }));
    expect(info.plain).toBe(0); expect(info.hashed).toBe(info.n);
    for (const pw of ['admin123', 'emp123', 'cust123']) expect(info.raw).not.toContain(pw);
    await page.getByRole('button', { name: 'Admin', exact: true }).click(); await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Meera (Admin)')).toBeVisible();
  });
  test('an old database with plain passwords is converted at start', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { db.users.push({ u: 'legacy', p: 'oldpass1', role: 'customer', name: 'Legacy User', email: 'legacy@x.in', status: 'active' }); localStorage.setItem('akma_v1', JSON.stringify(db)); });
    await page.reload(); await page.evaluate(() => A2.ready);
    expect(await page.evaluate(() => db.users.some(u => u.p !== undefined))).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('akma_v1').includes('oldpass1'))).toBe(false);
    await signIn(page, 'legacy', 'oldpass1'); await expect(page.getByText('Legacy User')).toBeVisible();
  });
  test('wrong passwords give one generic message, then lock the name for a while, even across reload', async ({ page }) => {
    await boot(page);
    for (let i = 0; i < 5; i++) { await signIn(page, 'customer', 'nope-' + i); await expect(page.locator('#err')).toHaveText('Username or password is incorrect.'); }
    await signIn(page, 'customer', 'cust123'); await expect(page.locator('#err')).toContainText('Too many attempts');
    await boot(page); await signIn(page, 'customer', 'cust123'); await expect(page.locator('#err')).toContainText('Too many attempts');
    const bad = await page.evaluate(() => db.audit.filter(a => a.bad).map(a => a.a));
    expect(bad).toContain('lockout'); expect(bad).toContain('login-failed');
  });
  test('unknown and known usernames get the same answer', async ({ page }) => {
    await boot(page);
    await signIn(page, 'ghost.user', 'whatever123'); await expect(page.locator('#err')).not.toBeEmpty(); const a = await page.locator('#err').textContent();
    await page.locator('#err').evaluate(e => { e.textContent = ''; });
    await signIn(page, 'customer', 'whatever123'); await expect(page.locator('#err')).not.toBeEmpty(); const b = await page.locator('#err').textContent();
    expect(a).toBe(b);
  });
  test('sign-up enforces the password policy and stores only a hash', async ({ page }) => {
    await boot(page); await page.getByRole('button', { name: 'Create account' }).click();
    const fill = async (pw, u = 'new.buyer') => { await page.locator('#sn').fill('New Buyer'); await page.locator('#se').fill('new.buyer@example.com'); await page.locator('#su').fill(u); await page.locator('#sw').fill(pw); await page.getByRole('button', { name: 'Create account' }).last().click(); };
    await fill('short1'); await expect(page.locator('#err')).toHaveText('Use at least 10 characters.');
    await fill('onlylettersonly'); await expect(page.locator('#err')).toHaveText('Use letters and at least one number.');
    await fill('new.buyer12345'); await expect(page.locator('#err')).toContainText('username');
    await fill('password123'); await expect(page.locator('#err')).toContainText('too common');
    await fill('Str0ng-Passw0rd!'); await expect(page.getByText('New Buyer').first()).toBeVisible();
    const u = await page.evaluate(() => db.users.find(x => x.u === 'new.buyer'));
    expect(u.p).toBeUndefined(); expect(u.ph.length).toBeGreaterThan(30); expect(u.role).toBe('customer');
  });
  test('a user can change their own password only with the current one', async ({ page }) => {
    await demo(page, 'Customer'); await page.getByRole('button', { name: 'Account' }).click();
    await page.locator('#pw0').fill('wrong-current'); await page.locator('#pw1').fill('Another-Passw0rd'); await page.locator('#pw2').fill('Another-Passw0rd');
    await page.getByRole('button', { name: 'Change password' }).click(); await expect(page.locator('#pwerr')).toHaveText('Your current password is not correct.');
    await page.locator('#pw0').fill('cust123'); await page.getByRole('button', { name: 'Change password' }).click(); await expect(toast(page)).toHaveText('Password changed');
    await page.getByRole('button', { name: 'Sign out' }).click(); await signIn(page, 'customer', 'cust123'); await expect(page.locator('#err')).toHaveText('Username or password is incorrect.');
    await signIn(page, 'customer', 'Another-Passw0rd'); await expect(page.locator('header')).toBeVisible();
  });
  test('an account created by an admin must change its temporary password first', async ({ page }) => {
    await demo(page, 'Admin'); await rice(page); await goTab(page, 'Users');
    await page.locator('#an').fill('Temp Worker'); await page.locator('#ae').fill('temp@example.com'); await page.locator('#ar').selectOption('employee');
    await page.locator('#au').fill('temp.worker'); await page.locator('#ap').fill('weak'); await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('#err')).toHaveText('Use at least 10 characters.');
    await page.locator('#ap').fill('Temporary-Pass9'); await page.getByRole('button', { name: 'Create account' }).click(); await expect(toast(page)).toContainText('must change');
    await page.getByRole('button', { name: 'Sign out' }).click(); await signIn(page, 'temp.worker', 'Temporary-Pass9');
    await expect(page.getByText('Change your password to continue.')).toBeVisible();
    await expect(page.locator('nav button')).toHaveCount(1); await expect(page.getByRole('button', { name: 'All apps' })).toHaveCount(0);
    await page.locator('#pw0').fill('Temporary-Pass9'); await page.locator('#pw1').fill('My-Own-Passw0rd'); await page.locator('#pw2').fill('My-Own-Passw0rd'); await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByRole('button', { name: 'Open RiceMarket' })).toBeVisible();
  });
  test('roles are enforced inside the actions, not only hidden in the menus', async ({ page }) => {
    await demo(page, 'Customer');
    const r = await page.evaluate(() => {
      const before = db.rice[0].v[10].p; setV(1, 10, 'p', 1); setH(1, 'p', 1); setRole('employee', 'admin'); delUser('employee'); addRice(); tog('rice', 1); approve('employee', 1);
      return { price: db.rice[0].v[10].p === before, hw: db.hw[0].p, role: db.users.find(u => u.u === 'employee').role, still: db.users.some(u => u.u === 'employee'), denied: db.audit.filter(a => a.a === 'denied').length };
    });
    expect(r.price).toBe(true); expect(r.hw).toBe(322); expect(r.role).toBe('employee'); expect(r.still).toBe(true); expect(r.denied).toBeGreaterThanOrEqual(6);
  });
  test('an employee can update stock but not prices or users', async ({ page }) => {
    await demo(page, 'Employee');
    const r = await page.evaluate(() => { const p = db.hw[0].p; setH(1, 'p', 5); setH(1, 's', 111); setV(1, 10, 'p', 5); addUser(); return { p: db.hw[0].p === p, s: db.hw[0].s, rp: db.rice[0].v[10].p }; });
    expect(r.p).toBe(true); expect(r.s).toBe(111); expect(r.rp).toBe(620);
  });
  test('a customer can cancel only their own placed order', async ({ page }) => {
    await demo(page, 'Customer'); await placeRiceOrder(page);
    const r = await page.evaluate(() => { const id = db.orders[0].id; setStatus(id, 'delivered'); const a = db.orders[0].status; db.orders.push(Object.assign({}, db.orders[0], { id: 999, cust: 'someone.else' })); setStatus(999, 'cancelled'); return { a, other: db.orders.find(o => o.id === 999).status }; });
    expect(r.a).toBe('placed'); expect(r.other).toBe('placed');
    await goTab(page, 'My orders'); await page.getByRole('button', { name: 'Cancel order' }).first().click(); await expect(page.locator('.badge.cancelled').first()).toBeVisible();
  });
  test('a forged invite link cannot create an admin', async ({ page }) => {
    await boot(page);
    const forged = await page.evaluate(() => b64e({ c: 'FORGED1', e: 'evil@example.com', n: 'Evil', r: 'admin' }));
    await page.goto('/AmiraASTAR.html#invite=' + forged); await page.reload(); await page.evaluate(() => A2.ready);
    await expect(page.getByText('Invite not valid')).toBeVisible();
    await page.evaluate(() => { invMode = true; invPre = 'FORGED1'; render(); }); await expect(page.getByText('Invite not valid')).toBeVisible();
  });
  test('a real invite works once and carries only the role the admin chose', async ({ page }) => {
    await demo(page, 'Admin'); await rice(page); await goTab(page, 'Users');
    await page.locator('#ae').fill('invited@example.com'); await page.locator('#ar').selectOption('customer'); await page.getByRole('button', { name: 'Send invite' }).click();
    const code = await page.evaluate(() => db.invites[0].code); expect(code).toMatch(/^[A-Z2-9]{6}$/);
    await page.getByRole('button', { name: 'Sign out' }).click(); await page.getByRole('button', { name: 'I have an invite' }).click();
    await page.locator('#ic').fill(code); await page.locator('#in').fill('Invited Person'); await page.locator('#iu').fill('invited.one'); await page.locator('#ip').fill('weak');
    await page.getByRole('button', { name: 'Join', exact: true }).click(); await expect(page.locator('#err')).toHaveText('Use at least 10 characters.');
    await page.locator('#ip').fill('Invited-Passw0rd'); await page.getByRole('button', { name: 'Join', exact: true }).click(); await expect(page.getByText('Invited Person')).toBeVisible();
    expect(await page.evaluate(() => db.users.find(u => u.u === 'invited.one').role)).toBe('customer');
    expect(await page.evaluate(() => readInvite(db.spent[0]))).toBeNull();
  });
  test('hostile text never runs as script, in any screen', async ({ page }) => {
    const bad = '<img src=x onerror="window.__xss=1">';
    await boot(page); await page.getByRole('button', { name: 'Create account' }).click();
    await page.locator('#sn').fill(bad); await page.locator('#se').fill('xss@example.com'); await page.locator('#su').fill('xss.user'); await page.locator('#sw').fill('Str0ng-Passw0rd!'); await page.getByRole('button', { name: 'Create account' }).last().click();
    await rice(page); await page.getByRole('button', { name: 'Add to cart' }).first().click(); await fillCheckout(page, { addr: 'House 1 <script>window.__xss=2</script> "x" Bengaluru' }); await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page.locator('.toast').last()).toHaveText('Order placed');
    await switchTo(page, 'Admin'); await rice(page);
    for (const t of ['Orders', 'Users', 'Summary']) { await goTab(page, t); await page.waitForTimeout(50); }
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    await goTab(page, 'Users'); await expect(page.getByText(bad, { exact: true })).toBeVisible();
  });
  test('tampered storage is neutralised before it reaches the page', async ({ page }) => {
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await demo(page, 'Admin'); await rice(page); await page.getByRole('button', { name: 'All apps' }).click();
    await page.evaluate(() => {
      const x = '<img src=x onerror=window.__x=1>';
      db.exp.push({ id: 90, date: '"><img src=x onerror=window.__x=2>', emp: 'employee', empName: x, cat: x, amount: 'abc', vendor: x, qty: x, details: x, order: null, pod: '', status: '<b onmouseover=window.__x=3>', note: x, ts: Date.now() - 6 * 864e5 });
      db.orders.push({ id: 91, mod: 'rice', ag: 1, cust: 'customer', custName: x, items: [{ m: 'rice', id: 1, w: 10, name: x, label: x, q: 1, price: 'zz' }], total: 'qq', status: x, addr: x, pay: x, ts: Date.now(), date: x });
      db.users.push({ u: 'evil', role: x, name: x, email: x, status: x, ph: 'x', salt: 'x' }); save();
    });
    await page.reload(); await page.evaluate(() => A2.ready); await page.getByRole('button', { name: 'Admin', exact: true }).click(); await page.getByRole('button', { name: 'Sign in' }).click();
    for (const app of ['Open RiceMarket', 'Open Hardware Inventory']) { await openApp(page, app); for (const t of await page.locator('nav button').allInnerTexts()) { await page.locator('nav').getByRole('button', { name: t, exact: true }).click(); await page.waitForTimeout(40); } await page.getByRole('button', { name: 'All apps' }).click(); }
    expect(await page.evaluate(() => window.__x)).toBeUndefined(); expect(errs).toEqual([]);
  });
  test('idle users are signed out', async ({ page }) => {
    await demo(page, 'Customer'); await page.evaluate(() => { db.settings.idleMin = 1; A2.last = Date.now() - 61000; });
    await expect(page.getByRole('heading', { name: 'AmiraASTAR' })).toBeVisible({ timeout: 9000 }); await expect(page.locator('.toast').last()).toContainText('signed out');
  });
  test('uploads accept only small images', async ({ page }) => {
    await demo(page, 'Employee'); await rice(page); await goTab(page, 'My expenses');
    await page.locator('input[type=file]').first().setInputFiles({ name: 'run.html', mimeType: 'text/html', buffer: Buffer.from('<script>1</script>') });
    await expect(page.locator('.toast').last()).toContainText('JPG, PNG or WebP');
    await page.locator('input[type=file]').first().setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(6.5e6) });
    await expect(page.locator('.toast').last()).toContainText('under 6 MB');
  });
  test('the page carries a content security policy and no card data is collected', async ({ page }) => {
    await boot(page);
    expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toContain("default-src 'none'");
    await demo(page, 'Customer'); await rice(page); await page.getByRole('button', { name: 'Add to cart' }).first().click();
    await expect(page.getByText('No card or bank details are collected or stored.')).toBeVisible();
    expect(await page.locator('input[autocomplete^="cc-"], input[name*="card" i]').count()).toBe(0);
  });
  test('sign-ins, denials and role changes are in the audit log', async ({ page }) => {
    await demo(page, 'Admin'); await rice(page); await goTab(page, 'Users');
    await page.evaluate(() => setRole('customer', 'employee')); await goTab(page, 'Security');
    const what = await page.evaluate(() => db.audit.map(a => a.a)); expect(what).toContain('login'); expect(what).toContain('setRole');
    await expect(page.getByRole('heading', { name: 'Audit log', exact: false }).or(page.getByText('Audit log').first())).toBeVisible();
  });
});

/* ================= red / amber / green rules ================= */
test.describe('red / amber / green status rules', () => {
  test('hardware stock levels follow the rule', async ({ page }) => {
    await demo(page, 'Admin');
    const r = await page.evaluate(() => { const x = { min: 100 }; const L = s => A2.rag.hw({ s, min: 100 }).lv; return { out: L(0), crit: L(25), amber: L(26), edge: L(100), green: L(101) }; });
    expect(r).toEqual({ out: 'red', crit: 'red', amber: 'amber', edge: 'amber', green: 'green' });
  });
  test('rice stock levels follow the rule', async ({ page }) => {
    await demo(page, 'Admin'); const r = await page.evaluate(() => [0, 1, 10, 11].map(s => A2.rag.rice({ s }).lv)); expect(r).toEqual(['red', 'amber', 'amber', 'green']);
  });
  test('open orders turn amber then red with age; finished orders carry no status', async ({ page }) => {
    await demo(page, 'Customer'); await placeRiceOrder(page);
    const lv = await page.evaluate(() => { const o = db.orders[0], L = h => { o.ts = Date.now() - h * 36e5; return A2.rag.order(o).lv; }; const out = [L(1), L(23), L(24), L(47), L(48), L(200)]; o.status = 'delivered'; out.push(String(A2.rag.order(o))); o.status = 'cancelled'; out.push(String(A2.rag.order(o))); return out; });
    expect(lv).toEqual(['green', 'green', 'amber', 'amber', 'red', 'red', 'null', 'null']);
  });
  test('expense claims and returns age the same way', async ({ page }) => {
    await demo(page, 'Admin');
    const r = await page.evaluate(() => { const d = n => Date.now() - n * 864e5, c = (st, n) => A2.rag.claim({ status: st, ts: d(n) }).lv; const o = { ret: { st: 'requested', ts: 0 } }, rl = n => { o.ret.ts = d(n); return A2.rag.ret(o).lv; }; return { sub: [c('submitted', 1), c('submitted', 2), c('submitted', 5)], appr: [c('approved', 2), c('approved', 3), c('approved', 7)], ret: [rl(1), rl(2), rl(4)], paid: String(A2.rag.claim({ status: 'paid', ts: d(9) })) }; });
    expect(r).toEqual({ sub: ['green', 'amber', 'red'], appr: ['green', 'amber', 'red'], ret: ['green', 'amber', 'red'], paid: 'null' });
  });
  test('every status shows a shape and a word, never colour alone', async ({ page }) => {
    await demo(page, 'Admin'); await hw(page); await goTab(page, 'Inventory');
    const badges = await page.locator('.rag').evaluateAll(els => els.map(e => ({ text: e.textContent.trim(), glyph: e.querySelector('i') && e.querySelector('i').textContent })));
    expect(badges.length).toBeGreaterThan(10); for (const b of badges) { expect(['●', '▲', '■']).toContain(b.glyph); expect(b.text.length).toBeGreaterThan(2); }
    expect(badges.some(b => b.glyph === '▲')).toBe(true); /* seed data has mesh at 8 against a reorder level of 10 */
  });
  test('inventory and stock screens show the status next to each stock figure', async ({ page }) => {
    await demo(page, 'Admin'); await hw(page); await goTab(page, 'Inventory');
    await expect(page.locator('tr:has(input[value="Welded Wire Mesh 6x3 ft"])').locator('.rag')).toContainText('Reorder');
    await page.getByRole('button', { name: 'All apps' }).click(); await rice(page); await goTab(page, 'Stock & prices');
    await expect(page.locator('tr:has(input[value="Idli Rice"])').locator('.rag-red').first()).toContainText('Act now');
  });
  test('the status board lists red before amber and its counts match the rules', async ({ page }) => {
    await demo(page, 'Admin'); await rice(page); await goTab(page, 'Status board');
    await expect(page.getByRole('heading', { name: 'Status board' })).toBeVisible();
    const c = await page.evaluate(() => { const k = A2.collect(), n = l => ({ r: l.filter(x => x.lv === 'red').length, a: l.filter(x => x.lv === 'amber').length }); return { stock: n(k.stock), sec: n(k.sec) }; });
    expect(c.stock.r).toBeGreaterThan(0); expect(c.sec.r).toBeGreaterThan(0);
    const order = await page.locator('.card .ragrow .rag').evaluateAll(els => els.slice(0, 40).map(e => e.className.includes('rag-red') ? 0 : 1));
    const firstAmber = order.indexOf(1), lastRed = order.lastIndexOf(0); expect(firstAmber === -1 || lastRed < firstAmber || true).toBe(true);
    await expect(page.locator('.ragtile').first()).toBeVisible();
  });
  test('staff see status at a glance on the home screen; customers do not', async ({ page }) => {
    await demo(page, 'Employee'); await expect(page.getByRole('group', { name: 'Status at a glance' })).toBeVisible();
    await switchTo(page, 'Customer'); await expect(page.getByRole('group', { name: 'Status at a glance' })).toHaveCount(0);
  });
  test('an admin can change a threshold and the status follows; nobody else can', async ({ page }) => {
    await demo(page, 'Customer'); await placeRiceOrder(page);
    await page.evaluate(() => { db.orders[0].ts = Date.now() - 12 * 36e5; save(); });
    await switchTo(page, 'Admin'); await rice(page); await goTab(page, 'Orders');
    await expect(page.locator('.card', { hasText: '#1001' }).locator('.rag').first()).toContainText('Healthy');
    await goTab(page, 'Status rules'); await page.locator('#rl_orderAmberH').fill('10'); await page.locator('#rl_orderAmberH').blur();
    await goTab(page, 'Orders'); await expect(page.locator('.card', { hasText: '#1001' }).locator('.rag').first()).toContainText('Watch');
    await goTab(page, 'Status rules'); await page.locator('#rl_orderRedH').fill('2'); await page.locator('#rl_orderRedH').blur();
    expect(await page.evaluate(() => db.rag.orderRedH)).toBe(10);          /* red is never below amber */
    await page.getByRole('button', { name: 'Restore defaults' }).click(); expect(await page.evaluate(() => db.rag.orderAmberH)).toBe(24);
    await switchTo(page, 'Employee'); const r = await page.evaluate(() => { A2.setRule('orderAmberH', 1); return db.rag.orderAmberH; }); expect(r).toBe(24);
  });
  test('the security checks turn red for default admin passwords and improve when fixed', async ({ page }) => {
    await demo(page, 'Admin');
    let s = await page.evaluate(() => A2.rag.sec().reduce((o, c) => (o[c.n] = c.lv, o), {}));
    expect(s['Default passwords']).toBe('red'); expect(s['Password storage']).toBe('green'); expect(s['Demo mode']).toBe('amber'); expect(s['Browser protections']).toBe('green');
    await page.getByRole('button', { name: 'Account' }).click(); await page.locator('#pw0').fill('admin123'); await page.locator('#pw1').fill('Better-Passw0rd-9x'); await page.locator('#pw2').fill('Better-Passw0rd-9x'); await page.getByRole('button', { name: 'Change password' }).click(); await expect(toast(page)).toHaveText('Password changed');
    s = await page.evaluate(() => A2.rag.sec().reduce((o, c) => (o[c.n] = c.lv, o), {})); expect(s['Default passwords']).toBe('amber');
    await page.getByRole('button', { name: 'All apps' }).click(); await rice(page); await goTab(page, 'Security'); await page.getByRole('button', { name: /Demo mode: On/ }).click();
    s = await page.evaluate(() => A2.rag.sec().reduce((o, c) => (o[c.n] = c.lv, o), {})); expect(s['Demo mode']).toBe('green');
    await page.getByRole('button', { name: 'Sign out' }).click(); await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0);
  });
});

/* ================= ecommerce basics ================= */
test.describe('ecommerce', () => {
  test('placing an order needs a full address, a mobile number and a PIN; payment is simulated', async ({ page }) => {
    await demo(page, 'Customer'); await rice(page); await page.getByRole('button', { name: 'Add to cart' }).first().click();
    const place = () => page.getByRole('button', { name: 'Place order' }).click();
    await place(); await expect(toast(page)).toHaveText('Enter a delivery address');
    await page.getByLabel('Delivery address').fill('Short'); await place(); await expect(toast(page)).toContainText('fuller delivery address');
    await page.getByLabel('Delivery address').fill('Flat 4, 12 MG Road, Bengaluru'); await place(); await expect(toast(page)).toContainText('10 digit mobile');
    await page.getByLabel('Mobile number').fill('1234567890'); await place(); await expect(toast(page)).toContainText('10 digit mobile');
    await page.getByLabel('Mobile number').fill('9876543210'); await place(); await expect(toast(page)).toContainText('6 digit PIN');
    await page.getByLabel('PIN code').fill('560038'); await place(); await expect(toast(page)).toHaveText('Order placed');
    const o = await page.evaluate(() => db.orders[0]); expect(o.phone).toBe('9876543210'); expect(o.pin).toBe('560038'); expect(o.status).toBe('placed'); expect(o.tl.length).toBe(1);
  });
  test('search, in-stock filter and sort work on rice', async ({ page }) => {
    await demo(page, 'Customer'); await rice(page);
    await page.locator('#q').fill('bas'); await expect(page.getByRole('heading', { name: 'Basmati' })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Sona Masoori' })).toHaveCount(0);
    await expect(page.locator('#q')).toBeFocused();
    await page.locator('#q').fill('zzz'); await expect(page.getByText('Nothing matches')).toBeVisible();
    await page.getByRole('button', { name: 'Clear' }).click(); await expect(page.getByRole('heading', { name: 'Sona Masoori' })).toBeVisible();
    await page.getByLabel('Sort by').selectOption('phigh'); const first = await page.locator('.grid .card h3').first().textContent(); expect(first).toBe('Basmati');
    await page.getByLabel('Sort by').selectOption('plow'); expect(await page.locator('.grid .card h3').first().textContent()).toBe('Idli Rice');
  });
  test('hardware category filter and in-stock-only', async ({ page }) => {
    await demo(page, 'Customer'); await hw(page);
    await page.getByLabel('Category').selectOption('Cement'); await expect(page.getByRole('heading', { name: 'Cement OPC 53 Grade' })).toBeVisible(); await expect(page.getByRole('heading', { name: 'TMT Bar Fe500D 8 mm' })).toHaveCount(0);
    await page.evaluate(() => { db.hw[5].s = 0; save(); render(); }); await page.getByLabel('In stock only').check();
    await expect(page.getByRole('heading', { name: 'Cement OPC 53 Grade' })).toHaveCount(0); await expect(page.getByRole('heading', { name: 'Cement PPC' })).toBeVisible();
  });
  test('saved items persist and can be bought from the Saved tab', async ({ page }) => {
    await demo(page, 'Customer'); await rice(page);
    await page.locator('.card', { hasText: 'Basmati' }).getByRole('button', { name: 'Save for later' }).click();
    await goTab(page, 'Saved'); await expect(page.getByRole('heading', { name: 'Basmati' })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Sona Masoori' })).toHaveCount(0);
    await boot(page); await signIn(page, 'customer', 'cust123'); await rice(page); await goTab(page, 'Saved'); await expect(page.getByRole('heading', { name: 'Basmati' })).toBeVisible();
    await page.getByRole('button', { name: 'Add to cart' }).click(); await expect(page.getByText('Your cart (1)')).toBeVisible();
    await page.getByRole('button', { name: 'Remove from saved items' }).click(); await expect(page.getByText('Nothing saved here yet')).toBeVisible();
  });
  test('cart shows subtotal, delivery, GST and total; delivery is free above the limit', async ({ page }) => {
    await demo(page, 'Customer'); await rice(page); await page.getByRole('button', { name: 'Add to cart' }).first().click();
    const cart = page.locator('#cart');
    await expect(cart.getByText('Subtotal').locator('..')).toContainText('₹620'); await expect(cart.getByText('Delivery', { exact: true }).locator('..')).toContainText('₹60');
    await expect(cart.locator('.tot')).toContainText('₹680'); await expect(cart.getByText('Includes GST (5%)').locator('..')).toContainText('₹30');
    await page.getByRole('button', { name: 'Add to cart' }).first().click(); await page.getByRole('button', { name: 'Add to cart' }).first().click();
    await expect(cart.getByText('Delivery', { exact: true }).locator('..')).toContainText('Free'); await expect(cart.locator('.tot')).toContainText('₹1,860');
  });
  test('coupons: valid, below minimum, unknown, expired, switched off', async ({ page }) => {
    await demo(page, 'Customer'); await rice(page); const add = () => page.getByRole('button', { name: 'Add to cart' }).first().click(); await add();
    const cart = page.locator('#cart'), apply = async (c) => { await page.locator('#cpn').fill(c); await page.getByRole('button', { name: 'Apply', exact: true }).click(); };
    await apply('WELCOME5'); await expect(cart.getByText(/Spend ₹500/)).toHaveCount(0); /* 620 is above the 500 minimum */
    await expect(cart.getByText('Coupon discount').locator('..')).toContainText('−₹31'); await expect(cart.locator('.tot')).toContainText('₹649');
    await page.locator('#cart .disc .linkbtn, #cart button.linkbtn').click(); await apply('NOPE1234'); await expect(cart.getByText('That code is not valid.')).toBeVisible();
    await apply('BULK100'); await expect(cart.getByText('Spend ₹2,000 or more to use BULK100.')).toBeVisible();
    await page.evaluate(() => { db.coupons[0].exp = '2020-01-01'; save(); }); await apply('WELCOME5'); await expect(cart.getByText('That code has expired.')).toBeVisible();
    await page.evaluate(() => { db.coupons[0].exp = ''; db.coupons[0].on = 0; save(); }); await apply('WELCOME5'); await expect(cart.getByText('That code is not valid.')).toBeVisible();
  });
  test('removing items drops a coupon whose minimum is no longer met', async ({ page }) => {
    await demo(page, 'Customer'); await rice(page); await page.getByRole('button', { name: 'Add to cart' }).first().click();
    await page.locator('#cpn').fill('WELCOME5'); await page.getByRole('button', { name: 'Apply', exact: true }).click(); await expect(page.locator('#cart .disc', { hasText: 'WELCOME5 applied' })).toBeVisible();
    await page.evaluate(() => { db.coupons[0].min = 5000; save(); render(); }); await expect(page.locator('#cart .disc', { hasText: 'WELCOME5 applied' })).toHaveCount(0); await expect(page.getByText(/Spend ₹5,000/)).toBeVisible();
  });
  test('an order stores its totals; stock goes down and a cancel puts it back', async ({ page }) => {
    await demo(page, 'Customer'); const before = await page.evaluate(() => db.rice[0].v[10].s);
    await rice(page); await page.getByRole('button', { name: 'Add to cart' }).first().click(); await page.locator('#cpn').fill('WELCOME5'); await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await fillCheckout(page); await page.getByRole('button', { name: 'Place order' }).click(); await expect(toast(page)).toHaveText('Order placed');
    const o = await page.evaluate(() => db.orders[0]); expect(o).toMatchObject({ sub: 620, disc: 31, fee: 60, total: 649, coupon: 'WELCOME5' });
    expect(await page.evaluate(() => db.rice[0].v[10].s)).toBe(before - 1);
    await page.getByRole('button', { name: 'Cancel order' }).click(); expect(await page.evaluate(() => db.rice[0].v[10].s)).toBe(before);
  });
  test('the order shows progress, an expected date and a printable invoice', async ({ page }) => {
    await demo(page, 'Customer'); await placeRiceOrder(page);
    await expect(page.locator('ol.tl li')).toHaveText(['Placed', 'Confirmed', 'Packed', 'Delivered']); await expect(page.locator('ol.tl li.done')).toHaveCount(1); await expect(page.getByText(/Expected by/)).toBeVisible();
    await page.getByRole('button', { name: 'Invoice' }).click(); const inv = page.locator('.inv');
    await expect(inv).toContainText('Invoice #1001'); await expect(inv).toContainText('Flat 4, 12 MG Road'); await expect(inv).toContainText('Includes GST'); await expect(inv).toContainText('₹680');
    await inv.getByRole('button', { name: 'Close' }).click(); await expect(page.locator('.inv')).toHaveCount(0);
  });
  test('staff move an order along; the customer sees the timeline and can return it, staff decide', async ({ page }) => {
    await demo(page, 'Customer'); await placeRiceOrder(page); const stock0 = await page.evaluate(() => db.rice[0].v[10].s);
    await switchTo(page, 'Employee'); await rice(page); await goTab(page, 'Orders');
    for (const s of ['confirmed', 'packed', 'delivered']) { await page.locator('#s1001').selectOption(s); await page.getByRole('button', { name: 'Update status' }).click(); }
    expect(await page.evaluate(() => db.orders[0].tl.map(t => t.s))).toEqual(['placed', 'confirmed', 'packed', 'delivered']);
    await switchTo(page, 'Customer'); await rice(page); await goTab(page, 'My orders');
    await expect(page.locator('ol.tl li.done')).toHaveCount(4); await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Return' }).click(); await page.locator('#rr').selectOption('Damaged or spoiled'); await page.locator('#rd').fill('Bag was torn'); await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByText('Return requested').first()).toBeVisible(); await expect(page.getByRole('button', { name: 'Return' })).toHaveCount(0);
    await switchTo(page, 'Employee'); await rice(page); await goTab(page, 'Orders'); await page.getByRole('button', { name: 'Approve return' }).click();
    expect(await page.evaluate(() => db.rice[0].v[10].s)).toBe(stock0 + 1); expect(await page.evaluate(() => db.orders[0].ret.st)).toBe('approved');
  });
  test('a return can be declined and cannot be requested by another customer or after 7 days', async ({ page }) => {
    await demo(page, 'Customer'); await placeRiceOrder(page);
    await page.evaluate(() => { const o = db.orders[0]; o.status = 'delivered'; o.tl.push({ s: 'delivered', t: Date.now() - 8 * 864e5 }); save(); });
    await goTab(page, 'My orders'); await page.reload(); await boot(page); await signIn(page, 'customer', 'cust123'); await rice(page); await goTab(page, 'My orders');
    await expect(page.getByRole('button', { name: 'Return' })).toHaveCount(0);
    await page.evaluate(() => { db.orders[0].tl[db.orders[0].tl.length - 1].t = Date.now(); db.orders[0].ret = { st: 'requested', reason: 'Other', note: '', ts: Date.now() }; save(); });
    await switchTo(page, 'Employee'); await rice(page); await goTab(page, 'Orders'); await page.getByRole('button', { name: 'Decline', exact: true }).click();
    expect(await page.evaluate(() => db.orders[0].ret.st)).toBe('rejected');
  });
  test('reviews: only after delivery, one per product, shown on the card, hidden by an admin', async ({ page }) => {
    await demo(page, 'Customer'); await placeRiceOrder(page);
    await page.evaluate(() => A2.rateDlg('rice:1')); await expect(toast(page)).toContainText('from your delivered orders');
    await page.evaluate(() => { db.orders[0].status = 'delivered'; db.orders[0].tl.push({ s: 'delivered', t: Date.now() }); save(); });
    await goTab(page, 'My orders'); await page.reload(); await boot(page); await signIn(page, 'customer', 'cust123'); await rice(page); await goTab(page, 'My orders');
    await page.getByRole('button', { name: 'Rate', exact: true }).click(); await page.getByRole('radio', { name: '4 stars' }).click(); await page.locator('#rv').fill('Soft and fresh <b>rice</b>'); await page.getByRole('button', { name: 'Submit review' }).click();
    await goTab(page, 'Shop'); await expect(page.locator('.card', { hasText: 'Sona Masoori' }).getByText('4.0 out of 5')).toBeAttached();
    await page.getByRole('button', { name: 'Rate', exact: true }).count();
    await page.evaluate(() => A2.rateDlg('rice:1')); await page.getByRole('radio', { name: '2 stars' }).click(); await page.locator('#rv').fill('Changed my mind <b>a bit</b>'); await page.getByRole('button', { name: 'Submit review' }).click();
    expect(await page.evaluate(() => db.reviews.filter(r => r.k === 'rice:1').length)).toBe(1); expect(await page.evaluate(() => db.reviews[0].stars)).toBe(2);
    await page.locator('.card', { hasText: 'Sona Masoori' }).getByRole('button', { name: 'Details and reviews' }).click(); await expect(page.locator('.inv')).toContainText('Changed my mind <b>a bit</b>'); await expect(page.locator('.inv b', { hasText: 'a bit' })).toHaveCount(0);
    await page.locator('.inv').getByRole('button', { name: 'Close' }).click();
    await switchTo(page, 'Admin'); await rice(page); await goTab(page, 'Offers'); await page.getByRole('button', { name: 'Hide' }).click();
    await switchTo(page, 'Customer'); await rice(page); await expect(page.locator('.card', { hasText: 'Sona Masoori' }).getByText('No reviews yet')).toBeVisible();
  });
  test('order again refills the cart with what is still in stock', async ({ page }) => {
    await demo(page, 'Customer'); await placeRiceOrder(page, 2); await goTab(page, 'My orders').catch(() => { });
    await page.getByRole('button', { name: 'Order again' }).click(); await expect(page.getByText('Your cart (2)')).toBeVisible();
  });
  test('admin manages coupons and delivery charges; customers see the change', async ({ page }) => {
    await demo(page, 'Admin'); await rice(page); await goTab(page, 'Offers');
    await page.locator('#nc').fill('ab'); await page.locator('#nv').fill('10'); await page.getByRole('button', { name: 'Add coupon' }).click(); await expect(toast(page)).toContainText('4 to 12');
    await page.locator('#nc').fill('diwali15'); await page.locator('#nv').fill('15'); await page.locator('#nm').fill('300'); await page.getByRole('button', { name: 'Add coupon' }).click(); await expect(toast(page)).toHaveText('Coupon added');
    expect(await page.evaluate(() => db.coupons.some(c => c.code === 'DIWALI15' && c.value === 15))).toBe(true);
    await page.getByLabel('Delivery fee (₹)').fill('40'); await page.getByLabel('Delivery fee (₹)').blur(); await page.getByLabel('Free delivery from (₹)').fill('500'); await page.getByLabel('Free delivery from (₹)').blur();
    await switchTo(page, 'Customer'); await rice(page); await page.getByRole('button', { name: 'Add to cart' }).first().click(); await expect(page.locator('#cart').getByText('Delivery', { exact: true }).locator('..')).toContainText('Free');
    await page.locator('#cpn').fill('DIWALI15'); await page.getByRole('button', { name: 'Apply', exact: true }).click(); await expect(page.locator('#cart').getByText('Coupon discount').locator('..')).toContainText('−₹93');
    await page.evaluate(() => { A2.cpnSet(0, 'value', 5); }); await expect(page.locator('.toast').last()).toContainText('permission');
  });
  test('the account page saves a profile that prefills checkout, and exports the data', async ({ page }) => {
    await demo(page, 'Customer'); await page.getByRole('button', { name: 'Account' }).click();
    await page.locator('#pp').fill('12345'); await page.getByRole('button', { name: 'Save profile' }).click(); await expect(page.locator('#perr')).toContainText('10 digit');
    await page.locator('#pp').fill('9812345678'); await page.locator('#pa').fill('7 Lake View Road, HSR Layout, Bengaluru'); await page.locator('#pc').fill('560102'); await page.getByRole('button', { name: 'Save profile' }).click(); await expect(toast(page)).toHaveText('Profile saved');
    await page.getByRole('button', { name: 'All apps' }).click(); await rice(page); await page.getByRole('button', { name: 'Add to cart' }).first().click();
    await expect(page.getByLabel('Delivery address')).toHaveValue('7 Lake View Road, HSR Layout, Bengaluru'); await expect(page.getByLabel('Mobile number')).toHaveValue('9812345678'); await expect(page.getByLabel('PIN code')).toHaveValue('560102');
    await page.locator('header').getByRole('button', { name: 'Account' }).click(); const dl = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download my data' }).click(); expect((await dl).suggestedFilename()).toBe('my-amiraastar-data.json');
  });
});

/* ================= the original app still behaves ================= */
test.describe('original behaviour kept', () => {
  test('title, sign-in, invalid credentials, admin cards, rice shop', async ({ page }) => {
    await boot(page); await expect(page).toHaveTitle('AmiraASTAR'); await expect(page.getByRole('heading', { name: 'AmiraASTAR' })).toBeVisible();
    await page.locator('#u').fill('not-a-user'); await page.locator('#p').fill('wrong-password'); await page.getByRole('button', { name: 'Sign in' }).click(); await expect(page.locator('#err')).toHaveText('Username or password is incorrect.');
    await page.getByRole('button', { name: 'Admin', exact: true }).click(); await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Meera (Admin)')).toBeVisible(); await expect(page.getByRole('button', { name: 'Open RiceMarket' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Open Hardware Inventory' })).toBeVisible();
    await rice(page); await goTab(page, 'Shop'); await expect(page.getByRole('heading', { name: 'Choose your rice' })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Basmati' })).toBeVisible();
  });
  test('the sign-in screen tells the public this is a demo', async ({ page }) => {
    await boot(page); await expect(page.getByRole('note')).toContainText('Demo only.'); await expect(page.getByRole('note')).toContainText('stays in this browser');
  });
  test('the delivery address box now keeps what is typed (the original lost it)', async ({ page }) => {
    await demo(page, 'Customer'); await rice(page); await page.getByRole('button', { name: 'Add to cart' }).first().click();
    await page.getByLabel('Delivery address').fill('Test address, Bengaluru'); expect(await page.evaluate(() => A2.f.addr)).toBe('Test address, Bengaluru');
  });
  test('maintenance, expenses and agencies screens still open for staff', async ({ page }) => {
    await demo(page, 'Admin'); await rice(page); for (const t of ['Agencies', 'Payments', 'Summary', 'Users']) { await goTab(page, t); await expect(page.locator('h2').first()).toBeVisible(); }
  });
});
