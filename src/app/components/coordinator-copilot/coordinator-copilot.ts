import { Component, ChangeDetectionStrategy, signal } from '@angular/core';

@Component({
  selector: 'app-coordinator-copilot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat-container">
      <h2>Coordinator Copilot</h2>
      <div class="messages">
        @for (msg of messages(); track $index) {
          <p [class]="msg.role">{{ msg.content }}</p>
        }
      </div>
      <input
        type="text"
        placeholder="Ask about your panel..."
        (keyup.enter)="sendMessage($event)"
        aria-label="Message input"
      />
    </div>
  `,
})
export class CoordinatorCopilot {
  messages = signal<{ role: string; content: string }[]>([]);

  sendMessage(event: Event): void {
    // TODO: call coordinator-copilot Lambda via API Gateway
  }
}
