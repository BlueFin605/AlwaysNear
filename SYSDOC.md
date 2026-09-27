# AlwaysNear

Purpose: hospital-style call-button PWA — see `README.md` for the full
pitch and how-it-works flow.

## Tech stack

- **Frontend:** Angular 21 PWA with a service worker (`src/frontend/`),
  standalone components — `patient` (sends a call), `carer` (receives it),
  `role-select`, plus `auth/` (Cognito OAuth code flow) and `push/`
  (Web Push subscription registration).
- **Backend:** Node.js/TypeScript Lambda (`src/backend/`) behind a REGIONAL
  API Gateway `RestApi` — `db.ts` (DynamoDB), `push.ts` (web-push dispatch),
  `routes.ts` (HTTP handlers).
- **Storage:** DynamoDB (subscriptions + household/user mapping).
- **Auth:** Cognito User Pool with Google federation (Hosted UI) — see
  `cdk/Stacks/AlwaysNearStack.Identity.cs`.
- **Infra:** C# AWS CDK (`cdk/`) — S3 + CloudFront + Route53 + Cognito +
  Lambda + API Gateway + DynamoDB + SSM Parameter Store (VAPID, Google
  OAuth secrets).
- **Push:** Web Push — see `README.md` Constraints for the VAPID key
  handling policy.

## Where things are

- `src/frontend/` — the Angular PWA. No area-level SYSDOC: ~13 source
  files, small enough to cover here.
- `src/backend/` — the Lambda API. No area-level SYSDOC: 4 source files.
- `cdk/` — the CDK stack. No area-level SYSDOC: `cdk/README.md` already
  carries the full deploy runbook (one-time SSM/cert setup, deploy script
  usage, CI update process) in detail, and per the no-duplication
  precedence (README outranks SYSDOC) that content isn't restated here —
  see that file directly for anything deploy-related.
- `config.example.json` — template for the private `config.json` an
  operator fills in; the real one lives in the private `BlueFin605/home`
  repo (`configuration/alwaysnear/config.json`), per `README.md`.

## Running it

Local dev and deployment commands are already documented in full:
`README.md` (repo overview + deploy pointer) and `cdk/README.md` (the
actual deploy runbook, including `deploy-infra.ps1` usage from the private
Home repo). Nothing operational is missing from those two files.
