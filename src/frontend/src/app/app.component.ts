import { Component, OnDestroy, inject } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { SwUpdate, VersionReadyEvent } from "@angular/service-worker";
import { Subscription, filter, interval } from "rxjs";
import { environment } from "../environments/environment";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <router-outlet />
    <footer class="version">v{{ version }}</footer>
  `,
  styles: [
    `
      .version {
        position: fixed;
        bottom: max(0.4rem, env(safe-area-inset-bottom));
        right: 0.6rem;
        font-size: 0.7rem;
        opacity: 0.45;
        font-family: ui-monospace, SFMono-Regular, monospace;
        pointer-events: none;
        z-index: 10;
      }
    `,
  ],
})
export class AppComponent implements OnDestroy {
  private swUpdate = inject(SwUpdate);
  private subs: Subscription[] = [];
  private visibilityHandler = (): void => {
    if (document.visibilityState === "visible") this.checkForUpdate();
  };

  version = environment.version;

  constructor() {
    if (!this.swUpdate.isEnabled) return;

    this.subs.push(
      this.swUpdate.versionUpdates
        .pipe(filter((e): e is VersionReadyEvent => e.type === "VERSION_READY"))
        .subscribe(async () => {
          try {
            await this.swUpdate.activateUpdate();
          } finally {
            location.reload();
          }
        }),
    );

    this.subs.push(interval(5 * 60 * 1000).subscribe(() => this.checkForUpdate()));
    document.addEventListener("visibilitychange", this.visibilityHandler);
    this.checkForUpdate();
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    document.removeEventListener("visibilitychange", this.visibilityHandler);
  }

  private async checkForUpdate(): Promise<void> {
    try {
      await this.swUpdate.checkForUpdate();
    } catch {
      /* offline or transient */
    }
  }
}
