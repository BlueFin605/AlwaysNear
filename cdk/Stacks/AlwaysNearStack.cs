using Amazon.CDK;
using AlwaysNear.Cdk.Config;
using Constructs;

namespace AlwaysNear.Cdk.Stacks;

/// <summary>
/// Single stack containing every AWS resource for AlwaysNear. Composed of
/// partial classes by concern:
///   - Identity:  Cognito User Pool, App Client, Hosted UI, Google IdP
///   - Data:      DynamoDB subscriptions table
///   - Secrets:   SSM SecureString references for VAPID + Google OAuth
///   - Api:       Lambda + API Gateway HTTP API with Cognito JWT authoriser
///   - Cdn:       S3 frontend bucket + CloudFront + Route53
/// </summary>
public sealed partial class AlwaysNearStack : Stack
{
    public AppConfig Cfg { get; }

    public AlwaysNearStack(Construct scope, string id, AppConfig cfg, IStackProps? props = null)
        : base(scope, id, props)
    {
        Cfg = cfg;

        Tags.SetTag("project", "alwaysnear");
        Tags.SetTag("environment", cfg.Env);
        Tags.SetTag("managedBy", "cdk");

        DefineSecrets();
        DefineData();
        DefineIdentity();
        DefineApi();
        DefineCdn();
    }

    partial void DefineSecrets();
    partial void DefineData();
    partial void DefineIdentity();
    partial void DefineApi();
    partial void DefineCdn();
}
