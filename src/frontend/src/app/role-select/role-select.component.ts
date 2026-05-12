import { Component, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { ApiService, Role } from "../api/api.service";

@Component({
  selector: "app-role-select",
  standalone: true,
  template: `
    <div class="wrap">
      <h1>Welcome to AlwaysNear</h1>
      <p>Choose your role. You can change this until you link with someone.</p>
      <div class="row">
        <button (click)="choose('patient')" [disabled]="busy()">I'm the patient</button>
        <button (click)="choose('carer')" [disabled]="busy()">I'm a carer</button>
      </div>
    </div>
  `,
  styles: [
    `
      .wrap {
        padding: 2rem;
        max-width: 480px;
        margin: 0 auto;
        text-align: center;
      }
      h1 {
        margin-top: 0;
      }
      .row {
        display: grid;
        gap: 1rem;
        margin-top: 2rem;
      }
      button {
        padding: 1.2rem 1.6rem;
        font-size: 1.1rem;
        border: 2px solid #fff;
        background: transparent;
        color: #fff;
        border-radius: 12px;
      }
      button:hover {
        background: rgba(255, 255, 255, 0.1);
      }
    `,
  ],
})
export class RoleSelectComponent {
  private api = inject(ApiService);
  private router = inject(Router);

  busy = signal(false);

  choose(role: Role): void {
    this.busy.set(true);
    this.api.setRole(role).subscribe({
      next: () => {
        this.router.navigate([role === "patient" ? "/patient" : "/carer"]);
      },
      error: (err) => {
        console.error("Set role failed", err);
        this.busy.set(false);
      },
    });
  }
}
