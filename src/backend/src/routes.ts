import {
  getUser,
  putUser,
  setRole,
  lockRoleAndLink,
  lockPatientRole,
  listCarersForPatient,
  listSubscriptions,
  putSubscription,
  deleteSubscription,
  putInvite,
  getInvite,
  deleteInvite,
  type UserRecord,
  type Role,
} from "./db";
import { sendToSubscription } from "./push";

export interface AuthContext {
  userId: string;
  email?: string;
  displayName?: string;
}

export type RouteResult = { status: number; body?: unknown };

const INVITE_TTL_SECONDS = 24 * 60 * 60;

export async function getMe(auth: AuthContext): Promise<RouteResult> {
  let user = await getUser(auth.userId);
  if (!user) {
    user = {
      userId: auth.userId,
      displayName: auth.displayName ?? auth.email,
      createdAt: Date.now(),
    };
    await putUser(user);
  }
  return { status: 200, body: user };
}

export async function setMyRole(auth: AuthContext, body: unknown): Promise<RouteResult> {
  const parsed = body as { role?: Role; displayName?: string };
  if (parsed.role !== "patient" && parsed.role !== "carer") {
    return { status: 400, body: { error: "role must be 'patient' or 'carer'" } };
  }
  try {
    const user = await setRole(auth.userId, parsed.role, parsed.displayName ?? auth.displayName);
    return { status: 200, body: user };
  } catch (err) {
    return { status: 409, body: { error: (err as Error).message } };
  }
}

export async function addSubscription(auth: AuthContext, body: unknown): Promise<RouteResult> {
  const parsed = body as {
    deviceId?: string;
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    userAgent?: string;
  };
  if (!parsed.deviceId || !parsed.endpoint || !parsed.keys?.p256dh || !parsed.keys?.auth) {
    return { status: 400, body: { error: "deviceId, endpoint, keys.p256dh, keys.auth required" } };
  }
  await putSubscription({
    userId: auth.userId,
    deviceId: parsed.deviceId,
    endpoint: parsed.endpoint,
    p256dh: parsed.keys.p256dh,
    auth: parsed.keys.auth,
    userAgent: parsed.userAgent,
    createdAt: Date.now(),
  });
  return { status: 204 };
}

export async function removeSubscription(auth: AuthContext, deviceId: string): Promise<RouteResult> {
  await deleteSubscription(auth.userId, deviceId);
  return { status: 204 };
}

export async function createInvite(auth: AuthContext): Promise<RouteResult> {
  const user = await getUser(auth.userId);
  if (user?.role !== "patient") {
    return { status: 403, body: { error: "Only patients can create invites" } };
  }
  const code = generateInviteCode();
  const expiresAt = Math.floor(Date.now() / 1000) + INVITE_TTL_SECONDS;
  await putInvite({
    code,
    patientId: auth.userId,
    expiresAt,
    createdAt: Date.now(),
  });
  return { status: 201, body: { code, expiresAt } };
}

export async function acceptInvite(auth: AuthContext, code: string): Promise<RouteResult> {
  const invite = await getInvite(code);
  if (!invite || invite.expiresAt < Math.floor(Date.now() / 1000)) {
    return { status: 404, body: { error: "Invite not found or expired" } };
  }
  if (invite.patientId === auth.userId) {
    return { status: 400, body: { error: "Cannot accept your own invite" } };
  }
  const user = await getUser(auth.userId);
  if (user?.role !== "carer") {
    return { status: 403, body: { error: "Only carers can accept invites" } };
  }
  if (user.linkedPatientId) {
    return { status: 409, body: { error: "Already linked to a patient" } };
  }
  await lockRoleAndLink(auth.userId, invite.patientId);
  await lockPatientRole(invite.patientId);
  await deleteInvite(code);
  return { status: 200, body: { linkedPatientId: invite.patientId } };
}

export async function getMyCarers(auth: AuthContext): Promise<RouteResult> {
  const user = await getUser(auth.userId);
  if (user?.role !== "patient") {
    return { status: 403, body: { error: "Only patients have carers" } };
  }
  const carers = await listCarersForPatient(auth.userId);
  return {
    status: 200,
    body: carers.map((c) => ({
      userId: c.userId,
      displayName: c.displayName,
    })),
  };
}

export async function fireCall(auth: AuthContext, body: unknown): Promise<RouteResult> {
  const parsed = body as { kind?: string; severity?: "mild" | "moderate" | "urgent" };
  if (!parsed.kind) {
    return { status: 400, body: { error: "kind required" } };
  }
  const user = await getUser(auth.userId);
  if (user?.role !== "patient") {
    return { status: 403, body: { error: "Only patients can call" } };
  }

  const carers = await listCarersForPatient(auth.userId);
  const payload = {
    kind: parsed.kind,
    severity: parsed.severity,
    patientName: user.displayName,
    at: Date.now(),
  };

  const results = await Promise.all(
    carers.map(async (carer) => {
      const subs = await listSubscriptions(carer.userId);
      return Promise.all(
        subs.map(async (sub) => {
          const result = await sendToSubscription(sub, payload);
          if (result.gone) {
            await deleteSubscription(carer.userId, sub.deviceId);
          }
          return { userId: carer.userId, deviceId: sub.deviceId, ok: result.ok };
        })
      );
    })
  );

  const flat = results.flat();
  return {
    status: 200,
    body: {
      delivered: flat.filter((r) => r.ok).length,
      attempted: flat.length,
    },
  };
}

function generateInviteCode(): string {
  // 6-character base32-ish code (no I/O/0/1 to reduce confusion when read aloud)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

// Used by routes.ts via dynamic import to avoid circular import on putUser.
// Re-exported here so test code can find it from one place.
export type { UserRecord };
