import { Component, inject, signal } from "@angular/core";
import { ApiService, CallRequest, CarerSummary } from "../api/api.service";
import { AuthService } from "../auth/auth.service";

interface ButtonDef {
  kind: string;
  label: string;
  emoji: string;
}

const BUTTONS: ButtonDef[] = [
  { kind: "water", label: "Water", emoji: "💧" },
  { kind: "tea-coffee", label: "Tea / Coffee", emoji: "☕" },
  { kind: "snack", label: "Snack", emoji: "🍪" },
  { kind: "medication", label: "Medication", emoji: "💊" },
  { kind: "just-need-you", label: "Just need you here", emoji: "💛" },
];

@Component({
  selector: "app-patient",
  standalone: true,
  template: `
    <div class="wrap">
      <header>
        <h1>AlwaysNear</h1>
        <button class="link" (click)="logout()">Sign out</button>
      </header>

      <section class="buttons">
        @for (b of buttons; track b.kind) {
          <button
            class="call"
            (pointerdown)="onDown(b)"
            (pointerup)="onUp(b)"
            (pointerleave)="onUp(b)"
            (click)="onTap(b)"
          >
            <span class="emoji">{{ b.emoji }}</span>
            <span class="label">{{ b.label }}</span>
          </button>
        }
      </section>

      @if (lastResult()) {
        <p class="status">Sent to {{ lastResult()!.delivered }} / {{ lastResult()!.attempted }} device(s)</p>
      }

      <section class="carers">
        <h2>Carers</h2>
        @if (carers().length === 0) {
          <p>
            No carers linked yet.
            <button class="link" (click)="newInvite()" [disabled]="inviteBusy()">Generate invite</button>
          </p>
        } @else {
          <ul>
            @for (c of carers(); track c.userId) {
              <li>{{ c.displayName ?? c.userId }}</li>
            }
          </ul>
          <button class="link" (click)="newInvite()" [disabled]="inviteBusy()">Invite another</button>
        }

        @if (invite(); as inv) {
          <div class="invite">
            <p>Share this code (valid 24h):</p>
            <code>{{ inv.code }}</code>
          </div>
        }
      </section>
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
      .buttons {
        display: grid;
        gap: 1rem;
      }
      .call {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1.5rem;
        font-size: 1.4rem;
        border: 2px solid #fff;
        background: rgba(255, 255, 255, 0.06);
        color: #fff;
        border-radius: 14px;
        text-align: left;
      }
      .call:active {
        background: rgba(255, 255, 255, 0.2);
      }
      .emoji {
        font-size: 2rem;
      }
      .status {
        margin-top: 1rem;
        text-align: center;
        font-size: 0.95rem;
        opacity: 0.85;
      }
      .carers {
        margin-top: 2rem;
        padding-top: 1.5rem;
        border-top: 1px solid rgba(255, 255, 255, 0.2);
      }
      .carers h2 {
        margin-top: 0;
      }
      .link {
        background: none;
        border: none;
        color: #9cc1ff;
        text-decoration: underline;
        padding: 0;
        font-size: inherit;
      }
      .invite code {
        display: block;
        margin-top: 0.5rem;
        font-size: 2rem;
        letter-spacing: 0.3rem;
        font-family: ui-monospace, SFMono-Regular, monospace;
        text-align: center;
      }
    `,
  ],
})
export class PatientComponent {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  buttons = BUTTONS;

  carers = signal<CarerSummary[]>([]);
  invite = signal<{ code: string; expiresAt: number } | null>(null);
  inviteBusy = signal(false);
  lastResult = signal<{ delivered: number; attempted: number } | null>(null);

  private downAt = new Map<string, number>();

  constructor() {
    this.refreshCarers();
  }

  onDown(b: ButtonDef): void {
    this.downAt.set(b.kind, performance.now());
  }

  onUp(b: ButtonDef): void {
    this.downAt.delete(b.kind);
  }

  onTap(b: ButtonDef): void {
    const started = this.downAt.get(b.kind);
    const heldMs = started ? performance.now() - started : 0;
    let severity: CallRequest["severity"];
    if (heldMs > 1500) severity = "urgent";
    else if (heldMs > 700) severity = "moderate";
    else severity = undefined; // tap = no explicit severity

    this.api.call({ kind: b.kind, severity }).subscribe({
      next: (r) => this.lastResult.set(r),
      error: (err) => console.error("call failed", err),
    });
  }

  newInvite(): void {
    this.inviteBusy.set(true);
    this.api.createInvite().subscribe({
      next: (r) => {
        this.invite.set(r);
        this.inviteBusy.set(false);
      },
      error: (err) => {
        console.error("invite failed", err);
        this.inviteBusy.set(false);
      },
    });
  }

  logout(): void {
    this.auth.logout();
  }

  private refreshCarers(): void {
    this.api.listCarers().subscribe({
      next: (cs) => this.carers.set(cs),
      error: (err) => console.error("listCarers failed", err),
    });
  }
}
