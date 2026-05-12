# AlwaysNear

A hospital-style call-button PWA. One person taps "Water" / "Just need you here" / etc. on their phone; another person's phone receives a Web Push notification.

Inspired by airline seatback panels — small, focused, fun.

## What this repo contains

- `src/frontend/` — Angular PWA (call buttons + service worker for receiving pushes)
- `src/backend/` — Node.js Lambda that registers Web Push subscriptions and dispatches notifications
- `cdk/` — C# CDK project: S3 + CloudFront + Route53 + Cognito + Lambda + API Gateway + DynamoDB + Secrets Manager (VAPID)
- `config.example.json` — fill in to deploy your own instance

## How it works

1. Both phones open the PWA, install it (Add to Home Screen), and sign in via Cognito.
2. Each phone registers its Web Push subscription with the backend (`POST /subscriptions`).
3. The "patient" taps a request button → `POST /call` → backend sends a Web Push to every other registered device for the same user/household.
4. The "carer" phone's service worker shows the notification (and a sound).

## Deployment

This is the public, generic code. The actual deployment is driven from the private `BlueFin605/home` repo:

- `configuration/alwaysnear/config.json` — real config (domain, account ID, cert ARNs)
- `.github/workflows/deploy-alwaysnear.yml` — manual-trigger deploy

To deploy your own instance, copy `config.example.json` → `config.json` in your own private repo, fill it in, and run CDK.

## Constraints

- No always-on infra (everything pay-as-you-go)
- Public endpoints behind Cognito JWT
- VAPID keys live in Secrets Manager — never in code or config.json
