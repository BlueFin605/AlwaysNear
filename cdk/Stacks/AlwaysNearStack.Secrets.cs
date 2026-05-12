using Amazon.CDK;
using Amazon.CDK.AWS.SecretsManager;

namespace AlwaysNear.Cdk.Stacks;

/// <summary>
/// References pre-existing Secrets Manager entries by name. Secrets are
/// provisioned manually (or by a one-off bootstrap script) so VAPID and OAuth
/// credentials are never visible in CloudFormation templates or logs.
///
/// Required secrets (created manually before first deploy):
///   - {VapidSecretName}: { "publicKey": "...", "privateKey": "..." }
///   - {GoogleOauthSecretName}: { "clientId": "...", "clientSecret": "..." }
/// </summary>
public sealed partial class AlwaysNearStack
{
    public ISecret VapidSecret { get; private set; } = null!;
    public ISecret GoogleOAuthSecret { get; private set; } = null!;

    partial void DefineSecrets()
    {
        VapidSecret = Secret.FromSecretNameV2(this, "VapidSecret", Cfg.VapidSecretName);
        GoogleOAuthSecret = Secret.FromSecretNameV2(this, "GoogleOAuthSecret", Cfg.GoogleOauthSecretName);

        new CfnOutput(this, "VapidSecretName", new CfnOutputProps { Value = Cfg.VapidSecretName });
    }
}
