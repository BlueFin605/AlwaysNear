// Placeholders are substituted just before `ng build` by either:
//   - configuration/alwaysnear/deploy-infra.ps1 (manual end-to-end deploy)
//   - .github/workflows/deploy-alwaysnear.yml (CI artefact deploy)
// Both restore the original placeholders after the build so this file
// stays committable as-is.
export const environment = {
  production: true,
  apiBaseUrl: "__API_BASE_URL__",
  cognitoDomain: "__COGNITO_HOSTED_UI_URL__",
  cognitoClientId: "__USER_POOL_CLIENT_ID__",
  cognitoRedirectUri: "__COGNITO_REDIRECT_URI__",
  vapidPublicKey: "__VAPID_PUBLIC_KEY__",
  version: "__BUILD_VERSION__",
};
