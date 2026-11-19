using Xunit;
using Amazon.CDK;
using Amazon.CDK.Assertions;
using AlwaysNear.Cdk.Config;
using AlwaysNear.Cdk.Stacks;

namespace AlwaysNear.Cdk.Tests;

public class IdentityStackTests
{
    private static Template Synth(string? poolId = null, string? domain = null)
    {
        var context = new Dictionary<string, object>
        {
            ["env"] = "production",
            ["domain"] = "alwaysnear.example.com",
            ["subdomainPrefix"] = "alwaysnear",
            ["rootDomain"] = "example.com",
            ["region"] = "ap-southeast-2",
            ["accountId"] = "000000000000",
            ["certArnUsEast1"] = "arn:aws:acm:us-east-1:000000000000:certificate/00000000-0000-0000-0000-000000000000",
            ["googleOauthSecretName"] = "alwaysnear-google-oauth-{env}",
            ["vapidSecretName"] = "alwaysnear-vapid-{env}",
            ["vapidSubject"] = "mailto:test@example.com",
        };
        if (poolId != null) context["identityUserPoolId"] = poolId;
        if (domain != null) context["identityDomain"] = domain;

        var app = new App(new AppProps { Context = context });
        var cfg = AppConfig.FromCdkContext(app);
        var stack = new AlwaysNearStack(app, "test", cfg, new StackProps
        {
            Env = new Amazon.CDK.Environment { Account = cfg.AccountId, Region = cfg.Region },
        });
        return Template.FromStack(stack);
    }

    [Fact]
    public void DefaultMode_CreatesOwnPoolGoogleIdpAndDomain()
    {
        var t = Synth();
        t.ResourceCountIs("AWS::Cognito::UserPool", 1);
        t.ResourceCountIs("AWS::Cognito::UserPoolIdentityProvider", 1);
        t.ResourceCountIs("AWS::Cognito::UserPoolDomain", 1);
        t.ResourceCountIs("AWS::Cognito::UserPoolClient", 1);
    }

    [Fact]
    public void ExternalMode_ImportsPoolAndSkipsOwnIdentityResources()
    {
        var t = Synth("ap-southeast-2_TEST", "auth.example.com");
        t.ResourceCountIs("AWS::Cognito::UserPool", 0);
        t.ResourceCountIs("AWS::Cognito::UserPoolIdentityProvider", 0);
        t.ResourceCountIs("AWS::Cognito::UserPoolDomain", 0);
        t.ResourceCountIs("AWS::Cognito::UserPoolClient", 1);
        t.HasResourceProperties("AWS::Cognito::UserPoolClient", Match.ObjectLike(new Dictionary<string, object>
        {
            { "UserPoolId", "ap-southeast-2_TEST" },
            { "SupportedIdentityProviders", new[] { "COGNITO", "Google" } },
        }));
        t.ResourceCountIs("AWS::ApiGateway::Authorizer", 1);
        t.HasResourceProperties("AWS::ApiGateway::Authorizer", Match.ObjectLike(new Dictionary<string, object>
        {
            { "Type", "COGNITO_USER_POOLS" },
        }));
    }

    [Fact]
    public void ExternalMode_LambdaClientIdEnvReferencesClient()
    {
        var t = Synth("ap-southeast-2_TEST", "auth.example.com");
        var clients = t.FindResources("AWS::Cognito::UserPoolClient");
        var clientLogicalId = Assert.Single(clients.Keys);
        t.HasResourceProperties("AWS::Lambda::Function", Match.ObjectLike(new Dictionary<string, object>
        {
            { "Environment", new Dictionary<string, object>
                {
                    { "Variables", Match.ObjectLike(new Dictionary<string, object>
                        {
                            { "COGNITO_CLIENT_ID", new Dictionary<string, object> { { "Ref", clientLogicalId } } },
                        }) },
                } },
        }));
    }

    [Fact]
    public void ExternalMode_HostedUiDomainOutputIsIdentityDomain()
    {
        var t = Synth("ap-southeast-2_TEST", "auth.example.com");
        t.HasOutput("HostedUiDomainName", Match.ObjectLike(new Dictionary<string, object> { { "Value", "auth.example.com" } }));
        t.HasOutput("UserPoolId", Match.ObjectLike(new Dictionary<string, object> { { "Value", "ap-southeast-2_TEST" } }));
    }

    [Fact]
    public void OnlyOneIdentityParam_Throws()
    {
        Assert.Throws<InvalidOperationException>(() => Synth(poolId: "ap-southeast-2_TEST"));
        Assert.Throws<InvalidOperationException>(() => Synth(domain: "auth.example.com"));
    }
}
