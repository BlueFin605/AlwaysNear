using Amazon.CDK;
using Amazon.CDK.AWS.DynamoDB;
using DdbAttribute = Amazon.CDK.AWS.DynamoDB.Attribute;

namespace AlwaysNear.Cdk.Stacks;

/// <summary>
/// DynamoDB tables:
///   - users:          PK userId. Stores role (patient|carer), displayName, linkedPatientId.
///                     GSI patient-index on linkedPatientId so a patient can list their carers.
///   - subscriptions:  PK userId, SK deviceId. One row per Web Push subscription.
///   - invites:        PK code. TTL on expiresAt (24h). Patient generates, carer redeems.
///
/// All on-demand, encrypted, PITR on. DESTROY in non-production, RETAIN in production.
/// </summary>
public sealed partial class AlwaysNearStack
{
    public Table UsersTable { get; private set; } = null!;
    public Table SubscriptionsTable { get; private set; } = null!;
    public Table InvitesTable { get; private set; } = null!;

    partial void DefineData()
    {
        var removalPolicy = Cfg.Env == "production"
            ? RemovalPolicy.RETAIN
            : RemovalPolicy.DESTROY;

        Table NewTable(string logicalId, string tableSuffix, DdbAttribute pk, DdbAttribute? sk = null, string? ttlAttribute = null)
        {
            return new Table(this, logicalId, new TableProps
            {
                TableName = Cfg.ResourceName(tableSuffix),
                PartitionKey = pk,
                SortKey = sk,
                BillingMode = BillingMode.PAY_PER_REQUEST,
                Encryption = TableEncryption.AWS_MANAGED,
                PointInTimeRecovery = true,
                TimeToLiveAttribute = ttlAttribute,
                RemovalPolicy = removalPolicy,
            });
        }

        UsersTable = NewTable(
            logicalId: "UsersTable",
            tableSuffix: "users",
            pk: new DdbAttribute { Name = "userId", Type = AttributeType.STRING });

        // Lets a patient list all carers linked to them in one Query.
        UsersTable.AddGlobalSecondaryIndex(new GlobalSecondaryIndexProps
        {
            IndexName = "patient-index",
            PartitionKey = new DdbAttribute { Name = "linkedPatientId", Type = AttributeType.STRING },
            SortKey = new DdbAttribute { Name = "userId", Type = AttributeType.STRING },
            ProjectionType = ProjectionType.ALL,
        });

        SubscriptionsTable = NewTable(
            logicalId: "SubscriptionsTable",
            tableSuffix: "subscriptions",
            pk: new DdbAttribute { Name = "userId", Type = AttributeType.STRING },
            sk: new DdbAttribute { Name = "deviceId", Type = AttributeType.STRING });

        InvitesTable = NewTable(
            logicalId: "InvitesTable",
            tableSuffix: "invites",
            pk: new DdbAttribute { Name = "code", Type = AttributeType.STRING },
            ttlAttribute: "expiresAt");

        new CfnOutput(this, "UsersTableName", new CfnOutputProps { Value = UsersTable.TableName });
        new CfnOutput(this, "SubscriptionsTableName", new CfnOutputProps { Value = SubscriptionsTable.TableName });
        new CfnOutput(this, "InvitesTableName", new CfnOutputProps { Value = InvitesTable.TableName });
    }
}
