import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RiskFlag } from './risk-flag';

describe('RiskFlag', () => {
  let component: RiskFlag;
  let fixture: ComponentFixture<RiskFlag>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RiskFlag],
    }).compileComponents();

    fixture = TestBed.createComponent(RiskFlag);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
