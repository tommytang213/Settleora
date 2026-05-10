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

public sealed class SettlementBalanceProjectionEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string WrongRawToken = "visible-wrong-settlement-balance-session-token";
    private const string HiddenMerchantName = "Hidden Settlement Balance Merchant";
    private const string HiddenItemName = "Hidden Settlement Balance Item";
    private const string HiddenPaymentMethodLabel = "Hidden settlement balance payment method";
    private const string HiddenPaymentHandle = "hidden-settlement-balance-payment-handle";
    private const string HiddenPaymentNote = "hidden settlement balance payment note";
    private const string HiddenStorageObjectKey = "hidden/settlement/balance/storage-object-key";
    private const string HiddenOriginalFilename = "hidden-settlement-balance-proof.png";
    private const string HiddenAuditMetadata = """{"requestBody":"hidden settlement balance raw body","paymentHandle":"hidden audit handle","storageObjectKey":"hidden audit object"}""";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 10, 9, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 10, 9, 42, 0, TimeSpan.Zero);
    private static readonly DateOnly PaymentDate = new(2026, 5, 10);

    private readonly WebApplicationFactory<Program> factory;

    public SettlementBalanceProjectionEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task ActorWithNoVisibleSettlementsGetsEmptyReadOnlyProjection()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Empty Balance Actor");
        var beforeCounts = await ReadReadOnlyCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, SettlementBalancesPath(), actorSession.RawSessionToken);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        using var payload = JsonDocument.Parse(content);
        AssertBalanceProjectionListShape(payload.RootElement);
        Assert.Equal(ValidationTimestamp, payload.RootElement.GetProperty("generatedAtUtc").GetDateTimeOffset());
        Assert.Empty(payload.RootElement.GetProperty("balances").EnumerateArray());
        Assert.Equal(beforeCounts, await ReadReadOnlyCountsAsync(testFactory));
    }

    [Fact]
    public async Task PersonalSettlementProjectsOutgoingForDebtorIncomingForCreditorAndExcludesRequesterOnlyRecords()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Balance Debtor");
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Balance Creditor");
        var requesterOnlySession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Requester Only Balance Actor");
        var otherDebtor = await SeedAccountAsync(testFactory, "Requester Only Balance Debtor", InitialTimestamp.AddMinutes(1));
        var otherCreditor = await SeedAccountAsync(testFactory, "Requester Only Balance Creditor", InitialTimestamp.AddMinutes(2));
        var billId = await SeedBillAsync(
            testFactory,
            creditorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtorSession.UserProfileId, 25m),
                new ParticipantSeed(creditorSession.UserProfileId, 25m)
            ],
            [new PayerSeed(creditorSession.UserProfileId, 50m)],
            InitialTimestamp);
        await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtorSession.UserProfileId,
            creditorSession.UserProfileId,
            creditorSession.UserProfileId,
            25m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(5));
        var requesterOnlyBillId = await SeedBillAsync(
            testFactory,
            otherCreditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(otherDebtor.UserProfileId, 8m),
                new ParticipantSeed(otherCreditor.UserProfileId, 8m)
            ],
            [new PayerSeed(otherCreditor.UserProfileId, 16m)],
            InitialTimestamp.AddMinutes(1));
        await SeedSettlementRequestAsync(
            testFactory,
            requesterOnlyBillId,
            groupId: null,
            otherDebtor.UserProfileId,
            otherCreditor.UserProfileId,
            requesterOnlySession.UserProfileId,
            8m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(6));

        using var client = testFactory.CreateClient();
        var debtorBalances = await GetBalancesAsync(client, debtorSession.RawSessionToken);
        var creditorBalances = await GetBalancesAsync(client, creditorSession.RawSessionToken);
        var requesterOnlyBalances = await GetBalancesAsync(client, requesterOnlySession.RawSessionToken);

        var outgoing = Assert.Single(debtorBalances);
        AssertBalanceProjectionShape(outgoing);
        Assert.Equal(creditorSession.UserProfileId, outgoing.GetProperty("counterpartyUserProfileId").GetGuid());
        Assert.Equal(JsonValueKind.Null, outgoing.GetProperty("groupId").ValueKind);
        Assert.Equal(SettlementBalanceDirections.Outgoing, outgoing.GetProperty("direction").GetString());
        Assert.Equal("USD", outgoing.GetProperty("currency").GetString());
        Assert.Equal("25", outgoing.GetProperty("selectedLineAmount").GetString());
        Assert.Equal("25", outgoing.GetProperty("remainingUnclaimedAmount").GetString());
        Assert.Equal(1, outgoing.GetProperty("requestCount").GetInt32());
        Assert.Equal(1, outgoing.GetProperty("lineCount").GetInt32());

        var incoming = Assert.Single(creditorBalances);
        AssertBalanceProjectionShape(incoming);
        Assert.Equal(debtorSession.UserProfileId, incoming.GetProperty("counterpartyUserProfileId").GetGuid());
        Assert.Equal(SettlementBalanceDirections.Incoming, incoming.GetProperty("direction").GetString());
        Assert.Equal("25", incoming.GetProperty("selectedLineAmount").GetString());
        Assert.Empty(requesterOnlyBalances);
    }

    [Fact]
    public async Task GroupProjectionRequiresActiveActorMembershipAndSettlementPartyRelationship()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Balance Debtor");
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Balance Creditor");
        var membershipOnlySession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Balance Membership Only");
        var removedDebtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Removed Group Balance Debtor");
        var nonMemberDebtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Non Member Group Balance Debtor");
        var groupId = await SeedGroupAsync(
            testFactory,
            debtorSession.UserProfileId,
            "Visible Balance Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(debtorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(creditorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(membershipOnlySession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var billId = await SeedBillAsync(
            testFactory,
            creditorSession.UserProfileId,
            groupId,
            [
                new ParticipantSeed(debtorSession.UserProfileId, 30m),
                new ParticipantSeed(creditorSession.UserProfileId, 30m)
            ],
            [new PayerSeed(creditorSession.UserProfileId, 60m)],
            InitialTimestamp);
        await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId,
            debtorSession.UserProfileId,
            creditorSession.UserProfileId,
            creditorSession.UserProfileId,
            30m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(4));

        var removedGroupId = await SeedGroupAsync(
            testFactory,
            creditorSession.UserProfileId,
            "Removed Balance Group",
            InitialTimestamp.AddMinutes(1),
            deletedAtUtc: null,
            new MembershipSeed(removedDebtorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed),
            new MembershipSeed(creditorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var removedBillId = await SeedBillAsync(
            testFactory,
            creditorSession.UserProfileId,
            removedGroupId,
            [
                new ParticipantSeed(removedDebtorSession.UserProfileId, 11m),
                new ParticipantSeed(creditorSession.UserProfileId, 11m)
            ],
            [new PayerSeed(creditorSession.UserProfileId, 22m)],
            InitialTimestamp.AddMinutes(2));
        await SeedSettlementRequestAsync(
            testFactory,
            removedBillId,
            removedGroupId,
            removedDebtorSession.UserProfileId,
            creditorSession.UserProfileId,
            creditorSession.UserProfileId,
            11m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(5));

        var nonMemberGroupId = await SeedGroupAsync(
            testFactory,
            creditorSession.UserProfileId,
            "Non Member Balance Group",
            InitialTimestamp.AddMinutes(3),
            deletedAtUtc: null,
            new MembershipSeed(creditorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var nonMemberBillId = await SeedBillAsync(
            testFactory,
            creditorSession.UserProfileId,
            nonMemberGroupId,
            [
                new ParticipantSeed(nonMemberDebtorSession.UserProfileId, 12m),
                new ParticipantSeed(creditorSession.UserProfileId, 12m)
            ],
            [new PayerSeed(creditorSession.UserProfileId, 24m)],
            InitialTimestamp.AddMinutes(4));
        await SeedSettlementRequestAsync(
            testFactory,
            nonMemberBillId,
            nonMemberGroupId,
            nonMemberDebtorSession.UserProfileId,
            creditorSession.UserProfileId,
            creditorSession.UserProfileId,
            12m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(6));

        using var client = testFactory.CreateClient();
        var debtorBalances = await GetBalancesAsync(client, debtorSession.RawSessionToken);
        var membershipOnlyBalances = await GetBalancesAsync(client, membershipOnlySession.RawSessionToken);
        var removedBalances = await GetBalancesAsync(client, removedDebtorSession.RawSessionToken);
        var nonMemberBalances = await GetBalancesAsync(client, nonMemberDebtorSession.RawSessionToken);

        var visible = Assert.Single(debtorBalances);
        Assert.Equal(groupId, visible.GetProperty("groupId").GetGuid());
        Assert.Equal(creditorSession.UserProfileId, visible.GetProperty("counterpartyUserProfileId").GetGuid());
        Assert.Equal("30", visible.GetProperty("remainingUnclaimedAmount").GetString());
        Assert.Empty(membershipOnlyBalances);
        Assert.Empty(removedBalances);
        Assert.Empty(nonMemberBalances);
    }

    [Fact]
    public async Task AllocationsSeparatePendingClaimedAndConfirmedClearedCoverage()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Coverage Balance Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Coverage Balance Creditor", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtorSession.UserProfileId, 100m),
                new ParticipantSeed(creditor.UserProfileId, 100m)
            ],
            [new PayerSeed(creditor.UserProfileId, 200m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            100m,
            SettlementRequestStatuses.PartiallyPaid,
            InitialTimestamp.AddMinutes(5));
        await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            30m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(6));
        await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            20m,
            SettlementPaymentStatuses.Confirmed,
            InitialTimestamp.AddMinutes(7));

        using var client = testFactory.CreateClient();
        var balances = await GetBalancesAsync(client, debtorSession.RawSessionToken);

        var balance = Assert.Single(balances);
        Assert.Equal("100", balance.GetProperty("selectedLineAmount").GetString());
        Assert.Equal("30", balance.GetProperty("pendingClaimedAmount").GetString());
        Assert.Equal("20", balance.GetProperty("confirmedClearedAmount").GetString());
        Assert.Equal("50", balance.GetProperty("remainingUnclaimedAmount").GetString());
        Assert.Equal(1, balance.GetProperty("requestCount").GetInt32());
        Assert.Equal(1, balance.GetProperty("lineCount").GetInt32());
        Assert.Equal(1, balance.GetProperty("pendingPaymentCount").GetInt32());
        Assert.Equal(1, balance.GetProperty("confirmedPaymentCount").GetInt32());
    }

    [Fact]
    public async Task FullPendingAndFullConfirmedCoverageReturnZeroRemainingWithSeparateCounters()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Full Coverage Balance Debtor");
        var pendingCreditor = await SeedAccountAsync(testFactory, "Full Pending Balance Creditor", InitialTimestamp.AddMinutes(1));
        var confirmedCreditor = await SeedAccountAsync(testFactory, "Full Confirmed Balance Creditor", InitialTimestamp.AddMinutes(2));
        var pendingBillId = await SeedBillAsync(
            testFactory,
            pendingCreditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtorSession.UserProfileId, 40m),
                new ParticipantSeed(pendingCreditor.UserProfileId, 40m)
            ],
            [new PayerSeed(pendingCreditor.UserProfileId, 80m)],
            InitialTimestamp);
        var pendingSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            pendingBillId,
            groupId: null,
            debtorSession.UserProfileId,
            pendingCreditor.UserProfileId,
            pendingCreditor.UserProfileId,
            40m,
            SettlementRequestStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(5));
        await SeedSettlementPaymentAsync(
            testFactory,
            pendingSettlementId,
            debtorSession.UserProfileId,
            pendingCreditor.UserProfileId,
            40m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(6));

        var confirmedBillId = await SeedBillAsync(
            testFactory,
            confirmedCreditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtorSession.UserProfileId, 55m),
                new ParticipantSeed(confirmedCreditor.UserProfileId, 55m)
            ],
            [new PayerSeed(confirmedCreditor.UserProfileId, 110m)],
            InitialTimestamp.AddMinutes(1));
        var confirmedSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            confirmedBillId,
            groupId: null,
            debtorSession.UserProfileId,
            confirmedCreditor.UserProfileId,
            confirmedCreditor.UserProfileId,
            55m,
            SettlementRequestStatuses.Confirmed,
            InitialTimestamp.AddMinutes(7));
        await SeedSettlementPaymentAsync(
            testFactory,
            confirmedSettlementId,
            debtorSession.UserProfileId,
            confirmedCreditor.UserProfileId,
            55m,
            SettlementPaymentStatuses.Confirmed,
            InitialTimestamp.AddMinutes(8));

        using var client = testFactory.CreateClient();
        var balances = await GetBalancesAsync(client, debtorSession.RawSessionToken);

        Assert.Equal(2, balances.Length);
        var pendingBalance = FindBalance(balances, pendingCreditor.UserProfileId, "USD");
        Assert.Equal("40", pendingBalance.GetProperty("pendingClaimedAmount").GetString());
        Assert.Equal("0", pendingBalance.GetProperty("confirmedClearedAmount").GetString());
        Assert.Equal("0", pendingBalance.GetProperty("remainingUnclaimedAmount").GetString());
        Assert.Equal(1, pendingBalance.GetProperty("pendingPaymentCount").GetInt32());
        Assert.Equal(0, pendingBalance.GetProperty("confirmedPaymentCount").GetInt32());

        var confirmedBalance = FindBalance(balances, confirmedCreditor.UserProfileId, "USD");
        Assert.Equal("0", confirmedBalance.GetProperty("pendingClaimedAmount").GetString());
        Assert.Equal("55", confirmedBalance.GetProperty("confirmedClearedAmount").GetString());
        Assert.Equal("0", confirmedBalance.GetProperty("remainingUnclaimedAmount").GetString());
        Assert.Equal(0, confirmedBalance.GetProperty("pendingPaymentCount").GetInt32());
        Assert.Equal(1, confirmedBalance.GetProperty("confirmedPaymentCount").GetInt32());
    }

    [Fact]
    public async Task CancelledAndDisputedPaymentsAndRequestsAreNotMixedIntoActiveBalances()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Excluded State Balance Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Excluded State Balance Creditor", InitialTimestamp.AddMinutes(1));
        var activeBillId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtorSession.UserProfileId, 80m),
                new ParticipantSeed(creditor.UserProfileId, 80m)
            ],
            [new PayerSeed(creditor.UserProfileId, 160m)],
            InitialTimestamp);
        var activeSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            activeBillId,
            groupId: null,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            80m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(5));
        await SeedSettlementPaymentAsync(
            testFactory,
            activeSettlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            30m,
            SettlementPaymentStatuses.Cancelled,
            InitialTimestamp.AddMinutes(6));
        await SeedSettlementPaymentAsync(
            testFactory,
            activeSettlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            25m,
            SettlementPaymentStatuses.Disputed,
            InitialTimestamp.AddMinutes(7));

        var cancelledBillId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtorSession.UserProfileId, 20m),
                new ParticipantSeed(creditor.UserProfileId, 20m)
            ],
            [new PayerSeed(creditor.UserProfileId, 40m)],
            InitialTimestamp.AddMinutes(1));
        await SeedSettlementRequestAsync(
            testFactory,
            cancelledBillId,
            groupId: null,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            20m,
            SettlementRequestStatuses.Cancelled,
            InitialTimestamp.AddMinutes(8));
        var disputedBillId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtorSession.UserProfileId, 30m),
                new ParticipantSeed(creditor.UserProfileId, 30m)
            ],
            [new PayerSeed(creditor.UserProfileId, 60m)],
            InitialTimestamp.AddMinutes(2));
        await SeedSettlementRequestAsync(
            testFactory,
            disputedBillId,
            groupId: null,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            30m,
            SettlementRequestStatuses.Disputed,
            InitialTimestamp.AddMinutes(9));

        using var client = testFactory.CreateClient();
        var balances = await GetBalancesAsync(client, debtorSession.RawSessionToken);

        var balance = Assert.Single(balances);
        Assert.Equal("80", balance.GetProperty("selectedLineAmount").GetString());
        Assert.Equal("0", balance.GetProperty("pendingClaimedAmount").GetString());
        Assert.Equal("0", balance.GetProperty("confirmedClearedAmount").GetString());
        Assert.Equal("80", balance.GetProperty("remainingUnclaimedAmount").GetString());
        Assert.Equal(0, balance.GetProperty("pendingPaymentCount").GetInt32());
        Assert.Equal(0, balance.GetProperty("confirmedPaymentCount").GetInt32());
    }

    [Fact]
    public async Task MultiCurrencySettlementsProduceSeparateBalanceRows()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Multi Currency Balance Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Multi Currency Balance Creditor", InitialTimestamp.AddMinutes(1));
        var usdBillId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtorSession.UserProfileId, 10m),
                new ParticipantSeed(creditor.UserProfileId, 10m)
            ],
            [new PayerSeed(creditor.UserProfileId, 20m)],
            InitialTimestamp,
            currency: "USD");
        await SeedSettlementRequestAsync(
            testFactory,
            usdBillId,
            groupId: null,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            10m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(5),
            currency: "USD");
        var hkdBillId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtorSession.UserProfileId, 20m),
                new ParticipantSeed(creditor.UserProfileId, 20m)
            ],
            [new PayerSeed(creditor.UserProfileId, 40m)],
            InitialTimestamp.AddMinutes(1),
            currency: "HKD");
        await SeedSettlementRequestAsync(
            testFactory,
            hkdBillId,
            groupId: null,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            20m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(6),
            currency: "HKD");

        using var client = testFactory.CreateClient();
        var balances = await GetBalancesAsync(client, debtorSession.RawSessionToken);

        Assert.Equal(2, balances.Length);
        Assert.Equal("10", FindBalance(balances, creditor.UserProfileId, "USD").GetProperty("selectedLineAmount").GetString());
        Assert.Equal("20", FindBalance(balances, creditor.UserProfileId, "HKD").GetProperty("selectedLineAmount").GetString());
    }

    [Fact]
    public async Task UnsafeActivePaymentWithoutAllocationCoverageIsExcluded()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Unsafe Allocation Balance Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Unsafe Allocation Balance Creditor", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtorSession.UserProfileId, 25m),
                new ParticipantSeed(creditor.UserProfileId, 25m)
            ],
            [new PayerSeed(creditor.UserProfileId, 50m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            25m,
            SettlementRequestStatuses.PartiallyPaid,
            InitialTimestamp.AddMinutes(5));
        await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            10m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(6),
            addAllocation: false);

        using var client = testFactory.CreateClient();
        var balances = await GetBalancesAsync(client, debtorSession.RawSessionToken);

        Assert.Empty(balances);
    }

    [Fact]
    public async Task ResponseDoesNotExposePaymentProofStorageAuditAuthBillOrUnrelatedInternals()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Safe Balance Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Safe Balance Creditor", InitialTimestamp.AddMinutes(1));
        await SeedPaymentProfileWithQrAsync(testFactory, creditor.UserProfileId, InitialTimestamp.AddMinutes(2));
        var billId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtorSession.UserProfileId, 60m),
                new ParticipantSeed(creditor.UserProfileId, 60m)
            ],
            [new PayerSeed(creditor.UserProfileId, 120m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            60m,
            SettlementRequestStatuses.PartiallyPaid,
            InitialTimestamp.AddMinutes(5));
        var paymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            10m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(6));
        await SeedSettlementProofAttachmentAsync(testFactory, paymentId, debtorSession.UserProfileId, InitialTimestamp.AddMinutes(7));
        await SeedHiddenAuditEventAsync(testFactory, debtorSession.AuthAccountId, InitialTimestamp.AddMinutes(8));
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, debtorSession.AuthSessionId);

        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, SettlementBalancesPath(), debtorSession.RawSessionToken);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertSafeBalanceResponseContent(
            content,
            debtorSession.RawSessionToken,
            sessionTokenHash,
            HiddenMerchantName,
            HiddenItemName,
            HiddenPaymentMethodLabel,
            HiddenPaymentHandle,
            HiddenPaymentNote,
            HiddenStorageObjectKey,
            HiddenOriginalFilename,
            HiddenAuditMetadata);
        using var payload = JsonDocument.Parse(content);
        var balance = Assert.Single(payload.RootElement.GetProperty("balances").EnumerateArray());
        AssertBalanceProjectionShape(balance);
    }

    [Fact]
    public async Task UnauthenticatedRequestReturnsSafeProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Authenticated Balance Actor");

        using var client = testFactory.CreateClient();
        using var missingRequest = new HttpRequestMessage(HttpMethod.Get, SettlementBalancesPath());
        using var missingResponse = await client.SendAsync(missingRequest);
        using var wrongRequest = CreateBearerRequest(HttpMethod.Get, SettlementBalancesPath(), WrongRawToken);
        using var wrongResponse = await client.SendAsync(wrongRequest);

        await AssertUnauthenticatedProblemAsync(missingResponse);
        await AssertUnauthenticatedProblemAsync(wrongResponse, WrongRawToken);
    }

    [Fact]
    public void OpenApiAndGeneratedClientsContainSettlementBalanceProjectionContract()
    {
        var openApi = File.ReadAllText(FindRepoFile("packages/contracts/openapi/settleora.v1.yaml"));
        var pathBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlement-balances:");
        var listSchemaBlock = ExtractOpenApiSchemaBlock(openApi, "SettlementBalanceProjectionListResponse:");
        var balanceSchemaBlock = ExtractOpenApiSchemaBlock(openApi, "SettlementBalanceProjectionResponse:");
        var directionSchemaBlock = ExtractOpenApiSchemaBlock(openApi, "SettlementBalanceDirection:");

        Assert.Contains("operationId: listSettlementBalanceProjections", pathBlock, StringComparison.Ordinal);
        Assert.Contains("SessionBearerAuth", pathBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementBalanceProjectionListResponse", pathBlock, StringComparison.Ordinal);
        Assert.DoesNotContain("requestBody:", pathBlock, StringComparison.Ordinal);
        Assert.Contains("generatedAtUtc", listSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("balances", listSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("counterpartyUserProfileId", balanceSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("direction", balanceSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("selectedLineAmount", balanceSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("pendingClaimedAmount", balanceSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("confirmedClearedAmount", balanceSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("remainingUnclaimedAmount", balanceSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("Decimal-safe selected request-line total amount represented as a string.", balanceSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("incoming", directionSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("outgoing", directionSchemaBlock, StringComparison.Ordinal);

        var webClient = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/client.ts"));
        var webModels = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/models.ts"));
        var dartClient = File.ReadAllText(FindRepoFile("packages/client-dart/generated/client.dart"));
        var dartModels = File.ReadAllText(FindRepoFile("packages/client-dart/generated/models.dart"));
        var generatedContent = string.Join("\n", webClient, webModels, dartClient, dartModels);

        Assert.Contains("listSettlementBalanceProjections", generatedContent, StringComparison.Ordinal);
        Assert.Contains("SettlementBalanceProjectionListResponse", generatedContent, StringComparison.Ordinal);
        Assert.Contains("SettlementBalanceProjectionResponse", generatedContent, StringComparison.Ordinal);
        Assert.Contains("SettlementBalanceDirection", generatedContent, StringComparison.Ordinal);
        Assert.Contains("remainingUnclaimedAmount", generatedContent, StringComparison.Ordinal);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = $"settlement-balance-projection-{Guid.NewGuid():D}";
        var timeProvider = new SettlementBalanceProjectionTestTimeProvider(InitialTimestamp);
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
        SettlementBalanceProjectionTestTimeProvider timeProvider,
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
        SettlementBalanceProjectionTestTimeProvider timeProvider,
        SeededAccount account)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Settlement balance projection endpoint test",
                UserAgentSummary: "Settlement balance projection endpoint test user agent",
                NetworkAddressHash: "settlement-balance-projection-endpoint-test-network",
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
        DateTimeOffset createdAtUtc,
        string currency = "USD")
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
            TotalCurrency = currency,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
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
                Status = ExpenseBillParticipantStatuses.Accepted,
                ResolvedShareAmount = participant.ResolvedShareAmount,
                ResolvedShareCurrency = currency,
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
                Amount = payer.Amount,
                Currency = currency,
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
        string currency = "USD",
        DateTimeOffset? archivedAtUtc = null,
        string lineStatus = SettlementRequestLineStatuses.Open)
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
            Currency = currency,
            AllocationOrder = 0,
            Status = lineStatus,
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
        DateTimeOffset createdAtUtc,
        string currency = "USD",
        bool addAllocation = true,
        decimal? allocationAmount = null)
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
            Currency = currency,
            Status = status,
            PaymentDate = PaymentDate,
            CreatedByUserProfileId = paidByUserProfileId,
            ClaimedAtUtc = createdAtUtc,
            ConfirmedAtUtc = status == SettlementPaymentStatuses.Confirmed ? createdAtUtc.AddMinutes(1) : null,
            DisputedAtUtc = status == SettlementPaymentStatuses.Disputed ? createdAtUtc.AddMinutes(1) : null,
            CancelledAtUtc = status == SettlementPaymentStatuses.Cancelled ? createdAtUtc.AddMinutes(1) : null,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        };
        dbContext.Set<SettlementPayment>().Add(payment);

        if (addAllocation && amount > 0m)
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
                ClearedAmount = allocationAmount ?? amount,
                Currency = currency,
                AllocationOrder = 0,
                CreatedAtUtc = createdAtUtc
            });
        }

        await dbContext.SaveChangesAsync();
        return paymentId;
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

    private static async Task SeedSettlementProofAttachmentAsync(
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
            Action = "settlement.hidden_balance_seed",
            Outcome = AuthAuditOutcomes.Success,
            OccurredAtUtc = createdAtUtc,
            SafeMetadataJson = HiddenAuditMetadata
        });

        await dbContext.SaveChangesAsync();
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

    private static async Task<ReadOnlyCounts> ReadReadOnlyCountsAsync(WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return new ReadOnlyCounts(
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

    private static async Task<JsonElement[]> GetBalancesAsync(HttpClient client, string rawSessionToken)
    {
        using var request = CreateBearerRequest(HttpMethod.Get, SettlementBalancesPath(), rawSessionToken);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var payload = JsonDocument.Parse(content);
        AssertBalanceProjectionListShape(payload.RootElement);
        return payload.RootElement.GetProperty("balances")
            .EnumerateArray()
            .Select(balance => balance.Clone())
            .ToArray();
    }

    private static JsonElement FindBalance(
        IReadOnlyList<JsonElement> balances,
        Guid counterpartyUserProfileId,
        string currency)
    {
        return balances.Single(balance =>
            balance.GetProperty("counterpartyUserProfileId").GetGuid() == counterpartyUserProfileId
            && string.Equals(balance.GetProperty("currency").GetString(), currency, StringComparison.Ordinal));
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

    private static string SettlementBalancesPath()
    {
        return "/api/v1/settlement-balances";
    }

    private static void AssertBalanceProjectionListShape(JsonElement response)
    {
        Assert.Equal(
            [
                "balances",
                "generatedAtUtc"
            ],
            response.EnumerateObject()
                .Select(property => property.Name)
                .Order(StringComparer.Ordinal)
                .ToArray());
    }

    private static void AssertBalanceProjectionShape(JsonElement response)
    {
        Assert.Equal(
            [
                "confirmedClearedAmount",
                "confirmedPaymentCount",
                "counterpartyUserProfileId",
                "currency",
                "direction",
                "groupId",
                "lineCount",
                "pendingClaimedAmount",
                "pendingPaymentCount",
                "remainingUnclaimedAmount",
                "requestCount",
                "selectedLineAmount"
            ],
            response.EnumerateObject()
                .Select(property => property.Name)
                .Order(StringComparer.Ordinal)
                .ToArray());
    }

    private static void AssertSafeBalanceResponseContent(
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
        SettlementBalanceProjectionTestTimeProvider TimeProvider);

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

    private sealed record ReadOnlyCounts(
        int SettlementRequestCount,
        int SettlementRequestLineCount,
        int SettlementPaymentCount,
        int SettlementPaymentAllocationCount,
        int SettlementProofAttachmentCount,
        int FileObjectCount,
        int UserPaymentProfileCount,
        int NonSessionAuditEventCount);

    private sealed class SettlementBalanceProjectionTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public SettlementBalanceProjectionTestTimeProvider(DateTimeOffset utcNow)
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
