const { test, expect } = require('@playwright/test');

/* ---------- helpers ---------- */
async function boot(page) { await page.goto('/AmiraASTAR.html'); await page.evaluate(() => A2.ready); }
async function demo(page, role) { await boot(page); await page.getByRole('button', { name: role, exact: true }).click(); await page.getByRole('button', { name: 'Sign in' }).click(); await expect(page.locator('header')).toBeVisible(); }
async function switchTo(page, role) { await page.getByRole('button', { name: 'Sign out' }).click(); await page.getByRole('button', { name: role, exact: true }).click(); await page.getByRole('button', { name: 'Sign in' }).click(); await expect(page.locator('header')).toBeVisible(); }
const goTab = (page, name) => page.locator('nav').getByRole('button', { name, exact: true }).click();
const parts = (page) => page.getByRole('button', { name: 'Open Auto Spare Parts' }).click();
const toast = (page) => page.locator('.toast').last();
const stock = (page, id) => page.evaluate((i) => db.ap.find(x => x.id === i).s, id);
const card = (page, name, pno) => page.locator('.card', { hasText: pno || name }).filter({ has: page.getByRole('heading', { name }) });
async function checkout(page) {
  await page.getByLabel('Delivery address').fill('Shop 12, Auto Nagar, Peenya, Bengaluru');
  await page.getByLabel('Mobile number').fill('9876543210'); await page.getByLabel('PIN code').fill('560058');
  await page.getByRole('button', { name: 'Place order' }).click(); await expect(toast(page)).toHaveText('Order placed');
}
async function orderPad(page) {   /* customer orders the Swift brake pads (part 1) */
  await parts(page); await page.getByLabel('Vehicle type').selectOption('Car'); await page.getByLabel('Vehicle model').selectOption('Maruti Swift');
  await card(page, 'Brake pad set (front)', 'BP-1021').getByRole('button', { name: 'Add', exact: true }).click(); await checkout(page);
}

