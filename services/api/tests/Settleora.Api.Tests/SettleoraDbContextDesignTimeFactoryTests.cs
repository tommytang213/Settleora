using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Finance;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.RecurringBills;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Sync;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class SettleoraDbContextDesignTimeFactoryTests
{
    [Fact]
    public void DesignTimeFactoryBuildsPostgreSqlContextWithSchemaFoundationModel()
    {
        const string connectionString =
            "Host=localhost;Port=5432;Database=settleora;Username=settleora;Password=settleora_dev_password";

        IConfiguration configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Settleora:Database:ConnectionString"] = connectionString
            })
            .Build();

        using var dbContext = SettleoraDbContextDesignTimeFactory.CreateDbContext(configuration);

        Assert.Equal("Npgsql.EntityFrameworkCore.PostgreSQL", dbContext.Database.ProviderName);
        Assert.Equal(connectionString, dbContext.Database.GetConnectionString());
        Assert.Equal(54, dbContext.Model.GetEntityTypes().Count());
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(AuthInvitation)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(AuthPasswordResetRequest)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(AuthPasskeyCredential)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(AuthMfaFactor)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(AuthRecoveryCodeBatch)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(AuthRecoveryCodeVerifier)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(AuthChallenge)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(AuthSecurityPolicy)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(FileObject)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(ManualFinancialAccount)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(ManualIncomeSource)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(InAppNotification)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(NotificationDeliveryAttempt)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(NotificationGlobalPolicy)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(NotificationEventPolicyOverride)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(PushDeviceToken)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(UserNotificationPreference)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(SyncOperation)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(SyncResourceVersion)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(ExpenseBill)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(BillCsvImportSession)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(ExpenseBillItemSplit)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(ReceiptOcrReview)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(ReceiptOcrReviewAssignment)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(ReceiptOcrReviewLine)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(ExpenseBillRevision)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(ExpenseBillRevisionParticipant)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(ExpenseBillRevisionPayer)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(ExpenseBillRevisionApproval)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(RecurringBillTemplate)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(RecurringBillOccurrence)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(SettlementRequest)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(SettlementRequestLine)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(SettlementPayment)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(SettlementPaymentAllocation)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(SettlementResidual)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(SettlementProofAttachment)));
    }

    [Fact]
    public void DesignTimeFactoryRequiresConfiguredConnectionString()
    {
        IConfiguration configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>())
            .Build();

        var exception = Assert.Throws<InvalidOperationException>(
            () => SettleoraDbContextDesignTimeFactory.CreateDbContext(configuration));

        Assert.Contains("Settleora:Database:ConnectionString", exception.Message);
    }
}
