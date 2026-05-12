import { Component, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { SwPush } from "@angular/service-worker";
import { ApiService, UserRecord } from "../api/api.service";
import { PushService, PushStatus } from "../push/push.service";
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
        <p class="status">Linked. Push notifications: {{ pushReady() ? 'on' : 'off' }}</p>
        <button class="enable" (click)="enablePush()" [disabled]="pushReady() || pushBusy()">
          {{ pushBusy() ? 'Enabling…' : 'Enable notifications on this device' }}
        </button>

        @switch (pushStatus()) {
          @case ('needs-install') {
            <p class="hint">
              On iPhone, notifications only work when the app is added to your home screen.
              In Safari, tap <strong>Share → Add to Home Screen</strong>, then open AlwaysNear from the home screen and tap Enable again.
            </p>
          }
          @case ('denied') {
            <p class="hint">Notifications were blocked. Open iPhone <strong>Settings → Notifications → AlwaysNear</strong> and allow notifications, then tap Enable again.</p>
          }
          @case ('unsupported') {
            <p class="hint">This browser doesn't support push notifications.</p>
          }
          @case ('not-configured') {
            <p class="hint">Push isn't configured on the server yet. Check VAPID keys.</p>
          }
          @case ('error') {
            <p class="hint">Couldn't enable notifications. Check the browser console.</p>
          }
        }

        <details class="diagnostics">
          <summary>Diagnostics</summary>
          <dl>
            <dt>Click count</dt><dd>{{ clickCount() }}</dd>
            <dt>Last status</dt><dd>{{ pushStatus() ?? '(not run yet)' }}</dd>
            <dt>Last error</dt><dd>{{ lastError() ?? '(none)' }}</dd>
            <dt>Standalone (PWA)</dt><dd>{{ diag.standalone }}</dd>
            <dt>iOS-like</dt><dd>{{ diag.iosLike }}</dd>
            <dt>Service worker API</dt><dd>{{ diag.hasSwApi }}</dd>
            <dt>PushManager API</dt><dd>{{ diag.hasPushApi }}</dd>
            <dt>SwPush enabled</dt><dd>{{ diag.swPushEnabled }}</dd>
            <dt>Notification perm</dt><dd>{{ diag.notifPermission }}</dd>
            <dt>UA</dt><dd class="ua">{{ diag.userAgent }}</dd>
          </dl>
        </details>

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
        margin-bottom: 1rem;
      }
      .enable:disabled {
        opacity: 0.6;
      }
      .hint {
        background: rgba(255, 255, 255, 0.08);
        border-left: 3px solid #9cc1ff;
        padding: 0.75rem 1rem;
        border-radius: 6px;
        margin-bottom: 1.5rem;
        font-size: 0.95rem;
        line-height: 1.4;
      }
      .diagnostics {
        background: rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        padding: 0.6rem 0.9rem;
        margin-bottom: 1.5rem;
        font-size: 0.85rem;
      }
      .diagnostics summary {
        cursor: pointer;
        font-weight: 600;
        opacity: 0.9;
      }
      .diagnostics dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.2rem 0.8rem;
        margin: 0.6rem 0 0;
        font-family: ui-monospace, SFMono-Regular, monospace;
        font-size: 0.78rem;
      }
      .diagnostics dt {
        opacity: 0.7;
      }
      .diagnostics dd {
        margin: 0;
        overflow-wrap: anywhere;
      }
      .diagnostics .ua {
        font-size: 0.7rem;
        opacity: 0.8;
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
  pushStatus = signal<PushStatus | null>(null);
  pushBusy = signal(false);
  clickCount = signal(0);
  lastError = signal<string | null>(null);
  recent = signal<RecentCall[]>([]);

  diag = {
    standalone:
      (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches) ||
      (typeof navigator !== "undefined" && (navigator as Navigator & { standalone?: boolean }).standalone === true)
        ? "yes"
        : "no",
    iosLike:
      typeof navigator !== "undefined" &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.userAgent.includes("Mac") && "ontouchend" in document))
        ? "yes"
        : "no",
    hasSwApi: typeof navigator !== "undefined" && "serviceWorker" in navigator ? "yes" : "no",
    hasPushApi: typeof window !== "undefined" && "PushManager" in window ? "yes" : "no",
    swPushEnabled: "checking…",
    notifPermission:
      typeof Notification !== "undefined" ? Notification.permission : "unsupported",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  };

  constructor() {
    this.diag.swPushEnabled = this.swPush.isEnabled ? "yes" : "no";
    this.refreshMe();
    this.swPush.messages.subscribe((msg) => {
      const m = msg as { data?: RecentCall } & RecentCall;
      const payload = m.data ?? m;
      this.recent.update((r) => [payload, ...r].slice(0, 25));
    });
    this.swPush.notificationClicks.subscribe(({ notification }) => {
      const data = (notification as { data?: RecentCall }).data;
      if (data) this.recent.update((r) => [data, ...r].slice(0, 25));
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
    this.clickCount.update((n) => n + 1);
    this.lastError.set(null);
    this.pushBusy.set(true);
    try {
      const status = await this.push.ensureSubscribed();
      this.pushStatus.set(status);
      this.pushReady.set(status === "ok");
    } catch (err) {
      this.lastError.set((err as Error)?.message ?? String(err));
    } finally {
      this.pushBusy.set(false);
    }
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
