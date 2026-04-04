import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'assert';

let refillStatus: string;
let updatedStatus: string;

Given('a member has a prescription with a refill status of {string}', (status: string) => {
  refillStatus = status;
});

When('a refill is requested for that prescription', () => {
  // Simulate a refill request updating the status
  if (refillStatus === 'overdue') {
    updatedStatus = 'ok';
  }
});

Then('the prescription status should update to {string}', (expectedStatus: string) => {
  assert.strictEqual(updatedStatus, expectedStatus);
});
