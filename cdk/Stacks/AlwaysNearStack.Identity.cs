using Amazon.CDK;
using Amazon.CDK.AWS.CertificateManager;
using Amazon.CDK.AWS.Cognito;

namespace AlwaysNear.Cdk.Stacks;

/// <summary>
/// Cognito User Pool with Google federation and a Hosted UI.
/// Production uses a custom domain auth.{spaDomain}; non-prod uses a Cognito prefix.
/// </summary>
public sealed partial class AlwaysNearStack
{
    public UserPool UserPool { get; private set; } = null!;
    public UserPoolClient UserPoolWebClient { get; private set; } = null!;
    public UserPoolDomain HostedUiDomain { get; private set; } = null!;
    public UserPoolIdentityProviderGoogle GoogleIdentityProvider { get; private set; } = null!;

    partial void DefineIdentity()
    {
        var isProduction = Cfg.Env == "production";
        var removalPolicy = isProduction ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

        UserPool = new UserPool(this, "UserPool", new UserPoolProps
        {
            UserPoolName = Cfg.ResourceName("users"),
            SignInAliases = new SignInAliases { Email = true, Username = false },
            SelfSignUpEnabled = true,
            StandardAttributes = new StandardAttributes
            {
                Email = new StandardAttribute { Required = true, Mutable = true },
                GivenName = new StandardAttribute { Required = false, Mutable = true },
                FamilyName = new StandardAttribute { Required = false, Mutable = true },
            },
            AutoVerify = new AutoVerifiedAttrs { Email = true },
            AccountRecovery = AccountRecovery.EMAIL_ONLY,
            PasswordPolicy = new PasswordPolicy
            {
                MinLength = 12,
                RequireLowercase = true,
                RequireUppercase = true,
                RequireDigits = true,
                RequireSymbols = true,
            },
            Mfa = Mfa.OFF,
            RemovalPolicy = removalPolicy,
            DeletionProtection = isProduction,
        });

        // Real Google credentials live in SSM SecureString at Cfg.GoogleOauthSecretName.
        // CDK sets placeholders; deploy-infra.ps1 runs `aws cognito-idp update-identity-provider`
        // post-deploy to inject the live values.
        GoogleIdentityProvider = new UserPoolIdentityProviderGoogle(this, "GoogleProvider",
            new UserPoolIdentityProviderGoogleProps
            {
                UserPool = UserPool,
                ClientId = "PLACEHOLDER_SYNCED_POST_DEPLOY",
                ClientSecretValue = SecretValue.UnsafePlainText("PLACEHOLDER_SYNCED_POST_DEPLOY"),
                Scopes = new[] { "openid", "email", "profile" },
                AttributeMapping = new AttributeMapping
                {
                    Email = ProviderAttribute.GOOGLE_EMAIL,
                    GivenName = ProviderAttribute.GOOGLE_GIVEN_NAME,
                    FamilyName = ProviderAttribute.GOOGLE_FAMILY_NAME,
                },
            });

        var callbackUrls = Cfg.AllowLocalhostCors
            ? new[] { $"https://{Cfg.SpaDomain}/auth/callback", "http://localhost:4200/auth/callback" }
            : new[] { $"https://{Cfg.SpaDomain}/auth/callback" };
        var logoutUrls = Cfg.AllowLocalhostCors
            ? new[] { $"https://{Cfg.SpaDomain}/", "http://localhost:4200/" }
            : new[] { $"https://{Cfg.SpaDomain}/" };

        UserPoolWebClient = new UserPoolClient(this, "WebClient", new UserPoolClientProps
        {
            UserPool = UserPool,
            UserPoolClientName = Cfg.ResourceName("web"),
            AuthFlows = new AuthFlow
            {
                UserSrp = false,
                UserPassword = false,
                Custom = false,
                AdminUserPassword = false,
            },
            OAuth = new OAuthSettings
            {
                Flows = new OAuthFlows
                {
                    AuthorizationCodeGrant = true,
                    ImplicitCodeGrant = false,
                },
                Scopes = new[] { OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE },
                CallbackUrls = callbackUrls,
                LogoutUrls = logoutUrls,
            },
            SupportedIdentityProviders = new[]
            {
                UserPoolClientIdentityProvider.COGNITO,
                UserPoolClientIdentityProvider.GOOGLE,
            },
            GenerateSecret = false,
            // Cognito hard caps access/id token validity at 24 hours.
            AccessTokenValidity = Duration.Days(1),
            IdTokenValidity = Duration.Days(1),
            RefreshTokenValidity = Duration.Days(30),
            PreventUserExistenceErrors = true,
            EnableTokenRevocation = true,
        });

        UserPoolWebClient.Node.AddDependency(GoogleIdentityProvider);

        HostedUiDomain = isProduction
            ? new UserPoolDomain(this, "AuthDomain", new UserPoolDomainProps
            {
                UserPool = UserPool,
                CustomDomain = new CustomDomainOptions
                {
                    DomainName = Cfg.AuthDomain,
                    Certificate = Certificate.FromCertificateArn(this, "AuthDomainCert", Cfg.CertArnUsEast1),
                },
            })
            : new UserPoolDomain(this, "AuthDomain", new UserPoolDomainProps
            {
                UserPool = UserPool,
                CognitoDomain = new CognitoDomainOptions
                {
                    DomainPrefix = Cfg.ResourceName("auth"),
                },
            });

        new CfnOutput(this, "UserPoolId", new CfnOutputProps { Value = UserPool.UserPoolId });
        new CfnOutput(this, "UserPoolArn", new CfnOutputProps { Value = UserPool.UserPoolArn });
        new CfnOutput(this, "UserPoolWebClientId", new CfnOutputProps { Value = UserPoolWebClient.UserPoolClientId });
        new CfnOutput(this, "HostedUiDomainName", new CfnOutputProps
        {
            Value = isProduction
                ? Cfg.AuthDomain
                : $"{Cfg.ResourceName("auth")}.auth.{Cfg.Region}.amazoncognito.com",
        });
    }
}
