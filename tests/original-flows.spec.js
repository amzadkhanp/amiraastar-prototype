/* Your five original starter tests. Only the order test changed: checkout now also asks for a mobile number and a PIN code. */
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => { await page.goto('/AmiraASTAR.html'); });

test('sign-in page loads with AmiraASTAR title', async ({ page }) => {
  await expect(page).toHaveTitle('AmiraASTAR');
  await expect(page.getByRole('heading', { name: 'AmiraASTAR' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('invalid credentials show validation message', async ({ page }) => {
  await page.locator('#u').fill('not-a-user');
  await page.locator('#p').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#err')).toHaveText('Username or password is incorrect.');
});

test('admin demo login opens application cards', async ({ page }) => {
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Meera (Admin)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open RiceMarket' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Hardware Inventory' })).toBeVisible();
});

test('customer can open RiceMarket and view rice options', async ({ page }) => {
  await page.getByRole('button', { name: 'Customer', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Open RiceMarket' }).click();
  await expect(page.getByRole('heading', { name: 'Choose your rice' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sona Masoori' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Basmati' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to cart' }).first()).toBeEnabled();
});

test('customer can place a rice order with a delivery address', async ({ page }) => {
  await page.getByRole('button', { name: 'Customer', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Open RiceMarket' }).click();
  await page.getByRole('button', { name: 'Add to cart' }).first().click();

  await page.getByLabel('Delivery address').fill('Test address, Bengaluru');
  await page.getByLabel('Mobile number').fill('9876543210');   // new in v2
  await page.getByLabel('PIN code').fill('560001');            // new in v2
  await page.getByRole('button', { name: 'Place order' }).click();

  await expect(page.getByText('Order placed')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My orders' })).toBeVisible();
  await expect(page.getByText('Test address, Bengaluru')).toBeVisible();
  await expect(page.getByText('placed', { exact: true }).first()).toBeVisible();
});
