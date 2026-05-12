import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import webpush from "web-push";
import type { SubscriptionRecord } from "./db";

const ssmClient = new SSMClient({});

const VAPID_SECRET_NAME = required("VAPID_SECRET_NAME");
const VAPID_SUBJECT = required("VAPID_SUBJECT");

let configured = false;

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

async function ensureVapidConfigured(): Promise<void> {
  if (configured) return;
  const out = await ssmClient.send(new GetParameterCommand({ Name: VAPID_SECRET_NAME, WithDecryption: true }));
  if (!out.Parameter?.Value) throw new Error(`SSM parameter ${VAPID_SECRET_NAME} has no value`);
  const parsed = JSON.parse(out.Parameter.Value) as { publicKey: string; privateKey: string };
  webpush.setVapidDetails(VAPID_SUBJECT, parsed.publicKey, parsed.privateKey);
  configured = true;
}

export interface CallPayload {
  kind: string;
  severity?: "mild" | "moderate" | "urgent";
  patientName?: string;
  at: number;
}

const LABEL_BY_KIND: Record<string, string> = {
  water: "💧 Water",
  "tea-coffee": "☕ Tea / Coffee",
  snack: "🍪 Snack",
  medication: "💊 Medication",
  "just-need-you": "💛 Just need you here",
};

export async function sendToSubscription(sub: SubscriptionRecord, payload: CallPayload): Promise<{ ok: boolean; gone?: boolean }> {
  await ensureVapidConfigured();
  // iOS Web Push requires every push to show a user-visible notification, so wrap the
  // payload in Angular ngsw's `notification` envelope — that triggers showNotification()
  // in the service worker.
  const title = payload.patientName ? `${payload.patientName} needs you` : "AlwaysNear";
  const body = `${LABEL_BY_KIND[payload.kind] ?? payload.kind}${payload.severity ? ` — ${payload.severity}` : ""}`;
  const envelope = {
    notification: {
      title,
      body,
      tag: "alwaysnear-call",
      renotify: true,
      requireInteraction: payload.severity === "urgent",
      data: payload,
    },
    data: payload,
  };
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(envelope)
    );
    return { ok: true };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    // 404/410 means the subscription is no longer valid — caller should delete it.
    if (statusCode === 404 || statusCode === 410) return { ok: false, gone: true };
    return { ok: false };
  }
}
