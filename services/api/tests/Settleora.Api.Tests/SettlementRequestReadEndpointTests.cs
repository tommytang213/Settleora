using System.Net;
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

public sealed class SettlementRequestReadEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string WrongRawToken = "visible-wrong-settlement-read-session-token";
    private const string HiddenMerchantName = "Hidden Settlement Read Merchant";
    private const string HiddenItemName = "Hidden Settlement Read Item";
    private const string HiddenPaymentMethodLabel = "Hidden settlement read payment method";
    private const string HiddenPaymentHandle = "hidden-settlement-read-payment-handle";
    private const string HiddenPaymentNote = "hidden settlement read payment note";
    private const string HiddenStorageObjectKey = "hidden/settlement/read/proof-object-key";
    private const string HiddenOriginalFilename = "hidden-settlement-read-proof.png";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 8, 11, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 8, 11, 15, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public SettlementRequestReadEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task PersonalListAndGetReturnOnlyCurrentActorSettlementRequestsWithBoundedResponse()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Personal Read Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Personal Read Creditor", InitialTimestamp.AddMinutes(1));
        var requesterOnlyDebtor = await SeedAccountAsync(testFactory, "Requester Only Debtor", InitialTimestamp.AddMinutes(2));
        var requesterOnlyCreditor = await SeedAccountAsync(testFactory, "Requester Only Creditor", InitialTimestamp.AddMinutes(3));
        var unrelated = await SeedAccountAsync(testFactory, "Unrelated Hidden Settlement User", InitialTimestamp.AddMinutes(4));
        var visibleBillId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [new ParticipantSeed(debtorSession.UserProfileId, 12.34m), new ParticipantSeed(creditor.UserProfileId, 12.34m)],
            [new PayerSeed(creditor.UserProfileId, 24.68m)],
            InitialTimestamp);
        var requesterOnlyBillId = await SeedBillAsync(
            testFactory,
            requesterOnlyCreditor.UserProfileId,
            groupId: null,
            [new ParticipantSeed(requesterOnlyDebtor.UserProfileId, 7.89m), new ParticipantSeed(requesterOnlyCreditor.UserProfileId, 7.89m)],
            [new PayerSeed(requesterOnlyCreditor.UserProfileId, 15.78m)],
            InitialTimestamp.AddMinutes(1));
        var unrelatedBillId = await SeedBillAsync(
            testFactory,
            unrelated.UserProfileId,
            groupId: null,
            [new ParticipantSeed(unrelated.UserProfileId, 1m)],
            [new PayerSeed(unrelated.UserProfileId, 1m)],
            InitialTimestamp.AddMinutes(2));
        var visibleSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            visibleBillId,
            groupId: null,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            12.34m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(10));
        var requesterOnlySettlementId = await SeedSettlementRequestAsync(
            testFactory,
            requesterOnlyBillId,
            groupId: null,
            requesterOnlyDebtor.UserProfileId,
            requesterOnlyCreditor.UserProfileId,
            debtorSession.UserProfileId,
            7.89m,
            SettlementRequestStatuses.Disputed,
            InitialTimestamp.AddMinutes(20));
        await SeedSettlementRequestAsync(
            testFactory,
            unrelatedBillId,
            groupId: null,
            unrelated.UserProfileId,
            requesterOnlyCreditor.UserProfileId,
            unrelated.UserProfileId,
            1m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(30));
        await SeedSettlementRequestAsync(
            testFactory,
            visibleBillId,
            groupId: null,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            debtorSession.UserProfileId,
            2m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(40),
            archivedAtUtc: InitialTimestamp.AddMinutes(41));
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, debtorSession.AuthSessionId);

        using var client = testFactory.CreateClient();
        using var listRequest = CreateBearerRequest(HttpMethod.Get, SettlementsPath(), debtorSession.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);
        var listContent = await listResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        Assert.Equal("application/json", listResponse.Content.Headers.ContentType?.MediaType);
        AssertSafeReadResponseContent(
            listContent,
            debtorSession.RawSessionToken,
            sessionTokenHash,
            HiddenMerchantName,
            HiddenItemName,
            HiddenPaymentMethodLabel,
            "Unrelated Hidden Settlement User");
        using var listPayload = JsonDocument.Parse(listContent);
        Assert.Equal(["settlements"], listPayload.RootElement.EnumerateObject().Select(property => property.Name).ToArray());
        var settlements = listPayload.RootElement.GetProperty("settlements").EnumerateArray().ToArray();
        Assert.Equal(2, settlements.Length);
        Assert.Equal(requesterOnlySettlementId, settlements[0].GetProperty("id").GetGuid());
        Assert.Equal(visibleSettlementId, settlements[1].GetProperty("id").GetGuid());
        AssertSettlementRequestResponseShape(settlements[0]);
        Assert.Equal(requesterOnlyBillId, settlements[0].GetProperty("sourceExpenseBillId").GetGuid());
        Assert.Equal(JsonValueKind.Null, settlements[0].GetProperty("groupId").ValueKind);
        Assert.Equal(requesterOnlyDebtor.UserProfileId, settlements[0].GetProperty("debtorUserProfileId").GetGuid());
        Assert.Equal(requesterOnlyCreditor.UserProfileId, settlements[0].GetProperty("creditorUserProfileId").GetGuid());
        Assert.Equal("7.89", settlements[0].GetProperty("amount").GetString());
        Assert.Equal("USD", settlements[0].GetProperty("currency").GetString());
        Assert.Equal(SettlementRequestStatuses.Disputed, settlements[0].GetProperty("status").GetString());
        Assert.Equal(debtorSession.UserProfileId, settlements[0].GetProperty("requestedByUserProfileId").GetGuid());
        var requesterOnlyLine = Assert.Single(settlements[0].GetProperty("lines").EnumerateArray());
        AssertSettlementRequestLineResponseShape(requesterOnlyLine);
        Assert.Equal(requesterOnlyBillId, requesterOnlyLine.GetProperty("sourceExpenseBillId").GetGuid());
        Assert.Equal(JsonValueKind.Null, requesterOnlyLine.GetProperty("sourceBillRevisionId").ValueKind);
        Assert.Equal($"seeded:{requesterOnlySettlementId:D}", requesterOnlyLine.GetProperty("sourceCandidateKey").GetString());
        Assert.Equal("7.89", requesterOnlyLine.GetProperty("exactAmount").GetString());
        Assert.Equal("USD", requesterOnlyLine.GetProperty("currency").GetString());
        Assert.Equal(0, requesterOnlyLine.GetProperty("allocationOrder").GetInt32());
        Assert.Equal(SettlementRequestLineStatuses.Open, requesterOnlyLine.GetProperty("status").GetString());

        using var getRequest = CreateBearerRequest(HttpMethod.Get, SettlementPath(visibleSettlementId), debtorSession.RawSessionToken);
        using var getResponse = await client.SendAsync(getRequest);
        var getContent = await getResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        AssertSafeReadResponseContent(
            getContent,
            debtorSession.RawSessionToken,
            sessionTokenHash,
            HiddenMerchantName,
            HiddenItemName,
            HiddenPaymentMethodLabel);
        using var getPayload = JsonDocument.Parse(getContent);
        AssertSettlementRequestResponseShape(getPayload.RootElement);
        Assert.Equal(visibleSettlementId, getPayload.RootElement.GetProperty("id").GetGuid());
        Assert.Equal(visibleBillId, getPayload.RootElement.GetProperty("sourceExpenseBillId").GetGuid());
        Assert.Equal("12.34", getPayload.RootElement.GetProperty("amount").GetString());
        var visibleLine = Assert.Single(getPayload.RootElement.GetProperty("lines").EnumerateArray());
        AssertSettlementRequestLineResponseShape(visibleLine);
        Assert.Equal(visibleBillId, visibleLine.GetProperty("sourceExpenseBillId").GetGuid());
        Assert.Equal($"seeded:{visibleSettlementId:D}", visibleLine.GetProperty("sourceCandidateKey").GetString());
        Assert.Equal("12.34", visibleLine.GetProperty("exactAmount").GetString());
    }

    [Fact]
    public async Task GroupReadsRequireSettlementPartyRelationshipAndActiveGroupVisibility()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Read Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Group Read Creditor", InitialTimestamp.AddMinutes(1));
        var membershipOnlySession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Membership Only Reader");
        var removedDebtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Removed Settlement Debtor");
        var removedCreditor = await SeedAccountAsync(testFactory, "Removed Settlement Creditor", InitialTimestamp.AddMinutes(2));
        var groupId = await SeedGroupAsync(
            testFactory,
            debtorSession.UserProfileId,
            "Visible Settlement Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(debtorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(creditor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(membershipOnlySession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var visibleBillId = await SeedBillAsync(
            testFactory,
            debtorSession.UserProfileId,
            groupId,
            [new ParticipantSeed(debtorSession.UserProfileId, 30m), new ParticipantSeed(creditor.UserProfileId, 30m)],
            [new PayerSeed(creditor.UserProfileId, 60m)],
            InitialTimestamp);
        var visibleSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            visibleBillId,
            groupId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            30m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(5));
        var removedGroupId = await SeedGroupAsync(
            testFactory,
            removedCreditor.UserProfileId,
            "Removed Settlement Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(removedDebtorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed),
            new MembershipSeed(removedCreditor.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var removedBillId = await SeedBillAsync(
            testFactory,
            removedCreditor.UserProfileId,
            removedGroupId,
            [new ParticipantSeed(removedDebtorSession.UserProfileId, 8m), new ParticipantSeed(removedCreditor.UserProfileId, 8m)],
            [new PayerSeed(removedCreditor.UserProfileId, 16m)],
            InitialTimestamp);
        var removedSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            removedBillId,
            removedGroupId,
            removedDebtorSession.UserProfileId,
            removedCreditor.UserProfileId,
            removedCreditor.UserProfileId,
            8m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(6));
        var deletedGroupId = await SeedGroupAsync(
            testFactory,
            debtorSession.UserProfileId,
            "Deleted Settlement Group",
            InitialTimestamp,
            deletedAtUtc: InitialTimestamp.AddMinutes(7),
            new MembershipSeed(debtorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(creditor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var deletedGroupBillId = await SeedBillAsync(
            testFactory,
            debtorSession.UserProfileId,
            deletedGroupId,
            [new ParticipantSeed(debtorSession.UserProfileId, 9m), new ParticipantSeed(creditor.UserProfileId, 9m)],
            [new PayerSeed(creditor.UserProfileId, 18m)],
            InitialTimestamp);
        var deletedGroupSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            deletedGroupBillId,
            deletedGroupId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            9m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(7));
        var removedCounterpartyGroupId = await SeedGroupAsync(
            testFactory,
            debtorSession.UserProfileId,
            "Removed Counterparty Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(debtorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(removedCreditor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed));
        var removedCounterpartyBillId = await SeedBillAsync(
            testFactory,
            debtorSession.UserProfileId,
            removedCounterpartyGroupId,
            [new ParticipantSeed(debtorSession.UserProfileId, 11m), new ParticipantSeed(removedCreditor.UserProfileId, 11m)],
            [new PayerSeed(removedCreditor.UserProfileId, 22m)],
            InitialTimestamp);
        var removedCounterpartySettlementId = await SeedSettlementRequestAsync(
            testFactory,
            removedCounterpartyBillId,
            removedCounterpartyGroupId,
            debtorSession.UserProfileId,
            removedCreditor.UserProfileId,
            debtorSession.UserProfileId,
            11m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(8));

        using var client = testFactory.CreateClient();
        using var visibleGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPath(visibleSettlementId), debtorSession.RawSessionToken);
        using var visibleGetResponse = await client.SendAsync(visibleGetRequest);
        var visibleGetContent = await visibleGetResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, visibleGetResponse.StatusCode);
        using var visiblePayload = JsonDocument.Parse(visibleGetContent);
        Assert.Equal(groupId, visiblePayload.RootElement.GetProperty("groupId").GetGuid());
        Assert.Equal(debtorSession.UserProfileId, visiblePayload.RootElement.GetProperty("debtorUserProfileId").GetGuid());
        Assert.Equal(creditor.UserProfileId, visiblePayload.RootElement.GetProperty("creditorUserProfileId").GetGuid());

        using var memberListRequest = CreateBearerRequest(HttpMethod.Get, SettlementsPath(), membershipOnlySession.RawSessionToken);
        using var memberListResponse = await client.SendAsync(memberListRequest);
        using var memberListPayload = JsonDocument.Parse(await memberListResponse.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, memberListResponse.StatusCode);
        Assert.Empty(memberListPayload.RootElement.GetProperty("settlements").EnumerateArray());

        using var memberGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPath(visibleSettlementId), membershipOnlySession.RawSessionToken);
        using var memberGetResponse = await client.SendAsync(memberGetRequest);
        await AssertSettlementUnavailableProblemAsync(memberGetResponse);

        using var removedGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPath(removedSettlementId), removedDebtorSession.RawSessionToken);
        using var removedGetResponse = await client.SendAsync(removedGetRequest);
        await AssertSettlementUnavailableProblemAsync(removedGetResponse);

        using var deletedGroupGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPath(deletedGroupSettlementId), debtorSession.RawSessionToken);
        using var deletedGroupGetResponse = await client.SendAsync(deletedGroupGetRequest);
        await AssertSettlementUnavailableProblemAsync(deletedGroupGetResponse);

        using var removedCounterpartyGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPath(removedCounterpartySettlementId), debtorSession.RawSessionToken);
        using var removedCounterpartyGetResponse = await client.SendAsync(removedCounterpartyGetRequest);
        await AssertSettlementUnavailableProblemAsync(removedCounterpartyGetResponse);
    }

    [Fact]
    public async Task DeletedDebtorCreditorOrRequesterFailClosed()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Deleted Party Actor");
        var activeCounterparty = await SeedAccountAsync(testFactory, "Active Counterparty", InitialTimestamp.AddMinutes(1));
        var deletedDebtor = await SeedAccountAsync(testFactory, "Deleted Debtor", InitialTimestamp.AddMinutes(2), InitialTimestamp.AddMinutes(20));
        var deletedCreditor = await SeedAccountAsync(testFactory, "Deleted Creditor", InitialTimestamp.AddMinutes(3), InitialTimestamp.AddMinutes(20));
        var deletedRequester = await SeedAccountAsync(testFactory, "Deleted Requester", InitialTimestamp.AddMinutes(4), InitialTimestamp.AddMinutes(20));
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 10m), new ParticipantSeed(activeCounterparty.UserProfileId, 10m)],
            [new PayerSeed(activeCounterparty.UserProfileId, 20m)],
            InitialTimestamp);
        var deletedDebtorSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            deletedDebtor.UserProfileId,
            actorSession.UserProfileId,
            actorSession.UserProfileId,
            10m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(1));
        var deletedCreditorSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            actorSession.UserProfileId,
            deletedCreditor.UserProfileId,
            actorSession.UserProfileId,
            11m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(2));
        var deletedRequesterSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            actorSession.UserProfileId,
            activeCounterparty.UserProfileId,
            deletedRequester.UserProfileId,
            12m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(3));
        var deletedDebtorPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            deletedDebtorSettlementId,
            deletedDebtor.UserProfileId,
            actorSession.UserProfileId,
            10m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(4));
        var deletedCreditorPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            deletedCreditorSettlementId,
            actorSession.UserProfileId,
            deletedCreditor.UserProfileId,
            11m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(5));
        var deletedRequesterPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            deletedRequesterSettlementId,
            actorSession.UserProfileId,
            activeCounterparty.UserProfileId,
            12m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(6));

        using var client = testFactory.CreateClient();
        foreach (var settlementId in new[]
        {
            deletedDebtorSettlementId,
            deletedCreditorSettlementId,
            deletedRequesterSettlementId
        })
        {
            using var getRequest = CreateBearerRequest(HttpMethod.Get, SettlementPath(settlementId), actorSession.RawSessionToken);
            using var getResponse = await client.SendAsync(getRequest);
            await AssertSettlementUnavailableProblemAsync(getResponse);
        }

        foreach (var paymentId in new[]
        {
            deletedDebtorPaymentId,
            deletedCreditorPaymentId,
            deletedRequesterPaymentId
        })
        {
            using var getRequest = CreateBearerRequest(HttpMethod.Get, SettlementPaymentPath(paymentId), actorSession.RawSessionToken);
            using var getResponse = await client.SendAsync(getRequest);
            await AssertSettlementPaymentUnavailableProblemAsync(getResponse);
        }

        using var listRequest = CreateBearerRequest(HttpMethod.Get, SettlementsPath(), actorSession.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);
        using var listPayload = JsonDocument.Parse(await listResponse.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        Assert.Empty(listPayload.RootElement.GetProperty("settlements").EnumerateArray());

        using var paymentListRequest = CreateBearerRequest(HttpMethod.Get, SettlementPaymentsPath(deletedRequesterSettlementId), actorSession.RawSessionToken);
        using var paymentListResponse = await client.SendAsync(paymentListRequest);
        await AssertSettlementUnavailableProblemAsync(paymentListResponse);
    }

    [Fact]
    public async Task PersonalPaymentListAndGetReturnVisiblePaymentsForDebtorCreditorAndRequesterWithBoundedResponse()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Payment Read Debtor");
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Payment Read Creditor");
        var requesterSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Payment Read Requester");
        var unrelatedSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Unrelated Payment Read User");
        await SeedPaymentProfileWithQrAsync(testFactory, creditorSession.UserProfileId, InitialTimestamp.AddMinutes(2));
        var billId = await SeedBillAsync(
            testFactory,
            creditorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(debtorSession.UserProfileId, 100m), new ParticipantSeed(creditorSession.UserProfileId, 100m)],
            [new PayerSeed(creditorSession.UserProfileId, 200m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtorSession.UserProfileId,
            creditorSession.UserProfileId,
            requesterSession.UserProfileId,
            100m,
            SettlementRequestStatuses.Disputed,
            InitialTimestamp.AddMinutes(3));
        var markedPaidPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditorSession.UserProfileId,
            10m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(4));
        var confirmedPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditorSession.UserProfileId,
            20m,
            SettlementPaymentStatuses.Confirmed,
            InitialTimestamp.AddMinutes(5));
        var disputedPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditorSession.UserProfileId,
            30m,
            SettlementPaymentStatuses.Disputed,
            InitialTimestamp.AddMinutes(6));
        var cancelledPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditorSession.UserProfileId,
            40m,
            SettlementPaymentStatuses.Cancelled,
            InitialTimestamp.AddMinutes(7));
        await SeedSettlementProofAttachmentAsync(
            testFactory,
            markedPaidPaymentId,
            debtorSession.UserProfileId,
            InitialTimestamp.AddMinutes(8));
        var unrelatedBillId = await SeedBillAsync(
            testFactory,
            unrelatedSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(unrelatedSession.UserProfileId, 5m)],
            [new PayerSeed(unrelatedSession.UserProfileId, 5m)],
            InitialTimestamp);
        var unrelatedSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            unrelatedBillId,
            groupId: null,
            unrelatedSession.UserProfileId,
            creditorSession.UserProfileId,
            unrelatedSession.UserProfileId,
            5m,
            SettlementRequestStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(9));
        await SeedSettlementPaymentAsync(
            testFactory,
            unrelatedSettlementId,
            unrelatedSession.UserProfileId,
            creditorSession.UserProfileId,
            5m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(10));
        var archivedSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtorSession.UserProfileId,
            creditorSession.UserProfileId,
            requesterSession.UserProfileId,
            25m,
            SettlementRequestStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(11),
            archivedAtUtc: InitialTimestamp.AddMinutes(12));
        var archivedPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            archivedSettlementId,
            debtorSession.UserProfileId,
            creditorSession.UserProfileId,
            25m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(13));
        var before = await ReadSideEffectCountsAsync(testFactory);
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, debtorSession.AuthSessionId);

        using var client = testFactory.CreateClient();
        using var debtorListRequest = CreateBearerRequest(HttpMethod.Get, SettlementPaymentsPath(settlementId), debtorSession.RawSessionToken);
        using var debtorListResponse = await client.SendAsync(debtorListRequest);
        var debtorListContent = await debtorListResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, debtorListResponse.StatusCode);
        Assert.Equal("application/json", debtorListResponse.Content.Headers.ContentType?.MediaType);
        AssertSafeReadResponseContent(
            debtorListContent,
            debtorSession.RawSessionToken,
            sessionTokenHash,
            HiddenMerchantName,
            HiddenItemName,
            HiddenPaymentMethodLabel,
            HiddenPaymentHandle,
            HiddenPaymentNote,
            HiddenStorageObjectKey,
            HiddenOriginalFilename,
            "Unrelated Payment Read User");
        using var debtorListPayload = JsonDocument.Parse(debtorListContent);
        Assert.Equal(["payments"], debtorListPayload.RootElement.EnumerateObject().Select(property => property.Name).ToArray());
        var payments = debtorListPayload.RootElement.GetProperty("payments").EnumerateArray().ToArray();
        Assert.Equal(4, payments.Length);
        Assert.Equal(
            [cancelledPaymentId, disputedPaymentId, confirmedPaymentId, markedPaidPaymentId],
            payments.Select(payment => payment.GetProperty("paymentId").GetGuid()).ToArray());
        var paymentStatuses = payments
            .Select(payment => payment.GetProperty("status").GetString())
            .ToArray();
        Assert.Equal(
            new string?[]
            {
                SettlementPaymentStatuses.Cancelled,
                SettlementPaymentStatuses.Disputed,
                SettlementPaymentStatuses.Confirmed,
                SettlementPaymentStatuses.MarkedPaid
            },
            paymentStatuses);
        Assert.All(payments, AssertSettlementPaymentResponseShape);
        Assert.All(payments, payment =>
        {
            Assert.Equal(settlementId, payment.GetProperty("settlementRequestId").GetGuid());
            Assert.Equal(debtorSession.UserProfileId, payment.GetProperty("paidByUserProfileId").GetGuid());
            Assert.Equal(creditorSession.UserProfileId, payment.GetProperty("receivedByUserProfileId").GetGuid());
            Assert.Equal(SettlementRequestStatuses.Disputed, payment.GetProperty("settlementRequestStatus").GetString());
            var allocation = Assert.Single(payment.GetProperty("allocations").EnumerateArray());
            AssertSettlementPaymentAllocationResponseShape(allocation);
            Assert.Equal(payment.GetProperty("amount").GetString(), allocation.GetProperty("clearedAmount").GetString());
            Assert.Equal("USD", allocation.GetProperty("currency").GetString());
        });

        using var creditorGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPaymentPath(confirmedPaymentId), creditorSession.RawSessionToken);
        using var creditorGetResponse = await client.SendAsync(creditorGetRequest);
        var creditorGetContent = await creditorGetResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, creditorGetResponse.StatusCode);
        AssertSafeReadResponseContent(creditorGetContent, HiddenPaymentHandle, HiddenPaymentNote, HiddenStorageObjectKey);
        using var creditorGetPayload = JsonDocument.Parse(creditorGetContent);
        AssertSettlementPaymentResponseShape(creditorGetPayload.RootElement);
        Assert.Equal(confirmedPaymentId, creditorGetPayload.RootElement.GetProperty("paymentId").GetGuid());
        Assert.Equal("20", creditorGetPayload.RootElement.GetProperty("amount").GetString());
        Assert.Equal("20", Assert.Single(creditorGetPayload.RootElement.GetProperty("allocations").EnumerateArray()).GetProperty("clearedAmount").GetString());

        using var requesterListRequest = CreateBearerRequest(HttpMethod.Get, SettlementPaymentsPath(settlementId), requesterSession.RawSessionToken);
        using var requesterListResponse = await client.SendAsync(requesterListRequest);
        using var requesterListPayload = JsonDocument.Parse(await requesterListResponse.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.OK, requesterListResponse.StatusCode);
        Assert.Equal(4, requesterListPayload.RootElement.GetProperty("payments").GetArrayLength());

        using var unrelatedListRequest = CreateBearerRequest(HttpMethod.Get, SettlementPaymentsPath(settlementId), unrelatedSession.RawSessionToken);
        using var unrelatedListResponse = await client.SendAsync(unrelatedListRequest);
        await AssertSettlementUnavailableProblemAsync(unrelatedListResponse);

        using var unrelatedGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPaymentPath(markedPaidPaymentId), unrelatedSession.RawSessionToken);
        using var unrelatedGetResponse = await client.SendAsync(unrelatedGetRequest);
        await AssertSettlementPaymentUnavailableProblemAsync(unrelatedGetResponse);

        using var archivedListRequest = CreateBearerRequest(HttpMethod.Get, SettlementPaymentsPath(archivedSettlementId), debtorSession.RawSessionToken);
        using var archivedListResponse = await client.SendAsync(archivedListRequest);
        await AssertSettlementUnavailableProblemAsync(archivedListResponse);

        using var archivedGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPaymentPath(archivedPaymentId), debtorSession.RawSessionToken);
        using var archivedGetResponse = await client.SendAsync(archivedGetRequest);
        await AssertSettlementPaymentUnavailableProblemAsync(archivedGetResponse);

        var after = await ReadSideEffectCountsAsync(testFactory);
        Assert.Equal(before, after);
    }

    [Fact]
    public async Task GroupPaymentReadsRequireSettlementPartyRelationshipAndActiveGroupVisibility()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Payment Read Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Group Payment Read Creditor", InitialTimestamp.AddMinutes(1));
        var requester = await SeedAccountAsync(testFactory, "Group Payment Read Requester", InitialTimestamp.AddMinutes(2));
        var membershipOnlySession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Payment Membership Only");
        var groupId = await SeedGroupAsync(
            testFactory,
            debtorSession.UserProfileId,
            "Visible Payment Read Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(debtorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(creditor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(requester.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(membershipOnlySession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var billId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId,
            [new ParticipantSeed(debtorSession.UserProfileId, 60m), new ParticipantSeed(creditor.UserProfileId, 60m)],
            [new PayerSeed(creditor.UserProfileId, 120m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            requester.UserProfileId,
            60m,
            SettlementRequestStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
        var paymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            60m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(4));

        var removedDebtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Removed Group Payment Debtor");
        var removedCreditor = await SeedAccountAsync(testFactory, "Removed Group Payment Creditor", InitialTimestamp.AddMinutes(5));
        var removedGroupId = await SeedGroupAsync(
            testFactory,
            removedCreditor.UserProfileId,
            "Removed Payment Read Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(removedDebtorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed),
            new MembershipSeed(removedCreditor.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var removedBillId = await SeedBillAsync(
            testFactory,
            removedCreditor.UserProfileId,
            removedGroupId,
            [new ParticipantSeed(removedDebtorSession.UserProfileId, 8m), new ParticipantSeed(removedCreditor.UserProfileId, 8m)],
            [new PayerSeed(removedCreditor.UserProfileId, 16m)],
            InitialTimestamp);
        var removedSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            removedBillId,
            removedGroupId,
            removedDebtorSession.UserProfileId,
            removedCreditor.UserProfileId,
            removedCreditor.UserProfileId,
            8m,
            SettlementRequestStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(6));
        var removedPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            removedSettlementId,
            removedDebtorSession.UserProfileId,
            removedCreditor.UserProfileId,
            8m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(7));

        using var client = testFactory.CreateClient();
        using var visibleListRequest = CreateBearerRequest(HttpMethod.Get, SettlementPaymentsPath(settlementId), debtorSession.RawSessionToken);
        using var visibleListResponse = await client.SendAsync(visibleListRequest);
        using var visibleListPayload = JsonDocument.Parse(await visibleListResponse.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.OK, visibleListResponse.StatusCode);
        Assert.Equal(paymentId, Assert.Single(visibleListPayload.RootElement.GetProperty("payments").EnumerateArray()).GetProperty("paymentId").GetGuid());

        using var membershipOnlyListRequest = CreateBearerRequest(HttpMethod.Get, SettlementPaymentsPath(settlementId), membershipOnlySession.RawSessionToken);
        using var membershipOnlyListResponse = await client.SendAsync(membershipOnlyListRequest);
        await AssertSettlementUnavailableProblemAsync(membershipOnlyListResponse);

        using var membershipOnlyGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPaymentPath(paymentId), membershipOnlySession.RawSessionToken);
        using var membershipOnlyGetResponse = await client.SendAsync(membershipOnlyGetRequest);
        await AssertSettlementPaymentUnavailableProblemAsync(membershipOnlyGetResponse);

        using var removedListRequest = CreateBearerRequest(HttpMethod.Get, SettlementPaymentsPath(removedSettlementId), removedDebtorSession.RawSessionToken);
        using var removedListResponse = await client.SendAsync(removedListRequest);
        await AssertSettlementUnavailableProblemAsync(removedListResponse);

        using var removedGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPaymentPath(removedPaymentId), removedDebtorSession.RawSessionToken);
        using var removedGetResponse = await client.SendAsync(removedGetRequest);
        await AssertSettlementPaymentUnavailableProblemAsync(removedGetResponse);
    }

    [Fact]
    public async Task MissingOrInvalidSessionReturnsUniformUnauthorizedForReadEndpoints()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        var settlementId = Guid.NewGuid();

        using var missingListRequest = new HttpRequestMessage(HttpMethod.Get, SettlementsPath());
        using var missingListResponse = await client.SendAsync(missingListRequest);
        await AssertUnauthenticatedProblemAsync(missingListResponse);

        using var invalidListRequest = CreateBearerRequest(HttpMethod.Get, SettlementsPath(), WrongRawToken);
        using var invalidListResponse = await client.SendAsync(invalidListRequest);
        await AssertUnauthenticatedProblemAsync(invalidListResponse, WrongRawToken);

        using var missingGetRequest = new HttpRequestMessage(HttpMethod.Get, SettlementPath(settlementId));
        using var missingGetResponse = await client.SendAsync(missingGetRequest);
        await AssertUnauthenticatedProblemAsync(missingGetResponse);

        using var invalidGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPath(settlementId), WrongRawToken);
        using var invalidGetResponse = await client.SendAsync(invalidGetRequest);
        await AssertUnauthenticatedProblemAsync(invalidGetResponse, WrongRawToken);

        using var missingPaymentListRequest = new HttpRequestMessage(HttpMethod.Get, SettlementPaymentsPath(settlementId));
        using var missingPaymentListResponse = await client.SendAsync(missingPaymentListRequest);
        await AssertUnauthenticatedProblemAsync(missingPaymentListResponse);

        using var invalidPaymentListRequest = CreateBearerRequest(HttpMethod.Get, SettlementPaymentsPath(settlementId), WrongRawToken);
        using var invalidPaymentListResponse = await client.SendAsync(invalidPaymentListRequest);
        await AssertUnauthenticatedProblemAsync(invalidPaymentListResponse, WrongRawToken);

        using var missingPaymentGetRequest = new HttpRequestMessage(HttpMethod.Get, SettlementPaymentPath(Guid.NewGuid()));
        using var missingPaymentGetResponse = await client.SendAsync(missingPaymentGetRequest);
        await AssertUnauthenticatedProblemAsync(missingPaymentGetResponse);

        using var invalidPaymentGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPaymentPath(Guid.NewGuid()), WrongRawToken);
        using var invalidPaymentGetResponse = await client.SendAsync(invalidPaymentGetRequest);
        await AssertUnauthenticatedProblemAsync(invalidPaymentGetResponse, WrongRawToken);
    }

    [Fact]
    public async Task SettlementReadEndpointsDoNotWriteSettlementPaymentProofFilePaymentProfileOrNonSessionAuditSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Read Side Effect Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Read Side Effect Creditor", InitialTimestamp.AddMinutes(1));
        await SeedPaymentProfileWithQrAsync(testFactory, creditor.UserProfileId, InitialTimestamp.AddMinutes(2));
        var billId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [new ParticipantSeed(debtorSession.UserProfileId, 14m), new ParticipantSeed(creditor.UserProfileId, 14m)],
            [new PayerSeed(creditor.UserProfileId, 28m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            14m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(5));
        var paymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            14m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(6));
        await SeedSettlementProofAttachmentAsync(
            testFactory,
            paymentId,
            debtorSession.UserProfileId,
            InitialTimestamp.AddMinutes(7));
        var before = await ReadSideEffectCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var listRequest = CreateBearerRequest(HttpMethod.Get, SettlementsPath(), debtorSession.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);

        using var getRequest = CreateBearerRequest(HttpMethod.Get, SettlementPath(settlementId), debtorSession.RawSessionToken);
        using var getResponse = await client.SendAsync(getRequest);
        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);

        using var paymentListRequest = CreateBearerRequest(HttpMethod.Get, SettlementPaymentsPath(settlementId), debtorSession.RawSessionToken);
        using var paymentListResponse = await client.SendAsync(paymentListRequest);
        Assert.Equal(HttpStatusCode.OK, paymentListResponse.StatusCode);

        using var paymentGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPaymentPath(paymentId), debtorSession.RawSessionToken);
        using var paymentGetResponse = await client.SendAsync(paymentGetRequest);
        Assert.Equal(HttpStatusCode.OK, paymentGetResponse.StatusCode);

        using var missingGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPath(Guid.NewGuid()), debtorSession.RawSessionToken);
        using var missingGetResponse = await client.SendAsync(missingGetRequest);
        await AssertSettlementUnavailableProblemAsync(missingGetResponse);

        using var missingPaymentListRequest = CreateBearerRequest(HttpMethod.Get, SettlementPaymentsPath(Guid.NewGuid()), debtorSession.RawSessionToken);
        using var missingPaymentListResponse = await client.SendAsync(missingPaymentListRequest);
        await AssertSettlementUnavailableProblemAsync(missingPaymentListResponse);

        using var missingPaymentGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPaymentPath(Guid.NewGuid()), debtorSession.RawSessionToken);
        using var missingPaymentGetResponse = await client.SendAsync(missingPaymentGetRequest);
        await AssertSettlementPaymentUnavailableProblemAsync(missingPaymentGetResponse);

        var after = await ReadSideEffectCountsAsync(testFactory);
        Assert.Equal(before, after);
    }

    [Fact]
    public async Task InvalidSettlementIdRouteReturnsNotFoundWithoutLeakingSessionValues()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Invalid Route Actor");
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, "/api/v1/settlements/not-a-guid", actorSession.RawSessionToken);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.DoesNotContain(actorSession.RawSessionToken, content);

        using var paymentListRequest = CreateBearerRequest(HttpMethod.Get, "/api/v1/settlements/not-a-guid/payments", actorSession.RawSessionToken);
        using var paymentListResponse = await client.SendAsync(paymentListRequest);
        var paymentListContent = await paymentListResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, paymentListResponse.StatusCode);
        Assert.DoesNotContain(actorSession.RawSessionToken, paymentListContent);

        using var paymentGetRequest = CreateBearerRequest(HttpMethod.Get, "/api/v1/settlement-payments/not-a-guid", actorSession.RawSessionToken);
        using var paymentGetResponse = await client.SendAsync(paymentGetRequest);
        var paymentGetContent = await paymentGetResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, paymentGetResponse.StatusCode);
        Assert.DoesNotContain(actorSession.RawSessionToken, paymentGetContent);
    }

    [Fact]
    public void OpenApiAndGeneratedClientsExposeSettlementReadPaymentConfirmationResidualDisputeAndCancellationSurfaces()
    {
        var openApi = File.ReadAllText(FindRepoFile("packages/contracts/openapi/settleora.v1.yaml"));
        var settlementsPathBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlements:");
        var settlementGetPathBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlements/{settlementId}:");
        var settlementRequestDisputePathBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlements/{settlementId}/dispute:");
        var settlementRequestCancellationPathBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlements/{settlementId}/cancel:");
        var settlementPaymentPathBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlements/{settlementId}/payments:");
        var settlementPaymentGetPathBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlement-payments/{paymentId}:");
        var settlementPaymentConfirmationPathBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlement-payments/{paymentId}/confirm:");
        var settlementPaymentResidualConfirmationPathBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlement-payments/{paymentId}/residuals/{residualId}/confirm:");
        var settlementPaymentDisputePathBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlement-payments/{paymentId}/dispute:");
        var settlementPaymentCancellationPathBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlement-payments/{paymentId}/cancel:");
        var listSchemaBlock = ExtractOpenApiSchemaBlock(openApi, "SettlementRequestListResponse:");
        var requestSchemaBlock = ExtractOpenApiSchemaBlock(openApi, "SettlementRequestResponse:");
        var requestLineSchemaBlock = ExtractOpenApiSchemaBlock(openApi, "SettlementRequestLineResponse:");
        var paymentListSchemaBlock = ExtractOpenApiSchemaBlock(openApi, "SettlementPaymentListResponse:");
        var paymentSchemaBlock = ExtractOpenApiSchemaBlock(openApi, "SettlementPaymentResponse:");
        var paymentAllocationSchemaBlock = ExtractOpenApiSchemaBlock(openApi, "SettlementPaymentAllocationResponse:");
        var paymentResidualSchemaBlock = ExtractOpenApiSchemaBlock(openApi, "SettlementPaymentResidualResponse:");

        Assert.Contains("operationId: listSettlementRequests", settlementsPathBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementRequestListResponse", settlementsPathBlock, StringComparison.Ordinal);
        Assert.Contains("operationId: getSettlementRequest", settlementGetPathBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementRequestResponse", settlementGetPathBlock, StringComparison.Ordinal);
        Assert.Contains("operationId: disputeSettlementRequest", settlementRequestDisputePathBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementRequestResponse", settlementRequestDisputePathBlock, StringComparison.Ordinal);
        Assert.DoesNotContain("requestBody:", settlementRequestDisputePathBlock, StringComparison.Ordinal);
        Assert.Contains("operationId: cancelSettlementRequest", settlementRequestCancellationPathBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementRequestResponse", settlementRequestCancellationPathBlock, StringComparison.Ordinal);
        Assert.DoesNotContain("requestBody:", settlementRequestCancellationPathBlock, StringComparison.Ordinal);
        Assert.Contains("operationId: createSettlementPaymentClaim", settlementPaymentPathBlock, StringComparison.Ordinal);
        Assert.Contains("CreateSettlementPaymentRequest", settlementPaymentPathBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementPaymentResponse", settlementPaymentPathBlock, StringComparison.Ordinal);
        Assert.Contains("operationId: listSettlementPayments", settlementPaymentPathBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementPaymentListResponse", settlementPaymentPathBlock, StringComparison.Ordinal);
        Assert.Contains("operationId: getSettlementPayment", settlementPaymentGetPathBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementPaymentResponse", settlementPaymentGetPathBlock, StringComparison.Ordinal);
        Assert.DoesNotContain("requestBody:", settlementPaymentGetPathBlock, StringComparison.Ordinal);
        Assert.Contains("operationId: confirmSettlementPayment", settlementPaymentConfirmationPathBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementPaymentResponse", settlementPaymentConfirmationPathBlock, StringComparison.Ordinal);
        Assert.DoesNotContain("requestBody:", settlementPaymentConfirmationPathBlock, StringComparison.Ordinal);
        Assert.Contains("operationId: confirmSettlementPaymentResidual", settlementPaymentResidualConfirmationPathBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementPaymentResponse", settlementPaymentResidualConfirmationPathBlock, StringComparison.Ordinal);
        Assert.DoesNotContain("requestBody:", settlementPaymentResidualConfirmationPathBlock, StringComparison.Ordinal);
        Assert.Contains("operationId: disputeSettlementPayment", settlementPaymentDisputePathBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementPaymentResponse", settlementPaymentDisputePathBlock, StringComparison.Ordinal);
        Assert.DoesNotContain("requestBody:", settlementPaymentDisputePathBlock, StringComparison.Ordinal);
        Assert.Contains("operationId: cancelSettlementPayment", settlementPaymentCancellationPathBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementPaymentResponse", settlementPaymentCancellationPathBlock, StringComparison.Ordinal);
        Assert.DoesNotContain("requestBody:", settlementPaymentCancellationPathBlock, StringComparison.Ordinal);
        Assert.Contains("settlements", listSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementRequestResponse", listSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("lines", requestSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementRequestLineResponse", requestSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("sourceCandidateKey", requestLineSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("sourceBillRevisionId", requestLineSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("payments", paymentListSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementPaymentResponse", paymentListSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("allocations", paymentSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementPaymentAllocationResponse", paymentSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("residuals", paymentSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementPaymentResidualResponse", paymentSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("settlementRequestLineId", paymentAllocationSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("clearedAmount", paymentAllocationSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementResidualPolicy", paymentResidualSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementResidualStatus", paymentResidualSchemaBlock, StringComparison.Ordinal);
        Assert.DoesNotContain("markSettlementPaid", openApi, StringComparison.Ordinal);
        Assert.DoesNotContain("proofSettlementPayment", openApi, StringComparison.Ordinal);
        Assert.DoesNotContain("/api/v1/files/{fileId}", openApi, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("listSettlementBalanceProjections", openApi, StringComparison.Ordinal);

        var webClient = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/client.ts"));
        var dartClient = File.ReadAllText(FindRepoFile("packages/client-dart/lib/generated/client.dart"));
        var webModels = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/models.ts"));
        var dartModels = File.ReadAllText(FindRepoFile("packages/client-dart/lib/generated/models.dart"));
        var generatedContent = string.Join("\n", webClient, dartClient, webModels, dartModels);

        Assert.Contains("listSettlementRequests", generatedContent, StringComparison.Ordinal);
        Assert.Contains("getSettlementRequest", generatedContent, StringComparison.Ordinal);
        Assert.Contains("listSettlementPayments", generatedContent, StringComparison.Ordinal);
        Assert.Contains("getSettlementPayment", generatedContent, StringComparison.Ordinal);
        Assert.Contains("createSettlementPaymentClaim", generatedContent, StringComparison.Ordinal);
        Assert.Contains("confirmSettlementPayment", generatedContent, StringComparison.Ordinal);
        Assert.Contains("confirmSettlementPaymentResidual", generatedContent, StringComparison.Ordinal);
        Assert.Contains("disputeSettlementRequest", generatedContent, StringComparison.Ordinal);
        Assert.Contains("disputeSettlementPayment", generatedContent, StringComparison.Ordinal);
        Assert.Contains("cancelSettlementRequest", generatedContent, StringComparison.Ordinal);
        Assert.Contains("cancelSettlementPayment", generatedContent, StringComparison.Ordinal);
        Assert.Contains("SettlementRequestListResponse", generatedContent, StringComparison.Ordinal);
        Assert.Contains("SettlementRequestLineResponse", generatedContent, StringComparison.Ordinal);
        Assert.Contains("sourceCandidateKey", generatedContent, StringComparison.Ordinal);
        Assert.Contains("SettlementPaymentListResponse", generatedContent, StringComparison.Ordinal);
        Assert.Contains("SettlementPaymentResponse", generatedContent, StringComparison.Ordinal);
        Assert.Contains("SettlementPaymentAllocationResponse", generatedContent, StringComparison.Ordinal);
        Assert.Contains("SettlementPaymentResidualResponse", generatedContent, StringComparison.Ordinal);
        Assert.Contains("SettlementResidualPolicy", generatedContent, StringComparison.Ordinal);
        Assert.Contains("SettlementResidualStatus", generatedContent, StringComparison.Ordinal);
        Assert.Contains("settlementRequestLineId", generatedContent, StringComparison.Ordinal);
        Assert.Contains("clearedAmount", generatedContent, StringComparison.Ordinal);
        Assert.DoesNotContain("markSettlementPaid", generatedContent, StringComparison.Ordinal);
        Assert.DoesNotContain("proofSettlementPayment", generatedContent, StringComparison.Ordinal);
        Assert.DoesNotContain("uploadSettlement", generatedContent, StringComparison.Ordinal);
        Assert.DoesNotContain("downloadSettlement", generatedContent, StringComparison.Ordinal);
        Assert.Contains("listSettlementBalanceProjections", generatedContent, StringComparison.Ordinal);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new SettlementRequestReadTestTimeProvider(InitialTimestamp);
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
        SettlementRequestReadTestTimeProvider timeProvider,
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
        SettlementRequestReadTestTimeProvider timeProvider,
        SeededAccount account)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Settlement request read endpoint test",
                UserAgentSummary: "Settlement request read endpoint test user agent",
                NetworkAddressHash: "settlement-request-read-endpoint-test-network",
                RequestedLifetime: TimeSpan.FromHours(1)));

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
        DateTimeOffset createdAtUtc)
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
            GroupId = groupId,
            MerchantName = HiddenMerchantName,
            BillDate = DateOnly.FromDateTime(createdAtUtc.UtcDateTime),
            Status = ExpenseBillStatuses.Confirmed,
            TotalAmount = totalAmount,
            TotalCurrency = "USD",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        };
        var item = new ExpenseBillItem
        {
            Id = itemId,
            ExpenseBillId = billId,
            Name = HiddenItemName,
            Amount = totalAmount,
            Currency = "USD",
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
                Status = ExpenseBillParticipantStatuses.Accepted,
                ResolvedShareAmount = participant.ResolvedShareAmount,
                ResolvedShareCurrency = "USD",
                AcceptedAtUtc = createdAtUtc,
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
                ResolvedCurrency = "USD",
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
                Amount = payer.Amount,
                Currency = "USD",
                PaymentMethodLabelSnapshot = HiddenPaymentMethodLabel,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        dbContext.Set<ExpenseBill>().Add(bill);
        await dbContext.SaveChangesAsync();
        return billId;
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
        DateTimeOffset? archivedAtUtc = null)
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
            Currency = "USD",
            Status = status,
            RequestedByUserProfileId = requestedByUserProfileId,
            RequestedAtUtc = requestedAtUtc,
            CreatedAtUtc = requestedAtUtc,
            UpdatedAtUtc = requestedAtUtc,
            ArchivedAtUtc = archivedAtUtc
        };
        settlementRequest.Lines.Add(new SettlementRequestLine
        {
            Id = Guid.NewGuid(),
            SettlementRequestId = settlementId,
            SourceExpenseBillId = billId,
            SourceCandidateKey = $"seeded:{settlementId:D}",
            ExactAmount = amount,
            Currency = "USD",
            AllocationOrder = 0,
            Status = SettlementRequestLineStatuses.Open,
            CreatedAtUtc = requestedAtUtc,
            UpdatedAtUtc = requestedAtUtc
        });
        dbContext.Set<SettlementRequest>().Add(settlementRequest);

        await dbContext.SaveChangesAsync();
        return settlementId;
    }

    private static async Task<Guid> SeedSettlementPaymentAsync(
        WebApplicationFactory<Program> testFactory,
        Guid settlementId,
        Guid paidByUserProfileId,
        Guid receivedByUserProfileId,
        decimal amount,
        string status,
        DateTimeOffset createdAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var paymentId = Guid.NewGuid();
        var payment = new SettlementPayment
        {
            Id = paymentId,
            SettlementRequestId = settlementId,
            PaidByUserProfileId = paidByUserProfileId,
            ReceivedByUserProfileId = receivedByUserProfileId,
            Amount = amount,
            Currency = "USD",
            Status = status,
            PaymentDate = DateOnly.FromDateTime(createdAtUtc.UtcDateTime),
            CreatedByUserProfileId = paidByUserProfileId,
            ClaimedAtUtc = createdAtUtc,
            ConfirmedAtUtc = status == SettlementPaymentStatuses.Confirmed ? createdAtUtc.AddMinutes(1) : null,
            DisputedAtUtc = status == SettlementPaymentStatuses.Disputed ? createdAtUtc.AddMinutes(1) : null,
            CancelledAtUtc = status == SettlementPaymentStatuses.Cancelled ? createdAtUtc.AddMinutes(1) : null,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        };
        dbContext.Set<SettlementPayment>().Add(payment);

        if (amount > 0m)
        {
            var requestLine = await dbContext.Set<SettlementRequestLine>()
                .Where(line => line.SettlementRequestId == settlementId)
                .OrderBy(line => line.AllocationOrder)
                .ThenBy(line => line.CreatedAtUtc)
                .ThenBy(line => line.Id)
                .FirstAsync();
            dbContext.Set<SettlementPaymentAllocation>().Add(new SettlementPaymentAllocation
            {
                Id = Guid.NewGuid(),
                SettlementPaymentId = paymentId,
                SettlementRequestLineId = requestLine.Id,
                ClearedAmount = amount,
                Currency = "USD",
                AllocationOrder = 0,
                CreatedAtUtc = createdAtUtc
            });
        }

        await dbContext.SaveChangesAsync();
        return paymentId;
    }

    private static async Task<Guid> SeedPaymentProfileWithQrAsync(
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
        var paymentProfileId = Guid.NewGuid();
        dbContext.Set<UserPaymentProfile>().Add(new UserPaymentProfile
        {
            Id = paymentProfileId,
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
        return paymentProfileId;
    }

    private static async Task<Guid> SeedSettlementProofAttachmentAsync(
        WebApplicationFactory<Program> testFactory,
        Guid paymentId,
        Guid createdByUserProfileId,
        DateTimeOffset createdAtUtc)
    {
        var fileObjectId = await SeedFileObjectAsync(
            testFactory,
            createdByUserProfileId,
            FileObjectPurposes.SettlementProof,
            HiddenStorageObjectKey,
            createdAtUtc);

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        dbContext.Set<SettlementProofAttachment>().Add(new SettlementProofAttachment
        {
            SettlementPaymentId = paymentId,
            FileObjectId = fileObjectId,
            CreatedByUserProfileId = createdByUserProfileId,
            CreatedAtUtc = createdAtUtc
        });

        await dbContext.SaveChangesAsync();
        return fileObjectId;
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

    private static async Task<string> ReadSessionTokenHashAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authSessionId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthSession>()
            .Where(session => session.Id == authSessionId)
            .Select(session => session.SessionTokenHash)
            .SingleAsync();
    }

    private static async Task<ReadSideEffectCounts> ReadSideEffectCountsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return new ReadSideEffectCounts(
            await dbContext.Set<SettlementRequest>().CountAsync(),
            await dbContext.Set<SettlementRequestLine>().CountAsync(),
            await dbContext.Set<SettlementPayment>().CountAsync(),
            await dbContext.Set<SettlementPaymentAllocation>().CountAsync(),
            await dbContext.Set<SettlementProofAttachment>().CountAsync(),
            await dbContext.Set<FileObject>().CountAsync(),
            await dbContext.Set<UserPaymentProfile>().CountAsync(),
            await dbContext.Set<AuthAuditEvent>().CountAsync(auditEvent =>
                auditEvent.Action != "session.created"
                && auditEvent.Action != "session.validated"
                && auditEvent.Action != "session.validation_failed"
                && auditEvent.Action != "session.revoked"));
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

    private static string SettlementsPath()
    {
        return "/api/v1/settlements";
    }

    private static string SettlementPath(Guid settlementId)
    {
        return $"/api/v1/settlements/{settlementId:D}";
    }

    private static string SettlementPaymentsPath(Guid settlementId)
    {
        return $"/api/v1/settlements/{settlementId:D}/payments";
    }

    private static string SettlementPaymentPath(Guid paymentId)
    {
        return $"/api/v1/settlement-payments/{paymentId:D}";
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

    private static void AssertSettlementPaymentResponseShape(JsonElement response)
    {
        Assert.Equal(
            [
                "allocations",
                "amount",
                "claimedAtUtc",
                "createdAtUtc",
                "currency",
                "paidByUserProfileId",
                "paymentDate",
                "paymentId",
                "receivedByUserProfileId",
                "residuals",
                "settlementRequestId",
                "settlementRequestStatus",
                "status",
                "updatedAtUtc"
            ],
            response.EnumerateObject()
                .Select(property => property.Name)
                .Order(StringComparer.Ordinal)
                .ToArray());
    }

    private static void AssertSettlementPaymentAllocationResponseShape(JsonElement response)
    {
        Assert.Equal(
            [
                "allocationOrder",
                "clearedAmount",
                "createdAtUtc",
                "currency",
                "id",
                "settlementRequestLineId"
            ],
            response.EnumerateObject()
                .Select(property => property.Name)
                .Order(StringComparer.Ordinal)
                .ToArray());
    }

    private static void AssertSafeReadResponseContent(
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
        Assert.DoesNotContain("ocr", lowerContent);
    }

    private static async Task AssertSettlementUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Settlement unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested settlement is unavailable.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertSettlementPaymentUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Settlement payment unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested settlement payment is unavailable.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertUnauthenticatedProblemAsync(
        HttpResponseMessage response,
        string? unexpectedResponseText = null)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
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

    private static void AssertSafeProblemContent(string content)
    {
        var lowerContent = content.ToLowerInvariant();
        Assert.DoesNotContain("merchant", lowerContent);
        Assert.DoesNotContain("paymenthandle", lowerContent);
        Assert.DoesNotContain("payment_handle", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("objectkey", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
        Assert.DoesNotContain("proof", lowerContent);
        Assert.DoesNotContain("qr", lowerContent);
        Assert.DoesNotContain("filename", lowerContent);
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
        SettlementRequestReadTestTimeProvider TimeProvider);

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
        decimal ResolvedShareAmount);

    private sealed record PayerSeed(
        Guid UserProfileId,
        decimal Amount);

    private sealed record ReadSideEffectCounts(
        int SettlementRequestCount,
        int SettlementRequestLineCount,
        int SettlementPaymentCount,
        int SettlementPaymentAllocationCount,
        int SettlementProofAttachmentCount,
        int FileObjectCount,
        int UserPaymentProfileCount,
        int NonSessionAuditEventCount);

    private sealed class SettlementRequestReadTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public SettlementRequestReadTestTimeProvider(DateTimeOffset utcNow)
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
