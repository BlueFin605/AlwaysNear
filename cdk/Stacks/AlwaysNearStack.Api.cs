using Amazon.CDK;
using Amazon.CDK.AWS.APIGateway;
using Amazon.CDK.AWS.IAM;
using Amazon.CDK.AWS.Lambda;
using Amazon.CDK.AWS.Logs;

namespace AlwaysNear.Cdk.Stacks;

/// <summary>
/// Single Node.js Lambda behind a REST API Gateway. The Lambda routes
/// internally based on method+path. A Cognito User Pool authorizer guards
/// every route except OPTIONS (preflight) — the frontend signs in via the
/// Hosted UI and sends id-tokens as `Authorization: Bearer ...`.
///
/// Routes:
///   GET    /me
///   POST   /me/role
///   POST   /me/subscriptions
///   DELETE /me/subscriptions/{deviceId}
///   POST   /invites
///   POST   /invites/{code}/accept
///   GET    /me/carers
///   POST   /call
/// </summary>
public sealed partial class AlwaysNearStack
{
    public Function ApiLambda { get; private set; } = null!;
    public RestApi Api { get; private set; } = null!;

    partial void DefineApi()
    {
        var isProduction = Cfg.Env == "production";
        var apiLogGroupName = $"/aws/lambda/{Cfg.LambdaName("api")}";

        // This keeps retention managed without failing when the log group
        // already exists outside CloudFormation (common after Lambda first-run).
        _ = new LogRetention(this, "ApiLambdaLogRetention", new LogRetentionProps
        {
            LogGroupName = apiLogGroupName,
            Retention = RetentionDays.ONE_MONTH,
            LogRetentionRetryOptions = new Amazon.CDK.AWS.Logs.LogRetentionRetryOptions
            {
                MaxRetries = 5,
            },
        });

        ApiLambda = new Function(this, "ApiLambda", new FunctionProps
        {
            FunctionName = Cfg.LambdaName("api"),
            Runtime = Runtime.NODEJS_20_X,
            Architecture = Architecture.ARM_64,
            Handler = "index.handler",
            // src/backend's build step emits dist/ which the deploy workflow zips.
            // CDK references a placeholder path; the deploy workflow swaps in the
            // real artefact via `aws lambda update-function-code`.
            Code = Code.FromInline("exports.handler = async () => ({ statusCode: 503, body: 'not yet deployed' });"),
            MemorySize = 256,
            Timeout = Duration.Seconds(15),
            Environment = new Dictionary<string, string>
            {
                ["USERS_TABLE"] = UsersTable.TableName,
                ["SUBSCRIPTIONS_TABLE"] = SubscriptionsTable.TableName,
                ["INVITES_TABLE"] = InvitesTable.TableName,
                ["VAPID_SECRET_NAME"] = Cfg.VapidSecretName,
                ["VAPID_SUBJECT"] = Cfg.VapidSubject,
                ["ALLOWED_ORIGINS"] = Cfg.AllowedOrigins,
            },
        });

        UsersTable.GrantReadWriteData(ApiLambda);
        SubscriptionsTable.GrantReadWriteData(ApiLambda);
        InvitesTable.GrantReadWriteData(ApiLambda);

        // VAPID lives in SSM SecureString. Grant the Lambda just enough to read
        // and decrypt that one parameter (kms:Decrypt is required for SecureString
        // values and is scoped via the SSM service condition).
        ApiLambda.AddToRolePolicy(new PolicyStatement(new PolicyStatementProps
        {
            Actions = new[] { "ssm:GetParameter" },
            Resources = new[] { $"arn:aws:ssm:{Region}:{Account}:parameter{Cfg.VapidSecretName}" },
        }));
        ApiLambda.AddToRolePolicy(new PolicyStatement(new PolicyStatementProps
        {
            Actions = new[] { "kms:Decrypt" },
            Resources = new[] { "*" },
            Conditions = new Dictionary<string, object>
            {
                ["StringEquals"] = new Dictionary<string, string>
                {
                    ["kms:ViaService"] = $"ssm.{Region}.amazonaws.com",
                },
            },
        }));

        Api = new RestApi(this, "Api", new RestApiProps
        {
            RestApiName = Cfg.ResourceName("api"),
            Description = $"AlwaysNear API — {Cfg.Env}",
            DeployOptions = new StageOptions
            {
                StageName = Cfg.Env,
                ThrottlingRateLimit = 20,
                ThrottlingBurstLimit = 40,
                LoggingLevel = MethodLoggingLevel.INFO,
                DataTraceEnabled = !isProduction,
                MetricsEnabled = true,
            },
            DefaultCorsPreflightOptions = new CorsOptions
            {
                AllowOrigins = new[] { $"https://{Cfg.SpaDomain}" },
                AllowMethods = Cors.ALL_METHODS,
                AllowHeaders = new[] { "Content-Type", "Authorization" },
                AllowCredentials = true,
            },
        });

        var authorizer = new CognitoUserPoolsAuthorizer(this, "CognitoAuthorizer", new CognitoUserPoolsAuthorizerProps
        {
            CognitoUserPools = new[] { UserPool },
            AuthorizerName = Cfg.ResourceName("authorizer"),
            IdentitySource = "method.request.header.Authorization",
            ResultsCacheTtl = Duration.Minutes(5),
        });

        var lambdaIntegration = new LambdaIntegration(ApiLambda, new LambdaIntegrationOptions
        {
            Proxy = true,
        });

        var protectedMethod = new MethodOptions
        {
            AuthorizationType = AuthorizationType.COGNITO,
            Authorizer = authorizer,
        };

        // /me
        var me = Api.Root.AddResource("me");
        me.AddMethod("GET", lambdaIntegration, protectedMethod);

        var meRole = me.AddResource("role");
        meRole.AddMethod("POST", lambdaIntegration, protectedMethod);

        var meSubs = me.AddResource("subscriptions");
        meSubs.AddMethod("POST", lambdaIntegration, protectedMethod);
        var meSubsId = meSubs.AddResource("{deviceId}");
        meSubsId.AddMethod("DELETE", lambdaIntegration, protectedMethod);

        var meCarers = me.AddResource("carers");
        meCarers.AddMethod("GET", lambdaIntegration, protectedMethod);

        // /invites
        var invites = Api.Root.AddResource("invites");
        invites.AddMethod("POST", lambdaIntegration, protectedMethod);
        var inviteByCode = invites.AddResource("{code}");
        var inviteAccept = inviteByCode.AddResource("accept");
        inviteAccept.AddMethod("POST", lambdaIntegration, protectedMethod);

        // /call
        var call = Api.Root.AddResource("call");
        call.AddMethod("POST", lambdaIntegration, protectedMethod);

        new CfnOutput(this, "ApiId", new CfnOutputProps { Value = Api.RestApiId });
        new CfnOutput(this, "ApiInvokeUrl", new CfnOutputProps { Value = Api.Url });
        new CfnOutput(this, "ApiLambdaName", new CfnOutputProps { Value = ApiLambda.FunctionName });
    }
}
