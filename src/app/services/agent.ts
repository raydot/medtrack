import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './prescriptions';

@Injectable({ providedIn: 'root' })
export class AgentService {
  private apiUrl = inject(API_BASE_URL);
  private http = inject(HttpClient);

  chatCoordinator(message: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/agent/coordinator`, { message });
  }

  chatMember(memberId: string, message: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/agent/member-chat/${memberId}`, {
      message,
    });
  }
}
