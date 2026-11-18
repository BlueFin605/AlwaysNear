import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { APIGatewayProxyEvent } from "aws-lambda";
import { extractAuth } from "./index";

// routes pulls in db.ts, which requires table env vars at import time.
vi.mock("./routes", () => ({}));

const CLIENT = "client-123";

function ev(claims?: Record<string, string>): APIGatewayProxyEvent {
  return { requestContext: { authorizer: claims ? { claims } : undefined } } as unknown as APIGatewayProxyEvent;
}

describe("extractAuth", () => {
  const saved = process.env.COGNITO_CLIENT_ID;
  beforeEach(() => {
    process.env.COGNITO_CLIENT_ID = CLIENT;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.COGNITO_CLIENT_ID;
    else process.env.COGNITO_CLIENT_ID = saved;
  });

  it("accepts matching aud and id token", () => {
    const a = extractAuth(ev({ sub: "u1", aud: CLIENT, token_use: "id", email: "a@b.c", given_name: "A", family_name: "B" }));
    expect(a).toEqual({ userId: "u1", email: "a@b.c", displayName: "A B" });
  });
  it("rejects wrong aud", () => {
    expect(extractAuth(ev({ sub: "u1", aud: "other", token_use: "id" }))).toBeUndefined();
  });
  it("rejects access tokens", () => {
    expect(extractAuth(ev({ sub: "u1", aud: CLIENT, token_use: "access" }))).toBeUndefined();
  });
  it("fails closed when COGNITO_CLIENT_ID is missing", () => {
    delete process.env.COGNITO_CLIENT_ID;
    expect(extractAuth(ev({ sub: "u1", aud: CLIENT, token_use: "id" }))).toBeUndefined();
  });
  it("rejects when no claims", () => {
    expect(extractAuth(ev())).toBeUndefined();
  });
});
