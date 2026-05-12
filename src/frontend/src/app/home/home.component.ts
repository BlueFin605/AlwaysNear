import { Component, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { ApiService } from "../api/api.service";

@Component({
  selector: "app-home",
  standalone: true,
  template: `<p style="padding: 2rem">Loading&hellip;</p>`,
})
export class HomeComponent {
  private api = inject(ApiService);
  private router = inject(Router);

  loading = signal(true);

  constructor() {
    this.api.getMe().subscribe({
      next: (me) => {
        if (!me.role) {
          this.router.navigate(["/role"]);
        } else if (me.role === "patient") {
          this.router.navigate(["/patient"]);
        } else {
          this.router.navigate(["/carer"]);
        }
      },
      error: (err) => {
        console.error("Failed to load profile", err);
      },
    });
  }
}
