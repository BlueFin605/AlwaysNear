// Dev defaults — overridden at build time in environment.production.ts
// (or via the deploy workflow's runtime config injection).
export const environment = {
  production: false,
  apiBaseUrl: "/api",
  cognitoDomain: "https://alwaysnear-auth-dev.auth.ap-southeast-2.amazoncognito.com",
  cognitoClientId: "PLACEHOLDER_CLIENT_ID",
  cognitoRedirectUri: "http://localhost:4200/auth/callback",
  vapidPublicKey: "PLACEHOLDER_VAPID_PUBLIC_KEY",
};
