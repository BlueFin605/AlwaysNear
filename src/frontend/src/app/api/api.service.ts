import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../environments/environment";

export type Role = "patient" | "carer";

export interface UserRecord {
  userId: string;
  displayName?: string;
  role?: Role;
  linkedPatientId?: string;
  roleLockedAt?: number;
}

export interface CarerSummary {
  userId: string;
  displayName?: string;
}

export interface InviteResponse {
  code: string;
  expiresAt: number;
}

export interface CallResult {
  delivered: number;
  attempted: number;
}

export interface CallRequest {
  kind: string;
  severity?: "mild" | "moderate" | "urgent";
}

export interface SubscriptionPayload {
  deviceId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

@Injectable({ providedIn: "root" })
export class ApiService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  getMe(): Observable<UserRecord> {
    return this.http.get<UserRecord>(`${this.base}/me`);
  }

  setRole(role: Role, displayName?: string): Observable<UserRecord> {
    return this.http.post<UserRecord>(`${this.base}/me/role`, { role, displayName });
  }

  registerSubscription(sub: SubscriptionPayload): Observable<void> {
    return this.http.post<void>(`${this.base}/me/subscriptions`, sub);
  }

  removeSubscription(deviceId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/me/subscriptions/${encodeURIComponent(deviceId)}`);
  }

  createInvite(): Observable<InviteResponse> {
    return this.http.post<InviteResponse>(`${this.base}/invites`, {});
  }

  acceptInvite(code: string): Observable<{ linkedPatientId: string }> {
    return this.http.post<{ linkedPatientId: string }>(`${this.base}/invites/${encodeURIComponent(code)}/accept`, {});
  }

  listCarers(): Observable<CarerSummary[]> {
    return this.http.get<CarerSummary[]>(`${this.base}/me/carers`);
  }

  call(req: CallRequest): Observable<CallResult> {
    return this.http.post<CallResult>(`${this.base}/call`, req);
  }
}
