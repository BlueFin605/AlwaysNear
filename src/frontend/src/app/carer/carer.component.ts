import { Component, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { SwPush } from "@angular/service-worker";
import { ApiService, UserRecord } from "../api/api.service";
import { PushService } from "../push/push.service";
import { AuthService } from "../auth/auth.service";

interface RecentCall {
  kind: string;
  severity?: "mild" | "moderate" | "urgent";
  patientName?: string;
  at: number;
}

@Component({
  selector: "app-carer",
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="wrap">
      <header>
        <h1>AlwaysNear</h1>
        <button class="link" (click)="logout()">Sign out</button>
      </header>

      @if (me()?.linkedPatientId) {
        <p class="status">Linked. Push notifications: {{ pushReady() ? 'on' : 'enabling…' }}</p>
        <button class="enable" (click)="enablePush()" [disabled]="pushReady()">Enable notifications on this device</button>

        <section>
          <h2>Recent</h2>
          @if (recent().length === 0) {
            <p class="muted">No calls yet.</p>
          } @else {
            <ul class="recent">
              @for (c of recent(); track c.at) {
                <li>
                  <span class="emoji">{{ emojiFor(c.kind) }}</span>
                  <span class="kind">{{ c.kind }}</span>
                  @if (c.severity) {
                    <span class="severity sev-{{ c.severity }}">{{ c.severity }}</span>
                  }
                  <span class="time">{{ timeAgo(c.at) }}</span>
                </li>
              }
            </ul>
          }
        </section>
      } @else {
        <p>Enter the invite code your patient gave you:</p>
        <div class="invite-row">
          <input [(ngModel)]="code" placeholder="ABC234" maxlength="6" />
          <button (click)="accept()" [disabled]="busy() || code().length !== 6">Link</button>
        </div>
        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      }
    </div>
  `,
  styles: [
    `
      .wrap {
        max-width: 480px;
        margin: 0 auto;
        padding: 1.5rem;
      }
      header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
      }
      h1 {
        margin: 0;
      }
      .status {
        opacity: 0.85;
      }
      .enable {
        padding: 0.8rem 1.2rem;
        border: 2px solid #fff;
        background: transparent;
        color: #fff;
        border-radius: 10px;
        margin-bottom: 1.5rem;
      }
      .invite-row {
        display: flex;
        gap: 0.5rem;
      }
      input {
        flex: 1;
        padding: 0.8rem;
        font-size: 1.4rem;
        text-align: center;
        letter-spacing: 0.3rem;
        text-transform: uppercase;
        border: 2px solid #fff;
        background: transparent;
        color: #fff;
        border-radius: 10px;
      }
      .invite-row button {
        padding: 0 1.2rem;
        border: 2px solid #fff;
        background: transparent;
        color: #fff;
        border-radius: 10px;
      }
      .error {
        color: #ffb3b3;
      }
      .recent {
        list-style: none;
        padding: 0;
      }
      .recent li {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.6rem 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      .emoji {
        font-size: 1.4rem;
      }
      .kind {
        flex: 1;
      }
      .severity {
        font-size: 0.8rem;
        padding: 0.1rem 0.4rem;
        border-radius: 6px;
      }
      .sev-mild {
        background: #2a6;
      }
      .sev-moderate {
        background: #c84;
      }
      .sev-urgent {
        background: #c33;
      }
      .time {
        opacity: 0.7;
        font-size: 0.85rem;
      }
      .muted {
        opacity: 0.7;
      }
      .link {
        background: none;
        border: none;
        color: #9cc1ff;
        text-decoration: underline;
        padding: 0;
        font-size: inherit;
      }
    `,
  ],
})
export class CarerComponent {
  private api = inject(ApiService);
  private push = inject(PushService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private swPush = inject(SwPush);

  me = signal<UserRecord | null>(null);
  code = signal("");
  busy = signal(false);
  error = signal<string | null>(null);
  pushReady = signal(false);
  recent = signal<RecentCall[]>([]);

  constructor() {
    this.refreshMe();
    this.swPush.messages.subscribe((msg) => {
      const payload = msg as RecentCall;
      this.recent.update((r) => [payload, ...r].slice(0, 25));
    });
  }

  accept(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.acceptInvite(this.code().toUpperCase()).subscribe({
      next: () => {
        this.busy.set(false);
        this.refreshMe();
        this.enablePush();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.error?.error ?? "Failed to accept invite");
      },
    });
  }

  async enablePush(): Promise<void> {
    await this.push.ensureSubscribed();
    this.pushReady.set(this.push.enabled);
  }

  logout(): void {
    this.auth.logout();
  }

  emojiFor(kind: string): string {
    return (
      { water: "💧", "tea-coffee": "☕", snack: "🍪", medication: "💊", "just-need-you": "💛" }[kind] ?? "🔔"
    );
  }

  timeAgo(at: number): string {
    const diff = Date.now() - at;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    return new Date(at).toLocaleTimeString();
  }

  private refreshMe(): void {
    this.api.getMe().subscribe({
      next: (me) => {
        this.me.set(me);
        if (me.linkedPatientId) this.enablePush();
      },
    });
  }
}
