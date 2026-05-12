import { Component, OnDestroy, computed, inject, signal } from "@angular/core";
import { ApiService, CallRequest, CarerSummary } from "../api/api.service";
import { AuthService } from "../auth/auth.service";

interface ButtonDef {
  kind: string;
  label: string;
  emoji: string;
}

type Severity = NonNullable<CallRequest["severity"]>;

const BUTTONS: ButtonDef[] = [
  { kind: "water", label: "Water", emoji: "💧" },
  { kind: "tea-coffee", label: "Tea / Coffee", emoji: "☕" },
  { kind: "snack", label: "Snack", emoji: "🍪" },
  { kind: "medication", label: "Medication", emoji: "💊" },
  { kind: "just-need-you", label: "Just need you here", emoji: "💛" },
];

const SEVERITY_RANK: Record<Severity, number> = { mild: 1, moderate: 2, urgent: 3 };
const NEEDLE_DEG: Record<Severity, number> = { mild: -60, moderate: 0, urgent: 60 };
const HOLD_MODERATE_MS = 700;
const HOLD_URGENT_MS = 1500;

@Component({
  selector: "app-patient",
  standalone: true,
  template: `
    <div class="wrap">
      <header>
        <h1>AlwaysNear</h1>
        <button class="link" (click)="logout()">Sign out</button>
      </header>

      <section class="dial" aria-label="Urgency dial">
        <svg viewBox="0 0 240 140" class="dial-svg">
          <path
            d="M 30 120 A 90 90 0 0 1 75 42 L 90 68 A 60 60 0 0 0 60 120 Z"
            class="seg seg-mild"
            [class.active]="displayedSeverity() === 'mild'"
            (click)="setSeverity('mild')"
          />
          <path
            d="M 75 42 A 90 90 0 0 1 165 42 L 150 68 A 60 60 0 0 0 90 68 Z"
            class="seg seg-moderate"
            [class.active]="displayedSeverity() === 'moderate'"
            (click)="setSeverity('moderate')"
          />
          <path
            d="M 165 42 A 90 90 0 0 1 210 120 L 180 120 A 60 60 0 0 0 150 68 Z"
            class="seg seg-urgent"
            [class.active]="displayedSeverity() === 'urgent'"
            (click)="setSeverity('urgent')"
          />
          <g class="needle" [style.transform]="'rotate(' + needleDeg() + 'deg)'">
            <line x1="120" y1="120" x2="120" y2="40" class="needle-line" />
          </g>
          <circle cx="120" cy="120" r="8" class="pivot" />
        </svg>
        <p class="dial-label">{{ displayedSeverity() }}</p>
      </section>

      <section class="buttons">
        @for (b of buttons; track b.kind) {
          <button
            class="call"
            (pointerdown)="onDown(b, $event)"
            (pointerup)="onUp(b)"
            (pointercancel)="onCancel(b)"
            (pointerleave)="onCancel(b)"
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
        margin-bottom: 1rem;
      }
      h1 {
        margin: 0;
      }
      .dial {
        margin: 0.5rem 0 1.25rem;
        text-align: center;
      }
      .dial-svg {
        width: 100%;
        max-width: 260px;
        height: auto;
        display: block;
        margin: 0 auto;
        touch-action: manipulation;
      }
      .seg {
        cursor: pointer;
        stroke: rgba(0, 0, 0, 0.25);
        stroke-width: 1;
        opacity: 0.55;
        transition: opacity 120ms ease;
      }
      .seg.active {
        opacity: 1;
      }
      .seg-mild {
        fill: #2a6;
      }
      .seg-moderate {
        fill: #c84;
      }
      .seg-urgent {
        fill: #c33;
      }
      .pivot {
        fill: #fff;
      }
      .needle {
        transform-box: view-box;
        transform-origin: 120px 120px;
        transition: transform 180ms ease;
      }
      .needle-line {
        stroke: #fff;
        stroke-width: 4;
        stroke-linecap: round;
      }
      .dial-label {
        margin: 0.25rem 0 0;
        font-size: 1.1rem;
        text-transform: uppercase;
        letter-spacing: 0.15rem;
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
        touch-action: manipulation;
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
export class PatientComponent implements OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  buttons = BUTTONS;

  carers = signal<CarerSummary[]>([]);
  invite = signal<{ code: string; expiresAt: number } | null>(null);
  inviteBusy = signal(false);
  lastResult = signal<{ delivered: number; attempted: number } | null>(null);

  severity = signal<Severity>("mild");
  holdOverride = signal<Severity | null>(null);
  displayedSeverity = computed<Severity>(() => this.holdOverride() ?? this.severity());
  needleDeg = computed<number>(() => NEEDLE_DEG[this.displayedSeverity()]);

  private downAt = new Map<string, number>();
  private activeButton: string | null = null;
  private pollHandle: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.refreshCarers();
  }

  ngOnDestroy(): void {
    this.clearPoll();
  }

  setSeverity(s: Severity): void {
    this.severity.set(s);
  }

  onDown(b: ButtonDef, ev: PointerEvent): void {
    (ev.currentTarget as Element | null)?.setPointerCapture?.(ev.pointerId);
    this.downAt.set(b.kind, performance.now());
    this.activeButton = b.kind;
    if (this.pollHandle === null) {
      this.pollHandle = setInterval(() => this.updateHold(), 80);
    }
    this.updateHold();
  }

  onUp(b: ButtonDef): void {
    const started = this.downAt.get(b.kind);
    if (started === undefined) return;
    this.downAt.delete(b.kind);
    this.clearPoll();

    const sev = this.displayedSeverity();
    this.holdOverride.set(null);
    this.activeButton = null;

    this.api.call({ kind: b.kind, severity: sev }).subscribe({
      next: (r) => this.lastResult.set(r),
      error: (err) => console.error("call failed", err),
    });
  }

  onCancel(b: ButtonDef): void {
    if (!this.downAt.has(b.kind)) return;
    this.downAt.delete(b.kind);
    this.clearPoll();
    this.holdOverride.set(null);
    this.activeButton = null;
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

  private updateHold(): void {
    if (this.activeButton === null) return;
    const started = this.downAt.get(this.activeButton);
    if (started === undefined) return;
    const heldMs = performance.now() - started;
    let implied: Severity = "mild";
    if (heldMs >= HOLD_URGENT_MS) implied = "urgent";
    else if (heldMs >= HOLD_MODERATE_MS) implied = "moderate";

    const base = this.severity();
    const chosen = SEVERITY_RANK[implied] > SEVERITY_RANK[base] ? implied : base;
    this.holdOverride.set(chosen === base ? null : chosen);
  }

  private clearPoll(): void {
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  private refreshCarers(): void {
    this.api.listCarers().subscribe({
      next: (cs) => this.carers.set(cs),
      error: (err) => console.error("listCarers failed", err),
    });
  }
}
