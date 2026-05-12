import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import webpush from "web-push";
import type { SubscriptionRecord } from "./db";

const secretsClient = new SecretsManagerClient({});

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
  const out = await secretsClient.send(new GetSecretValueCommand({ SecretId: VAPID_SECRET_NAME }));
  if (!out.SecretString) throw new Error("VAPID secret has no SecretString");
  const parsed = JSON.parse(out.SecretString) as { publicKey: string; privateKey: string };
  webpush.setVapidDetails(VAPID_SUBJECT, parsed.publicKey, parsed.privateKey);
  configured = true;
}

export interface CallPayload {
  kind: string;
  severity?: "mild" | "moderate" | "urgent";
  patientName?: string;
  at: number;
}

export async function sendToSubscription(sub: SubscriptionRecord, payload: CallPayload): Promise<{ ok: boolean; gone?: boolean }> {
  await ensureVapidConfigured();
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload)
    );
    return { ok: true };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    // 404/410 means the subscription is no longer valid — caller should delete it.
    if (statusCode === 404 || statusCode === 410) return { ok: false, gone: true };
    return { ok: false };
  }
}
