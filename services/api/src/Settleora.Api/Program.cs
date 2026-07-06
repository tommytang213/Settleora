using Settleora.Api.Auth.Authorization;
using Settleora.Api.Auth.AdminUsers;
using Settleora.Api.Auth.Bootstrap;
using Settleora.Api.Auth.Credentials;
using Settleora.Api.Auth.CurrentUser;
using Settleora.Api.Auth.Mfa;
using Settleora.Api.Auth.PasswordChange;
using Settleora.Api.Auth.PasswordReset;
using Settleora.Api.Auth.PasswordHashing;
using Settleora.Api.Auth.Passkeys;
using Settleora.Api.Auth.Policy;
using Settleora.Api.Auth.SignIn;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Configuration;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.RecurringBills;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Expenses.BillCsvImport;
using Settleora.Api.Expenses.BillLifecycle;
using Settleora.Api.Expenses.BillSearch;
using Settleora.Api.Expenses.BillAttachments;
using Settleora.Api.Expenses.BillRevisions;
using Settleora.Api.Expenses.BillWorkflow;
using Settleora.Api.Expenses.FutureBills;
using Settleora.Api.Expenses.GroupBills;
using Settleora.Api.Expenses.PersonalBills;
using Settleora.Api.Expenses.Reconciliation;
using Settleora.Api.Expenses.ReceiptOcrReviews;
using Settleora.Api.Expenses.RecurringBills;
using Settleora.Api.Finance;
using Settleora.Api.Health;
using Settleora.Api.LocalBackup;
using Settleora.Api.Notifications;
using Settleora.Api.Persistence;
using Settleora.Api.Persistence.MigrationRunner;
using Settleora.Api.Reports.MonthlyReports;
using Settleora.Api.Settlements;
using Settleora.Api.Storage;
using Settleora.Api.Sync;
using Settleora.Api.Users.Groups;
using Settleora.Api.Users.PaymentDetails;
using Settleora.Api.Users.SelfProfile;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSettleoraPersistence(builder.Configuration);
builder.Services.AddDatabaseMigrationRunner();
builder.Services.AddPasswordHashing(builder.Configuration);
builder.Services.AddAuthCredentialWorkflow();
builder.Services.AddCurrentAccountPasswordChange();
builder.Services.AddLocalPasswordResetRuntime();
builder.Services.AddAdminLocalUsers();
builder.Services.AddLocalOwnerBootstrap();
builder.Services.AddAuthSessionRuntime(builder.Configuration);
builder.Services.AddAuthSecurityPolicyRuntime();
builder.Services.AddPasskeyRuntime(builder.Configuration);
builder.Services.AddMfaRuntime(builder.Configuration);
builder.Services.AddSignInAbusePolicy();
builder.Services.AddSettleoraAuth();
builder.Services.AddGroupMembershipAudit();
builder.Services.AddPaymentDetailsAudit();
builder.Services.AddPersonalBillAudit();
builder.Services.AddGroupBillAudit();
builder.Services.AddExpenseBillAttachmentAudit();
builder.Services.AddReceiptOcrReviewAudit();
builder.Services.AddRecurringBillAudit();
builder.Services.AddExpenseBillWorkflowAudit();
builder.Services.AddExpenseBillRevisionAudit();
builder.Services.AddSettlementRequestAudit();
builder.Services.AddSettlementPaymentAudit();
builder.Services.AddExpenseBillReconciliationAudit();
builder.Services.AddInAppNotifications(builder.Configuration);
builder.Services.AddPushTokenLifecycle(builder.Configuration);
builder.Services.AddExpenseBillRevisionNotifications();
builder.Services.AddSyncOfflineFoundation();
builder.Services.AddSingleton<ExpenseBillCalculationService>();
builder.Services.AddSingleton<RecurringBillScheduleService>();
builder.Services.AddSingleton<ExpenseBillRevisionProposalService>();
builder.Services.AddSingleton<ExpenseBillRevisionSettlementApplyPolicy>();
builder.Services.AddSingleton<SettlementCandidateDerivationService>();
builder.Services.AddSingleton<SettlementResidualPolicyService>();
builder.Services.Configure<RabbitMqOptions>(
    builder.Configuration.GetSection(RabbitMqOptions.SectionName));
