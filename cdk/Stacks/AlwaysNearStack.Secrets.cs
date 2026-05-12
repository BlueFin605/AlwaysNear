using Amazon.CDK;

namespace AlwaysNear.Cdk.Stacks;

/// <summary>
/// References pre-existing SSM SecureString parameters by name. Parameters are
/// provisioned manually (or by the migration helper script) so VAPID and OAuth
/// credentials are never visible in CloudFormation templates.
///
/// Required parameters (created as SecureString before first deploy):
///   - {VapidSecretName}: { "publicKey": "...", "privateKey": "..." }
///   - {GoogleOauthSecretName}: { "clientId": "...", "clientSecret": "..." }
///
/// CDK never reads the parameter values directly. The deploy script syncs
/// Google OAuth into Cognito post-deploy; the Lambda reads VAPID at runtime
/// via the SSM SDK.
/// </summary>
public sealed partial class AlwaysNearStack
{
    partial void DefineSecrets()
    {
        new CfnOutput(this, "VapidSecretName", new CfnOutputProps { Value = Cfg.VapidSecretName });
        new CfnOutput(this, "GoogleOauthSecretName", new CfnOutputProps { Value = Cfg.GoogleOauthSecretName });
    }
}
