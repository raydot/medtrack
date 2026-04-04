import { Component, OnInit, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { PrescriptionService, Prescriptions } from '../../services/prescriptions';
import { PrescriptionList } from '../prescription-list/prescription-list';
import { RiskFlag } from '../risk-flag/risk-flag';

@Component({
  selector: 'app-member-dashboard',
  imports: [PrescriptionList, RiskFlag],
  templateUrl: './member-dashboard.html',
  styleUrl: './member-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemberDashboard implements OnInit {
  private prescriptionService = inject(PrescriptionService);
  prescriptions = signal<Prescriptions[]>([]);
  atRisk = signal<Prescriptions[]>([]);
  ngOnInit(): void {
    this.loadMember('member-123');
  }
  private loadMember(memberId: string): void {
    this.prescriptionService.getPrescriptions(memberId).subscribe((all) => {
      this.prescriptions.set(all);
      this.atRisk.set(
        all.filter((rx) => rx.refillStatus === 'due' || rx.refillStatus === 'overdue'),
      );
    });
  }
  onMemberChange(event: Event): void {
    this.loadMember((event.target as HTMLSelectElement).value);
  }
}
