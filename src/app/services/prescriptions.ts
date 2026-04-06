import { Injectable, InjectionToken, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export const DATE_NOW = new InjectionToken<() => Date>('DATE_NOW', {
  providedIn: 'root',
  factory: () => () => new Date(),
});

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => 'https://bi9pbmv63c.execute-api.us-west-2.amazonaws.com/prod',
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
  // private apiUrl = 'http://localhost:4566/restapis/xehaz6534e/prod/_user_request_/prescriptions';
  // private apiUrl = 'https://bi9pbmv63c.execute-api.us-west-2.amazonaws.com/prod/prescriptions';
  private apiUrl = inject(API_BASE_URL);
  private http = inject(HttpClient);

  getPrescriptions(memberId: string): Observable<Prescriptions[]> {
    // return this.http.get<Prescriptions[]>(`${this.apiUrl}/${memberId}`);
    return this.http.get<Prescriptions[]>(`${this.apiUrl}/prescriptions/${memberId}`);
  }

  calculateAdherence(rx: Prescriptions): number {
    const fillDate = new Date(rx.lastFillDate);
    const today = this.dateNow();
    const daysSinceFill = Math.floor(
      (today.getTime() - fillDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    return Math.min(100, Math.round((daysSinceFill / rx.daysSupply) * 100));
  }
}
