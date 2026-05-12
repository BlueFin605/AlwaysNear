using Amazon.CDK;
using Amazon.CDK.AWS.CertificateManager;
using Amazon.CDK.AWS.CloudFront;
using Amazon.CDK.AWS.CloudFront.Origins;
using Amazon.CDK.AWS.Route53;
using Amazon.CDK.AWS.Route53.Targets;
using Amazon.CDK.AWS.S3;

namespace AlwaysNear.Cdk.Stacks;

/// <summary>
/// SPA hosting:
///   - S3 frontend bucket (private, OAI access only)
///   - CloudFront distribution serving the SPA with /api/* proxied to API Gateway
///   - Production: Route53 alias for SpaDomain + AuthDomain, ACM cert in us-east-1
///   - Non-production: auto-assigned *.cloudfront.net URL, no DNS or custom cert
/// </summary>
public sealed partial class AlwaysNearStack
{
    public Bucket FrontendBucket { get; private set; } = null!;
    public Distribution Distribution { get; private set; } = null!;

    partial void DefineCdn()
    {
        var isProduction = Cfg.Env == "production";
        var removalPolicy = isProduction ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

        FrontendBucket = new Bucket(this, "FrontendBucket", new BucketProps
        {
            BucketName = $"{Cfg.ResourceName("frontend")}-{Cfg.AccountId}",
            BlockPublicAccess = BlockPublicAccess.BLOCK_ALL,
            Encryption = BucketEncryption.S3_MANAGED,
            EnforceSSL = true,
            Versioned = false,
            RemovalPolicy = removalPolicy,
            AutoDeleteObjects = !isProduction,
        });

        var oai = new OriginAccessIdentity(this, "FrontendOAI", new OriginAccessIdentityProps
        {
            Comment = $"OAI for {Cfg.ResourceName("frontend")}",
        });
        FrontendBucket.GrantRead(oai);

        // SPA route fallback: any extension-less path → /index.html so Angular routing works.
        var spaRewriteFn = new Amazon.CDK.AWS.CloudFront.Function(this, "SpaRewriteFn", new FunctionProps
        {
            Code = FunctionCode.FromInline(@"
function handler(event) {
  var req = event.request;
  var uri = req.uri;
  if (uri === '/' || /\.[a-zA-Z0-9]+$/.test(uri)) {
    return req;
  }
  req.uri = '/index.html';
  return req;
}"),
            Runtime = FunctionRuntime.JS_2_0,
            Comment = "Rewrite SPA routes to /index.html",
        });

        // CloudFront receives `/api/...`; API Gateway expects routes at `/...`. Strip the prefix.
        var stripApiPrefix = new Amazon.CDK.AWS.CloudFront.Function(this, "StripApiPrefixFn", new FunctionProps
        {
            Code = FunctionCode.FromInline(@"
function handler(event) {
  var req = event.request;
  if (req.uri === '/api') {
    req.uri = '/';
  } else if (req.uri.indexOf('/api/') === 0) {
    req.uri = req.uri.substring(4);
  }
  return req;
}"),
            Runtime = FunctionRuntime.JS_2_0,
            Comment = "Strip /api prefix before forwarding to API Gateway",
        });

        var defaultBehavior = new BehaviorOptions
        {
            Origin = new S3Origin(FrontendBucket, new S3OriginProps { OriginAccessIdentity = oai }),
            ViewerProtocolPolicy = ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            AllowedMethods = AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
            CachedMethods = CachedMethods.CACHE_GET_HEAD_OPTIONS,
            Compress = true,
            CachePolicy = CachePolicy.CACHING_DISABLED,
            FunctionAssociations = new[]
            {
                new FunctionAssociation
                {
                    Function = spaRewriteFn,
                    EventType = FunctionEventType.VIEWER_REQUEST,
                },
            },
        };

        var apiBehavior = new BehaviorOptions
        {
            Origin = new RestApiOrigin(Api),
            ViewerProtocolPolicy = ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            AllowedMethods = AllowedMethods.ALLOW_ALL,
            CachedMethods = CachedMethods.CACHE_GET_HEAD_OPTIONS,
            Compress = true,
            CachePolicy = CachePolicy.CACHING_DISABLED,
            OriginRequestPolicy = OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
            FunctionAssociations = new[]
            {
                new FunctionAssociation
                {
                    Function = stripApiPrefix,
                    EventType = FunctionEventType.VIEWER_REQUEST,
                },
            },
        };

        ICertificate? cdnCert = null;
        string[]? alternateDomains = null;
        if (isProduction)
        {
            cdnCert = Certificate.FromCertificateArn(this, "CdnCert", Cfg.CertArnUsEast1);
            alternateDomains = new[] { Cfg.SpaDomain };
        }

        Distribution = new Distribution(this, "FrontendDistribution", new DistributionProps
        {
            Comment = $"AlwaysNear — {Cfg.Env}",
            DefaultRootObject = "index.html",
            HttpVersion = HttpVersion.HTTP2_AND_3,
            MinimumProtocolVersion = SecurityPolicyProtocol.TLS_V1_2_2021,
            PriceClass = PriceClass.PRICE_CLASS_100,
            Certificate = cdnCert,
            DomainNames = alternateDomains,
            DefaultBehavior = defaultBehavior,
            AdditionalBehaviors = new Dictionary<string, IBehaviorOptions>
            {
                ["/api/*"] = apiBehavior,
            },
        });

        if (isProduction && !string.IsNullOrWhiteSpace(Cfg.RootDomainHostedZoneId))
        {
            var zone = HostedZone.FromHostedZoneAttributes(this, "RootZone", new HostedZoneAttributes
            {
                HostedZoneId = Cfg.RootDomainHostedZoneId,
                ZoneName = Cfg.RootDomain,
            });

            var spaAlias = new ARecord(this, "SpaAlias", new ARecordProps
            {
                Zone = zone,
                RecordName = Cfg.SpaDomain,
                Target = RecordTarget.FromAlias(new CloudFrontTarget(Distribution)),
            });
            var spaAliasV6 = new AaaaRecord(this, "SpaAliasV6", new AaaaRecordProps
            {
                Zone = zone,
                RecordName = Cfg.SpaDomain,
                Target = RecordTarget.FromAlias(new CloudFrontTarget(Distribution)),
            });

            HostedUiDomain.Node.AddDependency(spaAlias);
            HostedUiDomain.Node.AddDependency(spaAliasV6);

            new ARecord(this, "AuthAlias", new ARecordProps
            {
                Zone = zone,
                RecordName = Cfg.AuthDomain,
                Target = RecordTarget.FromAlias(new UserPoolDomainTarget(HostedUiDomain)),
            });
        }

        new CfnOutput(this, "FrontendBucketName", new CfnOutputProps { Value = FrontendBucket.BucketName });
        new CfnOutput(this, "DistributionId", new CfnOutputProps { Value = Distribution.DistributionId });
        new CfnOutput(this, "DistributionDomainName", new CfnOutputProps { Value = Distribution.DistributionDomainName });
        new CfnOutput(this, "FrontendUrl", new CfnOutputProps
        {
            Value = isProduction ? $"https://{Cfg.SpaDomain}" : $"https://{Distribution.DistributionDomainName}",
        });
    }
}
