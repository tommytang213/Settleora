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
using Settleora.Api.Domain.Users;
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
        await CreateIncomeAsync(client, actor.RawSessionToken, IncomeJson("Out of window", "40.00", "USD", "one_time", "2026-08-01", null));
        var archivedIncomeId = await CreateIncomeAsync(client, actor.RawSessionToken, IncomeJson("Archived bonus", "30.00", "USD", "one_time", "2026-06-20", null));
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

        await SeedFutureBillAsync(testFactory, actor.UserProfileId, "Utility", "75.25", "USD", "2026-06-30", ExpenseBillStatuses.Draft);
        await SeedFutureBillAsync(testFactory, actor.UserProfileId, "Rent", "300.00", "HKD", "2026-07-01", ExpenseBillStatuses.PendingConfirmation);
        await SeedFutureBillAsync(testFactory, actor.UserProfileId, "Cancelled", "99.00", "USD", "2026-06-30", ExpenseBillStatuses.Cancelled);
        await SeedFutureBillAsync(testFactory, actor.UserProfileId, "Archived", "88.00", "USD", "2026-06-30", ExpenseBillStatuses.Draft, archived: true);
        await SeedFutureBillAsync(testFactory, actor.UserProfileId, "Out of window", "77.00", "USD", "2026-08-30", ExpenseBillStatuses.Draft);
        await SeedFutureBillAsync(testFactory, other.UserProfileId, "Other", "600.00", "USD", "2026-06-30", ExpenseBillStatuses.Draft);

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
        Assert.Contains("recurringForecastNotIncluded", payload.RootElement.GetProperty("warnings").EnumerateArray().Select(item => item.GetString()));

        var rows = payload.RootElement.GetProperty("currencies").EnumerateArray().ToDictionary(row => row.GetProperty("currency").GetString()!);
        Assert.Equal(["HKD", "USD"], rows.Keys.OrderBy(key => key, StringComparer.Ordinal).ToArray());
        AssertSummaryRow(rows["USD"], "100.5", "25.25", "75.25", "50.5");
        AssertSummaryRow(rows["HKD"], "800", "50", "300", "550");
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

    private static async Task SeedFutureBillAsync(
        WebApplicationFactory<Program> testFactory,
        Guid ownerUserProfileId,
        string merchantName,
        string amount,
        string currency,
        string dueDate,
        string status,
        bool archived = false)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        dbContext.Set<ExpenseBill>().Add(new ExpenseBill
        {
            Id = Guid.NewGuid(),
            CreatedByUserProfileId = ownerUserProfileId,
            BillOwnerUserProfileId = ownerUserProfileId,
            MerchantName = merchantName,
            BillDate = DateOnly.Parse(dueDate),
            Status = status,
            TotalAmount = decimal.Parse(amount, CultureInfo.InvariantCulture),
            TotalCurrency = currency,
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
        string obligationTotal,
        string availableTotal)
    {
        Assert.Equal(accountTotal, row.GetProperty("activeManualAccountBalanceTotal").GetString());
        Assert.Equal(incomeTotal, row.GetProperty("expectedManualIncomeTotal").GetString());
        Assert.Equal(obligationTotal, row.GetProperty("upcomingOneTimeFutureBillObligationTotal").GetString());
        Assert.Equal("0", row.GetProperty("recurringObligationEstimateTotal").GetString());
        Assert.Equal(availableTotal, row.GetProperty("estimatedAvailableAmount").GetString());
        Assert.Contains("doesNotConvertCurrency", row.GetProperty("warnings").EnumerateArray().Select(item => item.GetString()));
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
