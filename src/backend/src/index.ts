import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  getMe,
  setMyRole,
  addSubscription,
  removeSubscription,
  createInvite,
  acceptInvite,
  getMyCarers,
  fireCall,
  type AuthContext,
  type RouteResult,
} from "./routes";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim());

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const origin = pickOrigin(event.headers?.origin ?? event.headers?.Origin);

  try {
    const auth = extractAuth(event);
    if (!auth) return respond(origin, { status: 401, body: { error: "Unauthorized" } });

    const result = await route(event, auth);
    return respond(origin, result);
  } catch (err) {
    console.error("Unhandled error", err);
    return respond(origin, { status: 500, body: { error: "Internal error" } });
  }
}

async function route(event: APIGatewayProxyEvent, auth: AuthContext): Promise<RouteResult> {
  const method = event.httpMethod;
  const path = event.resource ?? event.path; // resource has the route template (/me/subscriptions/{deviceId})
  const body = parseBody(event.body);

  if (method === "GET" && path === "/me") return getMe(auth);
  if (method === "POST" && path === "/me/role") return setMyRole(auth, body);
  if (method === "POST" && path === "/me/subscriptions") return addSubscription(auth, body);
  if (method === "DELETE" && path === "/me/subscriptions/{deviceId}") {
    const deviceId = event.pathParameters?.deviceId;
    if (!deviceId) return { status: 400, body: { error: "deviceId required" } };
    return removeSubscription(auth, deviceId);
  }
  if (method === "GET" && path === "/me/carers") return getMyCarers(auth);
  if (method === "POST" && path === "/invites") return createInvite(auth);
  if (method === "POST" && path === "/invites/{code}/accept") {
    const code = event.pathParameters?.code;
    if (!code) return { status: 400, body: { error: "code required" } };
    return acceptInvite(auth, code.toUpperCase());
  }
  if (method === "POST" && path === "/call") return fireCall(auth, body);

  return { status: 404, body: { error: `No route for ${method} ${path}` } };
}

function extractAuth(event: APIGatewayProxyEvent): AuthContext | undefined {
  // REST API + Cognito authorizer puts claims under requestContext.authorizer.claims.
  const claims = event.requestContext?.authorizer?.claims as Record<string, string> | undefined;
  if (!claims) return undefined;
  const userId = claims.sub;
  if (!userId) return undefined;
  const given = claims.given_name;
  const family = claims.family_name;
  const displayName = [given, family].filter(Boolean).join(" ") || undefined;
  return { userId, email: claims.email, displayName };
}

function parseBody(raw: string | null): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function pickOrigin(requestOrigin: string | undefined): string {
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  return ALLOWED_ORIGINS[0] ?? "*";
}

function respond(origin: string, result: RouteResult): APIGatewayProxyResult {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
  };
  return {
    statusCode: result.status,
    headers,
    body: result.body === undefined ? "" : JSON.stringify(result.body),
  };
}
