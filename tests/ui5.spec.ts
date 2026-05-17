import { test, expect } from './fixtures';

test('has title', async ({ safariPage: page }) => {
  await page.goto('https://ui5.sap.com/test-resources/sap/m/demokit/cart/webapp/index.html?sap-ui-theme=sap_horizon_dark');
  await page.locator('[role="listitem"][id*=category]').filter({ hasText: 'Keyboards' }).click();
  await page.locator('[role="listitem"][id*=category]').filter({ hasText: 'Internet Keyboard' }).click();
  await page.locator('[aria-label="Product Footer"] button').click();
  //click aria-label="Show Shopping Cart"
  await page.locator('[aria-label="Show Shopping Cart"]').click();
  //click data-sap-ui="container-cart---cartView--proceedButton"
  await page.locator('[data-sap-ui="container-cart---cartView--proceedButton"]').click();
  // click data-sap-ui="container-cart---checkoutView--contentsStep-nextButton"
  await page.locator('[data-sap-ui="container-cart---checkoutView--contentsStep-nextButton"]').click();
    await page.locator('[data-sap-ui="container-cart---checkoutView--paymentTypeStep-nextButton"]').click();
// fill id="container-cart---checkoutView--creditCardHolderName-inner"
  await page.locator('#container-cart---checkoutView--creditCardHolderName-inner').fill('John Doe');
  // fill id="container-cart---checkoutView--creditCardNumber-inner"
  await page.locator('#container-cart---checkoutView--creditCardNumber-inner').fill('4111 1111 1111 1111');
  // fill id="container-cart---checkoutView--creditCardExpiryDate-inner"
  await page.locator('#container-cart---checkoutView--creditCardExpirationDate-inner').fill('12/34');
  // fill id="container-cart---checkoutView--creditCardCVV-inner"
  await page.locator('#container-cart---checkoutView--creditCardSecurityNumber-inner').fill('123');
  await page.locator('[data-sap-ui="container-cart---checkoutView--creditCardStep-nextButton"]').click();
  await page.waitForTimeout(3000);
  //await test.info().attach('screenshot.png', { body: await page.locator('body').screenshot(), contentType: 'image/png' });
});