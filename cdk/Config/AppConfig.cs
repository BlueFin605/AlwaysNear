namespace AlwaysNear.Cdk.Config;

/// <summary>
/// Parsed shape of config.json. The CDK reads context values passed by the
/// deploy workflow (`-c key=value`) and maps them onto this record.
/// </summary>
public sealed record AppConfig(
    string Env,
    string Domain,
    string SubdomainPrefix,
    string RootDomain,
    string Region,
    string AccountId,
    string CertArnUsEast1,
    string GoogleOauthSecretName,
    string VapidSecretName,
    string VapidSubject,
    string RootDomainHostedZoneId,
    bool AllowLocalhostCors)
{
    public string ResourceName(string name) => $"alwaysnear-{name}-{Env}";

    public string LambdaName(string name) => $"alwaysnear-{Env}-{name}";

    public string SpaDomain => $"{SubdomainPrefix}.{RootDomain}";

    public string AuthDomain => $"auth.{SpaDomain}";

    public string AllowedOrigins => AllowLocalhostCors
        ? $"https://{SpaDomain},http://localhost:4200"
        : $"https://{SpaDomain}";

    public static AppConfig FromCdkContext(Amazon.CDK.App app)
    {
        string Required(string key) =>
            (app.Node.TryGetContext(key) as string)
            ?? throw new InvalidOperationException(
                $"CDK context '{key}' is required but missing. " +
                $"Pass it with `-c {key}=<value>` from config.json.");

        string Optional(string key) =>
            (app.Node.TryGetContext(key) as string) ?? string.Empty;

        var env = Required("env");
        if (env is not ("dev" or "staging" or "production"))
            throw new InvalidOperationException(
                $"env must be one of: dev, staging, production. Got: '{env}'.");

        return new AppConfig(
            Env: env,
            Domain: Required("domain"),
            SubdomainPrefix: Required("subdomainPrefix"),
            RootDomain: Required("rootDomain"),
            Region: Required("region"),
            AccountId: Required("accountId"),
            CertArnUsEast1: Required("certArnUsEast1"),
            GoogleOauthSecretName: Required("googleOauthSecretName").Replace("{env}", env),
            VapidSecretName: Required("vapidSecretName").Replace("{env}", env),
            VapidSubject: Required("vapidSubject"),
            RootDomainHostedZoneId: Optional("rootDomainHostedZoneId"),
            AllowLocalhostCors: Optional("allowLocalhostCors") == "true");
    }
}
