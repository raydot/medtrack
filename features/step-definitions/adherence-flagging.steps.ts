import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'assert';
// import { PrescriptionService } from '../../src/app/services/prescriptions';
import { calculateAdherence } from '../../src/app/utilities/adherence';

let daysSupply: number;
let daysSinceFill: number;
let adherence: number;

Given('a member has a prescription with a days supply of {int}', (days: number) => {
  daysSupply = days;
});

Given('the prescription was last filled {int} days ago', (days: number) => {
  daysSinceFill = days;
});

When('the member views their dashboard', () => {
  const today = new Date();
  const lastFillDate = new Date();
  // lastFillDate.setDate(lastFillDate.getDate() - daysSinceFill);
  lastFillDate.setDate(today.getDate() - daysSinceFill);

  const rx = {
    id: 'test-rx',
    memberId: 'test-member',
    drugName: 'TestDrug',
    daysSupply,
    lastFillDate: lastFillDate.toISOString().split('T')[0],
    refillStatus: 'ok' as const,
  };

  // const service = new PrescriptionService();
  // adherence = service.calculateAdherence(rx);
  adherence = calculateAdherence(rx, today);
});

Then('the risk flag banner should be visible', () => {
  assert.ok(adherence >= 100, `Expected adherence >= 100 but got ${adherence}`);
});

Then('the risk flag banner should not be visible', () => {
  assert.ok(adherence < 100, `Expected adherence < 100 but got ${adherence}`);
});
