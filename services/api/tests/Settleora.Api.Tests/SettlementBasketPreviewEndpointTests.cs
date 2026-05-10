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
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Storage;

namespace Settleora.Api.Tests;

public sealed class SettlementBasketPreviewEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string HiddenMerchantName = "Hidden Basket Merchant";
    private const string HiddenItemName = "Hidden Basket Item";
    private const string HiddenPaymentMethodLabel = "Hidden basket payment method";
    private const string HiddenPaymentHandle = "hidden-basket-payment-handle";
    private const string HiddenPaymentNote = "hidden basket payment note";
    private const string HiddenStorageObjectKey = "hidden/basket/storage-object-key";
    private const string HiddenOriginalFilename = "hidden-basket-qr.png";
    private const string HiddenAuditMetadata = """{"requestBody":"hidden basket raw body","paymentHandle":"hidden basket handle","storageObjectKey":"hidden basket object"}""";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 10, 9, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 10, 10, 46, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public SettlementBasketPreviewEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task PersonalOutgoingPreviewReturnsSortedEligibleLinesAndIsReadOnly()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Basket Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Basket Creditor", InitialTimestamp.AddMinutes(1));
        var unrelated = await SeedAccountAsync(testFactory, "Hidden Unrelated Basket User", InitialTimestamp.AddMinutes(2));
        await SeedPaymentProfileWithQrAsync(testFactory, creditor.UserProfileId, InitialTimestamp.AddMinutes(3));
        await SeedHiddenAuditEventAsync(testFactory, actorSession.AuthAccountId, InitialTimestamp.AddMinutes(4));

        var laterBillId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(actorSession.UserProfileId, 12m),
                new ParticipantSeed(creditor.UserProfileId, 12m)
            ],
            [new PayerSeed(creditor.UserProfileId, 24m)],
            ExpenseBillStatuses.Confirmed,
            "USD",
            InitialTimestamp.AddMinutes(20));
        var revisionId = await SeedAcceptedAppliedRevisionAsync(
            testFactory,
            laterBillId,
            creditor.UserProfileId,
            InitialTimestamp.AddMinutes(21));
        await SeedPendingRevisionAsync(
            testFactory,
            laterBillId,
            creditor.UserProfileId,
            InitialTimestamp.AddMinutes(22));

        var earlierBillId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(actorSession.UserProfileId, 5m),
                new ParticipantSeed(creditor.UserProfileId, 5m)
            ],
            [new PayerSeed(creditor.UserProfileId, 10m)],
            ExpenseBillStatuses.Confirmed,
            "USD",
            InitialTimestamp.AddMinutes(10));

        var duplicateBillId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(actorSession.UserProfileId, 7m),
                new ParticipantSeed(creditor.UserProfileId, 7m)
            ],
            [new PayerSeed(creditor.UserProfileId, 14m)],
            ExpenseBillStatuses.Confirmed,
            "USD",
            InitialTimestamp.AddMinutes(15));
        await SeedSettlementRequestAsync(
            testFactory,
            duplicateBillId,
            groupId: null,
            actorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            7m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(16));

        await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(actorSession.UserProfileId, 9m),
                new ParticipantSeed(creditor.UserProfileId, 9m)
            ],
            [new PayerSeed(creditor.UserProfileId, 18m)],
            ExpenseBillStatuses.Confirmed,
            "HKD",
            InitialTimestamp.AddMinutes(17));
        await SeedBillAsync(
            testFactory,
            unrelated.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(unrelated.UserProfileId, 11m),
                new ParticipantSeed(creditor.UserProfileId, 11m)
            ],
            [new PayerSeed(creditor.UserProfileId, 22m)],
            ExpenseBillStatuses.Confirmed,
            "USD",
            InitialTimestamp.AddMinutes(18));
        await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(actorSession.UserProfileId, 4m),
                new ParticipantSeed(creditor.UserProfileId, 4m)
            ],
            [new PayerSeed(creditor.UserProfileId, 8m)],
            ExpenseBillStatuses.PendingConfirmation,
            "USD",
            InitialTimestamp.AddMinutes(19));

        var beforeCounts = await ReadPreviewSideEffectCountsAsync(testFactory);
        using var client = testFactory.CreateClient();
        using var request = CreatePreviewRequest(
            actorSession.RawSessionToken,
            new
            {
                counterpartyUserProfileId = creditor.UserProfileId,
                direction = SettlementBalanceDirections.Outgoing,
                currency = "USD",
                groupId = (Guid?)null,
                selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
            });

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        AssertSafePreviewResponseContent(
            content,
            unrelated.UserProfileId.ToString("D"),
            duplicateBillId.ToString("D"),
            HiddenMerchantName,
            HiddenItemName,
            HiddenPaymentMethodLabel,
            HiddenPaymentHandle,
            HiddenPaymentNote,
            HiddenStorageObjectKey,
            HiddenOriginalFilename,
            "requestBody");

        using var payload = JsonDocument.Parse(content);
        AssertBasketPreviewShape(payload.RootElement);
        Assert.Equal(ValidationTimestamp, payload.RootElement.GetProperty("generatedAtUtc").GetDateTimeOffset());
        Assert.Equal(SettlementBasketSelectionModes.PayAllOutstandingForCounterparty, payload.RootElement.GetProperty("selectionMode").GetString());
        Assert.Equal(SettlementBalanceDirections.Outgoing, payload.RootElement.GetProperty("direction").GetString());
        Assert.Equal(actorSession.UserProfileId, payload.RootElement.GetProperty("debtorUserProfileId").GetGuid());
        Assert.Equal(creditor.UserProfileId, payload.RootElement.GetProperty("creditorUserProfileId").GetGuid());
        Assert.Equal(creditor.UserProfileId, payload.RootElement.GetProperty("counterpartyUserProfileId").GetGuid());
        Assert.Equal(JsonValueKind.Null, payload.RootElement.GetProperty("groupId").ValueKind);
        Assert.Equal("USD", payload.RootElement.GetProperty("currency").GetString());
        Assert.Equal("17", payload.RootElement.GetProperty("exactSelectedTotal").GetString());
        Assert.Equal(2, payload.RootElement.GetProperty("lineCount").GetInt32());

        var lines = payload.RootElement.GetProperty("lines").EnumerateArray().ToArray();
        Assert.Equal(earlierBillId, lines[0].GetProperty("sourceExpenseBillId").GetGuid());
        Assert.Equal(JsonValueKind.Null, lines[0].GetProperty("sourceBillRevisionId").ValueKind);
        Assert.Equal("5", lines[0].GetProperty("exactAmount").GetString());
        Assert.Equal(InitialTimestamp.AddMinutes(10), lines[0].GetProperty("createdAtUtc").GetDateTimeOffset());
        Assert.Equal(laterBillId, lines[1].GetProperty("sourceExpenseBillId").GetGuid());
        Assert.Equal(revisionId, lines[1].GetProperty("sourceBillRevisionId").GetGuid());
        Assert.Equal("12", lines[1].GetProperty("exactAmount").GetString());
        Assert.All(
            lines,
            line =>
            {
                AssertBasketPreviewLineShape(line);
                Assert.StartsWith($"bill:{line.GetProperty("sourceExpenseBillId").GetGuid():D}:", line.GetProperty("sourceCandidateKey").GetString(), StringComparison.Ordinal);
                Assert.Equal("USD", line.GetProperty("currency").GetString());
                Assert.Equal(SettlementCandidateDerivationService.BasisConfirmedBillNetPositionV1, line.GetProperty("candidateBasis").GetString());
            });
        Assert.Equal(beforeCounts, await ReadPreviewSideEffectCountsAsync(testFactory));
    }

    [Fact]
    public async Task IncomingDirectionTreatsCurrentActorAsCreditor()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Basket Incoming Creditor");
        var debtor = await SeedAccountAsync(testFactory, "Basket Incoming Debtor", InitialTimestamp.AddMinutes(1));
        await SeedBillAsync(
            testFactory,
            creditorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtor.UserProfileId, 13m),
                new ParticipantSeed(creditorSession.UserProfileId, 13m)
            ],
            [new PayerSeed(creditorSession.UserProfileId, 26m)],
            ExpenseBillStatuses.Confirmed,
            "USD",
            InitialTimestamp.AddMinutes(2));

        using var client = testFactory.CreateClient();
        using var request = CreatePreviewRequest(
            creditorSession.RawSessionToken,
            new
            {
                counterpartyUserProfileId = debtor.UserProfileId,
                direction = SettlementBalanceDirections.Incoming,
                currency = "USD",
                selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
            });

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal(SettlementBalanceDirections.Incoming, payload.RootElement.GetProperty("direction").GetString());
        Assert.Equal(debtor.UserProfileId, payload.RootElement.GetProperty("debtorUserProfileId").GetGuid());
        Assert.Equal(creditorSession.UserProfileId, payload.RootElement.GetProperty("creditorUserProfileId").GetGuid());
        Assert.Equal("13", payload.RootElement.GetProperty("exactSelectedTotal").GetString());
        Assert.Equal(1, payload.RootElement.GetProperty("lineCount").GetInt32());
    }

    [Fact]
    public async Task EmptyPreviewReturnsZeroWhenNoEligibleLinesExist()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Empty Basket Actor");
        var counterparty = await SeedAccountAsync(testFactory, "Empty Basket Counterparty", InitialTimestamp.AddMinutes(1));

        using var client = testFactory.CreateClient();
        using var request = CreatePreviewRequest(
            actorSession.RawSessionToken,
            new
            {
                counterpartyUserProfileId = counterparty.UserProfileId,
                direction = SettlementBalanceDirections.Outgoing,
                currency = "USD",
                selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
            });

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("0", payload.RootElement.GetProperty("exactSelectedTotal").GetString());
        Assert.Equal(0, payload.RootElement.GetProperty("lineCount").GetInt32());
        Assert.Empty(payload.RootElement.GetProperty("lines").EnumerateArray());
    }

    [Fact]
    public async Task GroupPreviewRequiresActiveActorAndCounterpartyVisibility()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Basket Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Group Basket Creditor", InitialTimestamp.AddMinutes(1));
        var membershipOnly = await SeedAccountAsync(testFactory, "Group Basket Membership Only", InitialTimestamp.AddMinutes(2));
        var removedCounterparty = await SeedAccountAsync(testFactory, "Removed Group Basket Counterparty", InitialTimestamp.AddMinutes(3));
        var nonMemberSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Non Member Group Basket Actor");
        var groupId = await SeedGroupAsync(
            testFactory,
            creditor.UserProfileId,
            "Visible Basket Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(creditor.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(membershipOnly.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(removedCounterparty.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed));
        await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId,
            [
                new ParticipantSeed(actorSession.UserProfileId, 30m),
                new ParticipantSeed(creditor.UserProfileId, 30m)
            ],
            [new PayerSeed(creditor.UserProfileId, 60m)],
            ExpenseBillStatuses.Confirmed,
            "USD",
            InitialTimestamp.AddMinutes(5));
        await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId,
            [
                new ParticipantSeed(membershipOnly.UserProfileId, 8m),
                new ParticipantSeed(creditor.UserProfileId, 8m)
            ],
            [new PayerSeed(creditor.UserProfileId, 16m)],
            ExpenseBillStatuses.Confirmed,
            "USD",
            InitialTimestamp.AddMinutes(6));

        using var client = testFactory.CreateClient();
        using var visibleRequest = CreatePreviewRequest(
            actorSession.RawSessionToken,
            new
            {
                counterpartyUserProfileId = creditor.UserProfileId,
                direction = SettlementBalanceDirections.Outgoing,
                currency = "USD",
                groupId,
                selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
            });
        using var visibleResponse = await client.SendAsync(visibleRequest);
        var visibleContent = await visibleResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, visibleResponse.StatusCode);
        Assert.DoesNotContain(membershipOnly.UserProfileId.ToString("D"), visibleContent, StringComparison.Ordinal);
        using (var payload = JsonDocument.Parse(visibleContent))
        {
            Assert.Equal(groupId, payload.RootElement.GetProperty("groupId").GetGuid());
            Assert.Equal("30", payload.RootElement.GetProperty("exactSelectedTotal").GetString());
            Assert.Equal(1, payload.RootElement.GetProperty("lineCount").GetInt32());
        }

        using var removedCounterpartyRequest = CreatePreviewRequest(
            actorSession.RawSessionToken,
            new
            {
                counterpartyUserProfileId = removedCounterparty.UserProfileId,
                direction = SettlementBalanceDirections.Outgoing,
                currency = "USD",
                groupId,
                selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
            });
        using var removedCounterpartyResponse = await client.SendAsync(removedCounterpartyRequest);
        await AssertBasketPreviewUnavailableProblemAsync(removedCounterpartyResponse);

        using var nonMemberRequest = CreatePreviewRequest(
            nonMemberSession.RawSessionToken,
            new
            {
                counterpartyUserProfileId = creditor.UserProfileId,
                direction = SettlementBalanceDirections.Outgoing,
                currency = "USD",
                groupId,
                selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
            });
        using var nonMemberResponse = await client.SendAsync(nonMemberRequest);
        await AssertBasketPreviewUnavailableProblemAsync(nonMemberResponse);
    }

    [Fact]
    public async Task InvalidPreviewRequestsReturnBoundedValidationProblems()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Invalid Basket Actor");
        var counterparty = await SeedAccountAsync(testFactory, "Invalid Basket Counterparty", InitialTimestamp.AddMinutes(1));
        using var client = testFactory.CreateClient();

        var invalidCases = new[]
        {
            new InvalidRequestCase(
                JsonSerializer.Serialize(new
                {
                    counterpartyUserProfileId = counterparty.UserProfileId,
                    direction = SettlementBalanceDirections.Outgoing,
                    currency = "USD",
                    selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty,
                    amount = "12.34"
                }),
                "body",
                "Unsupported fields are not allowed."),
            new InvalidRequestCase(
                JsonSerializer.Serialize(new
                {
                    counterpartyUserProfileId = "not-a-uuid",
                    direction = SettlementBalanceDirections.Outgoing,
                    currency = "USD",
                    selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
                }),
                "counterpartyUserProfileId",
                "Counterparty user profile ID must be a UUID."),
            new InvalidRequestCase(
                JsonSerializer.Serialize(new
                {
                    counterpartyUserProfileId = counterparty.UserProfileId,
                    direction = "sideways",
                    currency = "USD",
                    selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
                }),
                "direction",
                "Direction must be outgoing or incoming."),
            new InvalidRequestCase(
                JsonSerializer.Serialize(new
                {
                    counterpartyUserProfileId = counterparty.UserProfileId,
                    direction = SettlementBalanceDirections.Outgoing,
                    currency = "usd",
                    selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
                }),
                "currency",
                "Currency must be an uppercase supported three-letter code."),
            new InvalidRequestCase(
                JsonSerializer.Serialize(new
                {
                    counterpartyUserProfileId = counterparty.UserProfileId,
                    direction = SettlementBalanceDirections.Outgoing,
                    currency = "ZZZ",
                    selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
                }),
                "currency",
                "Currency must be an uppercase supported three-letter code."),
            new InvalidRequestCase(
                JsonSerializer.Serialize(new
                {
                    counterpartyUserProfileId = counterparty.UserProfileId,
                    direction = SettlementBalanceDirections.Outgoing,
                    currency = "USD",
                    groupId = "not-a-uuid",
                    selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
                }),
                "groupId",
                "Group ID must be a UUID or null."),
            new InvalidRequestCase(
                JsonSerializer.Serialize(new
                {
                    counterpartyUserProfileId = counterparty.UserProfileId,
                    direction = SettlementBalanceDirections.Outgoing,
                    currency = "USD",
                    selectionMode = "select_all_visible"
                }),
                "selectionMode",
                "Selection mode must be pay_all_outstanding_for_counterparty."),
            new InvalidRequestCase(
                "{}",
                "counterpartyUserProfileId",
                "Counterparty user profile ID is required."),
            new InvalidRequestCase(
                "{",
                "body",
                "A JSON object body is required.")
        };

        foreach (var invalidCase in invalidCases)
        {
            using var request = CreateRawPreviewRequest(actorSession.RawSessionToken, invalidCase.Json);
            using var response = await client.SendAsync(request);

            await AssertInvalidBasketPreviewProblemAsync(response, invalidCase.ExpectedField, invalidCase.ExpectedMessage);
        }

        using var sameActorRequest = CreatePreviewRequest(
            actorSession.RawSessionToken,
            new
            {
                counterpartyUserProfileId = actorSession.UserProfileId,
                direction = SettlementBalanceDirections.Outgoing,
                currency = "USD",
                selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
            });
        using var sameActorResponse = await client.SendAsync(sameActorRequest);
        await AssertInvalidBasketPreviewProblemAsync(
            sameActorResponse,
            "counterpartyUserProfileId",
            "Counterparty user profile ID must identify another profile.");
    }

    [Fact]
    public async Task UnauthenticatedPreviewRequiresBearerSession()
    {
        var counterpartyUserProfileId = Guid.NewGuid();
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, BasketPreviewPath())
        {
            Content = JsonContent(new
            {
                counterpartyUserProfileId,
                direction = SettlementBalanceDirections.Outgoing,
                currency = "USD",
                selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
            })
        };

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response);
    }

    [Fact]
    public async Task PersonalOutgoingBasketCreatePersistsMultipleOrderedLinesAndBoundedAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Basket Create Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Basket Create Creditor", InitialTimestamp.AddMinutes(1));

        var laterBillId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(actorSession.UserProfileId, 12m),
                new ParticipantSeed(creditor.UserProfileId, 12m)
            ],
            [new PayerSeed(creditor.UserProfileId, 24m)],
            ExpenseBillStatuses.Confirmed,
            "USD",
            InitialTimestamp.AddMinutes(20));
        var revisionId = await SeedAcceptedAppliedRevisionAsync(
            testFactory,
            laterBillId,
            creditor.UserProfileId,
            InitialTimestamp.AddMinutes(21));
        await SeedPendingRevisionAsync(
            testFactory,
            laterBillId,
            creditor.UserProfileId,
            InitialTimestamp.AddMinutes(22));

        var earlierBillId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(actorSession.UserProfileId, 5m),
                new ParticipantSeed(creditor.UserProfileId, 5m)
            ],
            [new PayerSeed(creditor.UserProfileId, 10m)],
            ExpenseBillStatuses.Confirmed,
            "USD",
            InitialTimestamp.AddMinutes(10));

        var duplicateBillId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(actorSession.UserProfileId, 7m),
                new ParticipantSeed(creditor.UserProfileId, 7m)
            ],
            [new PayerSeed(creditor.UserProfileId, 14m)],
            ExpenseBillStatuses.Confirmed,
            "USD",
            InitialTimestamp.AddMinutes(15));
        await SeedSettlementRequestAsync(
            testFactory,
            duplicateBillId,
            groupId: null,
            actorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            7m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(16));

        await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(actorSession.UserProfileId, 9m),
                new ParticipantSeed(creditor.UserProfileId, 9m)
            ],
            [new PayerSeed(creditor.UserProfileId, 18m)],
            ExpenseBillStatuses.Confirmed,
            "HKD",
            InitialTimestamp.AddMinutes(17));
        await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(actorSession.UserProfileId, 4m),
                new ParticipantSeed(creditor.UserProfileId, 4m)
            ],
            [new PayerSeed(creditor.UserProfileId, 8m)],
            ExpenseBillStatuses.PendingConfirmation,
            "USD",
            InitialTimestamp.AddMinutes(18));

        var beforeCounts = await ReadPreviewSideEffectCountsAsync(testFactory);
        using var client = testFactory.CreateClient();
        using var request = CreateCreateRequest(
            actorSession.RawSessionToken,
            new
            {
                counterpartyUserProfileId = creditor.UserProfileId,
                direction = SettlementBalanceDirections.Outgoing,
                currency = "USD",
                selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
            });

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeBasketCreateResponseContent(content, duplicateBillId.ToString("D"), HiddenMerchantName, HiddenItemName);

        using var payload = JsonDocument.Parse(content);
        AssertSettlementRequestResponseShape(payload.RootElement);
        var settlementId = payload.RootElement.GetProperty("id").GetGuid();
        Assert.NotEqual(Guid.Empty, settlementId);
        Assert.Equal(earlierBillId, payload.RootElement.GetProperty("sourceExpenseBillId").GetGuid());
        Assert.Equal(JsonValueKind.Null, payload.RootElement.GetProperty("groupId").ValueKind);
        Assert.Equal(actorSession.UserProfileId, payload.RootElement.GetProperty("debtorUserProfileId").GetGuid());
        Assert.Equal(creditor.UserProfileId, payload.RootElement.GetProperty("creditorUserProfileId").GetGuid());
        Assert.Equal("17", payload.RootElement.GetProperty("amount").GetString());
        Assert.Equal("USD", payload.RootElement.GetProperty("currency").GetString());
        Assert.Equal(SettlementRequestStatuses.Requested, payload.RootElement.GetProperty("status").GetString());
        Assert.Equal(actorSession.UserProfileId, payload.RootElement.GetProperty("requestedByUserProfileId").GetGuid());
        Assert.Equal(ValidationTimestamp, payload.RootElement.GetProperty("requestedAtUtc").GetDateTimeOffset());

        var lines = payload.RootElement.GetProperty("lines").EnumerateArray().ToArray();
        Assert.Equal(2, lines.Length);
        AssertSettlementRequestLineResponseShape(lines[0]);
        AssertSettlementRequestLineResponseShape(lines[1]);
        Assert.Equal(earlierBillId, lines[0].GetProperty("sourceExpenseBillId").GetGuid());
        Assert.Equal(JsonValueKind.Null, lines[0].GetProperty("sourceBillRevisionId").ValueKind);
        Assert.Equal("5", lines[0].GetProperty("exactAmount").GetString());
        Assert.Equal(0, lines[0].GetProperty("allocationOrder").GetInt32());
        Assert.Equal(laterBillId, lines[1].GetProperty("sourceExpenseBillId").GetGuid());
        Assert.Equal(revisionId, lines[1].GetProperty("sourceBillRevisionId").GetGuid());
        Assert.Equal("12", lines[1].GetProperty("exactAmount").GetString());
        Assert.Equal(1, lines[1].GetProperty("allocationOrder").GetInt32());
        Assert.All(lines, line =>
        {
            Assert.Equal("USD", line.GetProperty("currency").GetString());
            Assert.Equal(SettlementRequestLineStatuses.Open, line.GetProperty("status").GetString());
            Assert.StartsWith($"bill:{line.GetProperty("sourceExpenseBillId").GetGuid():D}:", line.GetProperty("sourceCandidateKey").GetString(), StringComparison.Ordinal);
        });

        var persisted = await ReadBasketCreateStateAsync(testFactory);
        Assert.Equal(beforeCounts.SettlementRequestCount + 1, persisted.Requests.Count);
        var createdRequest = persisted.Requests.Single(candidate => candidate.Id == settlementId);
        Assert.Equal(17m, createdRequest.Amount);
        Assert.Equal(earlierBillId, createdRequest.SourceExpenseBillId);
        Assert.Equal(beforeCounts.SettlementRequestLineCount + 2, persisted.RequestLines.Count);
        Assert.Equal([0, 1], createdRequest.Lines.OrderBy(line => line.AllocationOrder).Select(line => line.AllocationOrder).ToArray());
        Assert.Empty(persisted.Payments);
        Assert.Empty(persisted.PaymentAllocations);
        Assert.Empty(persisted.Residuals);
        Assert.Empty(persisted.ProofAttachments);
        Assert.Equal(beforeCounts.FileObjectCount, persisted.MutationCounts.FileObjectCount);
        Assert.Equal(beforeCounts.UserPaymentProfileCount, persisted.MutationCounts.UserPaymentProfileCount);

        var auditEvent = Assert.Single(persisted.BasketAuditEvents);
        Assert.Equal("settlement.basket_created", auditEvent.Action);
        Assert.Equal(AuthAuditOutcomes.Success, auditEvent.Outcome);
        AssertBoundedBasketCreateAuditMetadata(
            auditEvent.SafeMetadataJson,
            settlementId,
            earlierBillId,
            groupId: null,
            "personal",
            actorSession.UserProfileId,
            creditor.UserProfileId,
            "17",
            "USD");
    }

    [Fact]
    public async Task GroupIncomingBasketCreateUsesCurrentActorAsCreditor()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Basket Create Creditor");
        var debtor = await SeedAccountAsync(testFactory, "Group Basket Create Debtor", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            creditorSession.UserProfileId,
            "Basket Create Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(creditorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(debtor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var billId = await SeedBillAsync(
            testFactory,
            creditorSession.UserProfileId,
            groupId,
            [
                new ParticipantSeed(debtor.UserProfileId, 30m),
                new ParticipantSeed(creditorSession.UserProfileId, 30m)
            ],
            [new PayerSeed(creditorSession.UserProfileId, 60m)],
            ExpenseBillStatuses.Confirmed,
            "USD",
            InitialTimestamp.AddMinutes(2));

        using var client = testFactory.CreateClient();
        using var request = CreateCreateRequest(
            creditorSession.RawSessionToken,
            new
            {
                counterpartyUserProfileId = debtor.UserProfileId,
                direction = SettlementBalanceDirections.Incoming,
                currency = "USD",
                groupId,
                selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
            });

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal(groupId, payload.RootElement.GetProperty("groupId").GetGuid());
        Assert.Equal(debtor.UserProfileId, payload.RootElement.GetProperty("debtorUserProfileId").GetGuid());
        Assert.Equal(creditorSession.UserProfileId, payload.RootElement.GetProperty("creditorUserProfileId").GetGuid());
        Assert.Equal(creditorSession.UserProfileId, payload.RootElement.GetProperty("requestedByUserProfileId").GetGuid());
        Assert.Equal("30", payload.RootElement.GetProperty("amount").GetString());
        var line = Assert.Single(payload.RootElement.GetProperty("lines").EnumerateArray());
        Assert.Equal(billId, line.GetProperty("sourceExpenseBillId").GetGuid());
        Assert.Equal(0, line.GetProperty("allocationOrder").GetInt32());
    }

    [Fact]
    public async Task EmptyBasketCreateReturnsConflictAndCreatesNoRows()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Empty Create Actor");
        var counterparty = await SeedAccountAsync(testFactory, "Empty Create Counterparty", InitialTimestamp.AddMinutes(1));
        var beforeCounts = await ReadPreviewSideEffectCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var request = CreateCreateRequest(
            actorSession.RawSessionToken,
            new
            {
                counterpartyUserProfileId = counterparty.UserProfileId,
                direction = SettlementBalanceDirections.Outgoing,
                currency = "USD",
                selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
            });

        using var response = await client.SendAsync(request);

        await AssertSettlementBasketConflictProblemAsync(response);
        Assert.Equal(beforeCounts, await ReadPreviewSideEffectCountsAsync(testFactory));
    }

    [Fact]
    public async Task InvalidAndUnauthenticatedBasketCreateRequestsAreRejectedWithoutMutation()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Invalid Create Actor");
        var counterparty = await SeedAccountAsync(testFactory, "Invalid Create Counterparty", InitialTimestamp.AddMinutes(1));
        var beforeCounts = await ReadPreviewSideEffectCountsAsync(testFactory);
        using var client = testFactory.CreateClient();

        var invalidCases = new[]
        {
            new InvalidRequestCase(
                JsonSerializer.Serialize(new
                {
                    counterpartyUserProfileId = counterparty.UserProfileId,
                    direction = SettlementBalanceDirections.Outgoing,
                    currency = "USD",
                    selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty,
                    amount = "12.34"
                }),
                "body",
                "Unsupported fields are not allowed."),
            new InvalidRequestCase(
                JsonSerializer.Serialize(new
                {
                    counterpartyUserProfileId = "not-a-uuid",
                    direction = SettlementBalanceDirections.Outgoing,
                    currency = "USD",
                    selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
                }),
                "counterpartyUserProfileId",
                "Counterparty user profile ID must be a UUID."),
            new InvalidRequestCase(
                JsonSerializer.Serialize(new
                {
                    counterpartyUserProfileId = counterparty.UserProfileId,
                    direction = "sideways",
                    currency = "USD",
                    selectionMode = "manual_lines"
                }),
                "selectionMode",
                "Selection mode must be pay_all_outstanding_for_counterparty."),
            new InvalidRequestCase(
                JsonSerializer.Serialize(new
                {
                    counterpartyUserProfileId = actorSession.UserProfileId,
                    direction = SettlementBalanceDirections.Outgoing,
                    currency = "USD",
                    selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
                }),
                "counterpartyUserProfileId",
                "Counterparty user profile ID must identify another profile.")
        };

        foreach (var invalidCase in invalidCases)
        {
            using var request = CreateRawCreateRequest(actorSession.RawSessionToken, invalidCase.Json);
            using var response = await client.SendAsync(request);
            await AssertInvalidSettlementBasketProblemAsync(
                response,
                invalidCase.ExpectedField,
                invalidCase.ExpectedMessage);
        }

        using var unauthenticatedRequest = new HttpRequestMessage(HttpMethod.Post, BasketCreatePath())
        {
            Content = JsonContent(new
            {
                counterpartyUserProfileId = counterparty.UserProfileId,
                direction = SettlementBalanceDirections.Outgoing,
                currency = "USD",
                selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
            })
        };
        using var unauthenticatedResponse = await client.SendAsync(unauthenticatedRequest);
        await AssertUnauthenticatedProblemAsync(unauthenticatedResponse);

        Assert.Equal(beforeCounts, await ReadPreviewSideEffectCountsAsync(testFactory));
    }

    [Fact]
    public async Task GroupBasketCreateFailsClosedForRemovedCounterpartyOrActor()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Create Actor");
        var removedActorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Removed Group Create Actor");
        var creditor = await SeedAccountAsync(testFactory, "Group Create Creditor", InitialTimestamp.AddMinutes(1));
        var removedCounterparty = await SeedAccountAsync(testFactory, "Removed Group Create Counterparty", InitialTimestamp.AddMinutes(2));
        var groupId = await SeedGroupAsync(
            testFactory,
            creditor.UserProfileId,
            "Group Create Fail Closed",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(removedActorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed),
            new MembershipSeed(creditor.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(removedCounterparty.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed));
        await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId,
            [
                new ParticipantSeed(actorSession.UserProfileId, 20m),
                new ParticipantSeed(creditor.UserProfileId, 20m)
            ],
            [new PayerSeed(creditor.UserProfileId, 40m)],
            ExpenseBillStatuses.Confirmed,
            "USD",
            InitialTimestamp.AddMinutes(3));
        var beforeCounts = await ReadPreviewSideEffectCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var removedCounterpartyRequest = CreateCreateRequest(
            actorSession.RawSessionToken,
            new
            {
                counterpartyUserProfileId = removedCounterparty.UserProfileId,
                direction = SettlementBalanceDirections.Outgoing,
                currency = "USD",
                groupId,
                selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
            });
        using var removedCounterpartyResponse = await client.SendAsync(removedCounterpartyRequest);
        await AssertSettlementBasketUnavailableProblemAsync(removedCounterpartyResponse);

        using var removedActorRequest = CreateCreateRequest(
            removedActorSession.RawSessionToken,
            new
            {
                counterpartyUserProfileId = creditor.UserProfileId,
                direction = SettlementBalanceDirections.Outgoing,
                currency = "USD",
                groupId,
                selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
            });
        using var removedActorResponse = await client.SendAsync(removedActorRequest);
        await AssertSettlementBasketUnavailableProblemAsync(removedActorResponse);

        Assert.Equal(beforeCounts, await ReadPreviewSideEffectCountsAsync(testFactory));
    }

    [Fact]
    public async Task BasketPaymentClaimAllocatesAcrossMultipleLinesDeterministically()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Basket Payment Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Basket Payment Creditor", InitialTimestamp.AddMinutes(1));
        await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtorSession.UserProfileId, 5m),
                new ParticipantSeed(creditor.UserProfileId, 5m)
            ],
            [new PayerSeed(creditor.UserProfileId, 10m)],
            ExpenseBillStatuses.Confirmed,
            "USD",
            InitialTimestamp.AddMinutes(2));
        await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtorSession.UserProfileId, 12m),
                new ParticipantSeed(creditor.UserProfileId, 12m)
            ],
            [new PayerSeed(creditor.UserProfileId, 24m)],
            ExpenseBillStatuses.Confirmed,
            "USD",
            InitialTimestamp.AddMinutes(3));

        using var client = testFactory.CreateClient();
        var settlementId = await CreateBasketAndReadSettlementIdAsync(
            client,
            debtorSession.RawSessionToken,
            creditor.UserProfileId);

        using var request = CreatePaymentRequest(
            settlementId,
            debtorSession.RawSessionToken,
            """{"amount":"17.00","currency":"USD","paymentDate":"2026-05-10"}""");
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal(SettlementRequestStatuses.MarkedPaid, payload.RootElement.GetProperty("settlementRequestStatus").GetString());
        var allocations = payload.RootElement.GetProperty("allocations").EnumerateArray().ToArray();
        Assert.Equal(2, allocations.Length);
        Assert.Equal("5", allocations[0].GetProperty("clearedAmount").GetString());
        Assert.Equal(0, allocations[0].GetProperty("allocationOrder").GetInt32());
        Assert.Equal("12", allocations[1].GetProperty("clearedAmount").GetString());
        Assert.Equal(1, allocations[1].GetProperty("allocationOrder").GetInt32());

        var persisted = await ReadBasketCreateStateAsync(testFactory);
        var settlementRequest = persisted.Requests.Single(candidate => candidate.Id == settlementId);
        Assert.Equal(SettlementRequestStatuses.MarkedPaid, settlementRequest.Status);
        Assert.All(settlementRequest.Lines, line => Assert.Equal(SettlementRequestLineStatuses.Cleared, line.Status));
        Assert.Equal([5m, 12m], persisted.PaymentAllocations.OrderBy(allocation => allocation.AllocationOrder).Select(allocation => allocation.ClearedAmount).ToArray());
    }

    [Fact]
    public async Task PartialBasketPaymentClearsEarlierLinesFirstAndCancellationRecomputesCoverage()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Partial Basket Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Partial Basket Creditor", InitialTimestamp.AddMinutes(1));
        await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtorSession.UserProfileId, 5m),
                new ParticipantSeed(creditor.UserProfileId, 5m)
            ],
            [new PayerSeed(creditor.UserProfileId, 10m)],
            ExpenseBillStatuses.Confirmed,
            "USD",
            InitialTimestamp.AddMinutes(2));
        await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtorSession.UserProfileId, 12m),
                new ParticipantSeed(creditor.UserProfileId, 12m)
            ],
            [new PayerSeed(creditor.UserProfileId, 24m)],
            ExpenseBillStatuses.Confirmed,
            "USD",
            InitialTimestamp.AddMinutes(3));

        using var client = testFactory.CreateClient();
        var settlementId = await CreateBasketAndReadSettlementIdAsync(
            client,
            debtorSession.RawSessionToken,
            creditor.UserProfileId);

        using var paymentRequest = CreatePaymentRequest(
            settlementId,
            debtorSession.RawSessionToken,
            """{"amount":"6.00","currency":"USD","paymentDate":"2026-05-10"}""");
        using var paymentResponse = await client.SendAsync(paymentRequest);
        var paymentContent = await paymentResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, paymentResponse.StatusCode);
        using var paymentPayload = JsonDocument.Parse(paymentContent);
        var paymentId = paymentPayload.RootElement.GetProperty("paymentId").GetGuid();
        Assert.Equal(SettlementRequestStatuses.PartiallyPaid, paymentPayload.RootElement.GetProperty("settlementRequestStatus").GetString());
        var allocations = paymentPayload.RootElement.GetProperty("allocations").EnumerateArray().ToArray();
        Assert.Equal(2, allocations.Length);
        Assert.Equal("5", allocations[0].GetProperty("clearedAmount").GetString());
        Assert.Equal("1", allocations[1].GetProperty("clearedAmount").GetString());

        var afterPayment = await ReadBasketCreateStateAsync(testFactory);
        var orderedLines = afterPayment.Requests.Single(candidate => candidate.Id == settlementId)
            .Lines
            .OrderBy(line => line.AllocationOrder)
            .ToArray();
        Assert.Equal(SettlementRequestLineStatuses.Cleared, orderedLines[0].Status);
        Assert.Equal(SettlementRequestLineStatuses.PartiallyCleared, orderedLines[1].Status);

        using var cancelRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentCancellationPath(paymentId),
            debtorSession.RawSessionToken);
        using var cancelResponse = await client.SendAsync(cancelRequest);

        Assert.Equal(HttpStatusCode.OK, cancelResponse.StatusCode);
        var afterCancel = await ReadBasketCreateStateAsync(testFactory);
        var cancelledRequest = afterCancel.Requests.Single(candidate => candidate.Id == settlementId);
        Assert.Equal(SettlementRequestStatuses.Requested, cancelledRequest.Status);
        Assert.All(cancelledRequest.Lines, line => Assert.Equal(SettlementRequestLineStatuses.Open, line.Status));
        Assert.Equal(SettlementPaymentStatuses.Cancelled, Assert.Single(afterCancel.Payments).Status);
    }

    [Fact]
    public void OpenApiDefinesBasketPreviewAndCreateSurfaces()
    {
        var openApi = File.ReadAllText(FindRepoFile("packages/contracts/openapi/settleora.v1.yaml"));
        var createPathBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlements/baskets:");
        var createRequestSchemaBlock = ExtractOpenApiSchemaBlock(openApi, "CreateSettlementBasketRequest:");
        var pathBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlements/baskets/preview:");
        var requestSchemaBlock = ExtractOpenApiSchemaBlock(openApi, "SettlementBasketPreviewRequest:");
        var responseSchemaBlock = ExtractOpenApiSchemaBlock(openApi, "SettlementBasketPreviewResponse:");
        var lineSchemaBlock = ExtractOpenApiSchemaBlock(openApi, "SettlementBasketPreviewLineResponse:");

        Assert.Contains("operationId: createSettlementBasketRequest", createPathBlock, StringComparison.Ordinal);
        Assert.Contains("$ref: \"#/components/schemas/CreateSettlementBasketRequest\"", createPathBlock, StringComparison.Ordinal);
        Assert.Contains("$ref: \"#/components/schemas/SettlementRequestResponse\"", createPathBlock, StringComparison.Ordinal);
        Assert.Contains("additionalProperties: false", createRequestSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("counterpartyUserProfileId", createRequestSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("selectionMode", createRequestSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("operationId: previewSettlementBasket", pathBlock, StringComparison.Ordinal);
        Assert.Contains("post:", pathBlock, StringComparison.Ordinal);
        Assert.Contains("$ref: \"#/components/schemas/SettlementBasketPreviewRequest\"", pathBlock, StringComparison.Ordinal);
        Assert.Contains("$ref: \"#/components/schemas/SettlementBasketPreviewResponse\"", pathBlock, StringComparison.Ordinal);
        Assert.Contains("additionalProperties: false", requestSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("counterpartyUserProfileId", requestSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("selectionMode", requestSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("pay_all_outstanding_for_counterparty", openApi, StringComparison.Ordinal);
        Assert.Contains("exactSelectedTotal", responseSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("lines", responseSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("sourceBillRevisionId", lineSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("sourceCandidateKey", lineSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("candidateBasis", lineSchemaBlock, StringComparison.Ordinal);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new SettlementBasketPreviewTestTimeProvider(InitialTimestamp);
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
        SettlementBasketPreviewTestTimeProvider timeProvider,
        string displayName)
    {
        var account = await SeedAccountAsync(testFactory, displayName, InitialTimestamp);
        return await SeedSessionForAccountAsync(testFactory, timeProvider, account);
    }

    private static async Task<SeededAccount> SeedAccountAsync(
        WebApplicationFactory<Program> testFactory,
        string displayName,
        DateTimeOffset createdAtUtc,
        DateTimeOffset? deletedAtUtc = null)
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
            UpdatedAtUtc = createdAtUtc,
            DeletedAtUtc = deletedAtUtc
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
        SettlementBasketPreviewTestTimeProvider timeProvider,
        SeededAccount account)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Settlement basket preview endpoint test",
                UserAgentSummary: "Settlement basket preview endpoint test user agent",
                NetworkAddressHash: "settlement-basket-preview-endpoint-test-network",
                RequestedLifetime: TimeSpan.FromHours(4)));

        Assert.True(sessionCreationResult.Succeeded);
        Assert.NotNull(sessionCreationResult.AuthSessionId);
        Assert.NotNull(sessionCreationResult.RawSessionToken);
        Assert.NotNull(sessionCreationResult.SessionExpiresAtUtc);

        timeProvider.SetUtcNow(ValidationTimestamp);
        return new SeededSession(
            account.AuthAccountId,
            account.UserProfileId,
            sessionCreationResult.AuthSessionId.Value,
            sessionCreationResult.RawSessionToken,
            sessionCreationResult.SessionExpiresAtUtc.Value);
    }

    private static async Task<Guid> SeedGroupAsync(
        WebApplicationFactory<Program> testFactory,
        Guid creatorUserProfileId,
        string name,
        DateTimeOffset createdAtUtc,
        DateTimeOffset? deletedAtUtc,
        params MembershipSeed[] memberships)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var groupId = Guid.NewGuid();
        dbContext.Set<UserGroup>().Add(new UserGroup
        {
            Id = groupId,
            Name = name,
            CreatedByUserProfileId = creatorUserProfileId,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc,
            DeletedAtUtc = deletedAtUtc
        });

        foreach (var membership in memberships)
        {
            dbContext.Set<GroupMembership>().Add(new GroupMembership
            {
                GroupId = groupId,
                UserProfileId = membership.UserProfileId,
                Role = membership.Role,
                Status = membership.Status,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        await dbContext.SaveChangesAsync();
        return groupId;
    }

    private static async Task<Guid> SeedBillAsync(
        WebApplicationFactory<Program> testFactory,
        Guid creatorProfileId,
        Guid? groupId,
        IReadOnlyList<ParticipantSeed> participants,
        IReadOnlyList<PayerSeed> payers,
        string status,
        string currency,
        DateTimeOffset createdAtUtc,
        DateTimeOffset? archivedAtUtc = null)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var billId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var totalAmount = participants.Sum(participant => participant.ResolvedShareAmount);
        var bill = new ExpenseBill
        {
            Id = billId,
            CreatedByUserProfileId = creatorProfileId,
            BillOwnerUserProfileId = creatorProfileId,
            GroupId = groupId,
            MerchantName = HiddenMerchantName,
            BillDate = DateOnly.FromDateTime(createdAtUtc.UtcDateTime),
            Status = status,
            TotalAmount = totalAmount,
            TotalCurrency = currency,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc,
            ArchivedAtUtc = archivedAtUtc
        };

        var item = new ExpenseBillItem
        {
            Id = itemId,
            ExpenseBillId = billId,
            Name = HiddenItemName,
            Amount = totalAmount,
            Currency = currency,
            SortOrder = 0,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        };

        for (var index = 0; index < participants.Count; index++)
        {
            var participant = participants[index];
            bill.Participants.Add(new ExpenseBillParticipant
            {
                ExpenseBillId = billId,
                UserProfileId = participant.UserProfileId,
                Status = participant.Status,
                ResolvedShareAmount = participant.ResolvedShareAmount,
                ResolvedShareCurrency = currency,
                AcceptedAtUtc = participant.AcceptedAtUtc ?? createdAtUtc,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
            item.Splits.Add(new ExpenseBillItemSplit
            {
                Id = Guid.NewGuid(),
                ExpenseBillItemId = itemId,
                UserProfileId = participant.UserProfileId,
                SplitMethod = ExpenseBillItemSplitMethods.ExactAmount,
                BasisValue = participant.ResolvedShareAmount,
                ResolvedAmount = participant.ResolvedShareAmount,
                ResolvedCurrency = currency,
                AllocationOrder = index,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        bill.Items.Add(item);
        foreach (var payer in payers)
        {
            bill.Payers.Add(new ExpenseBillPayer
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = billId,
                UserProfileId = payer.UserProfileId,
                PayerFactsCreatedByUserProfileId = payer.UserProfileId,
                Amount = payer.Amount,
                Currency = currency,
                PaymentMethodLabelSnapshot = HiddenPaymentMethodLabel,
                PayerConfirmationStatus = ExpenseBillPayerConfirmationStatuses.Confirmed,
                PayerConfirmedAtUtc = createdAtUtc,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        dbContext.Set<ExpenseBill>().Add(bill);
        await dbContext.SaveChangesAsync();
        return billId;
    }

    private static async Task<Guid> SeedAcceptedAppliedRevisionAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId,
        Guid proposalCreatorUserProfileId,
        DateTimeOffset createdAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var bill = await dbContext.Set<ExpenseBill>().SingleAsync(candidate => candidate.Id == billId);
        var revisionId = Guid.NewGuid();
        dbContext.Set<ExpenseBillRevision>().Add(new ExpenseBillRevision
        {
            Id = revisionId,
            ExpenseBillId = billId,
            ProposalCreatorUserProfileId = proposalCreatorUserProfileId,
            Status = ExpenseBillRevisionStatuses.AcceptedApplied,
            TotalAmount = bill.TotalAmount,
            TotalCurrency = bill.TotalCurrency,
            CalculationHash = new string('a', 64),
            AppliedAtUtc = createdAtUtc,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });
        bill.ActiveAcceptedBillRevisionId = revisionId;
        bill.UpdatedAtUtc = createdAtUtc;

        await dbContext.SaveChangesAsync();
        return revisionId;
    }

    private static async Task SeedPendingRevisionAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId,
        Guid proposalCreatorUserProfileId,
        DateTimeOffset createdAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        dbContext.Set<ExpenseBillRevision>().Add(new ExpenseBillRevision
        {
            Id = Guid.NewGuid(),
            ExpenseBillId = billId,
            ProposalCreatorUserProfileId = proposalCreatorUserProfileId,
            Status = ExpenseBillRevisionStatuses.SubmittedForReview,
            TotalAmount = 999m,
            TotalCurrency = "USD",
            CalculationHash = new string('b', 64),
            SubmittedAtUtc = createdAtUtc,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });

        await dbContext.SaveChangesAsync();
    }

    private static async Task<Guid> SeedSettlementRequestAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId,
        Guid? groupId,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        Guid requestedByUserProfileId,
        decimal amount,
        string status,
        DateTimeOffset requestedAtUtc,
        string currency = "USD")
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var settlementId = Guid.NewGuid();
        var settlementRequest = new SettlementRequest
        {
            Id = settlementId,
            SourceExpenseBillId = billId,
            GroupId = groupId,
            DebtorUserProfileId = debtorUserProfileId,
            CreditorUserProfileId = creditorUserProfileId,
            Amount = amount,
            Currency = currency,
            Status = status,
            RequestedByUserProfileId = requestedByUserProfileId,
            RequestedAtUtc = requestedAtUtc,
            CreatedAtUtc = requestedAtUtc,
            UpdatedAtUtc = requestedAtUtc
        };
        settlementRequest.Lines.Add(new SettlementRequestLine
        {
            Id = Guid.NewGuid(),
            SettlementRequestId = settlementId,
            SourceExpenseBillId = billId,
            SourceCandidateKey = $"seeded:{settlementId:D}",
            ExactAmount = amount,
            Currency = currency,
            AllocationOrder = 0,
            Status = SettlementRequestLineStatuses.Open,
            CreatedAtUtc = requestedAtUtc,
            UpdatedAtUtc = requestedAtUtc
        });
        dbContext.Set<SettlementRequest>().Add(settlementRequest);

        await dbContext.SaveChangesAsync();
        return settlementId;
    }

    private static async Task SeedPaymentProfileWithQrAsync(
        WebApplicationFactory<Program> testFactory,
        Guid userProfileId,
        DateTimeOffset createdAtUtc)
    {
        var fileObjectId = await SeedFileObjectAsync(
            testFactory,
            userProfileId,
            FileObjectPurposes.PaymentQr,
            HiddenStorageObjectKey,
            createdAtUtc);

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        dbContext.Set<UserPaymentProfile>().Add(new UserPaymentProfile
        {
            Id = Guid.NewGuid(),
            UserProfileId = userProfileId,
            PreferredMethodLabel = HiddenPaymentMethodLabel,
            PaymentHandle = HiddenPaymentHandle,
            PaymentNote = HiddenPaymentNote,
            Visibility = UserPaymentProfileVisibilities.SettlementCounterpartiesOnly,
            QrFileObjectId = fileObjectId,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });

        await dbContext.SaveChangesAsync();
    }

    private static async Task<Guid> SeedFileObjectAsync(
        WebApplicationFactory<Program> testFactory,
        Guid ownerUserProfileId,
        string purpose,
        string storageObjectKey,
        DateTimeOffset createdAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var fileObjectId = Guid.NewGuid();
        dbContext.Set<FileObject>().Add(new FileObject
        {
            Id = fileObjectId,
            OwnerUserProfileId = ownerUserProfileId,
            CreatedByUserProfileId = ownerUserProfileId,
            Purpose = purpose,
            Status = FileObjectStatuses.Active,
            ContentType = "image/png",
            OriginalFilename = HiddenOriginalFilename,
            SizeBytes = 12,
            Sha256Hash = null,
            StorageProvider = StorageProviderNames.Local,
            StorageObjectKey = storageObjectKey,
            EncryptionMode = FileObjectEncryptionModes.ServerManaged,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });

        await dbContext.SaveChangesAsync();
        return fileObjectId;
    }

    private static async Task SeedHiddenAuditEventAsync(
        WebApplicationFactory<Program> testFactory,
        Guid actorAuthAccountId,
        DateTimeOffset createdAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        dbContext.Set<AuthAuditEvent>().Add(new AuthAuditEvent
        {
            Id = Guid.NewGuid(),
            ActorAuthAccountId = actorAuthAccountId,
            SubjectAuthAccountId = actorAuthAccountId,
            Action = "settlement.hidden_basket_seed",
            Outcome = AuthAuditOutcomes.Success,
            OccurredAtUtc = createdAtUtc,
            SafeMetadataJson = HiddenAuditMetadata
        });

        await dbContext.SaveChangesAsync();
    }

    private static async Task<PreviewSideEffectCounts> ReadPreviewSideEffectCountsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return new PreviewSideEffectCounts(
            await dbContext.Set<SettlementRequest>().CountAsync(),
            await dbContext.Set<SettlementRequestLine>().CountAsync(),
            await dbContext.Set<SettlementPayment>().CountAsync(),
            await dbContext.Set<SettlementPaymentAllocation>().CountAsync(),
            await dbContext.Set<SettlementResidual>().CountAsync(),
            await dbContext.Set<SettlementProofAttachment>().CountAsync(),
            await dbContext.Set<FileObject>().CountAsync(),
            await dbContext.Set<UserPaymentProfile>().CountAsync(),
            await dbContext.Set<AuthAuditEvent>().CountAsync(auditEvent =>
                auditEvent.Action != "session.created"
                && auditEvent.Action != "session.validated"
                && auditEvent.Action != "session.validation_failed"
                && auditEvent.Action != "session.revoked"));
    }

    private static async Task<BasketCreateState> ReadBasketCreateStateAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return new BasketCreateState(
            await dbContext.Set<SettlementRequest>()
                .AsNoTracking()
                .Include(settlementRequest => settlementRequest.Lines)
                .OrderBy(settlementRequest => settlementRequest.CreatedAtUtc)
                .ThenBy(settlementRequest => settlementRequest.Id)
                .ToListAsync(),
            await dbContext.Set<SettlementRequestLine>()
                .AsNoTracking()
                .OrderBy(line => line.AllocationOrder)
                .ThenBy(line => line.CreatedAtUtc)
                .ThenBy(line => line.Id)
                .ToListAsync(),
            await dbContext.Set<SettlementPayment>()
                .AsNoTracking()
                .OrderBy(payment => payment.CreatedAtUtc)
                .ThenBy(payment => payment.Id)
                .ToListAsync(),
            await dbContext.Set<SettlementPaymentAllocation>()
                .AsNoTracking()
                .OrderBy(allocation => allocation.AllocationOrder)
                .ThenBy(allocation => allocation.CreatedAtUtc)
                .ThenBy(allocation => allocation.Id)
                .ToListAsync(),
            await dbContext.Set<SettlementResidual>()
                .AsNoTracking()
                .ToListAsync(),
            await dbContext.Set<SettlementProofAttachment>()
                .AsNoTracking()
                .ToListAsync(),
            await dbContext.Set<AuthAuditEvent>()
                .AsNoTracking()
                .Where(auditEvent => auditEvent.Action == "settlement.basket_created")
                .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
                .ToListAsync(),
            await ReadPreviewSideEffectCountsAsync(testFactory));
    }

    private static async Task<Guid> CreateBasketAndReadSettlementIdAsync(
        HttpClient client,
        string rawSessionToken,
        Guid counterpartyUserProfileId)
    {
        using var request = CreateCreateRequest(
            rawSessionToken,
            new
            {
                counterpartyUserProfileId,
                direction = SettlementBalanceDirections.Outgoing,
                currency = "USD",
                selectionMode = SettlementBasketSelectionModes.PayAllOutstandingForCounterparty
            });
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var payload = JsonDocument.Parse(content);
        return payload.RootElement.GetProperty("id").GetGuid();
    }

    private static HttpRequestMessage CreateCreateRequest(
        string rawSessionToken,
        object body)
    {
        return CreateRawCreateRequest(rawSessionToken, JsonSerializer.Serialize(body));
    }

    private static HttpRequestMessage CreateRawCreateRequest(
        string rawSessionToken,
        string json)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, BasketCreatePath())
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
    }

    private static HttpRequestMessage CreatePaymentRequest(
        Guid settlementId,
        string rawSessionToken,
        string json)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, SettlementPaymentsPath(settlementId))
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
    }

    private static HttpRequestMessage CreateBearerRequest(
        HttpMethod method,
        string path,
        string rawSessionToken)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
    }

    private static HttpRequestMessage CreatePreviewRequest(
        string rawSessionToken,
        object body)
    {
        return CreateRawPreviewRequest(rawSessionToken, JsonSerializer.Serialize(body));
    }

    private static HttpRequestMessage CreateRawPreviewRequest(
        string rawSessionToken,
        string json)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, BasketPreviewPath())
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
    }

    private static StringContent JsonContent(object value)
    {
        return new StringContent(
            JsonSerializer.Serialize(value),
            Encoding.UTF8,
            "application/json");
    }

    private static string BasketPreviewPath()
    {
        return "/api/v1/settlements/baskets/preview";
    }

    private static string BasketCreatePath()
    {
        return "/api/v1/settlements/baskets";
    }

    private static string SettlementPaymentsPath(Guid settlementId)
    {
        return $"/api/v1/settlements/{settlementId:D}/payments";
    }

    private static string SettlementPaymentCancellationPath(Guid paymentId)
    {
        return $"/api/v1/settlement-payments/{paymentId:D}/cancel";
    }

    private static void AssertSettlementRequestResponseShape(JsonElement response)
    {
        Assert.Equal(
            [
                "amount",
                "createdAtUtc",
                "creditorUserProfileId",
                "currency",
                "debtorUserProfileId",
                "groupId",
                "id",
                "lines",
                "requestedAtUtc",
                "requestedByUserProfileId",
                "sourceExpenseBillId",
                "status",
                "updatedAtUtc"
            ],
            response.EnumerateObject()
                .Select(property => property.Name)
                .Order(StringComparer.Ordinal)
                .ToArray());
    }

    private static void AssertSettlementRequestLineResponseShape(JsonElement response)
    {
        Assert.Equal(
            [
                "allocationOrder",
                "createdAtUtc",
                "currency",
                "exactAmount",
                "id",
                "sourceBillRevisionId",
                "sourceCandidateKey",
                "sourceExpenseBillId",
                "status",
                "updatedAtUtc"
            ],
            response.EnumerateObject()
                .Select(property => property.Name)
                .Order(StringComparer.Ordinal)
                .ToArray());
    }

    private static void AssertBasketPreviewShape(JsonElement response)
    {
        Assert.Equal(
            [
                "counterpartyUserProfileId",
                "creditorUserProfileId",
                "currency",
                "debtorUserProfileId",
                "direction",
                "exactSelectedTotal",
                "generatedAtUtc",
                "groupId",
                "lineCount",
                "lines",
                "selectionMode"
            ],
            response.EnumerateObject()
                .Select(property => property.Name)
                .Order(StringComparer.Ordinal)
                .ToArray());
    }

    private static void AssertBasketPreviewLineShape(JsonElement response)
    {
        Assert.Equal(
            [
                "candidateBasis",
                "createdAtUtc",
                "currency",
                "exactAmount",
                "sourceBillRevisionId",
                "sourceCandidateKey",
                "sourceExpenseBillId"
            ],
            response.EnumerateObject()
                .Select(property => property.Name)
                .Order(StringComparer.Ordinal)
                .ToArray());
    }

    private static void AssertSafePreviewResponseContent(
        string content,
        params string[] forbiddenValues)
    {
        var lowerContent = content.ToLowerInvariant();

        foreach (var forbiddenValue in forbiddenValues)
        {
            Assert.DoesNotContain(forbiddenValue, content);
        }

        Assert.DoesNotContain("auth", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("payload", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("objectkey", lowerContent);
        Assert.DoesNotContain("object_key", lowerContent);
        Assert.DoesNotContain("vault", lowerContent);
        Assert.DoesNotContain("paymentprofile", lowerContent);
        Assert.DoesNotContain("payment_profile", lowerContent);
        Assert.DoesNotContain("paymenthandle", lowerContent);
        Assert.DoesNotContain("payment_handle", lowerContent);
        Assert.DoesNotContain("paymentnote", lowerContent);
        Assert.DoesNotContain("payment_note", lowerContent);
        Assert.DoesNotContain("methodlabel", lowerContent);
        Assert.DoesNotContain("qr", lowerContent);
        Assert.DoesNotContain("proof", lowerContent);
        Assert.DoesNotContain("fileobject", lowerContent);
        Assert.DoesNotContain("file_object", lowerContent);
        Assert.DoesNotContain("filename", lowerContent);
        Assert.DoesNotContain("merchant", lowerContent);
        Assert.DoesNotContain("item", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("requestbody", lowerContent);
        Assert.DoesNotContain("request_body", lowerContent);
        Assert.DoesNotContain("ocr", lowerContent);
    }

    private static void AssertSafeBasketCreateResponseContent(
        string content,
        params string[] forbiddenValues)
    {
        var lowerContent = content.ToLowerInvariant();

        foreach (var forbiddenValue in forbiddenValues)
        {
            Assert.DoesNotContain(forbiddenValue, content);
        }

        Assert.DoesNotContain("auth", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("payload", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("objectkey", lowerContent);
        Assert.DoesNotContain("object_key", lowerContent);
        Assert.DoesNotContain("vault", lowerContent);
        Assert.DoesNotContain("paymentprofile", lowerContent);
        Assert.DoesNotContain("payment_profile", lowerContent);
        Assert.DoesNotContain("paymenthandle", lowerContent);
        Assert.DoesNotContain("payment_handle", lowerContent);
        Assert.DoesNotContain("paymentnote", lowerContent);
        Assert.DoesNotContain("payment_note", lowerContent);
        Assert.DoesNotContain("methodlabel", lowerContent);
        Assert.DoesNotContain("qr", lowerContent);
        Assert.DoesNotContain("proof", lowerContent);
        Assert.DoesNotContain("fileobject", lowerContent);
        Assert.DoesNotContain("file_object", lowerContent);
        Assert.DoesNotContain("filename", lowerContent);
        Assert.DoesNotContain("merchant", lowerContent);
        Assert.DoesNotContain("item", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("requestbody", lowerContent);
        Assert.DoesNotContain("request_body", lowerContent);
        Assert.DoesNotContain("ocr", lowerContent);
    }

    private static void AssertBoundedBasketCreateAuditMetadata(
        string? metadataJson,
        Guid settlementRequestId,
        Guid sourceExpenseBillId,
        Guid? groupId,
        string groupMode,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        string amount,
        string currency)
    {
        Assert.NotNull(metadataJson);
        Assert.DoesNotContain("requestBody", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("candidateKey", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("merchant", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("item", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("paymentHandle", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("storage", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token", metadataJson, StringComparison.OrdinalIgnoreCase);

        using var metadata = JsonDocument.Parse(metadataJson);
        Assert.Equal("settlement_basket_create", metadata.RootElement.GetProperty("workflowName").GetString());
        Assert.Equal(settlementRequestId.ToString("D"), metadata.RootElement.GetProperty("settlementRequestId").GetString());
        Assert.Equal(sourceExpenseBillId.ToString("D"), metadata.RootElement.GetProperty("sourceExpenseBillId").GetString());
        if (groupId.HasValue)
        {
            Assert.Equal(groupId.Value.ToString("D"), metadata.RootElement.GetProperty("groupId").GetString());
        }
        else
        {
            Assert.False(metadata.RootElement.TryGetProperty("groupId", out _));
        }

        Assert.Equal(groupMode, metadata.RootElement.GetProperty("groupMode").GetString());
        Assert.Equal(debtorUserProfileId.ToString("D"), metadata.RootElement.GetProperty("debtorUserProfileId").GetString());
        Assert.Equal(creditorUserProfileId.ToString("D"), metadata.RootElement.GetProperty("creditorUserProfileId").GetString());
        Assert.Equal(SettlementRequestStatuses.Requested, metadata.RootElement.GetProperty("requestStatus").GetString());
        Assert.Equal(amount, metadata.RootElement.GetProperty("amount").GetString());
        Assert.Equal(currency, metadata.RootElement.GetProperty("currency").GetString());
        Assert.Equal(SettlementBasketSelectionModes.PayAllOutstandingForCounterparty, metadata.RootElement.GetProperty("candidateBasis").GetString());
    }

    private static async Task AssertInvalidBasketPreviewProblemAsync(
        HttpResponseMessage response,
        string expectedField,
        string expectedMessage)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains(expectedField, content, StringComparison.Ordinal);
        Assert.Contains(expectedMessage, content, StringComparison.Ordinal);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid settlement basket preview", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The submitted settlement basket preview request is invalid.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertInvalidSettlementBasketProblemAsync(
        HttpResponseMessage response,
        string expectedField,
        string expectedMessage)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains(expectedField, content, StringComparison.Ordinal);
        Assert.Contains(expectedMessage, content, StringComparison.Ordinal);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid settlement basket", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The submitted settlement basket request is invalid.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertSettlementBasketConflictProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Settlement basket conflict", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The settlement basket cannot be created for the current counterparty state.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertSettlementBasketUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Settlement basket unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested settlement basket is unavailable.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertBasketPreviewUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Settlement basket preview unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested settlement basket preview is unavailable.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertUnauthenticatedProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Unauthenticated", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(401, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "Authentication is required to access this resource.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static string FindRepoFile(string relativePath)
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var candidate = Path.Combine(directory.FullName, relativePath);
            if (File.Exists(candidate))
            {
                return candidate;
            }

            directory = directory.Parent;
        }

        throw new FileNotFoundException($"Could not find {relativePath} from {AppContext.BaseDirectory}.");
    }

    private static string ExtractOpenApiPathBlock(string openApi, string pathHeader)
    {
        var start = openApi.IndexOf(pathHeader, StringComparison.Ordinal);
        Assert.True(start >= 0, $"Could not find OpenAPI path block {pathHeader}.");

        var nextPath = openApi.IndexOf("\n  /", start + pathHeader.Length, StringComparison.Ordinal);
        return nextPath < 0
            ? openApi[start..]
            : openApi[start..nextPath];
    }

    private static string ExtractOpenApiSchemaBlock(string openApi, string schemaHeader)
    {
        var start = openApi.IndexOf($"    {schemaHeader}", StringComparison.Ordinal);
        Assert.True(start >= 0, $"Could not find OpenAPI schema block {schemaHeader}.");

        var nextSchema = openApi.IndexOf("\n    ", start + schemaHeader.Length + 4, StringComparison.Ordinal);
        while (nextSchema >= 0
            && openApi.Length > nextSchema + 5
            && openApi[nextSchema + 5] is ' ')
        {
            nextSchema = openApi.IndexOf("\n    ", nextSchema + 1, StringComparison.Ordinal);
        }

        return nextSchema < 0
            ? openApi[start..]
            : openApi[start..nextSchema];
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        SettlementBasketPreviewTestTimeProvider TimeProvider);

    private sealed record SeededAccount(
        Guid AuthAccountId,
        Guid UserProfileId);

    private sealed record SeededSession(
        Guid AuthAccountId,
        Guid UserProfileId,
        Guid AuthSessionId,
        string RawSessionToken,
        DateTimeOffset SessionExpiresAtUtc);

    private sealed record MembershipSeed(
        Guid UserProfileId,
        string Role,
        string Status);

    private sealed record ParticipantSeed(
        Guid UserProfileId,
        decimal ResolvedShareAmount,
        string Status = ExpenseBillParticipantStatuses.Accepted,
        DateTimeOffset? AcceptedAtUtc = null);

    private sealed record PayerSeed(
        Guid UserProfileId,
        decimal Amount);

    private sealed record PreviewSideEffectCounts(
        int SettlementRequestCount,
        int SettlementRequestLineCount,
        int SettlementPaymentCount,
        int SettlementPaymentAllocationCount,
        int SettlementResidualCount,
        int SettlementProofAttachmentCount,
        int FileObjectCount,
        int UserPaymentProfileCount,
        int NonSessionAuditEventCount);

    private sealed record BasketCreateState(
        IReadOnlyList<SettlementRequest> Requests,
        IReadOnlyList<SettlementRequestLine> RequestLines,
        IReadOnlyList<SettlementPayment> Payments,
        IReadOnlyList<SettlementPaymentAllocation> PaymentAllocations,
        IReadOnlyList<SettlementResidual> Residuals,
        IReadOnlyList<SettlementProofAttachment> ProofAttachments,
        IReadOnlyList<AuthAuditEvent> BasketAuditEvents,
        PreviewSideEffectCounts MutationCounts);

    private sealed record InvalidRequestCase(
        string Json,
        string ExpectedField,
        string ExpectedMessage);

    private sealed class SettlementBasketPreviewTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public SettlementBasketPreviewTestTimeProvider(DateTimeOffset utcNow)
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
