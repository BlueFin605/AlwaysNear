# AlwaysNear CDK

Per BlueFin policy, infrastructure changes are **never** run from a pipeline. Deploy this stack manually from your workstation.

## One-time setup

Create the two referenced secrets in SSM Parameter Store as `SecureString` (region matches `config.json`):

```bash
# Generate VAPID keys (any laptop with node):
npx web-push generate-vapid-keys --json

# Then put the parameter:
aws ssm put-parameter \
  --name /alwaysnear/production/vapid \
  --type SecureString \
  --value '{"publicKey":"...","privateKey":"..."}'

# Google OAuth client (from console.cloud.google.com → OAuth 2.0 Client IDs):
aws ssm put-parameter \
  --name /alwaysnear/production/google-oauth \
  --type SecureString \
  --value '{"clientId":"...","clientSecret":"..."}'
```

The deploy script will auto-request a us-east-1 ACM cert if one covering `{spaDomain}` and `auth.{spaDomain}` isn't already issued. It writes the Route53 validation records too, so you just need credentials with ACM + Route53 + SSM Parameter Store permissions.

With a shared identity pool (see the context keys below), only `{spaDomain}` is needed on the cert, and the Google OAuth parameter above is not needed: the pool's Google IdP belongs to the owning stack, this stack does not read the parameter, and the deploy script skips its SSM check and Cognito credential sync. The VAPID parameter is still required.

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
  -c domain=alwaysnear.example.com \
  -c subdomainPrefix=alwaysnear \
  -c rootDomain=example.com \
  -c region=ap-southeast-2 \
  -c accountId=<account> \
  -c certArnUsEast1=<acm arn> \
  -c googleOauthSecretName=alwaysnear/{env}/google-oauth \
  -c vapidSecretName=alwaysnear/{env}/vapid \
  -c vapidSubject=mailto:you@example.com \
  -c identityUserPoolId=<shared user pool id> \
  -c identityDomain=<shared hosted UI domain> \
  -c rootDomainHostedZoneId=<route53 zone id>
```

`identityUserPoolId` and `identityDomain` are optional and must be given together or not at all. Delete both lines unless you are deploying against a shared pool. With both set, this stack imports the existing pool and uses `identityDomain` as the hosted UI domain (e.g. `auth.example.com`), and creates no pool, Google IdP or Hosted UI domain. The external pool must already have a Google identity provider named `Google`, because the app client lists it as a supported provider.

## CI-driven app updates

After the stack exists, `.github/workflows/deploy-alwaysnear.yml` (manual trigger) can update Lambda code and frontend bundle without touching infra. Requires these GitHub secrets in BlueFin605/home:

- `ALWAYSNEAR_AWS_ACCESS_KEY_ID`
- `ALWAYSNEAR_AWS_SECRET_ACCESS_KEY`

The IAM user needs: `lambda:UpdateFunctionCode`, `s3:PutObject` + `s3:DeleteObject` on the frontend bucket, `cloudfront:CreateInvalidation`, `cloudformation:DescribeStacks`, `ssm:GetParameter` on the VAPID parameter, plus `kms:Decrypt` scoped via `kms:ViaService = ssm.<region>.amazonaws.com`.
