// Dev defaults — overridden at build time in environment.production.ts
// (or via the deploy workflow's runtime config injection).
export const environment = {
  production: false,
  apiBaseUrl: "/api",
  cognitoDomain: "PLACEHOLDER_COGNITO_HOSTED_UI_URL",
  cognitoClientId: "PLACEHOLDER_CLIENT_ID",
  cognitoRedirectUri: "http://localhost:4200/auth/callback",
  vapidPublicKey: "PLACEHOLDER_VAPID_PUBLIC_KEY",
  version: "dev",
};
