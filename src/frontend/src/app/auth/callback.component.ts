import { Component, inject } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { AuthService } from "./auth.service";

@Component({
  selector: "app-callback",
  standalone: true,
  template: `<p style="padding: 2rem">Signing you in&hellip;</p>`,
})
export class CallbackComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);

  constructor() {
    const code = this.route.snapshot.queryParamMap.get("code");
    const state = this.route.snapshot.queryParamMap.get("state");
    if (!code || !state) {
      this.router.navigate(["/"]);
      return;
    }
    this.auth.completeLogin(code, state).then(
      () => this.router.navigate(["/"]),
      (err) => {
        console.error("Login failed", err);
        this.router.navigate(["/"]);
      }
    );
  }
}
