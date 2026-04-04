import { TestBed } from '@angular/core/testing';

import { Prescriptions } from './prescriptions';

describe('Prescriptions', () => {
  let service: Prescriptions;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Prescriptions);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
