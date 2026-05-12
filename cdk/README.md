# AlwaysNear CDK

Per BlueFin policy, infrastructure changes are **never** run from a pipeline. Deploy this stack manually from your workstation.

## One-time setup

Create the two referenced secrets in Secrets Manager (region matches `config.json`):

```bash
# Generate VAPID keys (any laptop with node):
npx web-push generate-vapid-keys --json

# Then create the secret:
aws secretsmanager create-secret \
  --name alwaysnear/production/vapid \
  --secret-string '{"publicKey":"...","privateKey":"..."}'

# Google OAuth client (from console.cloud.google.com → OAuth 2.0 Client IDs):
aws secretsmanager create-secret \
  --name alwaysnear/production/google-oauth \
  --secret-string '{"clientId":"...","clientSecret":"..."}'
```

The deploy script will auto-request a us-east-1 ACM cert if one covering `{spaDomain}` and `auth.{spaDomain}` isn't already issued. It writes the Route53 validation records too, so you just need credentials with ACM + Route53 + Secrets Manager permissions.

## Deploy

Use the end-to-end script in the home repo — it runs CDK *and* publishes both the frontend bundle and the Lambda code:

```pwsh
# Production: infra + frontend + backend
./configuration/alwaysnear/deploy-infra.ps1

# Dev (Cognito prefix-based Hosted UI, no Route53/custom cert)
./configuration/alwaysnear/deploy-infra.ps1 -Environment dev

# Local dev — adds localhost:4200 to Cognito callbacks + Lambda CORS
./configuration/alwaysnear/deploy-infra.ps1 -AllowLocalhost

# Iterate on one side only
./configuration/alwaysnear/deploy-infra.ps1 -SkipFrontend
./configuration/alwaysnear/deploy-infra.ps1 -SkipBackend

# Other CDK actions
./configuration/alwaysnear/deploy-infra.ps1 -Action diff
./configuration/alwaysnear/deploy-infra.ps1 -Action synth
./configuration/alwaysnear/deploy-infra.ps1 -Action destroy
```

If you'd rather call CDK directly (e.g. for debugging), the equivalent context is:

```bash
cd cdk
dotnet build
npx aws-cdk@latest deploy \
  -c env=production \
  -c domain=alwaysnear.bluefin605.com \
  -c subdomainPrefix=alwaysnear \
  -c rootDomain=bluefin605.com \
  -c region=ap-southeast-2 \
  -c accountId=<account> \
  -c certArnUsEast1=<acm arn> \
  -c googleOauthSecretName=alwaysnear/{env}/google-oauth \
  -c vapidSecretName=alwaysnear/{env}/vapid \
  -c vapidSubject=mailto:bluefin605@gmail.com \
  -c rootDomainHostedZoneId=<route53 zone id>
```

## CI-driven app updates

After the stack exists, `.github/workflows/deploy-alwaysnear.yml` (manual trigger) can update Lambda code and frontend bundle without touching infra. Requires these GitHub secrets in BlueFin605/home:

- `ALWAYSNEAR_AWS_ACCESS_KEY_ID`
- `ALWAYSNEAR_AWS_SECRET_ACCESS_KEY`

The IAM user needs: `lambda:UpdateFunctionCode`, `s3:PutObject` + `s3:DeleteObject` on the frontend bucket, `cloudfront:CreateInvalidation`, `cloudformation:DescribeStacks`, `secretsmanager:GetSecretValue` on the VAPID secret.
