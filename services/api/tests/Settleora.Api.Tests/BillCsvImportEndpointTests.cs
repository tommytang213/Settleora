using System.Net;
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
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class BillCsvImportEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string PersonalImportPath = "/api/v1/bills/import.csv";
    private const string PersonalImportPreflightPath = "/api/v1/bills/import-preflight.csv";
    private const string BillCsvImportedAction = "bill.csv_imported";
    private const string WrongRawToken = "visible-wrong-bill-csv-import-session-token";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 17, 8, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 17, 8, 15, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 5, 17, 8, 30, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public BillCsvImportEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task PersonalCsvImportCreatesActorOnlyDraftBillWithoutEchoingRawCsvText()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Personal CSV Actor");
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        var csv = $$"""
            clientBillKey,merchantName,billDate,currency,itemName,itemAmount,itemNote,payerUserProfileId,splitUserProfileId,splitMethod,splitBasisValue
            personal-1,=Formula Shop,2026-05-17,USD,Lunch,10.00,=private note,,,,
            personal-1,=Formula Shop,2026-05-17,USD,Tea,2.50,,{{actorSession.UserProfileId:D}},{{actorSession.UserProfileId:D}},exact_amount,2.50
            """;
        using var request = CreateCsvRequest(
            HttpMethod.Post,
            PersonalImportPath,
            actorSession.RawSessionToken,
            csv);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain("Formula Shop", content);
        Assert.DoesNotContain("Lunch", content);
        Assert.DoesNotContain("private note", content);
        Assert.DoesNotContain(actorSession.RawSessionToken, content);

        using var payload = JsonDocument.Parse(content);
        var root = payload.RootElement;
        Assert.Equal(2, root.GetProperty("rowCount").GetInt32());
        Assert.Equal(1, root.GetProperty("importedBillCount").GetInt32());
        Assert.Equal(0, root.GetProperty("rejectedRowCount").GetInt32());
        Assert.Empty(root.GetProperty("errors").EnumerateArray());

        var billSummary = Assert.Single(root.GetProperty("bills").EnumerateArray());
        var billId = billSummary.GetProperty("billId").GetGuid();
        Assert.Equal(JsonValueKind.Null, billSummary.GetProperty("groupId").ValueKind);
        Assert.Equal("2026-05-17", billSummary.GetProperty("billDate").GetString());
        Assert.Equal(ExpenseBillStatuses.Draft, billSummary.GetProperty("status").GetString());
        Assert.Equal("12.5", billSummary.GetProperty("totalAmount").GetString());
        Assert.Equal("USD", billSummary.GetProperty("totalCurrency").GetString());
        Assert.Equal(2, billSummary.GetProperty("itemCount").GetInt32());
        Assert.Equal(1, billSummary.GetProperty("participantCount").GetInt32());
        Assert.Equal(1, billSummary.GetProperty("payerCount").GetInt32());

        var bill = await ReadBillAsync(testFactory, billId);
        Assert.Null(bill.GroupId);
        Assert.Equal(actorSession.UserProfileId, bill.CreatedByUserProfileId);
        Assert.Equal(actorSession.UserProfileId, bill.BillOwnerUserProfileId);
        Assert.Equal("=Formula Shop", bill.MerchantName);
        Assert.Equal(12.5m, bill.TotalAmount);
        Assert.Equal(2, bill.Items.Count);
        Assert.All(bill.Items.SelectMany(item => item.Splits), split => Assert.Equal(actorSession.UserProfileId, split.UserProfileId));
        var payer = Assert.Single(bill.Payers);
        Assert.Equal(actorSession.UserProfileId, payer.UserProfileId);
        Assert.Equal(12.5m, payer.Amount);

        var auditEvent = Assert.Single(await ReadImportAuditEventsAsync(testFactory));
        Assert.Equal(BillCsvImportedAction, auditEvent.Action);
        Assert.Equal(actorSession.AuthAccountId, auditEvent.ActorAuthAccountId);
        Assert.Equal(actorSession.AuthAccountId, auditEvent.SubjectAuthAccountId);
        Assert.Equal(AuthAuditOutcomes.Success, auditEvent.Outcome);
        Assert.Equal(WriteTimestamp, auditEvent.OccurredAtUtc);
        Assert.Contains(billId.ToString("D"), auditEvent.SafeMetadataJson ?? string.Empty, StringComparison.Ordinal);
        AssertSafeAuditContent(
            auditEvent,
            actorSession.RawSessionToken,
            "Formula Shop",
            "Lunch",
            "private note");
    }

    [Fact]
    public async Task PersonalCsvImportRejectsCrossUserProfileReferencesWithoutCreatingBills()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Personal CSV Owner");
        var other = await SeedAccountAsync(testFactory, "Cross User", InitialTimestamp.AddMinutes(1));
        using var client = testFactory.CreateClient();
        var csv = $$"""
            clientBillKey,billDate,currency,itemName,itemAmount,payerUserProfileId,splitUserProfileId
            personal-cross,2026-05-17,USD,Lunch,10.00,{{actorSession.UserProfileId:D}},{{other.UserProfileId:D}}
            """;
        using var request = CreateCsvRequest(
            HttpMethod.Post,
            PersonalImportPath,
            actorSession.RawSessionToken,
            csv);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain(other.UserProfileId.ToString("D"), content);
        using var payload = JsonDocument.Parse(content);
        var root = payload.RootElement;
        Assert.Equal(1, root.GetProperty("rowCount").GetInt32());
        Assert.Equal(0, root.GetProperty("importedBillCount").GetInt32());
        Assert.Equal(1, root.GetProperty("rejectedRowCount").GetInt32());

        var error = Assert.Single(root.GetProperty("errors").EnumerateArray());
        Assert.Equal(2, error.GetProperty("rowNumber").GetInt32());
        Assert.Equal("splitUserProfileId", error.GetProperty("field").GetString());
        Assert.Equal("personal_profile_mismatch", error.GetProperty("code").GetString());

        await AssertNoBillsCreatedByAsync(testFactory, actorSession.UserProfileId);
        Assert.Empty(await ReadImportAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task PersonalCsvPreflightReturnsReviewWithoutCreatingBillsOrEchoingRawCsvText()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Personal CSV Preflight Actor");
        using var client = testFactory.CreateClient();
        var csv = $$"""
            clientBillKey,merchantName,billDate,currency,itemName,itemAmount,itemNote,payerUserProfileId,splitUserProfileId,splitMethod,splitBasisValue
            personal-preview,Private Merchant,2026-05-17,USD,Secret Lunch,10.00,private note,,,,
            personal-preview,Private Merchant,2026-05-17,USD,Secret Tea,2.50,,{{actorSession.UserProfileId:D}},{{actorSession.UserProfileId:D}},exact_amount,2.50
            """;
        using var request = CreateCsvRequest(
            HttpMethod.Post,
            PersonalImportPreflightPath,
            actorSession.RawSessionToken,
            csv);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain("Private Merchant", content);
        Assert.DoesNotContain("Secret Lunch", content);
        Assert.DoesNotContain("Secret Tea", content);
        Assert.DoesNotContain("private note", content);
        Assert.DoesNotContain(actorSession.RawSessionToken, content);

        using var payload = JsonDocument.Parse(content);
        var root = payload.RootElement;
        Assert.Equal("personal", root.GetProperty("scope").GetString());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("groupId").ValueKind);
        Assert.True(root.GetProperty("available").GetBoolean());
        Assert.Equal("ready_for_review", root.GetProperty("statusCode").GetString());
        Assert.Equal(2, root.GetProperty("rowCount").GetInt32());
        Assert.Equal(2, root.GetProperty("acceptedRowCount").GetInt32());
        Assert.Equal(0, root.GetProperty("warningRowCount").GetInt32());
        Assert.Equal(0, root.GetProperty("rejectedRowCount").GetInt32());
        Assert.Equal("Review import", root.GetProperty("confirmation").GetProperty("reviewLabel").GetString());
        Assert.Equal("Import bills", root.GetProperty("confirmation").GetProperty("confirmLabel").GetString());

        var reviewItems = root.GetProperty("reviewItems").EnumerateArray().ToArray();
        Assert.Equal(2, reviewItems.Length);
        Assert.All(reviewItems, item =>
        {
            Assert.Equal("accepted", item.GetProperty("state").GetString());
            Assert.Equal("info", item.GetProperty("severity").GetString());
            Assert.Contains(
                item.GetProperty("codes").EnumerateArray(),
                code => code.GetString() == "row_accepted");
            Assert.NotEqual(JsonValueKind.Null, item.GetProperty("normalizedCandidate").ValueKind);
            Assert.Equal("USD", item.GetProperty("normalizedCandidate").GetProperty("currency").GetString());
        });

        await AssertNoBillsCreatedByAsync(testFactory, actorSession.UserProfileId);
        Assert.Empty(await ReadImportAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task GroupCsvImportCreatesDraftBillForActiveMembers()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group CSV Actor");
        var member = await SeedAccountAsync(testFactory, "Group CSV Member", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "CSV Group",
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(member.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        var csv = $$"""
            clientBillKey,merchantName,billDate,currency,itemName,itemAmount,itemNote,payerUserProfileId,splitUserProfileId,splitMethod,splitBasisValue
            group-1,Night Market,2026-05-17,USD,Dinner,7.00,,{{actorSession.UserProfileId:D}},{{actorSession.UserProfileId:D}},exact_amount,7.00
            group-1,Night Market,2026-05-17,USD,Dessert,5.00,,{{member.UserProfileId:D}},{{member.UserProfileId:D}},exact_amount,5.00
            """;
        using var request = CreateCsvRequest(
            HttpMethod.Post,
            GroupImportPath(groupId),
            actorSession.RawSessionToken,
            csv);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var payload = JsonDocument.Parse(content);
        var root = payload.RootElement;
        Assert.Equal(2, root.GetProperty("rowCount").GetInt32());
        Assert.Equal(1, root.GetProperty("importedBillCount").GetInt32());
        Assert.Equal(0, root.GetProperty("rejectedRowCount").GetInt32());
        Assert.Empty(root.GetProperty("errors").EnumerateArray());

        var billSummary = Assert.Single(root.GetProperty("bills").EnumerateArray());
        var billId = billSummary.GetProperty("billId").GetGuid();
        Assert.Equal(groupId, billSummary.GetProperty("groupId").GetGuid());
        Assert.Equal("12", billSummary.GetProperty("totalAmount").GetString());
        Assert.Equal(2, billSummary.GetProperty("participantCount").GetInt32());
        Assert.Equal(2, billSummary.GetProperty("payerCount").GetInt32());

        var bill = await ReadBillAsync(testFactory, billId);
        Assert.Equal(groupId, bill.GroupId);
        Assert.Equal(actorSession.UserProfileId, bill.CreatedByUserProfileId);
        Assert.Equal("Night Market", bill.MerchantName);
        Assert.Equal(12m, bill.TotalAmount);
        Assert.Equal(2, bill.Items.Count);
        var participantIds = bill.Participants.Select(participant => participant.UserProfileId).Order().ToArray();
        var expectedParticipantIds = new[] { actorSession.UserProfileId, member.UserProfileId }.Order().ToArray();
        Assert.Equal(expectedParticipantIds, participantIds);
        var payerAmounts = bill.Payers.ToDictionary(payer => payer.UserProfileId, payer => payer.Amount);
        Assert.Equal(7m, payerAmounts[actorSession.UserProfileId]);
        Assert.Equal(5m, payerAmounts[member.UserProfileId]);

        var auditEvent = Assert.Single(await ReadImportAuditEventsAsync(testFactory));
        Assert.Equal(BillCsvImportedAction, auditEvent.Action);
        Assert.Equal(actorSession.AuthAccountId, auditEvent.ActorAuthAccountId);
        Assert.Equal(actorSession.AuthAccountId, auditEvent.SubjectAuthAccountId);
        Assert.Contains(groupId.ToString("D"), auditEvent.SafeMetadataJson ?? string.Empty, StringComparison.Ordinal);
        AssertSafeAuditContent(
            auditEvent,
            actorSession.RawSessionToken,
            "Night Market",
            "Dinner",
            "Dessert");
    }

    [Fact]
    public async Task GroupCsvImportRejectsUnavailableMembersWithoutPartialWrites()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group CSV Owner");
        var outside = await SeedAccountAsync(testFactory, "Outside CSV User", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Reject CSV Group",
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        using var client = testFactory.CreateClient();
        var csv = $$"""
            clientBillKey,billDate,currency,itemName,itemAmount,payerUserProfileId,splitUserProfileId,splitMethod,splitBasisValue
            group-invalid,2026-05-17,USD,Valid Item,5.00,{{actorSession.UserProfileId:D}},{{actorSession.UserProfileId:D}},exact_amount,5.00
            group-invalid,2026-05-17,USD,Hidden Item,5.00,{{actorSession.UserProfileId:D}},{{outside.UserProfileId:D}},exact_amount,5.00
            """;
        using var request = CreateCsvRequest(
            HttpMethod.Post,
            GroupImportPath(groupId),
            actorSession.RawSessionToken,
            csv);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain(outside.UserProfileId.ToString("D"), content);
        Assert.DoesNotContain("Hidden Item", content);
        using var payload = JsonDocument.Parse(content);
        var root = payload.RootElement;
        Assert.Equal(2, root.GetProperty("rowCount").GetInt32());
        Assert.Equal(0, root.GetProperty("importedBillCount").GetInt32());
        Assert.Equal(1, root.GetProperty("rejectedRowCount").GetInt32());
        Assert.Empty(root.GetProperty("bills").EnumerateArray());

        var error = Assert.Single(root.GetProperty("errors").EnumerateArray());
        Assert.Equal(3, error.GetProperty("rowNumber").GetInt32());
        Assert.Equal("splitUserProfileId", error.GetProperty("field").GetString());
        Assert.Equal("group_member_unavailable", error.GetProperty("code").GetString());

        await AssertNoBillsCreatedByAsync(testFactory, actorSession.UserProfileId);
        Assert.Empty(await ReadImportAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task GroupCsvPreflightRejectsUnavailableMembersWithoutCreatingBillsOrEchoingHiddenData()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group CSV Preflight Owner");
        var outside = await SeedAccountAsync(testFactory, "Outside CSV Preflight User", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Preflight CSV Group",
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        using var client = testFactory.CreateClient();
        var csv = $$"""
            clientBillKey,billDate,currency,itemName,itemAmount,payerUserProfileId,splitUserProfileId,splitMethod,splitBasisValue
            group-preview,2026-05-17,USD,Visible Item,5.00,{{actorSession.UserProfileId:D}},{{actorSession.UserProfileId:D}},exact_amount,5.00
            group-preview,2026-05-17,USD,Hidden Item,5.00,{{actorSession.UserProfileId:D}},{{outside.UserProfileId:D}},exact_amount,5.00
            """;
        using var request = CreateCsvRequest(
            HttpMethod.Post,
            GroupImportPreflightPath(groupId),
            actorSession.RawSessionToken,
            csv);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain(outside.UserProfileId.ToString("D"), content);
        Assert.DoesNotContain("Hidden Item", content);
        using var payload = JsonDocument.Parse(content);
        var root = payload.RootElement;
        Assert.Equal("group", root.GetProperty("scope").GetString());
        Assert.Equal(groupId, root.GetProperty("groupId").GetGuid());
        Assert.False(root.GetProperty("available").GetBoolean());
        Assert.Equal("needs_correction", root.GetProperty("statusCode").GetString());
        Assert.Equal(2, root.GetProperty("rowCount").GetInt32());
        Assert.Equal(0, root.GetProperty("acceptedRowCount").GetInt32());
        Assert.Equal(1, root.GetProperty("rejectedRowCount").GetInt32());

        var reviewItem = Assert.Single(root.GetProperty("reviewItems").EnumerateArray());
        Assert.Equal(3, reviewItem.GetProperty("rowNumber").GetInt32());
        Assert.Equal("rejected", reviewItem.GetProperty("state").GetString());
        Assert.Equal("error", reviewItem.GetProperty("severity").GetString());
        Assert.Contains(
            reviewItem.GetProperty("codes").EnumerateArray(),
            code => code.GetString() == "group_member_unavailable");
        Assert.Equal(JsonValueKind.Null, reviewItem.GetProperty("normalizedCandidate").ValueKind);

        await AssertNoBillsCreatedByAsync(testFactory, actorSession.UserProfileId);
        Assert.Empty(await ReadImportAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task GroupCsvPreflightRequiresServerSideGroupAuthorization()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group CSV Unauthorized Actor");
        var groupOwner = await SeedAccountAsync(testFactory, "Hidden Group Owner", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            groupOwner.UserProfileId,
            "Hidden CSV Group",
            new MembershipSeed(groupOwner.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        using var client = testFactory.CreateClient();
        using var request = CreateCsvRequest(
            HttpMethod.Post,
            GroupImportPreflightPath(groupId),
            actorSession.RawSessionToken,
            "clientBillKey,billDate,currency,itemName,itemAmount\nhidden,2026-05-17,USD,Secret,10.00");

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain("Hidden CSV Group", content);
        Assert.DoesNotContain(groupOwner.UserProfileId.ToString("D"), content);
        Assert.DoesNotContain("Secret", content);
        await AssertNoBillsCreatedByAsync(testFactory, actorSession.UserProfileId);
        Assert.Empty(await ReadImportAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task PersonalCsvPreflightRejectsInvalidOversizedAndTooManyRowsSafely()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "CSV Preflight Invalid Actor");
        using var client = testFactory.CreateClient();

        using var invalidContentTypeRequest = new HttpRequestMessage(HttpMethod.Post, PersonalImportPreflightPath);
        invalidContentTypeRequest.Headers.TryAddWithoutValidation("Authorization", $"Bearer {actorSession.RawSessionToken}");
        invalidContentTypeRequest.Content = new StringContent("{\"secret\":\"raw\"}", Encoding.UTF8, "application/json");
        using var invalidContentTypeResponse = await client.SendAsync(invalidContentTypeRequest);
        var invalidContentTypeBody = await invalidContentTypeResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, invalidContentTypeResponse.StatusCode);
        Assert.DoesNotContain("raw", invalidContentTypeBody);

        using var oversizedRequest = CreateCsvRequest(
            HttpMethod.Post,
            PersonalImportPreflightPath,
            actorSession.RawSessionToken,
            new string('x', 65537));
        using var oversizedResponse = await client.SendAsync(oversizedRequest);
        Assert.Equal(HttpStatusCode.BadRequest, oversizedResponse.StatusCode);

        var rows = Enumerable
            .Range(0, 101)
            .Select(index => $"row-{index},2026-05-17,USD,Item,1.00");
        var tooManyRowsCsv = "clientBillKey,billDate,currency,itemName,itemAmount\n" + string.Join("\n", rows);
        using var tooManyRowsRequest = CreateCsvRequest(
            HttpMethod.Post,
            PersonalImportPreflightPath,
            actorSession.RawSessionToken,
            tooManyRowsCsv);
        using var tooManyRowsResponse = await client.SendAsync(tooManyRowsRequest);
        var tooManyRowsContent = await tooManyRowsResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, tooManyRowsResponse.StatusCode);
        Assert.DoesNotContain("row-100", tooManyRowsContent);

        await AssertNoBillsCreatedByAsync(testFactory, actorSession.UserProfileId);
        Assert.Empty(await ReadImportAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task MissingOrInvalidSessionReturnsUniformUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "CSV Auth Actor");
        using var client = testFactory.CreateClient();

        using var missingRequest = new HttpRequestMessage(HttpMethod.Post, PersonalImportPath)
        {
            Content = new StringContent("clientBillKey,billDate,currency,itemName,itemAmount", Encoding.UTF8, "text/csv")
        };
        using var missingResponse = await client.SendAsync(missingRequest);
        await AssertUnauthenticatedProblemAsync(missingResponse);

        using var invalidRequest = CreateCsvRequest(
            HttpMethod.Post,
            PersonalImportPath,
            WrongRawToken,
            "clientBillKey,billDate,currency,itemName,itemAmount");
        using var invalidResponse = await client.SendAsync(invalidRequest);
        await AssertUnauthenticatedProblemAsync(invalidResponse, WrongRawToken);

        using var preflightRequest = CreateCsvRequest(
            HttpMethod.Post,
            PersonalImportPreflightPath,
            WrongRawToken,
            "clientBillKey,billDate,currency,itemName,itemAmount");
        using var preflightResponse = await client.SendAsync(preflightRequest);
        await AssertUnauthenticatedProblemAsync(preflightResponse, WrongRawToken);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new BillCsvImportTestTimeProvider(InitialTimestamp);
        var testFactory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<SettleoraDbContext>();
                services.RemoveAll<DbContextOptions>();
                services.RemoveAll<DbContextOptions<SettleoraDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<SettleoraDbContext>>();
                services.AddDbContext<SettleoraDbContext>(options =>
                {
                    options.UseInMemoryDatabase(databaseName);
                });

                services.RemoveAll<TimeProvider>();
                services.AddSingleton<TimeProvider>(timeProvider);
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static async Task<SeededSession> SeedSessionActorAsync(
        WebApplicationFactory<Program> testFactory,
        BillCsvImportTestTimeProvider timeProvider,
        string displayName)
    {
        var account = await SeedAccountAsync(testFactory, displayName, InitialTimestamp);
        return await SeedSessionForAccountAsync(testFactory, timeProvider, account);
    }

    private static async Task<SeededAccount> SeedAccountAsync(
        WebApplicationFactory<Program> testFactory,
        string displayName,
        DateTimeOffset createdAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = displayName,
            DefaultCurrency = "USD",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });
        dbContext.Set<AuthAccount>().Add(new AuthAccount
        {
            Id = authAccountId,
            UserProfileId = userProfileId,
            Status = AuthAccountStatuses.Active,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });

        await dbContext.SaveChangesAsync();
        return new SeededAccount(authAccountId, userProfileId);
    }

    private static async Task<SeededSession> SeedSessionForAccountAsync(
        WebApplicationFactory<Program> testFactory,
        BillCsvImportTestTimeProvider timeProvider,
        SeededAccount account)
    {
        timeProvider.SetUtcNow(InitialTimestamp);
        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Bill CSV import endpoint test",
                UserAgentSummary: "Bill CSV import endpoint test user agent",
                NetworkAddressHash: "bill-csv-import-endpoint-test-network",
                RequestedLifetime: TimeSpan.FromHours(1)));

        Assert.True(sessionCreationResult.Succeeded);
        Assert.NotNull(sessionCreationResult.AuthSessionId);
        Assert.NotNull(sessionCreationResult.RawSessionToken);

        timeProvider.SetUtcNow(ValidationTimestamp);
        return new SeededSession(
            account.AuthAccountId,
            account.UserProfileId,
            sessionCreationResult.AuthSessionId.Value,
            sessionCreationResult.RawSessionToken);
    }

    private static async Task<Guid> SeedGroupAsync(
        WebApplicationFactory<Program> testFactory,
        Guid creatorProfileId,
        string name,
        params MembershipSeed[] memberships)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var groupId = Guid.NewGuid();

        dbContext.Set<UserGroup>().Add(new UserGroup
        {
            Id = groupId,
            Name = name,
            CreatedByUserProfileId = creatorProfileId,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });

        foreach (var membership in memberships)
        {
            dbContext.Set<GroupMembership>().Add(new GroupMembership
            {
                GroupId = groupId,
                UserProfileId = membership.UserProfileId,
                Role = membership.Role,
                Status = membership.Status,
                CreatedAtUtc = InitialTimestamp,
                UpdatedAtUtc = InitialTimestamp
            });
        }

        await dbContext.SaveChangesAsync();
        return groupId;
    }

    private static async Task<ExpenseBill> ReadBillAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ExpenseBill>()
            .Include(bill => bill.Items)
                .ThenInclude(item => item.Splits)
            .Include(bill => bill.Participants)
            .Include(bill => bill.Payers)
            .Include(bill => bill.Adjustments)
            .SingleAsync(bill => bill.Id == billId);
    }

    private static async Task AssertNoBillsCreatedByAsync(
        WebApplicationFactory<Program> testFactory,
        Guid userProfileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var billCount = await dbContext.Set<ExpenseBill>()
            .CountAsync(bill => bill.CreatedByUserProfileId == userProfileId);

        Assert.Equal(0, billCount);
    }

    private static async Task<IReadOnlyList<AuthAuditEvent>> ReadImportAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthAuditEvent>()
            .AsNoTracking()
            .Where(auditEvent => auditEvent.Action == BillCsvImportedAction)
            .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
            .ThenBy(auditEvent => auditEvent.Id)
            .ToArrayAsync();
    }

    private static void AssertSafeAuditContent(
        AuthAuditEvent auditEvent,
        params string[] forbiddenValues)
    {
        var auditText = string.Join(
            "\n",
            auditEvent.Action,
            auditEvent.Outcome,
            auditEvent.SafeMetadataJson ?? string.Empty);
        var lowerAuditText = auditText.ToLowerInvariant();

        foreach (var forbiddenValue in forbiddenValues)
        {
            Assert.DoesNotContain(forbiddenValue, auditText);
        }

        Assert.DoesNotContain("merchant", lowerAuditText);
        Assert.DoesNotContain("itemname", lowerAuditText);
        Assert.DoesNotContain("note", lowerAuditText);
        Assert.DoesNotContain("payment", lowerAuditText);
        Assert.DoesNotContain("method", lowerAuditText);
        Assert.DoesNotContain("label", lowerAuditText);
        Assert.DoesNotContain("request", lowerAuditText);
        Assert.DoesNotContain("body", lowerAuditText);
        Assert.DoesNotContain("auth", lowerAuditText);
        Assert.DoesNotContain("session", lowerAuditText);
        Assert.DoesNotContain("credential", lowerAuditText);
        Assert.DoesNotContain("token", lowerAuditText);
        Assert.DoesNotContain("hash", lowerAuditText);
        Assert.DoesNotContain("password", lowerAuditText);
        Assert.DoesNotContain("provider", lowerAuditText);
        Assert.DoesNotContain("payload", lowerAuditText);
        Assert.DoesNotContain("storage", lowerAuditText);
        Assert.DoesNotContain("path", lowerAuditText);
        Assert.DoesNotContain("file", lowerAuditText);
        Assert.DoesNotContain("object", lowerAuditText);
        Assert.DoesNotContain("vault", lowerAuditText);
        Assert.DoesNotContain("ocr", lowerAuditText);
    }

    private static HttpRequestMessage CreateCsvRequest(
        HttpMethod method,
        string path,
        string rawSessionToken,
        string csv)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");
        request.Content = new StringContent(csv, Encoding.UTF8, "text/csv");
        return request;
    }

    private static string GroupImportPath(Guid groupId)
    {
        return $"/api/v1/groups/{groupId:D}/bills/import.csv";
    }

    private static string GroupImportPreflightPath(Guid groupId)
    {
        return $"/api/v1/groups/{groupId:D}/bills/import-preflight.csv";
    }

    private static async Task AssertUnauthenticatedProblemAsync(
        HttpResponseMessage response,
        string? unexpectedResponseText = null)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain(WrongRawToken, content);
        if (unexpectedResponseText is not null)
        {
            Assert.DoesNotContain(unexpectedResponseText, content);
        }

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Unauthenticated", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(401, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "Authentication is required to access this resource.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        BillCsvImportTestTimeProvider TimeProvider);

    private sealed record SeededAccount(
        Guid AuthAccountId,
        Guid UserProfileId);

    private sealed record SeededSession(
        Guid AuthAccountId,
        Guid UserProfileId,
        Guid AuthSessionId,
        string RawSessionToken);

    private sealed record MembershipSeed(
        Guid UserProfileId,
        string Role,
        string Status);

    private sealed class BillCsvImportTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public BillCsvImportTestTimeProvider(DateTimeOffset utcNow)
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
