import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { Prescriptions } from '../../services/prescriptions';

@Component({
  selector: 'app-risk-flag',
  imports: [],
  templateUrl: './risk-flag.html',
  styleUrl: './risk-flag.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RiskFlag {
  atRisk = input<Prescriptions[]>([]);
}
