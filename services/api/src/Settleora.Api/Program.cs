using Settleora.Api.Auth.Authorization;
using Settleora.Api.Auth.AdminUsers;
using Settleora.Api.Auth.Bootstrap;
using Settleora.Api.Auth.Credentials;
using Settleora.Api.Auth.CurrentUser;
using Settleora.Api.Auth.PasswordHashing;
using Settleora.Api.Auth.SignIn;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Configuration;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Expenses.BillWorkflow;
using Settleora.Api.Expenses.GroupBills;
using Settleora.Api.Expenses.PersonalBills;
using Settleora.Api.Health;
using Settleora.Api.Persistence;
using Settleora.Api.Settlements;
using Settleora.Api.Storage;
using Settleora.Api.Users.Groups;
using Settleora.Api.Users.PaymentDetails;
using Settleora.Api.Users.SelfProfile;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSettleoraPersistence(builder.Configuration);
builder.Services.AddPasswordHashing(builder.Configuration);
builder.Services.AddAuthCredentialWorkflow();
builder.Services.AddAdminLocalUsers();
builder.Services.AddLocalOwnerBootstrap();
builder.Services.AddAuthSessionRuntime(builder.Configuration);
builder.Services.AddSignInAbusePolicy();
builder.Services.AddSettleoraAuth();
builder.Services.AddGroupMembershipAudit();
builder.Services.AddPaymentDetailsAudit();
builder.Services.AddPersonalBillAudit();
builder.Services.AddGroupBillAudit();
builder.Services.AddExpenseBillWorkflowAudit();
builder.Services.AddSettlementRequestAudit();
builder.Services.AddSettlementPaymentAudit();
builder.Services.AddSingleton<ExpenseBillCalculationService>();
builder.Services.AddSingleton<SettlementCandidateDerivationService>();
builder.Services.Configure<RabbitMqOptions>(
    builder.Configuration.GetSection(RabbitMqOptions.SectionName));
builder.Services.Configure<StorageOptions>(
    builder.Configuration.GetSection(StorageOptions.SectionName));
builder.Services.AddFileObjectStorage();
builder.Services.AddSingleton<IDatabaseReadinessCheck, NpgsqlDatabaseReadinessCheck>();
builder.Services.AddSingleton<IRabbitMqReadinessCheck, RabbitMqReadinessCheck>();
builder.Services.AddSingleton<IStorageReadinessCheck, LocalStorageReadinessCheck>();

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

app.MapHealthEndpoints();
app.MapLocalOwnerBootstrapEndpoints();
app.MapLocalSignInEndpoints();
app.MapRefreshSessionEndpoints();
app.MapCurrentUserEndpoints();
app.MapGroupFoundationEndpoints();
app.MapGroupMemberManagementEndpoints();
app.MapSelfUserProfileEndpoints();
app.MapSelfPaymentDetailsEndpoints();
app.MapPersonalBillEndpoints();
app.MapGroupBillEndpoints();
app.MapExpenseBillWorkflowEndpoints();
app.MapSettlementCandidatePreviewEndpoints();
app.MapSettlementRequestCreateEndpoints();
app.MapSettlementRequestReadEndpoints();
app.MapSettlementPaymentClaimEndpoints();
app.MapSettlementPaymentConfirmationEndpoints();
app.MapSettlementDisputeEndpoints();
app.MapSettlementCancellationEndpoints();
app.MapSignOutEndpoints();
app.MapSignOutAllEndpoints();
app.MapSessionListEndpoints();
app.MapSessionRevocationEndpoints();
app.MapAdminUserEndpoints();

app.Run();

public partial class Program { }
