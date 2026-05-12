import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USERS_TABLE = required("USERS_TABLE");
const SUBSCRIPTIONS_TABLE = required("SUBSCRIPTIONS_TABLE");
const INVITES_TABLE = required("INVITES_TABLE");

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

export type Role = "patient" | "carer";

export interface UserRecord {
  userId: string;
  displayName?: string;
  role?: Role;
  linkedPatientId?: string;
  createdAt: number;
  roleLockedAt?: number;
}

export interface SubscriptionRecord {
  userId: string;
  deviceId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  createdAt: number;
}

export interface InviteRecord {
  code: string;
  patientId: string;
  expiresAt: number;
  createdAt: number;
}

export async function getUser(userId: string): Promise<UserRecord | undefined> {
  const out = await ddb.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId } }));
  return out.Item as UserRecord | undefined;
}

export async function putUser(user: UserRecord): Promise<void> {
  await ddb.send(new PutCommand({ TableName: USERS_TABLE, Item: user }));
}

export async function setRole(userId: string, role: Role, displayName?: string): Promise<UserRecord> {
  const now = Date.now();
  const existing = await getUser(userId);
  if (existing?.roleLockedAt) {
    throw new Error("Role already locked; cannot change after linking.");
  }
  const user: UserRecord = {
    userId,
    displayName: displayName ?? existing?.displayName,
    role,
    linkedPatientId: existing?.linkedPatientId,
    createdAt: existing?.createdAt ?? now,
  };
  await putUser(user);
  return user;
}

export async function lockRoleAndLink(userId: string, linkedPatientId: string): Promise<void> {
  const now = Date.now();
  await ddb.send(
    new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression: "SET linkedPatientId = :p, roleLockedAt = :t",
      ConditionExpression: "attribute_exists(userId) AND #role = :carer",
      ExpressionAttributeNames: { "#role": "role" },
      ExpressionAttributeValues: { ":p": linkedPatientId, ":t": now, ":carer": "carer" },
    })
  );
}

export async function lockPatientRole(userId: string): Promise<void> {
  const now = Date.now();
  await ddb.send(
    new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression: "SET roleLockedAt = if_not_exists(roleLockedAt, :t)",
      ConditionExpression: "attribute_exists(userId) AND #role = :patient",
      ExpressionAttributeNames: { "#role": "role" },
      ExpressionAttributeValues: { ":t": now, ":patient": "patient" },
    })
  );
}

export async function listCarersForPatient(patientId: string): Promise<UserRecord[]> {
  const out = await ddb.send(
    new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: "patient-index",
      KeyConditionExpression: "linkedPatientId = :p",
      ExpressionAttributeValues: { ":p": patientId },
    })
  );
  return (out.Items ?? []) as UserRecord[];
}

export async function listSubscriptions(userId: string): Promise<SubscriptionRecord[]> {
  const out = await ddb.send(
    new QueryCommand({
      TableName: SUBSCRIPTIONS_TABLE,
      KeyConditionExpression: "userId = :u",
      ExpressionAttributeValues: { ":u": userId },
    })
  );
  return (out.Items ?? []) as SubscriptionRecord[];
}

export async function putSubscription(sub: SubscriptionRecord): Promise<void> {
  await ddb.send(new PutCommand({ TableName: SUBSCRIPTIONS_TABLE, Item: sub }));
}

export async function deleteSubscription(userId: string, deviceId: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: SUBSCRIPTIONS_TABLE, Key: { userId, deviceId } }));
}

export async function putInvite(invite: InviteRecord): Promise<void> {
  await ddb.send(new PutCommand({ TableName: INVITES_TABLE, Item: invite }));
}

export async function getInvite(code: string): Promise<InviteRecord | undefined> {
  const out = await ddb.send(new GetCommand({ TableName: INVITES_TABLE, Key: { code } }));
  return out.Item as InviteRecord | undefined;
}

export async function deleteInvite(code: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: INVITES_TABLE, Key: { code } }));
}
