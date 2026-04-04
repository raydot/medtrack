import { test, expect } from '@playwright/test';

test.describe('Member Dashboard', () => {
  test('happy path: member views dashboard with all prescriptions visible', async ({ page }) => {
    await page.goto('http://localhost:4200');

    await expect(page.getByRole('heading', { name: 'MedTrack' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Lisinopril' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Metformin' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Atorvastatin' })).toBeVisible();
  });

  test('risk flag: overdue prescription triggers alert banner', async ({ page }) => {
    await page.goto('http://localhost:4200');

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('Lisinopril — overdue')).toBeVisible();
  });
});
