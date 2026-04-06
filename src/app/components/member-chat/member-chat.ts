import { Component, ChangeDetectionStrategy, signal, input, inject } from '@angular/core';
import { AgentService } from '../../services/agent';

@Component({
  selector: 'app-member-chat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .chat-wrapper {
        display: flex;
        flex-direction: column;
        height: calc(100vh - 120px);
        max-width: 800px;
        margin: 24px auto;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
        overflow: hidden;
      }

      .chat-header {
        padding: 16px 24px;
        background: #0d6e6e;
        color: #fff;
        font-size: 1rem;
        font-weight: 600;
        letter-spacing: 0.02em;
      }

      .messages {
        flex: 1;
        overflow-y: auto;
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .empty-state {
        margin: auto;
        color: #999;
        font-size: 0.9rem;
        text-align: center;
      }

      .bubble {
        max-width: 75%;
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 0.9rem;
        line-height: 1.5;
        white-space: pre-wrap;
      }

      .bubble.user {
        align-self: flex-end;
        background: #0d6e6e;
        color: #fff;
        border-bottom-right-radius: 4px;
      }

      .bubble.assistant {
        align-self: flex-start;
        background: #f0f2f5;
        color: #1a1a2e;
        border-bottom-left-radius: 4px;
      }

      .bubble.loading {
        align-self: flex-start;
        background: #f0f2f5;
        color: #999;
        font-style: italic;
      }

      .input-bar {
        display: flex;
        gap: 8px;
        padding: 16px 24px;
        border-top: 1px solid #eee;
        background: #fff;
      }

      .input-bar input {
        flex: 1;
        padding: 10px 14px;
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 0.9rem;
        outline: none;
        transition: border-color 0.2s;
      }

      .input-bar input:focus {
        border-color: #0d6e6e;
      }

      .input-bar button {
        padding: 10px 20px;
        background: #0d6e6e;
        color: #fff;
        border: none;
        border-radius: 8px;
        font-size: 0.9rem;
        cursor: pointer;
        transition: opacity 0.2s;
      }

      .input-bar button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
    `,
  ],
  template: `
    <div class="chat-wrapper">
      <div class="chat-header">Member Chat</div>

      <div class="messages" role="log" aria-label="Conversation">
        @if (messages().length === 0) {
          <p class="empty-state">Ask about your medications — e.g. "When is my Metformin due?"</p>
        }
        @for (msg of messages(); track $index) {
          <div
            class="bubble"
            [class]="msg.role"
            [attr.aria-label]="msg.role === 'user' ? 'You' : 'Assistant'"
            [innerHTML]="formatMessage(msg.content)"
          ></div>
        }
        @if (loading()) {
          <div class="bubble loading" aria-live="polite">Thinking...</div>
        }
      </div>

      <div class="input-bar">
        <input
          #inputEl
          type="text"
          placeholder="Ask about your medications..."
          [disabled]="loading()"
          (keyup.enter)="sendMessage(inputEl)"
          aria-label="Message input"
        />
        <button [disabled]="loading()" (click)="sendMessage(inputEl)" aria-label="Send message">
          Send
        </button>
      </div>
    </div>
  `,
})
export class MemberChat {
  private agentService = inject(AgentService);
  memberId = input.required<string>();
  messages = signal<{ role: string; content: string }[]>([]);
  loading = signal(false);

  formatMessage(content: string): string {
    return content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  }

  sendMessage(input: HTMLInputElement): void {
    const message = input.value.trim();
    if (!message || this.loading()) return;

    this.messages.update((msgs) => [...msgs, { role: 'user', content: message }]);
    input.value = '';
    this.loading.set(true);

    this.agentService.chatMember(this.memberId(), message).subscribe({
      next: (response) => {
        this.messages.update((msgs) => [...msgs, { role: 'assistant', content: response.message }]);
        this.loading.set(false);
      },
      error: () => {
        this.messages.update((msgs) => [
          ...msgs,
          { role: 'assistant', content: 'Something went wrong. Please try again.' },
        ]);
        this.loading.set(false);
      },
    });
  }
}
