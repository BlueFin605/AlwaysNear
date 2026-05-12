import { Injectable, inject } from "@angular/core";
import { SwPush } from "@angular/service-worker";
import { firstValueFrom } from "rxjs";
import { ApiService } from "../api/api.service";
import { environment } from "../../environments/environment";

const DEVICE_ID_KEY = "alwaysnear.deviceId";

@Injectable({ providedIn: "root" })
export class PushService {
  private swPush = inject(SwPush);
  private api = inject(ApiService);

  get enabled(): boolean {
    return this.swPush.isEnabled;
  }

  async ensureSubscribed(): Promise<void> {
    if (!this.swPush.isEnabled) {
      console.warn("Service worker push is not enabled");
      return;
    }
    if (environment.vapidPublicKey.startsWith("PLACEHOLDER")) {
      console.warn("VAPID public key is a placeholder; push registration skipped.");
      return;
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
    } catch (err) {
      console.error("Push subscription failed", err);
    }
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
