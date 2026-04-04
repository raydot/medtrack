import { Injectable, InjectionToken, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export const DATE_NOW = new InjectionToken<() => Date>('DATE_NOW', {
  providedIn: 'root',
  factory: () => () => new Date(),
});

export interface Prescriptions {
  id: string;
  memberId: string;
  drugName: string;
  daysSupply: number;
  lastFillDate: string; // ISO date string
  refillStatus: 'ok' | 'due' | 'overdue';
}

@Injectable({
  providedIn: 'root',
})
export class PrescriptionService {
  private dateNow = inject(DATE_NOW);
  private apiUrl = 'http://localhost:4566/restapis/xehaz6534e/prod/_user_request_/prescriptions';
  private http = inject(HttpClient);
  // private mockPrescriptions: Prescriptions[] = [
  //   {
  //     id: 'rx-001',
  //     memberId: 'member-123',
  //     drugName: 'Lisinopril',
  //     daysSupply: 30,
  //     lastFillDate: '2026-02-01',
  //     refillStatus: 'overdue',
  //   },
  //   {
  //     id: 'rx-002',
  //     memberId: 'member-123',
  //     drugName: 'Metformin',
  //     daysSupply: 90,
  //     lastFillDate: '2026-02-15',
  //     refillStatus: 'ok',
  //   },
  //   {
  //     id: 'rx-003',
  //     memberId: 'member-123',
  //     drugName: 'Atorvastatin',
  //     daysSupply: 30,
  //     lastFillDate: '2026-03-05',
  //     refillStatus: 'due',
  //   },
  // ];

  // getPrescriptions(memberId: string): Prescriptions[] {
  //   return this.mockPrescriptions.filter((rx) => rx.memberId === memberId);
  // }

  getPrescriptions(memberId: string): Observable<Prescriptions[]> {
    return this.http.get<Prescriptions[]>(`${this.apiUrl}/${memberId}`);
  }

  calculateAdherence(rx: Prescriptions): number {
    const fillDate = new Date(rx.lastFillDate);
    const today = this.dateNow();
    // const today = new Date();
    const daysSinceFill = Math.floor(
      (today.getTime() - fillDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    return Math.min(100, Math.round((daysSinceFill / rx.daysSupply) * 100));
  }
}
