using Amazon.CDK;
using AlwaysNear.Cdk.Config;
using AlwaysNear.Cdk.Stacks;

namespace AlwaysNear.Cdk;

public static class Program
{
    public static void Main(string[] args)
    {
        var app = new App();

        var cfg = AppConfig.FromCdkContext(app);

        new AlwaysNearStack(
            scope: app,
            id: cfg.ResourceName("stack"),
            cfg: cfg,
            props: new StackProps
            {
                Env = new Amazon.CDK.Environment
                {
                    Account = cfg.AccountId,
                    Region = cfg.Region,
                },
                Description = $"AlwaysNear — {cfg.Env}",
                TerminationProtection = cfg.Env == "production",
            });

        app.Synth();
    }
}
