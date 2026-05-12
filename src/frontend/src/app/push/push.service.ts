import { Injectable, inject } from "@angular/core";
import { SwPush } from "@angular/service-worker";
import { firstValueFrom } from "rxjs";
import { ApiService } from "../api/api.service";
import { environment } from "../../environments/environment";

const DEVICE_ID_KEY = "alwaysnear.deviceId";

export type PushStatus = "ok" | "needs-install" | "unsupported" | "denied" | "error" | "not-configured";

@Injectable({ providedIn: "root" })
export class PushService {
  private swPush = inject(SwPush);
  private api = inject(ApiService);

  get enabled(): boolean {
    return this.swPush.isEnabled;
  }

  async ensureSubscribed(): Promise<PushStatus> {
    if (environment.vapidPublicKey.startsWith("PLACEHOLDER")) {
      console.warn("VAPID public key is a placeholder; push registration skipped.");
      return "not-configured";
    }
    if (this.isIosSafari() && !this.isStandalone()) {
      return "needs-install";
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return "unsupported";
    }
    if (!this.swPush.isEnabled) {
      return "unsupported";
    }
    try {
      const sub = await this.swPush.requestSubscription({
        serverPublicKey: environment.vapidPublicKey,
      });
      const json = sub.toJSON();
      const p256dh = json.keys?.["p256dh"];
      const authKey = json.keys?.["auth"];
      if (!json.endpoint || !p256dh || !authKey) {
        throw new Error("Subscription missing required fields");
      }
      const deviceId = this.getOrCreateDeviceId();
      await firstValueFrom(
        this.api.registerSubscription({
          deviceId,
          endpoint: json.endpoint,
          keys: { p256dh, auth: authKey },
          userAgent: navigator.userAgent,
        })
      );
      return "ok";
    } catch (err) {
      console.error("Push subscription failed", err);
      const name = (err as { name?: string })?.name;
      if (name === "NotAllowedError") return "denied";
      return "error";
    }
  }

  private isIosSafari(): boolean {
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    return ua.includes("Mac") && "ontouchend" in document;
  }

  private isStandalone(): boolean {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    return (navigator as Navigator & { standalone?: boolean }).standalone === true;
  }

  private getOrCreateDeviceId(): string {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }
}