test.describe('auto spare parts card', () => {
  test('a new card sits on the home screen for every role and opens its own tabs', async ({ page }) => {
    await demo(page, 'Customer'); await expect(page.getByRole('button', { name: 'Open Auto Spare Parts' })).toBeVisible(); await parts(page);
    await expect(page.locator('nav button')).toHaveText(['Parts', 'Saved', 'My orders', 'Account']); await expect(page.getByRole('heading', { name: 'Spare parts' })).toBeVisible();
    await switchTo(page, 'Employee'); await parts(page); await expect(page.locator('nav button')).toHaveText(['Orders', 'Parts', 'Parts stock', 'Status board', 'Account']);
    await switchTo(page, 'Admin'); await parts(page); await expect(page.locator('nav button')).toContainText(['Orders', 'Parts', 'Parts stock', 'Parts report', 'Users']);
  });
  test('an admin can rename the card and hide it from customers', async ({ page }) => {
    await demo(page, 'Admin'); await page.getByRole('button', { name: 'Customize cards' }).click();
    const mine = page.locator('.card.mod').nth(2); await expect(mine.getByLabel('Card title')).toHaveValue('Auto Spare Parts');
    await mine.getByLabel('Card title').fill('Parts Counter'); await mine.getByLabel('Card title').blur();
    await mine.getByRole('button', { name: 'Hide from customers' }).click(); await page.getByRole('button', { name: 'Done customizing' }).click();
    await expect(page.getByRole('button', { name: 'Open Parts Counter' })).toBeVisible(); await expect(page.getByText('Hidden from customers')).toBeVisible();
    await switchTo(page, 'Customer'); await expect(page.getByRole('button', { name: /Open Parts Counter|Open Auto Spare Parts/ })).toHaveCount(0);
  });
  test('parts are found by vehicle type and model, plus universal parts', async ({ page }) => {
    await demo(page, 'Customer'); await parts(page);
    await page.getByLabel('Vehicle type').selectOption('Car');
    expect(await page.getByLabel('Vehicle model').locator('option').allInnerTexts()).toEqual(expect.arrayContaining(['All models', 'Maruti Swift', 'Tata Nexon']));
    expect(await page.getByLabel('Vehicle model').locator('option').allInnerTexts()).not.toContain('Hero Splendor');
    await page.getByLabel('Vehicle model').selectOption('Maruti Swift');
    await expect(page.getByRole('heading', { name: 'Oil filter' })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Headlight bulb H4' })).toBeVisible();   /* "All" fits every car */
    await expect(page.getByRole('heading', { name: 'Clutch plate' })).toHaveCount(0);          /* Scorpio only */
    await expect(page.locator('.card', { hasText: 'BP-2045' })).toHaveCount(0);                /* Creta, Nexon, City pads */
    await expect(page.locator('.card', { hasText: 'BP-1021' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Engine oil 5W-30 synthetic (1 L)' })).toBeVisible();   /* fits all vehicles */
    await page.getByLabel('Vehicle type').selectOption('Bike'); await expect(page.getByLabel('Vehicle model')).toHaveValue('');
    await expect(page.locator('.card', { hasText: 'BP-1021' })).toHaveCount(0); await expect(page.getByRole('heading', { name: 'Brake shoe set' })).toBeVisible();
  });
  test('search by name, brand or part number; stock filter and sort', async ({ page }) => {
    await demo(page, 'Customer'); await parts(page);
    await page.locator('#aq').fill('of-118'); await expect(page.locator('.grid .card')).toHaveCount(1); await expect(page.getByRole('heading', { name: 'Oil filter' })).toBeVisible(); await expect(page.locator('#aq')).toBeFocused();
    await page.locator('#aq').fill('exide'); expect(await page.locator('.grid .card').count()).toBe(3);
    await page.locator('#aq').fill('zzzz'); await expect(page.getByText('Nothing matches')).toBeVisible(); await page.getByRole('button', { name: 'Clear' }).click();
    await page.getByLabel('Vehicle type').selectOption('Bike'); await expect(page.getByRole('heading', { name: 'Rear tyre 90/90-12' })).toBeVisible(); await page.getByLabel('In stock only').check(); await expect(page.getByRole('heading', { name: 'Rear tyre 90/90-12' })).toHaveCount(0);
    await page.getByLabel('Sort by').selectOption('phigh'); expect(await page.locator('.grid .card h3').first().textContent()).toBe('Battery 12V 5Ah');
  });
  test('a customer orders a part: totals, GST, stock down, shown in My orders, history written', async ({ page }) => {
    await demo(page, 'Customer'); const before = await stock(page, 1); await parts(page);
    await page.getByLabel('Vehicle type').selectOption('Car'); await page.getByLabel('Vehicle model').selectOption('Maruti Swift');
    await card(page, 'Brake pad set (front)', 'BP-1021').getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.locator('#cart')).toContainText('Bosch BP-1021'); await expect(page.locator('#cart')).toContainText('Includes GST (18%)'); await expect(page.locator('#cart .tot')).toContainText('₹1,510');   /* 1450 + 60 delivery */
    await checkout(page); expect(await stock(page, 1)).toBe(before - 1);
    await expect(page.getByRole('heading', { name: 'My orders' })).toBeVisible(); await expect(page.locator('.card', { hasText: '#1001' })).toContainText('Brake pad set (front) (Bosch BP-1021)');
    const log = await page.evaluate(() => db.stockLog[0]); expect(log).toMatchObject({ id: 1, d: -1, r: 'Order #1001' });
    await page.getByRole('button', { name: 'Cancel order' }).click(); expect(await stock(page, 1)).toBe(before);
    expect(await page.evaluate(() => db.stockLog.slice(0, 2).map(l => l.d + ':' + l.r))).toEqual(['1:Order #1001 cancelled', '-1:Order #1001']);
  });
  test('a customer cannot order more than the stock', async ({ page }) => {
    await demo(page, 'Customer'); await parts(page); await page.locator('#aq').fill('BT-88');
    const add = card(page, 'Tractor battery 12V 88Ah').getByRole('button', { name: 'Add', exact: true });
    for (let i = 0; i < 5; i++) await add.click(); await add.click(); await expect(toast(page)).toHaveText('Only 5 in stock');
  });
  test('staff follow the order through to delivery; a return puts the part back and is logged', async ({ page }) => {
    await demo(page, 'Customer'); await orderPad(page); const afterSale = await stock(page, 1);
    await switchTo(page, 'Employee'); await parts(page); await goTab(page, 'Orders');
    for (const s of ['confirmed', 'packed', 'delivered']) { await page.locator('#s1001').selectOption(s); await page.getByRole('button', { name: 'Update status' }).click(); }
    await switchTo(page, 'Customer'); await parts(page); await goTab(page, 'My orders');
    await page.getByRole('button', { name: 'Return' }).click(); await page.locator('#rr').selectOption('Wrong item'); await page.getByRole('button', { name: 'Send request' }).click();
    await switchTo(page, 'Employee'); await parts(page); await goTab(page, 'Orders'); await page.getByRole('button', { name: 'Approve return' }).click();
    expect(await stock(page, 1)).toBe(afterSale + 1); expect(await page.evaluate(() => db.stockLog[0].r)).toBe('Return of order #1001');
  });
  test('staff update stock and every change is recorded; prices and reorder levels are admin only', async ({ page }) => {
    await demo(page, 'Employee'); await parts(page); await goTab(page, 'Parts stock');
    await page.getByLabel('Oil filter stock').first().fill('50'); await page.getByLabel('Oil filter stock').first().blur(); await expect(toast(page)).toHaveText('Saved');
    expect(await stock(page, 3)).toBe(50); expect(await page.evaluate(() => db.stockLog[0])).toMatchObject({ id: 3, d: -10, r: 'Stock count', u: 'employee' });
    await expect(page.getByLabel('Oil filter price').first()).toBeDisabled(); await expect(page.getByLabel('Oil filter reorder level').first()).toBeDisabled();
    const r = await page.evaluate(() => { const p = db.ap[2].p; A2.ap.set(3, 'p', 1); A2.ap.set(3, 'min', 0); A2.ap.add(); return { same: db.ap[2].p === p, min: db.ap[2].min, n: db.ap.length }; }); expect(r).toEqual({ same: true, min: 15, n: 33 });
    await page.getByLabel('Oil filter stock').first().fill('-4'); await page.getByLabel('Oil filter stock').first().blur(); await expect(toast(page)).toContainText('whole number'); expect(await stock(page, 3)).toBe(50);
  });
  test('receiving stock needs a part and a sensible quantity, then adds to the stock and the history', async ({ page }) => {
    await demo(page, 'Employee'); await parts(page); await goTab(page, 'Parts stock');
    await page.getByRole('button', { name: 'Add to stock' }).click(); await expect(page.locator('#rcerr')).toContainText('how many arrived');
    await page.locator('#rc_p').selectOption('16'); await page.locator('#rc_q').fill('10'); await page.locator('#rc_n').fill('Bill 4471 <b>x</b>'); await page.getByRole('button', { name: 'Add to stock' }).click();
    expect(await stock(page, 16)).toBe(10); await expect(page.locator('.card', { hasText: 'Stock history' })).toContainText('Stock in: Bill 4471 <b>x</b>'); await expect(page.locator('.card', { hasText: 'Stock history' }).locator('b', { hasText: 'x' })).toHaveCount(0);
    await expect(page.locator('tr:has(input[value="Rear tyre 90/90-12"])').locator('.rag')).toContainText('OK');
  });
  test('an admin adds a part with checks, hides it, and customers see the change', async ({ page }) => {
    await demo(page, 'Admin'); await parts(page); await goTab(page, 'Parts stock');
    const add = () => page.getByRole('button', { name: 'Add part' }).click(), err = () => page.locator('#nperr');
    await add(); await expect(err()).toHaveText('Enter the part name.');
    await page.locator('#np_name').fill('Radiator hose'); await add(); await expect(err()).toHaveText('Enter the part number.');
    await page.locator('#np_pno').fill('rh-77'); await add(); await expect(err()).toContainText('selling price');
    await page.locator('#np_p').fill('620'); await page.locator('#np_s').fill('12'); await page.locator('#np_min').fill('4'); await page.locator('#np_vt').selectOption('Car'); await page.locator('#np_models').fill('Honda City, Hyundai i20'); await page.locator('#np_cat').selectOption('Engine'); await add();
    await expect(toast(page)).toHaveText('Part added'); expect(await page.evaluate(() => db.ap.at(-1))).toMatchObject({ name: 'Radiator hose', pno: 'RH-77', vtype: 'Car', models: ['Honda City', 'Hyundai i20'], s: 12 });
    expect(await page.evaluate(() => db.stockLog[0].r)).toBe('Opening stock');
    await switchTo(page, 'Customer'); await parts(page); await page.getByLabel('Vehicle type').selectOption('Car'); await page.getByLabel('Vehicle model').selectOption('Honda City'); await expect(page.getByRole('heading', { name: 'Radiator hose' })).toBeVisible();
    await switchTo(page, 'Admin'); await parts(page); await goTab(page, 'Parts stock'); await page.locator('#aq').fill('RH-77'); await page.getByRole('button', { name: 'Hide' }).click();
    await switchTo(page, 'Customer'); await parts(page); await page.locator('#aq').fill('RH-77'); await expect(page.getByText('Nothing matches')).toBeVisible();
  });
  test('status colours follow the stock rule and reach the board and the home card', async ({ page }) => {
    await demo(page, 'Admin'); await parts(page); await goTab(page, 'Parts stock');
    await expect(page.locator('tr:has(input[value="Rear tyre 90/90-12"])').locator('.rag-red')).toContainText('Out of stock');
    await expect(page.locator('tr:has(input[value="Clutch cable"])').locator('.rag-amber')).toContainText('Reorder');
    await goTab(page, 'Status board'); await expect(page.getByText('Rear tyre 90/90-12 (Bike TY-9012)')).toBeVisible();
    await page.getByRole('button', { name: 'All apps' }).click(); await expect(page.locator('.card.mod', { hasText: 'Auto Spare Parts' })).toContainText('parts to restock');
    await switchTo(page, 'Customer'); await parts(page); await page.getByLabel('Vehicle type').selectOption('Bike'); await page.getByLabel('Vehicle model').selectOption('Honda Activa');
    await expect(card(page, 'Rear tyre 90/90-12').locator('.rag-red')).toContainText('Out of stock'); await expect(card(page, 'Rear tyre 90/90-12').getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
  });
  test('the parts report shows sales, best sellers and what to restock', async ({ page }) => {
    await demo(page, 'Customer'); await orderPad(page);
    await switchTo(page, 'Admin'); await parts(page); await goTab(page, 'Parts report');
    await expect(page.locator('.card', { hasText: 'Orders (not cancelled)' })).toContainText('1'); await expect(page.locator('.card', { hasText: 'Best sellers' })).toContainText('Brake pad set (front)');
    await expect(page.locator('.card', { hasText: 'Sales by vehicle type' })).toContainText('Car'); await expect(page.locator('.card', { hasText: 'Needs restocking' }).last()).toContainText('Rear tyre 90/90-12');
  });
  test('saved parts and reviews work like in the other cards', async ({ page }) => {
    await demo(page, 'Customer'); await parts(page); await card(page, 'Oil filter').getByRole('button', { name: 'Save for later' }).click();
    await goTab(page, 'Saved'); await expect(page.getByRole('heading', { name: 'Oil filter' })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Spark plug (set of 4)' })).toHaveCount(0);
    await page.evaluate(() => A2.rateDlg('ap:3')); await expect(toast(page)).toContainText('delivered orders');
  });
  test('hostile text in part fields never runs; staff-only actions are blocked for customers', async ({ page }) => {
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await demo(page, 'Customer');
    const r = await page.evaluate(() => { const b = db.ap.length; A2.ap.add(); A2.ap.receive(); A2.ap.set(1, 's', 999); tog('ap', 1); setN('ap', 1, 'name', 'hacked'); return { n: db.ap.length === b, s: db.ap[0].s, name: db.ap[0].name, denied: db.audit.filter(a => a.a === 'denied').length }; });
    expect(r.n).toBe(true); expect(r.s).toBe(24); expect(r.name).toBe('Brake pad set (front)'); expect(r.denied).toBeGreaterThanOrEqual(4);
    await page.evaluate(() => { const x = '<img src=x onerror=window.__p=1>'; db.ap.push({ id: 77, name: x, cat: x, vtype: x, models: [x], brand: x, pno: x, unit: x, p: 'zz', s: 'qq', min: x, on: 1 }); db.stockLog.push({ t: 1, u: x, id: 77, name: x, d: x, r: x }); save(); });
    await page.reload(); await page.evaluate(() => A2.ready); await page.getByRole('button', { name: 'Admin', exact: true }).click(); await page.getByRole('button', { name: 'Sign in' }).click();
    await parts(page); for (const t of ['Parts', 'Parts stock', 'Parts report', 'Status board']) { await goTab(page, t); await page.waitForTimeout(60); }
    expect(await page.evaluate(() => window.__p)).toBeUndefined(); expect(errs).toEqual([]);
  });
});
