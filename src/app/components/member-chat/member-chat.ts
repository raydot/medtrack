import { Component, ChangeDetectionStrategy, signal, input } from '@angular/core';

@Component({
  selector: 'app-member-chat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat-container">
      <h2>Member Chat</h2>
      <div class="messages">
        @for (msg of messages(); track $index) {
          <p [class]="msg.role">{{ msg.content }}</p>
        }
      </div>
      <input
        type="text"
        placeholder="Ask about your medications..."
        (keyup.enter)="sendMessage($event)"
        aria-label="Message input"
      />
    </div>
  `,
})
export class MemberChat {
  memberId = input.required<string>();
  messages = signal<{ role: string; content: string }[]>([]);

  sendMessage(event: Event): void {
    // TODO: call member-chat Lambda via API Gateway
  }
}
