import { Component } from '@angular/core';
import { MemberDashboard } from './components/member-dashboard/member-dashboard';

@Component({
  selector: 'app-root',
  imports: [MemberDashboard],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
