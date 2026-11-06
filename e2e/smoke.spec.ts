import { expect, test } from '@playwright/test';

test.describe('Legaas — Smoke E2E', () => {
  test('renderiza a página inicial e navega para o ambiente Legaas Office', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Legaas/i })).toBeVisible();
  });
});
