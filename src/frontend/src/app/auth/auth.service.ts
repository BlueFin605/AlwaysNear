import { Injectable, signal } from "@angular/core";
import { environment } from "../../environments/environment";

interface StoredTokens {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

const STORAGE_KEY = "alwaysnear.tokens";
const PKCE_KEY = "alwaysnear.pkce";

@Injectable({ providedIn: "root" })
export class AuthService {
  private tokens = signal<StoredTokens | null>(this.loadTokens());

  readonly isAuthenticated = () => {
    const t = this.tokens();
    return !!t && t.expiresAt > Date.now() + 10_000;
  };

  readonly idToken = () => this.tokens()?.idToken;

  async beginLogin(): Promise<void> {
    const verifier = randomString(64);
    const challenge = await sha256Base64Url(verifier);
    const state = randomString(24);
    sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));

    const url = new URL(`${environment.cognitoDomain}/oauth2/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", environment.cognitoClientId);
    url.searchParams.set("redirect_uri", environment.cognitoRedirectUri);
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    window.location.href = url.toString();
  }

  async completeLogin(code: string, state: string): Promise<void> {
    const stored = sessionStorage.getItem(PKCE_KEY);
    if (!stored) throw new Error("Missing PKCE state");
    const { verifier, state: expectedState } = JSON.parse(stored) as { verifier: string; state: string };
    if (expectedState !== state) throw new Error("State mismatch");

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: environment.cognitoClientId,
      code,
      redirect_uri: environment.cognitoRedirectUri,
      code_verifier: verifier,
    });
    const res = await fetch(`${environment.cognitoDomain}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
    const tok = (await res.json()) as {
      id_token: string;
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    this.saveTokens({
      idToken: tok.id_token,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAt: Date.now() + tok.expires_in * 1000,
    });
    sessionStorage.removeItem(PKCE_KEY);
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.tokens.set(null);
    const url = new URL(`${environment.cognitoDomain}/logout`);
    url.searchParams.set("client_id", environment.cognitoClientId);
    url.searchParams.set("logout_uri", environment.cognitoRedirectUri.replace("/auth/callback", "/"));
    window.location.href = url.toString();
  }

  private loadTokens(): StoredTokens | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredTokens;
    } catch {
      return null;
    }
  }

  private saveTokens(tok: StoredTokens): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tok));
    this.tokens.set(tok);
  }
}

function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64Url(bytes).slice(0, length);
}

async function sha256Base64Url(input: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return base64Url(new Uint8Array(hash));
}

function base64Url(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
