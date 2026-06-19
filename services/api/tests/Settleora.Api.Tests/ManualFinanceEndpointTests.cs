using System.Net;
using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Finance;
using Settleora.Api.Domain.RecurringBills;
using Settleora.Api.Domain.Users;
using Settleora.Api.Expenses.RecurringBills;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class ManualFinanceEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string AccountsPath = "/api/v1/manual-financial-accounts";
    private const string IncomePath = "/api/v1/manual-income-sources";
    private const string SummaryPath = "/api/v1/manual-finance/summary";
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 6, 18, 6, 35, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 6, 18, 6, 45, 0, TimeSpan.Zero);
    private readonly WebApplicationFactory<Program> factory;

    public ManualFinanceEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task AccountCreateListReadUpdateAndArchiveAreOwnerScoped()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Manual Account Actor");
        using var client = testFactory.CreateClient();

        var accountId = await CreateAccountAsync(client, actor.RawSessionToken, AccountJson("Cash Wallet", "cash", "1234.50", "USD", "2026-06-18"));

        using var listRequest = CreateBearerRequest(HttpMethod.Get, AccountsPath, actor.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        using var listPayload = JsonDocument.Parse(await listResponse.Content.ReadAsStringAsync());
        Assert.Equal(accountId, Assert.Single(listPayload.RootElement.GetProperty("accounts").EnumerateArray()).GetProperty("id").GetGuid());

        using var patchRequest = CreateJsonRequest(
            HttpMethod.Patch,
            $"{AccountsPath}/{accountId:D}",
            actor.RawSessionToken,
            """
            {
              "displayName": " Main Cash ",
              "accountType": "stored_value",
              "currentBalanceAmount": "-12.34",
              "currency": "HKD",
              "balanceAsOfDate": "2026-06-17",
              "note": "updated"
            }
            """);
        using var patchResponse = await client.SendAsync(patchRequest);
        var patchContent = await patchResponse.Content.ReadAsStringAsync();
        Assert.True(patchResponse.StatusCode == HttpStatusCode.OK, patchContent);
        using var patchPayload = JsonDocument.Parse(patchContent);
        Assert.Equal("Main Cash", patchPayload.RootElement.GetProperty("displayName").GetString());
        Assert.Equal("stored_value", patchPayload.RootElement.GetProperty("accountType").GetString());
        Assert.Equal("-12.34", patchPayload.RootElement.GetProperty("currentBalanceAmount").GetString());
        Assert.Equal("HKD", patchPayload.RootElement.GetProperty("currency").GetString());

        using var archiveRequest = CreateBearerRequest(HttpMethod.Post, $"{AccountsPath}/{accountId:D}/archive", actor.RawSessionToken);
        using var archiveResponse = await client.SendAsync(archiveRequest);
        Assert.Equal(HttpStatusCode.OK, archiveResponse.StatusCode);
        using var archivePayload = JsonDocument.Parse(await archiveResponse.Content.ReadAsStringAsync());
        Assert.Equal(ManualFinancialAccountStatuses.Archived, archivePayload.RootElement.GetProperty("status").GetString());
        Assert.Equal(WriteTimestamp, archivePayload.RootElement.GetProperty("archivedAtUtc").GetDateTimeOffset());

        using var defaultListRequest = CreateBearerRequest(HttpMethod.Get, AccountsPath, actor.RawSessionToken);
        using var defaultListResponse = await client.SendAsync(defaultListRequest);
        using var defaultListPayload = JsonDocument.Parse(await defaultListResponse.Content.ReadAsStringAsync());
        Assert.Empty(defaultListPayload.RootElement.GetProperty("accounts").EnumerateArray());

        using var archivedListRequest = CreateBearerRequest(HttpMethod.Get, $"{AccountsPath}?includeArchived=true", actor.RawSessionToken);
        using var archivedListResponse = await client.SendAsync(archivedListRequest);
        using var archivedListPayload = JsonDocument.Parse(await archivedListResponse.Content.ReadAsStringAsync());
        Assert.Equal(accountId, Assert.Single(archivedListPayload.RootElement.GetProperty("accounts").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task IncomeCreateListReadUpdateAndArchiveAreOwnerScoped()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Manual Income Actor");
        using var client = testFactory.CreateClient();
        var accountId = await CreateAccountAsync(client, actor.RawSessionToken, AccountJson("Bank", "bank_account", "200.00", "USD", "2026-06-18"));
        var incomeId = await CreateIncomeAsync(client, actor.RawSessionToken, IncomeJson("Salary", "3000.00", "USD", "monthly", "2026-06-30", accountId));

        using var listRequest = CreateBearerRequest(HttpMethod.Get, IncomePath, actor.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        using var listPayload = JsonDocument.Parse(await listResponse.Content.ReadAsStringAsync());
        Assert.Equal(incomeId, Assert.Single(listPayload.RootElement.GetProperty("incomeSources").EnumerateArray()).GetProperty("id").GetGuid());

        using var updateRequest = CreateJsonRequest(
            HttpMethod.Put,
            $"{IncomePath}/{incomeId:D}",
            actor.RawSessionToken,
            IncomeJson("Bonus", "800.25", "HKD", "one_time", "2026-07-15", null, "2026-07-15", "updated"));
        using var updateResponse = await client.SendAsync(updateRequest);
        var updateContent = await updateResponse.Content.ReadAsStringAsync();
        Assert.True(updateResponse.StatusCode == HttpStatusCode.OK, updateContent);
        using var updatePayload = JsonDocument.Parse(updateContent);
        Assert.Equal("Bonus", updatePayload.RootElement.GetProperty("displayName").GetString());
        Assert.Equal("800.25", updatePayload.RootElement.GetProperty("amount").GetString());
        Assert.Equal("HKD", updatePayload.RootElement.GetProperty("currency").GetString());
        Assert.Equal(JsonValueKind.Null, updatePayload.RootElement.GetProperty("manualFinancialAccountId").ValueKind);

        using var archiveRequest = CreateBearerRequest(HttpMethod.Post, $"{IncomePath}/{incomeId:D}/archive", actor.RawSessionToken);
        using var archiveResponse = await client.SendAsync(archiveRequest);
        Assert.Equal(HttpStatusCode.OK, archiveResponse.StatusCode);

        using var defaultListRequest = CreateBearerRequest(HttpMethod.Get, IncomePath, actor.RawSessionToken);
        using var defaultListResponse = await client.SendAsync(defaultListRequest);
        using var defaultListPayload = JsonDocument.Parse(await defaultListResponse.Content.ReadAsStringAsync());
        Assert.Empty(defaultListPayload.RootElement.GetProperty("incomeSources").EnumerateArray());
    }

    [Fact]
    public async Task CrossUserAccountAndIncomeAccessFailsClosed()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var owner = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Manual Finance Owner");
        var other = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Manual Finance Other");
        using var client = testFactory.CreateClient();
        var accountId = await CreateAccountAsync(client, owner.RawSessionToken, AccountJson("Private", "cash", "10.00", "USD", "2026-06-18"));
        var incomeId = await CreateIncomeAsync(client, owner.RawSessionToken, IncomeJson("Private Income", "10.00", "USD", "weekly", "2026-06-20", accountId));

        using var otherGetAccount = CreateBearerRequest(HttpMethod.Get, $"{AccountsPath}/{accountId:D}", other.RawSessionToken);
        using var otherGetAccountResponse = await client.SendAsync(otherGetAccount);
        Assert.Equal(HttpStatusCode.NotFound, otherGetAccountResponse.StatusCode);

        using var otherPatchAccount = CreateJsonRequest(HttpMethod.Patch, $"{AccountsPath}/{accountId:D}", other.RawSessionToken, """{"displayName":"stolen"}""");
        using var otherPatchAccountResponse = await client.SendAsync(otherPatchAccount);
        Assert.Equal(HttpStatusCode.NotFound, otherPatchAccountResponse.StatusCode);

        using var otherArchiveIncome = CreateBearerRequest(HttpMethod.Post, $"{IncomePath}/{incomeId:D}/archive", other.RawSessionToken);
        using var otherArchiveIncomeResponse = await client.SendAsync(otherArchiveIncome);
        Assert.Equal(HttpStatusCode.NotFound, otherArchiveIncomeResponse.StatusCode);

        using var ownerListRequest = CreateBearerRequest(HttpMethod.Get, AccountsPath, owner.RawSessionToken);
        using var ownerListResponse = await client.SendAsync(ownerListRequest);
        using var ownerListPayload = JsonDocument.Parse(await ownerListResponse.Content.ReadAsStringAsync());
        Assert.Single(ownerListPayload.RootElement.GetProperty("accounts").EnumerateArray());
    }

    [Fact]
    public async Task InvalidAmountCurrencyAndDateValidationIsRejected()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Manual Finance Invalid Actor");
        using var client = testFactory.CreateClient();

        using var accountRequest = CreateJsonRequest(
            HttpMethod.Post,
            AccountsPath,
            actor.RawSessionToken,
            """
            {
              "displayName": "Bad",
              "accountType": "cash",
              "currentBalanceAmount": "1e2",
              "currency": "usd",
              "balanceAsOfDate": "18-06-2026"
            }
            """);
        using var accountResponse = await client.SendAsync(accountRequest);
        var accountContent = await accountResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, accountResponse.StatusCode);
        Assert.Contains("Currency must be an uppercase three-letter code.", accountContent);
        Assert.Contains("balanceAsOfDate must be a yyyy-MM-dd date string.", accountContent);

        using var incomeRequest = CreateJsonRequest(
            HttpMethod.Post,
            IncomePath,
            actor.RawSessionToken,
            """
            {
              "displayName": "Bad Income",
              "amount": "0",
              "currency": "USD",
              "cadence": "monthly",
              "nextExpectedDate": "2026-07-10",
              "endDate": "2026-07-01"
            }
            """);
        using var incomeResponse = await client.SendAsync(incomeRequest);
        var incomeContent = await incomeResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, incomeResponse.StatusCode);
        Assert.Contains("Zero amount is not allowed for this operation.", incomeContent);
        Assert.Contains("End date must be on or after next expected date.", incomeContent);
    }

    [Fact]
    public async Task IncomeLinkedAccountMustBelongToCurrentActor()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var owner = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Manual Finance Link Owner");
        var other = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Manual Finance Link Other");
        using var client = testFactory.CreateClient();
        var ownerAccountId = await CreateAccountAsync(client, owner.RawSessionToken, AccountJson("Owner Account", "cash", "10.00", "USD", "2026-06-18"));

        using var request = CreateJsonRequest(
            HttpMethod.Post,
            IncomePath,
            other.RawSessionToken,
            IncomeJson("Other Income", "20.00", "USD", "monthly", "2026-07-01", ownerAccountId));
        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task AccountRequestsRejectBodySmuggledAuthorityFieldsWithoutSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Manual Finance Account Smuggle Actor");
        var other = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Manual Finance Account Smuggle Other");
        using var client = testFactory.CreateClient();

        using var createRequest = CreateJsonRequest(
            HttpMethod.Post,
            AccountsPath,
            actor.RawSessionToken,
            $$"""
            {
              "displayName": "Smuggled",
              "accountType": "cash",
              "currentBalanceAmount": "10.00",
              "currency": "USD",
              "balanceAsOfDate": "2026-06-18",
              "ownerUserProfileId": "{{other.UserProfileId:D}}"
            }
            """);
        using var createResponse = await client.SendAsync(createRequest);
        var createContent = await createResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, createResponse.StatusCode);
        Assert.Contains("Unsupported fields are not allowed.", createContent);
        Assert.Empty(await LoadAccountsAsync(testFactory, actor.UserProfileId));
        Assert.Empty(await LoadAccountsAsync(testFactory, other.UserProfileId));

        var accountId = await CreateAccountAsync(client, actor.RawSessionToken, AccountJson("Cash Wallet", "cash", "123.45", "USD", "2026-06-18"));
        using var patchRequest = CreateJsonRequest(
            HttpMethod.Patch,
            $"{AccountsPath}/{accountId:D}",
            actor.RawSessionToken,
            $$"""
            {
              "displayName": "Mutated",
              "id": "{{Guid.NewGuid():D}}",
              "ownerUserProfileId": "{{other.UserProfileId:D}}"
            }
            """);
        using var patchResponse = await client.SendAsync(patchRequest);
        var patchContent = await patchResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, patchResponse.StatusCode);
        Assert.Contains("Unsupported fields are not allowed.", patchContent);

        var account = Assert.Single(await LoadAccountsAsync(testFactory, actor.UserProfileId));
        Assert.Equal(accountId, account.Id);
        Assert.Equal("Cash Wallet", account.DisplayName);
        Assert.Equal("123.45", account.CurrentBalanceAmount.ToString("0.##", CultureInfo.InvariantCulture));

        using var archiveRequest = CreateJsonRequest(
            HttpMethod.Post,
            $"{AccountsPath}/{accountId:D}/archive",
            actor.RawSessionToken,
            $$"""{"ownerUserProfileId":"{{other.UserProfileId:D}}"}""");
        using var archiveResponse = await client.SendAsync(archiveRequest);
        var archiveContent = await archiveResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, archiveResponse.StatusCode);
        Assert.Contains("does not accept a request body", archiveContent);

        account = Assert.Single(await LoadAccountsAsync(testFactory, actor.UserProfileId));
        Assert.Equal(ManualFinancialAccountStatuses.Active, account.Status);
        Assert.Null(account.ArchivedAtUtc);
    }

    [Fact]
    public async Task IncomeRequestsRejectBodySmuggledAuthorityFieldsWithoutSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Manual Finance Income Smuggle Actor");
        var other = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Manual Finance Income Smuggle Other");
        using var client = testFactory.CreateClient();
        var accountId = await CreateAccountAsync(client, actor.RawSessionToken, AccountJson("Bank", "bank_account", "200.00", "USD", "2026-06-18"));

        using var createRequest = CreateJsonRequest(
            HttpMethod.Post,
            IncomePath,
            actor.RawSessionToken,
            $$"""
            {
              "displayName": "Smuggled Salary",
              "amount": "100.00",
              "currency": "USD",
              "cadence": "monthly",
              "nextExpectedDate": "2026-06-30",
              "manualFinancialAccountId": "{{accountId:D}}",
              "ownerUserProfileId": "{{other.UserProfileId:D}}"
            }
            """);
        using var createResponse = await client.SendAsync(createRequest);
        var createContent = await createResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, createResponse.StatusCode);
        Assert.Contains("Unsupported fields are not allowed.", createContent);
        Assert.Empty(await LoadIncomeSourcesAsync(testFactory, actor.UserProfileId));
        Assert.Empty(await LoadIncomeSourcesAsync(testFactory, other.UserProfileId));

        var incomeId = await CreateIncomeAsync(client, actor.RawSessionToken, IncomeJson("Salary", "3000.00", "USD", "monthly", "2026-06-30", accountId));
        using var updateRequest = CreateJsonRequest(
            HttpMethod.Put,
            $"{IncomePath}/{incomeId:D}",
            actor.RawSessionToken,
            $$"""
            {
              "displayName": "Mutated Salary",
              "amount": "1.00",
              "currency": "USD",
              "cadence": "weekly",
              "nextExpectedDate": "2026-07-01",
              "manualFinancialAccountId": "{{accountId:D}}",
              "incomeSourceId": "{{Guid.NewGuid():D}}",
              "ownerUserProfileId": "{{other.UserProfileId:D}}"
            }
            """);
        using var updateResponse = await client.SendAsync(updateRequest);
        var updateContent = await updateResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, updateResponse.StatusCode);
        Assert.Contains("Unsupported fields are not allowed.", updateContent);

        var income = Assert.Single(await LoadIncomeSourcesAsync(testFactory, actor.UserProfileId));
        Assert.Equal(incomeId, income.Id);
        Assert.Equal("Salary", income.DisplayName);
        Assert.Equal("3000", income.Amount.ToString("0.##", CultureInfo.InvariantCulture));
        Assert.Equal(ManualIncomeCadences.Monthly, income.Cadence);

        using var archiveRequest = CreateJsonRequest(
            HttpMethod.Post,
            $"{IncomePath}/{incomeId:D}/archive",
            actor.RawSessionToken,
            $$"""{"ownerUserProfileId":"{{other.UserProfileId:D}}"}""");
        using var archiveResponse = await client.SendAsync(archiveRequest);
        var archiveContent = await archiveResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, archiveResponse.StatusCode);
        Assert.Contains("does not accept a request body", archiveContent);

        income = Assert.Single(await LoadIncomeSourcesAsync(testFactory, actor.UserProfileId));
        Assert.Equal(ManualIncomeSourceStatuses.Active, income.Status);
        Assert.Null(income.ArchivedAtUtc);
    }

    [Fact]
    public async Task SummaryGroupsAvailableBalanceByCurrencyForCurrentActorOnly()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Manual Finance Summary Actor");
        var other = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Manual Finance Summary Other");
        using var client = testFactory.CreateClient();

        await CreateAccountAsync(client, actor.RawSessionToken, AccountJson("USD Bank", "bank_account", "100.50", "USD", "2026-06-18"));
        var archivedAccountId = await CreateAccountAsync(client, actor.RawSessionToken, AccountJson("Archived Cash", "cash", "999.00", "USD", "2026-06-18"));
        await CreateAccountAsync(client, actor.RawSessionToken, AccountJson("HKD Wallet", "cash", "800.00", "HKD", "2026-06-18"));
        await CreateAccountAsync(client, other.RawSessionToken, AccountJson("Other USD", "cash", "700.00", "USD", "2026-06-18"));
        await CreateIncomeAsync(client, actor.RawSessionToken, IncomeJson("One-time bonus", "25.25", "USD", "one_time", "2026-06-20", null));
        await CreateIncomeAsync(client, actor.RawSessionToken, IncomeJson("HKD refund", "50.00", "HKD", "one_time", "2026-06-25", null));
        await CreateIncomeAsync(client, actor.RawSessionToken, IncomeJson("Recurring salary", "5000.00", "USD", "monthly", "2026-06-30", null));
        await CreateIncomeAsync(client, actor.RawSessionToken, IncomeJson("Biweekly stipend", "20.00", "USD", "biweekly", "2026-06-19", null, "2026-07-10"));
        await CreateIncomeAsync(client, actor.RawSessionToken, IncomeJson("Out of window", "40.00", "USD", "one_time", "2026-08-01", null));
        var archivedIncomeId = await CreateIncomeAsync(client, actor.RawSessionToken, IncomeJson("Archived bonus", "30.00", "USD", "one_time", "2026-06-20", null));
        var archivedRecurringIncomeId = await CreateIncomeAsync(client, actor.RawSessionToken, IncomeJson("Archived salary", "7000.00", "USD", "monthly", "2026-06-20", null));
        await CreateIncomeAsync(client, other.RawSessionToken, IncomeJson("Other bonus", "900.00", "USD", "one_time", "2026-06-20", null));

        using (var archiveAccountRequest = CreateBearerRequest(HttpMethod.Post, $"{AccountsPath}/{archivedAccountId:D}/archive", actor.RawSessionToken))
        using (var archiveAccountResponse = await client.SendAsync(archiveAccountRequest))
        {
            Assert.Equal(HttpStatusCode.OK, archiveAccountResponse.StatusCode);
        }

        using (var archiveIncomeRequest = CreateBearerRequest(HttpMethod.Post, $"{IncomePath}/{archivedIncomeId:D}/archive", actor.RawSessionToken))
        using (var archiveIncomeResponse = await client.SendAsync(archiveIncomeRequest))
        {
            Assert.Equal(HttpStatusCode.OK, archiveIncomeResponse.StatusCode);
        }

        using (var archiveRecurringIncomeRequest = CreateBearerRequest(HttpMethod.Post, $"{IncomePath}/{archivedRecurringIncomeId:D}/archive", actor.RawSessionToken))
        using (var archiveRecurringIncomeResponse = await client.SendAsync(archiveRecurringIncomeRequest))
        {
            Assert.Equal(HttpStatusCode.OK, archiveRecurringIncomeResponse.StatusCode);
        }

        await SeedFutureBillAsync(testFactory, actor.UserProfileId, "Utility", "75.25", "USD", "2026-06-30", ExpenseBillStatuses.Draft);
        await SeedFutureBillAsync(testFactory, actor.UserProfileId, "Rent", "300.00", "HKD", "2026-07-01", ExpenseBillStatuses.PendingConfirmation);
        await SeedFutureBillAsync(testFactory, actor.UserProfileId, "Cancelled", "99.00", "USD", "2026-06-30", ExpenseBillStatuses.Cancelled);
        await SeedFutureBillAsync(testFactory, actor.UserProfileId, "Archived", "88.00", "USD", "2026-06-30", ExpenseBillStatuses.Draft, archived: true);
        await SeedFutureBillAsync(testFactory, actor.UserProfileId, "Out of window", "77.00", "USD", "2026-08-30", ExpenseBillStatuses.Draft);
        await SeedFutureBillAsync(testFactory, other.UserProfileId, "Other", "600.00", "USD", "2026-06-30", ExpenseBillStatuses.Draft);
        await SeedRecurringBillTemplateAsync(testFactory, actor.UserProfileId, groupId: null, "Personal rent", "200.00", "USD", "2026-06-20");
        await SeedRecurringBillTemplateAsync(testFactory, actor.UserProfileId, groupId: null, "Paused personal", "999.00", "USD", "2026-06-20", status: RecurringBillTemplateStatuses.Paused);
        await SeedRecurringBillTemplateAsync(testFactory, actor.UserProfileId, groupId: null, "Archived personal", "888.00", "USD", "2026-06-20", archived: true);
        await SeedRecurringBillTemplateAsync(testFactory, other.UserProfileId, groupId: null, "Other recurring", "777.00", "USD", "2026-06-20");
        var groupId = await SeedGroupAsync(testFactory, actor.UserProfileId, "Shared Home", actor.UserProfileId, other.UserProfileId);
        await SeedFutureBillAsync(
            testFactory,
            actor.UserProfileId,
            "Group planned utility",
            "1000.00",
            "USD",
            "2026-06-30",
            ExpenseBillStatuses.Draft,
            groupId: groupId,
            participantUserProfileId: actor.UserProfileId,
            participantShareAmount: "400.00");
        await SeedFutureBillAsync(testFactory, actor.UserProfileId, "Group unsupported share", "111.00", "USD", "2026-06-30", ExpenseBillStatuses.Draft, groupId: groupId);
        await SeedRecurringBillTemplateAsync(
            testFactory,
            actor.UserProfileId,
            groupId,
            "Group rent",
            "600.00",
            "USD",
            "2026-06-20",
            actorShareUserProfileId: actor.UserProfileId,
            actorShareAmount: "250.00",
            otherShareUserProfileId: other.UserProfileId,
            otherShareAmount: "350.00");
        await SeedRecurringBillTemplateAsync(testFactory, actor.UserProfileId, groupId, "Group unsupported rent", "600.00", "USD", "2026-06-20");

        using var request = CreateBearerRequest(
            HttpMethod.Get,
            $"{SummaryPath}?windowStartDate=2026-06-18&windowEndDate=2026-07-18",
            actor.RawSessionToken);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal(WriteTimestamp, payload.RootElement.GetProperty("asOfUtc").GetDateTimeOffset());
        Assert.Equal("2026-06-18", payload.RootElement.GetProperty("windowStartDate").GetString());
        Assert.Equal("2026-07-18", payload.RootElement.GetProperty("windowEndDate").GetString());
        Assert.Contains("doesNotIncludeBankSync", payload.RootElement.GetProperty("warnings").EnumerateArray().Select(item => item.GetString()));
        Assert.Contains("includesSafeRecurringManualIncomeInWindow", payload.RootElement.GetProperty("warnings").EnumerateArray().Select(item => item.GetString()));
        Assert.Contains("includesPersonalRecurringBillProjectionInWindow", payload.RootElement.GetProperty("warnings").EnumerateArray().Select(item => item.GetString()));
        Assert.Contains("includesSafeGroupFutureBillProjectionInWindow", payload.RootElement.GetProperty("warnings").EnumerateArray().Select(item => item.GetString()));
        Assert.Contains("includesSafeGroupRecurringBillProjectionInWindow", payload.RootElement.GetProperty("warnings").EnumerateArray().Select(item => item.GetString()));
        Assert.Contains("groupFutureBillsPartiallyExcludedUnsupportedActorShare", payload.RootElement.GetProperty("warnings").EnumerateArray().Select(item => item.GetString()));
        Assert.Contains("groupRecurringBillsPartiallyExcludedUnsupportedActorShare", payload.RootElement.GetProperty("warnings").EnumerateArray().Select(item => item.GetString()));

        var rows = payload.RootElement.GetProperty("currencies").EnumerateArray().ToDictionary(row => row.GetProperty("currency").GetString()!);
        Assert.Equal(["HKD", "USD"], rows.Keys.OrderBy(key => key, StringComparer.Ordinal).ToArray());
        AssertSummaryRow(rows["USD"], "100.5", "25.25", "5040", "75.25", "400", "200", "250", "4240.5");
        AssertSummaryRow(rows["HKD"], "800", "50", "0", "300", "0", "0", "0", "550");
    }

    [Fact]
    public async Task SummaryExcludesInactiveArchivedAndOutOfWindowGroupProjectionRows()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Manual Finance Group Projection Actor");
        var other = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Manual Finance Group Projection Other");
        using var client = testFactory.CreateClient();

        var activeGroupId = await SeedGroupAsync(testFactory, actor.UserProfileId, "Active Group", actor.UserProfileId, other.UserProfileId);
        var removedGroupId = await SeedGroupAsync(testFactory, actor.UserProfileId, "Removed Group", actor.UserProfileId, other.UserProfileId);
        await SetGroupMembershipStatusAsync(testFactory, removedGroupId, actor.UserProfileId, GroupMembershipStatuses.Removed);

        await SeedFutureBillAsync(
            testFactory,
            actor.UserProfileId,
            "Included group future",
            "100.00",
            "USD",
            "2026-06-30",
            ExpenseBillStatuses.PendingConfirmation,
            groupId: activeGroupId,
            participantUserProfileId: actor.UserProfileId,
            participantShareAmount: "40.00");
        await SeedFutureBillAsync(
            testFactory,
            actor.UserProfileId,
            "Unsupported group future",
            "111.00",
            "USD",
            "2026-06-30",
            ExpenseBillStatuses.Draft,
            groupId: activeGroupId);
        await SeedFutureBillAsync(
            testFactory,
            actor.UserProfileId,
            "Archived group future",
            "999.00",
            "USD",
            "2026-06-30",
            ExpenseBillStatuses.Draft,
            archived: true,
            groupId: activeGroupId,
            participantUserProfileId: actor.UserProfileId,
            participantShareAmount: "999.00");
        await SeedFutureBillAsync(
            testFactory,
            actor.UserProfileId,
            "Cancelled group future",
            "999.00",
            "USD",
            "2026-06-30",
            ExpenseBillStatuses.Cancelled,
            groupId: activeGroupId,
            participantUserProfileId: actor.UserProfileId,
            participantShareAmount: "999.00");
        await SeedFutureBillAsync(
            testFactory,
            actor.UserProfileId,
            "Out-of-window group future",
            "999.00",
            "USD",
            "2026-08-01",
            ExpenseBillStatuses.Draft,
            groupId: activeGroupId,
            participantUserProfileId: actor.UserProfileId,
            participantShareAmount: "999.00");
        await SeedFutureBillAsync(
            testFactory,
            actor.UserProfileId,
            "Removed-member group future",
            "777.00",
            "USD",
            "2026-06-30",
            ExpenseBillStatuses.Draft,
            groupId: removedGroupId,
            participantUserProfileId: actor.UserProfileId,
            participantShareAmount: "777.00");

        await SeedRecurringBillTemplateAsync(
            testFactory,
            actor.UserProfileId,
            activeGroupId,
            "Included group recurring",
            "100.00",
            "USD",
            "2026-06-20",
            actorShareUserProfileId: actor.UserProfileId,
            actorShareAmount: "30.00",
            otherShareUserProfileId: other.UserProfileId,
            otherShareAmount: "70.00");
        await SeedRecurringBillTemplateAsync(testFactory, actor.UserProfileId, activeGroupId, "Unsupported group recurring", "100.00", "USD", "2026-06-20");
        await SeedRecurringBillTemplateAsync(
            testFactory,
            actor.UserProfileId,
            activeGroupId,
            "Paused group recurring",
            "999.00",
            "USD",
            "2026-06-20",
            status: RecurringBillTemplateStatuses.Paused,
            actorShareUserProfileId: actor.UserProfileId,
            actorShareAmount: "999.00");
        await SeedRecurringBillTemplateAsync(
            testFactory,
            actor.UserProfileId,
            activeGroupId,
            "Archived group recurring",
            "999.00",
            "USD",
            "2026-06-20",
            archived: true,
            actorShareUserProfileId: actor.UserProfileId,
            actorShareAmount: "999.00");
        await SeedRecurringBillTemplateAsync(
            testFactory,
            actor.UserProfileId,
            activeGroupId,
            "Out-of-window group recurring",
            "999.00",
            "USD",
            "2026-08-20",
            actorShareUserProfileId: actor.UserProfileId,
            actorShareAmount: "999.00");
        await SeedRecurringBillTemplateAsync(
            testFactory,
            actor.UserProfileId,
            removedGroupId,
            "Removed-member group recurring",
            "777.00",
            "USD",
            "2026-06-20",
            actorShareUserProfileId: actor.UserProfileId,
            actorShareAmount: "777.00");

        using var request = CreateBearerRequest(
            HttpMethod.Get,
            $"{SummaryPath}?windowStartDate=2026-06-18&windowEndDate=2026-07-18",
            actor.RawSessionToken);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var payload = JsonDocument.Parse(content);

        var row = Assert.Single(payload.RootElement.GetProperty("currencies").EnumerateArray());
        Assert.Equal("USD", row.GetProperty("currency").GetString());
        AssertSummaryRow(row, "0", "0", "0", "0", "40", "0", "30", "-70");
        Assert.Contains("groupFutureBillsPartiallyExcludedUnsupportedActorShare", payload.RootElement.GetProperty("warnings").EnumerateArray().Select(item => item.GetString()));
        Assert.Contains("groupRecurringBillsPartiallyExcludedUnsupportedActorShare", payload.RootElement.GetProperty("warnings").EnumerateArray().Select(item => item.GetString()));
    }

    [Fact]
    public async Task SummaryHandlesEmptyDataAndInvalidWindowSafely()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Manual Finance Empty Summary Actor");
        using var client = testFactory.CreateClient();

        using var emptyRequest = CreateBearerRequest(HttpMethod.Get, SummaryPath, actor.RawSessionToken);
        using var emptyResponse = await client.SendAsync(emptyRequest);
        Assert.Equal(HttpStatusCode.OK, emptyResponse.StatusCode);
        using var emptyPayload = JsonDocument.Parse(await emptyResponse.Content.ReadAsStringAsync());
        Assert.Empty(emptyPayload.RootElement.GetProperty("currencies").EnumerateArray());
        Assert.Equal("2026-06-18", emptyPayload.RootElement.GetProperty("windowStartDate").GetString());
        Assert.Equal("2026-08-17", emptyPayload.RootElement.GetProperty("windowEndDate").GetString());

        using var invalidRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"{SummaryPath}?windowStartDate=2026-07-01&windowEndDate=2026-06-30",
            actor.RawSessionToken);
        using var invalidResponse = await client.SendAsync(invalidRequest);
        var invalidContent = await invalidResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, invalidResponse.StatusCode);
        Assert.Contains("Window end date must be on or after window start date.", invalidContent);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new EndpointTestTimeProvider(InitialTimestamp);
        var testFactory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<SettleoraDbContext>();
                services.RemoveAll<DbContextOptions>();
                services.RemoveAll<DbContextOptions<SettleoraDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<SettleoraDbContext>>();
                services.AddDbContext<SettleoraDbContext>(options => options.UseInMemoryDatabase(databaseName));
                services.RemoveAll<TimeProvider>();
                services.AddSingleton<TimeProvider>(timeProvider);
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static async Task<Guid> CreateAccountAsync(HttpClient client, string rawSessionToken, string json)
    {
        using var request = CreateJsonRequest(HttpMethod.Post, AccountsPath, rawSessionToken, json);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.Created, content);
        using var payload = JsonDocument.Parse(content);
        return payload.RootElement.GetProperty("id").GetGuid();
    }

    private static async Task<Guid> CreateIncomeAsync(HttpClient client, string rawSessionToken, string json)
    {
        using var request = CreateJsonRequest(HttpMethod.Post, IncomePath, rawSessionToken, json);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.Created, content);
        using var payload = JsonDocument.Parse(content);
        return payload.RootElement.GetProperty("id").GetGuid();
    }

    private static async Task<List<ManualFinancialAccount>> LoadAccountsAsync(
        WebApplicationFactory<Program> testFactory,
        Guid ownerUserProfileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        return await dbContext.Set<ManualFinancialAccount>()
            .AsNoTracking()
            .Where(account => account.OwnerUserProfileId == ownerUserProfileId)
            .OrderBy(account => account.CreatedAtUtc)
            .ToListAsync();
    }

    private static async Task<List<ManualIncomeSource>> LoadIncomeSourcesAsync(
        WebApplicationFactory<Program> testFactory,
        Guid ownerUserProfileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        return await dbContext.Set<ManualIncomeSource>()
            .AsNoTracking()
            .Where(income => income.OwnerUserProfileId == ownerUserProfileId)
            .OrderBy(income => income.CreatedAtUtc)
            .ToListAsync();
    }

    private static async Task SeedFutureBillAsync(
        WebApplicationFactory<Program> testFactory,
        Guid ownerUserProfileId,
        string merchantName,
        string amount,
        string currency,
        string dueDate,
        string status,
        bool archived = false,
        Guid? groupId = null,
        Guid? participantUserProfileId = null,
        string? participantShareAmount = null)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var bill = new ExpenseBill
        {
            Id = Guid.NewGuid(),
            CreatedByUserProfileId = ownerUserProfileId,
            BillOwnerUserProfileId = ownerUserProfileId,
            GroupId = groupId,
            MerchantName = merchantName,
            BillDate = DateOnly.Parse(dueDate),
            Status = status,
            TotalAmount = decimal.Parse(amount, CultureInfo.InvariantCulture),
            TotalCurrency = currency,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            ArchivedAtUtc = archived ? InitialTimestamp : null
        };
        if (participantUserProfileId is not null && participantShareAmount is not null)
        {
            bill.Participants.Add(new ExpenseBillParticipant
            {
                ExpenseBillId = bill.Id,
                UserProfileId = participantUserProfileId.Value,
                Status = ExpenseBillParticipantStatuses.PendingAcceptance,
                ResolvedShareAmount = decimal.Parse(participantShareAmount, CultureInfo.InvariantCulture),
                ResolvedShareCurrency = currency,
                CreatedAtUtc = InitialTimestamp,
                UpdatedAtUtc = InitialTimestamp
            });
        }

        dbContext.Set<ExpenseBill>().Add(bill);
        await dbContext.SaveChangesAsync();
    }

    private static async Task<Guid> SeedGroupAsync(
        WebApplicationFactory<Program> testFactory,
        Guid createdByUserProfileId,
        string name,
        params Guid[] memberUserProfileIds)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var groupId = Guid.NewGuid();
        dbContext.Set<UserGroup>().Add(new UserGroup
        {
            Id = groupId,
            Name = name,
            CreatedByUserProfileId = createdByUserProfileId,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });

        foreach (var memberUserProfileId in memberUserProfileIds)
        {
            dbContext.Set<GroupMembership>().Add(new GroupMembership
            {
                GroupId = groupId,
                UserProfileId = memberUserProfileId,
                Role = memberUserProfileId == createdByUserProfileId ? GroupMembershipRoles.Owner : GroupMembershipRoles.Member,
                Status = GroupMembershipStatuses.Active,
                CreatedAtUtc = InitialTimestamp,
                UpdatedAtUtc = InitialTimestamp
            });
        }

        await dbContext.SaveChangesAsync();
        return groupId;
    }

    private static async Task SetGroupMembershipStatusAsync(
        WebApplicationFactory<Program> testFactory,
        Guid groupId,
        Guid userProfileId,
        string status)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var membership = await dbContext.Set<GroupMembership>().SingleAsync(item =>
            item.GroupId == groupId
            && item.UserProfileId == userProfileId);
        membership.Status = status;
        membership.UpdatedAtUtc = InitialTimestamp;
        await dbContext.SaveChangesAsync();
    }

    private static async Task SeedRecurringBillTemplateAsync(
        WebApplicationFactory<Program> testFactory,
        Guid ownerUserProfileId,
        Guid? groupId,
        string merchantName,
        string amount,
        string currency,
        string startDate,
        string status = RecurringBillTemplateStatuses.Active,
        bool archived = false,
        Guid? actorShareUserProfileId = null,
        string? actorShareAmount = null,
        Guid? otherShareUserProfileId = null,
        string? otherShareAmount = null)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var parsedAmount = decimal.Parse(amount, CultureInfo.InvariantCulture);
        var splits = new List<RecurringBillTemplatePayloadItemSplit>();
        if (actorShareUserProfileId is not null && actorShareAmount is not null)
        {
            splits.Add(new RecurringBillTemplatePayloadItemSplit(
                actorShareUserProfileId.Value,
                ExpenseBillItemSplitMethods.ExactAmount,
                decimal.Parse(actorShareAmount, CultureInfo.InvariantCulture),
                0));
        }

        if (otherShareUserProfileId is not null && otherShareAmount is not null)
        {
            splits.Add(new RecurringBillTemplatePayloadItemSplit(
                otherShareUserProfileId.Value,
                ExpenseBillItemSplitMethods.ExactAmount,
                decimal.Parse(otherShareAmount, CultureInfo.InvariantCulture),
                1));
        }

        var payload = new RecurringBillTemplatePayload(
            currency,
            [new RecurringBillTemplatePayloadItem("Seed recurring item", null, parsedAmount, currency, splits)],
            [],
            []);
        dbContext.Set<RecurringBillTemplate>().Add(new RecurringBillTemplate
        {
            Id = Guid.NewGuid(),
            OwnerUserProfileId = ownerUserProfileId,
            CreatedByUserProfileId = ownerUserProfileId,
            GroupId = groupId,
            MerchantName = merchantName,
            ScheduleType = RecurringBillScheduleTypes.Monthly,
            IntervalCount = 1,
            StartDate = DateOnly.Parse(startDate, CultureInfo.InvariantCulture),
            NextOccurrenceDate = DateOnly.Parse(startDate, CultureInfo.InvariantCulture),
            Status = status,
            PayloadVersion = 1,
            PayloadJson = RecurringBillTemplatePayloadCodec.Serialize(payload),
            ForecastAmount = parsedAmount,
            ForecastCurrency = currency,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            ArchivedAtUtc = archived ? InitialTimestamp : null
        });
        await dbContext.SaveChangesAsync();
    }

    private static void AssertSummaryRow(
        JsonElement row,
        string accountTotal,
        string incomeTotal,
        string recurringIncomeTotal,
        string obligationTotal,
        string groupObligationTotal,
        string recurringObligationTotal,
        string groupRecurringObligationTotal,
        string availableTotal)
    {
        Assert.Equal(accountTotal, row.GetProperty("activeManualAccountBalanceTotal").GetString());
        Assert.Equal(incomeTotal, row.GetProperty("expectedManualIncomeTotal").GetString());
        Assert.Equal(recurringIncomeTotal, row.GetProperty("recurringExpectedManualIncomeTotal").GetString());
        Assert.Equal(obligationTotal, row.GetProperty("upcomingOneTimeFutureBillObligationTotal").GetString());
        Assert.Equal(groupObligationTotal, row.GetProperty("groupOneTimeFutureBillObligationTotal").GetString());
        Assert.Equal(recurringObligationTotal, row.GetProperty("recurringObligationEstimateTotal").GetString());
        Assert.Equal(groupRecurringObligationTotal, row.GetProperty("groupRecurringObligationEstimateTotal").GetString());
        Assert.Equal(availableTotal, row.GetProperty("estimatedAvailableAmount").GetString());
        Assert.Contains("doesNotConvertCurrency", row.GetProperty("warnings").EnumerateArray().Select(item => item.GetString()));
        Assert.Contains("includesSafeRecurringManualIncomeInWindow", row.GetProperty("warnings").EnumerateArray().Select(item => item.GetString()));
        Assert.Contains("includesPersonalRecurringBillProjectionInWindow", row.GetProperty("warnings").EnumerateArray().Select(item => item.GetString()));
        Assert.Contains("includesSafeGroupFutureBillProjectionInWindow", row.GetProperty("warnings").EnumerateArray().Select(item => item.GetString()));
        Assert.Contains("includesSafeGroupRecurringBillProjectionInWindow", row.GetProperty("warnings").EnumerateArray().Select(item => item.GetString()));
    }

    private static async Task<SeededSession> SeedSessionActorAsync(
        WebApplicationFactory<Program> testFactory,
        EndpointTestTimeProvider timeProvider,
        string displayName)
    {
        timeProvider.SetUtcNow(InitialTimestamp);
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();
        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = displayName,
            DefaultCurrency = "USD",
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<AuthAccount>().Add(new AuthAccount
        {
            Id = authAccountId,
            UserProfileId = userProfileId,
            Status = AuthAccountStatuses.Active,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<SystemRoleAssignment>().Add(new SystemRoleAssignment
        {
            AuthAccountId = authAccountId,
            Role = SystemRoles.User,
            AssignedAtUtc = InitialTimestamp
        });
        await dbContext.SaveChangesAsync();

        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                authAccountId,
                DeviceLabel: "Manual finance endpoint test",
                UserAgentSummary: "Manual finance endpoint test",
                NetworkAddressHash: $"manual-finance-{userProfileId:N}",
                RequestedLifetime: TimeSpan.FromHours(1)));

        Assert.True(sessionCreationResult.Succeeded);
        timeProvider.SetUtcNow(WriteTimestamp);
        return new SeededSession(authAccountId, userProfileId, sessionCreationResult.RawSessionToken!);
    }

    private static string AccountJson(string displayName, string accountType, string amount, string currency, string balanceAsOfDate)
    {
        return JsonSerializer.Serialize(new
        {
            displayName,
            accountType,
            currentBalanceAmount = amount,
            currency,
            balanceAsOfDate,
            note = "note"
        });
    }

    private static string IncomeJson(
        string displayName,
        string amount,
        string currency,
        string cadence,
        string nextExpectedDate,
        Guid? manualFinancialAccountId,
        string? endDate = null,
        string? note = "note")
    {
        return JsonSerializer.Serialize(new
        {
            displayName,
            amount,
            currency,
            cadence,
            nextExpectedDate,
            endDate,
            manualFinancialAccountId,
            note
        });
    }

    private static HttpRequestMessage CreateBearerRequest(HttpMethod method, string path, string rawSessionToken)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new("Bearer", rawSessionToken);
        return request;
    }

    private static HttpRequestMessage CreateJsonRequest(HttpMethod method, string path, string rawSessionToken, string json)
    {
        var request = CreateBearerRequest(method, path, rawSessionToken);
        request.Content = new StringContent(json, Encoding.UTF8, "application/json");
        return request;
    }

    private sealed record SeededSession(Guid AuthAccountId, Guid UserProfileId, string RawSessionToken);

    private sealed record FactoryTestContext(WebApplicationFactory<Program> Factory, EndpointTestTimeProvider TimeProvider);

    private sealed class EndpointTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public EndpointTestTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow()
        {
            return utcNow;
        }

        public void SetUtcNow(DateTimeOffset value)
        {
            utcNow = value;
        }
    }
}
