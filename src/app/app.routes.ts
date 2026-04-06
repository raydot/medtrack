import { Routes } from '@angular/router';
import { CoordinatorCopilot } from './components/coordinator-copilot/coordinator-copilot';
import { MemberChat } from './components/member-chat/member-chat';

import { MemberDashboard } from './components/member-dashboard/member-dashboard';

export const routes: Routes = [
  { path: 'coordinator', component: CoordinatorCopilot },
  { path: 'member/:memberId/chat', component: MemberChat },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: MemberDashboard },
];
