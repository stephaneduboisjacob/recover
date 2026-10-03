import { expect, test } from '@playwright/test';

test('marketing home and demo dashboard load', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name:/AI will improve productivity/i })).toBeVisible();
  await page.goto('/app');
  await expect(page.getByRole('heading', { name:/Good morning, Sam/ })).toBeVisible();
  await expect(page.getByText(/RECOVER found/).first()).toBeVisible();
  await expect(page.getByText('$84,219').first()).toBeVisible();
  await expect(page.getByText('$17,430').first()).toBeVisible();
  await page.screenshot({ path:'test-results/dashboard.png', fullPage:true });
});
