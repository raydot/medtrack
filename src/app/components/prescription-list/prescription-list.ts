import { Component, input, inject, ChangeDetectionStrategy } from '@angular/core';
import { Prescriptions, PrescriptionService } from '../../services/prescriptions';

@Component({
  selector: 'app-prescription-list',
  imports: [],
  templateUrl: './prescription-list.html',
  styleUrl: './prescription-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrescriptionList {
  private prescriptionService = inject(PrescriptionService);
  prescriptions = input<Prescriptions[]>([]);
  getAdherence(rx: Prescriptions): number {
    return this.prescriptionService.calculateAdherence(rx);
  }
}