builder.Services.Configure<StorageOptions>(
    builder.Configuration.GetSection(StorageOptions.SectionName));
builder.Services.AddFileObjectStorage();
builder.Services.AddSingleton<IDatabaseReadinessCheck, NpgsqlDatabaseReadinessCheck>();
builder.Services.AddSingleton<IRabbitMqReadinessCheck, RabbitMqReadinessCheck>();
builder.Services.AddSingleton<IStorageReadinessCheck, LocalStorageReadinessCheck>();

var migrationCommand = DatabaseMigrationCommandLine.TryParse(args, builder.Configuration);
if (migrationCommand is not null)
{
    await using var migrationApp = builder.Build();
    await using var scope = migrationApp.Services.CreateAsyncScope();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();

    try
    {
        var runner = scope.ServiceProvider.GetRequiredService<DatabaseMigrationRunner>();
        return await runner.RunAsync(migrationCommand, CancellationToken.None);
    }
    catch (Exception exception)
    {
        logger.LogError(
            exception,
            "Settleora database migration command failed.");
        return DatabaseMigrationExitCode.Failure;
    }
}

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

app.MapHealthEndpoints();
app.MapLocalOwnerBootstrapEndpoints();
app.MapLocalSignInEndpoints();
app.MapRefreshSessionEndpoints();
app.MapCurrentUserEndpoints();
app.MapCurrentAccountPasswordChangeEndpoints();
app.MapPasskeyEndpoints();
app.MapMfaEndpoints();
app.MapGroupFoundationEndpoints();
app.MapGroupMemberManagementEndpoints();
app.MapSelfUserProfileEndpoints();
app.MapSelfPaymentDetailsEndpoints();
app.MapPersonalBillEndpoints();
app.MapGroupBillEndpoints();
app.MapExpenseBillLifecycleEndpoints();
app.MapSyncEndpoints();
app.MapLocalBackupPackageReadinessEndpoints();
app.MapBillCsvImportEndpoints();
app.MapExpenseBillExportEndpoints();
app.MapBillAttachmentEndpoints();
app.MapReceiptOcrReviewEndpoints();
app.MapRecurringBillEndpoints();
app.MapFutureBillEndpoints();
app.MapManualFinanceEndpoints();
app.MapInAppNotificationEndpoints();
app.MapNotificationPreferenceEndpoints();
app.MapAdminNotificationPolicyEndpoints();
app.MapPushDeviceTokenEndpoints();
app.MapExpenseBillWorkflowEndpoints();
app.MapExpenseBillRevisionEndpoints();
app.MapExpenseBillReconciliationEndpoints();
app.MapMonthlyReportEndpoints();
app.MapSettlementCandidatePreviewEndpoints();
app.MapSettlementBasketPreviewEndpoints();
app.MapSettlementBasketCreateEndpoints();
app.MapSettlementRequestCreateEndpoints();
app.MapSettlementRequestReadEndpoints();
app.MapSettlementBalanceProjectionEndpoints();
app.MapSettlementCounterpartyPaymentDetailsEndpoints();
app.MapSettlementPaymentReadEndpoints();
app.MapSettlementPaymentClaimEndpoints();
app.MapSettlementPaymentProofEndpoints();
app.MapSettlementPaymentResidualConfirmationEndpoints();
app.MapSettlementPaymentConfirmationEndpoints();
app.MapSettlementDisputeEndpoints();
app.MapSettlementCancellationEndpoints();
app.MapSignOutEndpoints();
app.MapSignOutAllEndpoints();
app.MapSessionListEndpoints();
app.MapSessionRevocationEndpoints();
app.MapAdminUserEndpoints();

app.Run();

return DatabaseMigrationExitCode.Success;

public partial class Program { }
