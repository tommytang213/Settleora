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

namespace Settleora.Api.Tests;

public sealed class SettlementCancellationEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string WrongRawToken = "visible-wrong-settlement-cancellation-session-token";
    private const string HiddenMerchantName = "Hidden Settlement Cancellation Merchant";
    private const string HiddenItemName = "Hidden Settlement Cancellation Item";
    private const string HiddenPaymentMethodLabel = "Hidden settlement cancellation method label";
    private const string HiddenPaymentHandle = "hidden-settlement-cancellation-handle";
    private const string HiddenPaymentNote = "hidden settlement cancellation note";
    private const string HiddenStorageObjectKey = "hidden/settlement/cancellation/object-key";
    private const string HiddenOriginalFilename = "hidden-settlement-cancellation-proof.png";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 9, 2, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 9, 2, 15, 0, TimeSpan.Zero);
    private static readonly DateOnly PaymentDate = new(2026, 5, 9);

    private readonly WebApplicationFactory<Program> factory;

    public SettlementCancellationEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task RequesterCanCancelRequestedSettlementWithBoundedAuditAndNoPaymentProofPaymentDetailOrFileSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var requesterSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Request Cancel Requester");
        var creditor = await SeedAccountAsync(testFactory, "Request Cancel Creditor", InitialTimestamp.AddMinutes(1));
        await SeedPaymentProfileWithQrAsync(testFactory, creditor.UserProfileId, InitialTimestamp.AddMinutes(2));
        var billId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [new ParticipantSeed(requesterSession.UserProfileId, 25m), new ParticipantSeed(creditor.UserProfileId, 25m)],
            [new PayerSeed(creditor.UserProfileId, 50m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            requesterSession.UserProfileId,
            creditor.UserProfileId,
            requesterSession.UserProfileId,
            25m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(3));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, requesterSession.AuthSessionId);

        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Post,
            SettlementRequestCancellationPath(settlementId),
            requesterSession.RawSessionToken);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeResponseContent(
            content,
            requesterSession.RawSessionToken,
            sessionTokenHash,
            HiddenMerchantName,
            HiddenItemName,
            HiddenPaymentMethodLabel,
            HiddenPaymentHandle,
            HiddenPaymentNote,
            HiddenStorageObjectKey,
            HiddenOriginalFilename);

        using var payload = JsonDocument.Parse(content);
        AssertSettlementRequestResponseShape(payload.RootElement);
        Assert.Equal(settlementId, payload.RootElement.GetProperty("id").GetGuid());
        Assert.Equal(SettlementRequestStatuses.Cancelled, payload.RootElement.GetProperty("status").GetString());
        Assert.Equal(ValidationTimestamp, payload.RootElement.GetProperty("updatedAtUtc").GetDateTimeOffset());

        var persisted = await ReadSettlementStateAsync(testFactory);
        var settlementRequest = Assert.Single(persisted.Requests);
        Assert.Equal(SettlementRequestStatuses.Cancelled, settlementRequest.Status);
        Assert.Equal(ValidationTimestamp, settlementRequest.CancelledAtUtc);
        Assert.Equal(ValidationTimestamp, settlementRequest.UpdatedAtUtc);
        Assert.Equal(SettlementRequestLineStatuses.Cancelled, Assert.Single(persisted.RequestLines).Status);
        Assert.Empty(persisted.Payments);
        Assert.Empty(persisted.ProofAttachments);
        Assert.Equal(beforeCounts with { CancellationAuditEventCount = beforeCounts.CancellationAuditEventCount + 1 }, persisted.MutationCounts);

        var auditEvent = Assert.Single(persisted.CancellationAuditEvents);
        Assert.Equal("settlement.request_cancelled", auditEvent.Action);
        Assert.Equal(AuthAuditOutcomes.Success, auditEvent.Outcome);
        Assert.Equal(requesterSession.AuthAccountId, auditEvent.ActorAuthAccountId);
        AssertBoundedRequestCancellationAuditMetadata(
            auditEvent.SafeMetadataJson,
            settlementId,
            billId,
            groupId: null,
            "personal",
            requesterSession.UserProfileId,
            creditor.UserProfileId,
            "25");
    }

    [Fact]
    public async Task DebtorOrCreditorWhoIsNotRequesterCannotCancelRequest()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Request Actor Debtor");
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Request Actor Creditor");
        var requester = await SeedAccountAsync(testFactory, "Request Actor Requester", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creditorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(debtorSession.UserProfileId, 30m), new ParticipantSeed(creditorSession.UserProfileId, 30m)],
            [new PayerSeed(creditorSession.UserProfileId, 60m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtorSession.UserProfileId,
            creditorSession.UserProfileId,
            requester.UserProfileId,
            30m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(2));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        foreach (var rawSessionToken in new[] { debtorSession.RawSessionToken, creditorSession.RawSessionToken })
        {
            using var request = CreateBearerRequest(
                HttpMethod.Post,
                SettlementRequestCancellationPath(settlementId),
                rawSessionToken);
            using var response = await client.SendAsync(request);
            await AssertSettlementUnavailableProblemAsync(response);
        }

        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public async Task RequestCancellationRejectsAnyPaymentOrInvalidRequestStatus()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var requesterSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Request State Requester");
        var creditor = await SeedAccountAsync(testFactory, "Request State Creditor", InitialTimestamp.AddMinutes(1));
        var visibleStatusCases = new[]
        {
            SettlementRequestStatuses.PartiallyPaid,
            SettlementRequestStatuses.MarkedPaid,
            SettlementRequestStatuses.Confirmed,
            SettlementRequestStatuses.Disputed,
            SettlementRequestStatuses.Cancelled,
            "unsupported_status"
        };
        var requestIds = new List<Guid>();

        var billWithPaymentId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [new ParticipantSeed(requesterSession.UserProfileId, 20m), new ParticipantSeed(creditor.UserProfileId, 20m)],
            [new PayerSeed(creditor.UserProfileId, 40m)],
            InitialTimestamp);
        var requestedWithPaymentId = await SeedSettlementRequestAsync(
            testFactory,
            billWithPaymentId,
            groupId: null,
            requesterSession.UserProfileId,
            creditor.UserProfileId,
            requesterSession.UserProfileId,
            20m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(2));
        await SeedSettlementPaymentAsync(
            testFactory,
            requestedWithPaymentId,
            requesterSession.UserProfileId,
            creditor.UserProfileId,
            20m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
        requestIds.Add(requestedWithPaymentId);

        foreach (var status in visibleStatusCases)
        {
            var billId = await SeedBillAsync(
                testFactory,
                creditor.UserProfileId,
                groupId: null,
                [new ParticipantSeed(requesterSession.UserProfileId, 20m), new ParticipantSeed(creditor.UserProfileId, 20m)],
                [new PayerSeed(creditor.UserProfileId, 40m)],
                InitialTimestamp);
            requestIds.Add(await SeedSettlementRequestAsync(
                testFactory,
                billId,
                groupId: null,
                requesterSession.UserProfileId,
                creditor.UserProfileId,
                requesterSession.UserProfileId,
                20m,
                status,
                InitialTimestamp.AddMinutes(4)));
        }

        var beforeCounts = await ReadMutationCountsAsync(testFactory);
        using var client = testFactory.CreateClient();
        foreach (var settlementId in requestIds)
        {
            using var request = CreateBearerRequest(
                HttpMethod.Post,
                SettlementRequestCancellationPath(settlementId),
                requesterSession.RawSessionToken);
            using var response = await client.SendAsync(request);
            await AssertSettlementCancellationConflictProblemAsync(response);
        }

        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public async Task PaymentCreatorDebtorCanCancelMarkedPaidPaymentAndRequestReturnsToRequestedWithBoundedAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Payment Cancel Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Payment Cancel Creditor", InitialTimestamp.AddMinutes(1));
        await SeedPaymentProfileWithQrAsync(testFactory, creditor.UserProfileId, InitialTimestamp.AddMinutes(2));
        var billId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [new ParticipantSeed(debtorSession.UserProfileId, 40m), new ParticipantSeed(creditor.UserProfileId, 40m)],
            [new PayerSeed(creditor.UserProfileId, 80m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            40m,
            SettlementRequestStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
        var paymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            40m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(4));
        var fileObjectId = await SeedSettlementProofAttachmentAsync(
            testFactory,
            paymentId,
            debtorSession.UserProfileId,
            InitialTimestamp.AddMinutes(5));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, debtorSession.AuthSessionId);

        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentCancellationPath(paymentId),
            debtorSession.RawSessionToken);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeResponseContent(
            content,
            debtorSession.RawSessionToken,
            sessionTokenHash,
            HiddenMerchantName,
            HiddenItemName,
            HiddenPaymentMethodLabel,
            HiddenPaymentHandle,
            HiddenPaymentNote,
            HiddenStorageObjectKey,
            HiddenOriginalFilename);

        using var payload = JsonDocument.Parse(content);
        AssertSettlementPaymentResponseShape(payload.RootElement);
        Assert.Equal(paymentId, payload.RootElement.GetProperty("paymentId").GetGuid());
        Assert.Equal(SettlementPaymentStatuses.Cancelled, payload.RootElement.GetProperty("status").GetString());
        Assert.Equal(SettlementRequestStatuses.Requested, payload.RootElement.GetProperty("settlementRequestStatus").GetString());
        Assert.Equal(ValidationTimestamp, payload.RootElement.GetProperty("updatedAtUtc").GetDateTimeOffset());
        var allocationPayload = Assert.Single(payload.RootElement.GetProperty("allocations").EnumerateArray());
        Assert.Equal("40", allocationPayload.GetProperty("clearedAmount").GetString());

        var persisted = await ReadSettlementStateAsync(testFactory);
        var settlementRequest = Assert.Single(persisted.Requests);
        Assert.Equal(SettlementRequestStatuses.Requested, settlementRequest.Status);
        Assert.Null(settlementRequest.ConfirmedAtUtc);
        Assert.Equal(ValidationTimestamp, settlementRequest.UpdatedAtUtc);
        Assert.Equal(SettlementRequestLineStatuses.Open, Assert.Single(persisted.RequestLines).Status);
        var payment = Assert.Single(persisted.Payments);
        Assert.Equal(SettlementPaymentStatuses.Cancelled, payment.Status);
        Assert.Equal(ValidationTimestamp, payment.CancelledAtUtc);
        Assert.Equal(ValidationTimestamp, payment.UpdatedAtUtc);
        Assert.Equal(40m, Assert.Single(persisted.PaymentAllocations).ClearedAmount);
        var proofAttachment = Assert.Single(persisted.ProofAttachments);
        Assert.Equal(fileObjectId, proofAttachment.FileObjectId);
        Assert.Equal(beforeCounts.FileObjectCount, persisted.MutationCounts.FileObjectCount);
        Assert.Equal(beforeCounts.UserPaymentProfileCount, persisted.MutationCounts.UserPaymentProfileCount);
        Assert.Equal(beforeCounts.SettlementProofAttachmentCount, persisted.MutationCounts.SettlementProofAttachmentCount);
        Assert.Equal(beforeCounts.CancellationAuditEventCount + 1, persisted.MutationCounts.CancellationAuditEventCount);

        var auditEvent = Assert.Single(persisted.CancellationAuditEvents);
        Assert.Equal("settlement.payment_cancelled", auditEvent.Action);
        Assert.Equal(debtorSession.AuthAccountId, auditEvent.ActorAuthAccountId);
        AssertBoundedPaymentCancellationAuditMetadata(
            auditEvent.SafeMetadataJson,
            settlementId,
            paymentId,
            billId,
            groupId: null,
            "personal",
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            SettlementRequestStatuses.MarkedPaid,
            SettlementRequestStatuses.Requested,
            "40",
            "0",
            "40");
    }

    [Theory]
    [InlineData(30, 0, SettlementRequestStatuses.PartiallyPaid)]
    [InlineData(30, 20, SettlementRequestStatuses.MarkedPaid)]
    public async Task PaymentCancellationRecomputesParentRequestFromRemainingActiveCoverage(
        decimal remainingMarkedPaidAmount,
        decimal remainingConfirmedAmount,
        string expectedRequestStatus)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Payment Recompute Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Payment Recompute Creditor", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [new ParticipantSeed(debtorSession.UserProfileId, 50m), new ParticipantSeed(creditor.UserProfileId, 50m)],
            [new PayerSeed(creditor.UserProfileId, 100m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            50m,
            SettlementRequestStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(2));
        var paymentToCancelId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            10m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
        await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            remainingMarkedPaidAmount,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(4));
        if (remainingConfirmedAmount > 0m)
        {
            await SeedSettlementPaymentAsync(
                testFactory,
                settlementId,
                debtorSession.UserProfileId,
                creditor.UserProfileId,
                remainingConfirmedAmount,
                SettlementPaymentStatuses.Confirmed,
                InitialTimestamp.AddMinutes(5));
        }

        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentCancellationPath(paymentToCancelId),
            debtorSession.RawSessionToken);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal(SettlementPaymentStatuses.Cancelled, payload.RootElement.GetProperty("status").GetString());
        Assert.Equal(expectedRequestStatus, payload.RootElement.GetProperty("settlementRequestStatus").GetString());

        var persisted = await ReadSettlementStateAsync(testFactory);
        Assert.Equal(expectedRequestStatus, Assert.Single(persisted.Requests).Status);
        var expectedLineStatus = expectedRequestStatus == SettlementRequestStatuses.MarkedPaid
            ? SettlementRequestLineStatuses.Cleared
            : SettlementRequestLineStatuses.PartiallyCleared;
        Assert.Equal(expectedLineStatus, Assert.Single(persisted.RequestLines).Status);
    }

    [Fact]
    public async Task PaymentCancellationRejectsVisibleInvalidPaymentRequestCurrencyPartyAndAmountStates()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Payment Invalid Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Payment Invalid Creditor", InitialTimestamp.AddMinutes(1));
        var other = await SeedAccountAsync(testFactory, "Payment Invalid Other", InitialTimestamp.AddMinutes(2));
        var paymentIds = new List<Guid>();

        foreach (var paymentStatus in new[]
        {
            SettlementPaymentStatuses.Confirmed,
            SettlementPaymentStatuses.Disputed,
            SettlementPaymentStatuses.Cancelled,
            "unsupported_payment_status"
        })
        {
            paymentIds.Add(await SeedCancellationCaseAsync(
                testFactory,
                debtorSession.UserProfileId,
                creditor.UserProfileId,
                SettlementRequestStatuses.MarkedPaid,
                paymentStatus));
        }

        foreach (var requestStatus in new[]
        {
            SettlementRequestStatuses.Requested,
            SettlementRequestStatuses.Confirmed,
            SettlementRequestStatuses.Disputed,
            SettlementRequestStatuses.Cancelled,
            "unsupported_request_status"
        })
        {
            paymentIds.Add(await SeedCancellationCaseAsync(
                testFactory,
                debtorSession.UserProfileId,
                creditor.UserProfileId,
                requestStatus,
                SettlementPaymentStatuses.MarkedPaid));
        }

        paymentIds.Add(await SeedCancellationCaseAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            SettlementRequestStatuses.MarkedPaid,
            SettlementPaymentStatuses.MarkedPaid,
            paymentCurrency: "HKD"));
        paymentIds.Add(await SeedCancellationCaseAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            SettlementRequestStatuses.MarkedPaid,
            SettlementPaymentStatuses.MarkedPaid,
            paidByUserProfileId: other.UserProfileId));
        paymentIds.Add(await SeedCancellationCaseAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            SettlementRequestStatuses.MarkedPaid,
            SettlementPaymentStatuses.MarkedPaid,
            receivedByUserProfileId: other.UserProfileId));
        paymentIds.Add(await SeedCancellationCaseAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            SettlementRequestStatuses.MarkedPaid,
            SettlementPaymentStatuses.MarkedPaid,
            createdByUserProfileId: other.UserProfileId));
        paymentIds.Add(await SeedCancellationCaseAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            SettlementRequestStatuses.MarkedPaid,
            SettlementPaymentStatuses.MarkedPaid,
            paymentAmount: 0m));

        var beforeCounts = await ReadMutationCountsAsync(testFactory);
        using var client = testFactory.CreateClient();
        foreach (var paymentId in paymentIds)
        {
            using var request = CreateBearerRequest(
                HttpMethod.Post,
                SettlementPaymentCancellationPath(paymentId),
                debtorSession.RawSessionToken);
            using var response = await client.SendAsync(request);
            await AssertSettlementPaymentCancellationConflictProblemAsync(response);
        }

        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public async Task PaymentCancellationWrongActorArchivedDeletedUnrelatedOrNotVisibleCasesFailClosed()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Payment Closed Debtor");
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Payment Closed Creditor");
        var requesterOnlySession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Payment Closed Requester");
        var nonPartySession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Payment Closed Non Party");
        var visiblePaymentId = await SeedVisibleMarkedPaidPaymentAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditorSession.UserProfileId,
            requesterOnlySession.UserProfileId);
        var archivedPaymentId = await SeedVisibleMarkedPaidPaymentAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditorSession.UserProfileId,
            creditorSession.UserProfileId,
            archivedAtUtc: InitialTimestamp.AddMinutes(20));
        var deletedCreditor = await SeedAccountAsync(
            testFactory,
            "Payment Closed Deleted Creditor",
            InitialTimestamp.AddMinutes(1),
            deletedAtUtc: InitialTimestamp.AddMinutes(21));
        var deletedPaymentId = await SeedVisibleMarkedPaidPaymentAsync(
            testFactory,
            debtorSession.UserProfileId,
            deletedCreditor.UserProfileId,
            deletedCreditor.UserProfileId);
        var unrelatedDebtor = await SeedAccountAsync(testFactory, "Payment Closed Unrelated Debtor", InitialTimestamp.AddMinutes(2));
        var unrelatedCreditor = await SeedAccountAsync(testFactory, "Payment Closed Unrelated Creditor", InitialTimestamp.AddMinutes(3));
        var unrelatedPaymentId = await SeedVisibleMarkedPaidPaymentAsync(
            testFactory,
            unrelatedDebtor.UserProfileId,
            unrelatedCreditor.UserProfileId,
            unrelatedCreditor.UserProfileId);
        var removedGroupId = await SeedGroupAsync(
            testFactory,
            creditorSession.UserProfileId,
            "Payment Closed Removed Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(debtorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed),
            new MembershipSeed(creditorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var removedBillId = await SeedBillAsync(
            testFactory,
            creditorSession.UserProfileId,
            removedGroupId,
            [new ParticipantSeed(debtorSession.UserProfileId, 15m), new ParticipantSeed(creditorSession.UserProfileId, 15m)],
            [new PayerSeed(creditorSession.UserProfileId, 30m)],
            InitialTimestamp);
        var removedSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            removedBillId,
            removedGroupId,
            debtorSession.UserProfileId,
            creditorSession.UserProfileId,
            creditorSession.UserProfileId,
            15m,
            SettlementRequestStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(4));
        var removedPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            removedSettlementId,
            debtorSession.UserProfileId,
            creditorSession.UserProfileId,
            15m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(5));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        foreach (var rawSessionToken in new[] { creditorSession.RawSessionToken, requesterOnlySession.RawSessionToken, nonPartySession.RawSessionToken })
        {
            using var request = CreateBearerRequest(
                HttpMethod.Post,
                SettlementPaymentCancellationPath(visiblePaymentId),
                rawSessionToken);
            using var response = await client.SendAsync(request);
            await AssertSettlementPaymentUnavailableProblemAsync(response);
        }

        foreach (var paymentId in new[] { archivedPaymentId, deletedPaymentId, unrelatedPaymentId, removedPaymentId, Guid.NewGuid() })
        {
            using var request = CreateBearerRequest(
                HttpMethod.Post,
                SettlementPaymentCancellationPath(paymentId),
                debtorSession.RawSessionToken);
            using var response = await client.SendAsync(request);
            await AssertSettlementPaymentUnavailableProblemAsync(response);
        }

        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public async Task GroupScopedCancellationRequiresActiveMembership()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Cancel Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Group Cancel Creditor", InitialTimestamp.AddMinutes(1));
        var activeGroupId = await SeedGroupAsync(
            testFactory,
            creditor.UserProfileId,
            "Group Cancel Active",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(debtorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(creditor.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var activeBillId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            activeGroupId,
            [new ParticipantSeed(debtorSession.UserProfileId, 35m), new ParticipantSeed(creditor.UserProfileId, 35m)],
            [new PayerSeed(creditor.UserProfileId, 70m)],
            InitialTimestamp);
        var requestToCancelId = await SeedSettlementRequestAsync(
            testFactory,
            activeBillId,
            activeGroupId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            debtorSession.UserProfileId,
            35m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(2));
        var paymentSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            activeBillId,
            activeGroupId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            35m,
            SettlementRequestStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
        var paymentToCancelId = await SeedSettlementPaymentAsync(
            testFactory,
            paymentSettlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            35m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(4));
        var removedGroupId = await SeedGroupAsync(
            testFactory,
            creditor.UserProfileId,
            "Group Cancel Removed",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(debtorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(creditor.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Removed));
        var removedBillId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            removedGroupId,
            [new ParticipantSeed(debtorSession.UserProfileId, 10m), new ParticipantSeed(creditor.UserProfileId, 10m)],
            [new PayerSeed(creditor.UserProfileId, 20m)],
            InitialTimestamp);
        var removedRequestId = await SeedSettlementRequestAsync(
            testFactory,
            removedBillId,
            removedGroupId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            debtorSession.UserProfileId,
            10m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(5));

        using var client = testFactory.CreateClient();
        using var activeRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementRequestCancellationPath(requestToCancelId),
            debtorSession.RawSessionToken);
        using var activeRequestResponse = await client.SendAsync(activeRequest);
        Assert.Equal(HttpStatusCode.OK, activeRequestResponse.StatusCode);

        using var activePaymentRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentCancellationPath(paymentToCancelId),
            debtorSession.RawSessionToken);
        using var activePaymentResponse = await client.SendAsync(activePaymentRequest);
        Assert.Equal(HttpStatusCode.OK, activePaymentResponse.StatusCode);

        using var removedRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementRequestCancellationPath(removedRequestId),
            debtorSession.RawSessionToken);
        using var removedResponse = await client.SendAsync(removedRequest);
        await AssertSettlementUnavailableProblemAsync(removedResponse);
    }

    [Fact]
    public async Task NonEmptyBodyAndUnauthenticatedRequestsReturnBoundedProblemsWithoutMutation()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Invalid Cancel Body Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Invalid Cancel Body Creditor", InitialTimestamp.AddMinutes(1));
        var settlementId = await SeedVisibleRequestedSettlementAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId, debtorSession.UserProfileId);
        var paymentId = await SeedVisibleMarkedPaidPaymentAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId, creditor.UserProfileId);
        var beforeCounts = await ReadMutationCountsAsync(testFactory);
        using var client = testFactory.CreateClient();
        const string unexpectedBodyValue = "do-not-echo-this-rawbodysecret";

        using var requestBodyRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementRequestCancellationPath(settlementId),
            debtorSession.RawSessionToken,
            $$"""{"rawBodySecret":"{{unexpectedBodyValue}}"}""");
        using var requestBodyResponse = await client.SendAsync(requestBodyRequest);
        await AssertInvalidSettlementCancellationProblemAsync(requestBodyResponse, unexpectedBodyValue);

        using var paymentBodyRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentCancellationPath(paymentId),
            debtorSession.RawSessionToken,
            $$"""{"rawBodySecret":"{{unexpectedBodyValue}}"}""");
        using var paymentBodyResponse = await client.SendAsync(paymentBodyRequest);
        await AssertInvalidSettlementPaymentCancellationProblemAsync(paymentBodyResponse, unexpectedBodyValue);

        using var unauthenticatedRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementRequestCancellationPath(settlementId),
            WrongRawToken);
        using var unauthenticatedResponse = await client.SendAsync(unauthenticatedRequest);
        await AssertUnauthenticatedProblemAsync(unauthenticatedResponse);

        using var unauthenticatedPaymentRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentCancellationPath(paymentId),
            WrongRawToken);
        using var unauthenticatedPaymentResponse = await client.SendAsync(unauthenticatedPaymentRequest);
        await AssertUnauthenticatedProblemAsync(unauthenticatedPaymentResponse);

        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public void OpenApiAndGeneratedClientsExposeCancellationWithoutBalanceOcrOrAiSurfaces()
    {
        var openApi = File.ReadAllText(FindRepoFile("packages/contracts/openapi/settleora.v1.yaml"));
        var requestCancelBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlements/{settlementId}/cancel:");
        var paymentCancelBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlement-payments/{paymentId}/cancel:");

        Assert.Contains("operationId: cancelSettlementRequest", requestCancelBlock);
        Assert.Contains("$ref: \"#/components/schemas/SettlementRequestResponse\"", requestCancelBlock);
        Assert.DoesNotContain("requestBody:", requestCancelBlock);
        Assert.Contains("operationId: cancelSettlementPayment", paymentCancelBlock);
        Assert.Contains("$ref: \"#/components/schemas/SettlementPaymentResponse\"", paymentCancelBlock);
        Assert.DoesNotContain("requestBody:", paymentCancelBlock);

        var pathHeaders = openApi
            .Split('\n')
            .Select(line => line.TrimEnd())
            .Where(line => line.StartsWith("/api/v1/", StringComparison.Ordinal)
                || line.StartsWith("  /api/v1/", StringComparison.Ordinal))
            .ToArray();
        Assert.DoesNotContain(pathHeaders, path => path.Contains("settlement", StringComparison.OrdinalIgnoreCase)
            && (path.Contains("ocr", StringComparison.OrdinalIgnoreCase)
                || path.Contains("recurring", StringComparison.OrdinalIgnoreCase)
                || path.Contains("forecast", StringComparison.OrdinalIgnoreCase)
                || path.Contains("reconciliation", StringComparison.OrdinalIgnoreCase)
                || path.Contains("/ai", StringComparison.OrdinalIgnoreCase)
                || path.Contains("-ai", StringComparison.OrdinalIgnoreCase)
                || path.Contains("ai-", StringComparison.OrdinalIgnoreCase)));

        var webClient = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/client.ts"));
        var dartClient = File.ReadAllText(FindRepoFile("packages/client-dart/generated/client.dart"));
        Assert.Contains("cancelSettlementRequest", webClient);
        Assert.Contains("cancelSettlementPayment", webClient);
        Assert.Contains("cancelSettlementRequest", dartClient);
        Assert.Contains("cancelSettlementPayment", dartClient);
    }

    private async Task<Guid> SeedCancellationCaseAsync(
        WebApplicationFactory<Program> testFactory,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        string requestStatus,
        string paymentStatus,
        string requestCurrency = "USD",
        string paymentCurrency = "USD",
        Guid? paidByUserProfileId = null,
        Guid? receivedByUserProfileId = null,
        Guid? createdByUserProfileId = null,
        decimal paymentAmount = 10m)
    {
        var billId = await SeedBillAsync(
            testFactory,
            creditorUserProfileId,
            groupId: null,
            [new ParticipantSeed(debtorUserProfileId, 10m), new ParticipantSeed(creditorUserProfileId, 10m)],
            [new PayerSeed(creditorUserProfileId, 20m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtorUserProfileId,
            creditorUserProfileId,
            creditorUserProfileId,
            10m,
            requestStatus,
            InitialTimestamp.AddMinutes(2),
            currency: requestCurrency);
        return await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            paidByUserProfileId ?? debtorUserProfileId,
            receivedByUserProfileId ?? creditorUserProfileId,
            paymentAmount,
            paymentStatus,
            InitialTimestamp.AddMinutes(3),
            currency: paymentCurrency,
            createdByUserProfileId: createdByUserProfileId);
    }

    private static FactoryTestContext CreateFactory()
    {
        var databaseName = $"settleora-settlement-cancellation-{Guid.NewGuid():N}";
        var timeProvider = new SettlementCancellationTestTimeProvider(ValidationTimestamp);
        var testFactory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureServices(services =>
            {
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
        SettlementCancellationTestTimeProvider timeProvider,
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
        SettlementCancellationTestTimeProvider timeProvider,
        SeededAccount account)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Settlement cancellation endpoint test",
                UserAgentSummary: "Settlement cancellation endpoint test user agent",
                NetworkAddressHash: "settlement-cancellation-endpoint-test-network",
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
        DateTimeOffset? archivedAtUtc = null,
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
        DateTimeOffset createdAtUtc,
        string currency = "USD",
        Guid? createdByUserProfileId = null)
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
            CreatedByUserProfileId = createdByUserProfileId ?? paidByUserProfileId,
            ClaimedAtUtc = createdAtUtc,
            ConfirmedAtUtc = status == SettlementPaymentStatuses.Confirmed ? createdAtUtc : null,
            DisputedAtUtc = status == SettlementPaymentStatuses.Disputed ? createdAtUtc : null,
            CancelledAtUtc = status == SettlementPaymentStatuses.Cancelled ? createdAtUtc : null,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        };
        dbContext.Set<SettlementPayment>().Add(payment);

        if (amount > 0m
            && status is SettlementPaymentStatuses.MarkedPaid or SettlementPaymentStatuses.Confirmed)
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
                Currency = currency,
                AllocationOrder = 0,
                CreatedAtUtc = createdAtUtc
            });
        }

        await dbContext.SaveChangesAsync();
        return paymentId;
    }

    private static async Task<Guid> SeedVisibleRequestedSettlementAsync(
        WebApplicationFactory<Program> testFactory,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        Guid requestedByUserProfileId)
    {
        var billId = await SeedBillAsync(
            testFactory,
            creditorUserProfileId,
            groupId: null,
            [new ParticipantSeed(debtorUserProfileId, 10m), new ParticipantSeed(creditorUserProfileId, 10m)],
            [new PayerSeed(creditorUserProfileId, 20m)],
            InitialTimestamp);
        return await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtorUserProfileId,
            creditorUserProfileId,
            requestedByUserProfileId,
            10m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(2));
    }

    private static async Task<Guid> SeedVisibleMarkedPaidPaymentAsync(
        WebApplicationFactory<Program> testFactory,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        Guid requestedByUserProfileId,
        DateTimeOffset? archivedAtUtc = null)
    {
        var billId = await SeedBillAsync(
            testFactory,
            creditorUserProfileId,
            groupId: null,
            [new ParticipantSeed(debtorUserProfileId, 10m), new ParticipantSeed(creditorUserProfileId, 10m)],
            [new PayerSeed(creditorUserProfileId, 20m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtorUserProfileId,
            creditorUserProfileId,
            requestedByUserProfileId,
            10m,
            SettlementRequestStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(2),
            archivedAtUtc);
        return await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorUserProfileId,
            creditorUserProfileId,
            10m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
    }

    private static async Task<Guid> SeedSettlementProofAttachmentAsync(
        WebApplicationFactory<Program> testFactory,
        Guid paymentId,
        Guid creatorUserProfileId,
        DateTimeOffset createdAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var fileObjectId = Guid.NewGuid();
        dbContext.Set<FileObject>().Add(new FileObject
        {
            Id = fileObjectId,
            OwnerUserProfileId = creatorUserProfileId,
            CreatedByUserProfileId = creatorUserProfileId,
            Purpose = FileObjectPurposes.SettlementProof,
            Status = FileObjectStatuses.Active,
            ContentType = "image/png",
            OriginalFilename = HiddenOriginalFilename,
            SizeBytes = 2048,
            Sha256Hash = null,
            StorageProvider = "local",
            StorageObjectKey = HiddenStorageObjectKey,
            EncryptionMode = FileObjectEncryptionModes.ServerManaged,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });
        dbContext.Set<SettlementProofAttachment>().Add(new SettlementProofAttachment
        {
            SettlementPaymentId = paymentId,
            FileObjectId = fileObjectId,
            CreatedByUserProfileId = creatorUserProfileId,
            CreatedAtUtc = createdAtUtc
        });

        await dbContext.SaveChangesAsync();
        return fileObjectId;
    }

    private static async Task SeedPaymentProfileWithQrAsync(
        WebApplicationFactory<Program> testFactory,
        Guid userProfileId,
        DateTimeOffset createdAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var fileObjectId = Guid.NewGuid();
        dbContext.Set<FileObject>().Add(new FileObject
        {
            Id = fileObjectId,
            OwnerUserProfileId = userProfileId,
            CreatedByUserProfileId = userProfileId,
            Purpose = FileObjectPurposes.PaymentQr,
            Status = FileObjectStatuses.Active,
            ContentType = "image/png",
            OriginalFilename = HiddenOriginalFilename,
            SizeBytes = 1234,
            Sha256Hash = null,
            StorageProvider = "local",
            StorageObjectKey = HiddenStorageObjectKey,
            EncryptionMode = FileObjectEncryptionModes.ServerManaged,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });
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

    private static async Task<SettlementState> ReadSettlementStateAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return new SettlementState(
            await dbContext.Set<SettlementRequest>()
                .AsNoTracking()
                .Include(settlementRequest => settlementRequest.Lines)
                .OrderBy(settlementRequest => settlementRequest.CreatedAtUtc)
                .ToListAsync(),
            await dbContext.Set<SettlementPayment>()
                .AsNoTracking()
                .Include(payment => payment.Allocations)
                .OrderBy(payment => payment.CreatedAtUtc)
                .ToListAsync(),
            await dbContext.Set<SettlementRequestLine>()
                .AsNoTracking()
                .OrderBy(line => line.CreatedAtUtc)
                .ToListAsync(),
            await dbContext.Set<SettlementPaymentAllocation>()
                .AsNoTracking()
                .OrderBy(allocation => allocation.CreatedAtUtc)
                .ToListAsync(),
            await dbContext.Set<SettlementProofAttachment>()
                .AsNoTracking()
                .ToListAsync(),
            await dbContext.Set<AuthAuditEvent>()
                .AsNoTracking()
                .Where(auditEvent => IsSettlementCancellationAuditAction(auditEvent.Action))
                .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
                .ToListAsync(),
            await ReadMutationCountsAsync(testFactory));
    }

    private static async Task<MutationCounts> ReadMutationCountsAsync(WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return new MutationCounts(
            await dbContext.Set<SettlementRequest>().CountAsync(),
            await dbContext.Set<SettlementRequestLine>().CountAsync(),
            await dbContext.Set<SettlementPayment>().CountAsync(),
            await dbContext.Set<SettlementPaymentAllocation>().CountAsync(),
            await dbContext.Set<SettlementProofAttachment>().CountAsync(),
            await dbContext.Set<FileObject>().CountAsync(),
            await dbContext.Set<UserPaymentProfile>().CountAsync(),
            await dbContext.Set<AuthAuditEvent>().CountAsync(auditEvent => IsSettlementCancellationAuditAction(auditEvent.Action)));
    }

    private static bool IsSettlementCancellationAuditAction(string action)
    {
        return action is "settlement.request_cancelled"
            or "settlement.payment_cancelled";
    }

    private static async Task AssertMutationCountsAsync(
        WebApplicationFactory<Program> testFactory,
        MutationCounts expectedCounts)
    {
        Assert.Equal(expectedCounts, await ReadMutationCountsAsync(testFactory));
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

    private static HttpRequestMessage CreateJsonBearerRequest(
        HttpMethod method,
        string path,
        string rawSessionToken,
        string body)
    {
        var request = new HttpRequestMessage(method, path)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
    }

    private static string SettlementRequestCancellationPath(Guid settlementId)
    {
        return $"/api/v1/settlements/{settlementId:D}/cancel";
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

    private static void AssertSafeResponseContent(
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
        Assert.DoesNotContain("merchant", lowerContent);
        Assert.DoesNotContain("item", lowerContent);
        Assert.DoesNotContain("ocr", lowerContent);
    }

    private static void AssertSafeProblemContent(string content)
    {
        var lowerContent = content.ToLowerInvariant();
        Assert.DoesNotContain("rawbodysecret", lowerContent);
        Assert.DoesNotContain("do-not-echo-this", lowerContent);
        Assert.DoesNotContain("merchant", lowerContent);
        Assert.DoesNotContain("item", lowerContent);
        Assert.DoesNotContain("paymenthandle", lowerContent);
        Assert.DoesNotContain("payment_handle", lowerContent);
        Assert.DoesNotContain("paymentnote", lowerContent);
        Assert.DoesNotContain("payment_note", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("objectkey", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
        Assert.DoesNotContain("proof", lowerContent);
        Assert.DoesNotContain("qr", lowerContent);
    }

    private static void AssertBoundedRequestCancellationAuditMetadata(
        string? metadataJson,
        Guid settlementRequestId,
        Guid billId,
        Guid? groupId,
        string groupMode,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        string amount)
    {
        Assert.NotNull(metadataJson);
        Assert.DoesNotContain("requestBody", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("paymentHandle", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("paymentNote", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("storage", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("session", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("credential", metadataJson, StringComparison.OrdinalIgnoreCase);

        using var metadata = JsonDocument.Parse(metadataJson);
        Assert.Equal("settlement_request_cancellation", metadata.RootElement.GetProperty("workflowName").GetString());
        Assert.Equal(settlementRequestId.ToString("D"), metadata.RootElement.GetProperty("settlementRequestId").GetString());
        Assert.Equal(billId.ToString("D"), metadata.RootElement.GetProperty("sourceExpenseBillId").GetString());
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
        Assert.Equal(SettlementRequestStatuses.Cancelled, metadata.RootElement.GetProperty("requestStatus").GetString());
        Assert.Equal(SettlementRequestStatuses.Requested, metadata.RootElement.GetProperty("previousRequestStatus").GetString());
        Assert.Equal(SettlementRequestStatuses.Cancelled, metadata.RootElement.GetProperty("newRequestStatus").GetString());
        Assert.Equal(amount, metadata.RootElement.GetProperty("amount").GetString());
        Assert.Equal("USD", metadata.RootElement.GetProperty("currency").GetString());
        Assert.Equal("request_status_transition", metadata.RootElement.GetProperty("candidateBasis").GetString());
    }

    private static void AssertBoundedPaymentCancellationAuditMetadata(
        string? metadataJson,
        Guid settlementRequestId,
        Guid settlementPaymentId,
        Guid billId,
        Guid? groupId,
        string groupMode,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        string previousRequestStatus,
        string newRequestStatus,
        string paymentAmount,
        string activePaymentCoverageAmount,
        string requestAmount)
    {
        Assert.NotNull(metadataJson);
        Assert.DoesNotContain("requestBody", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("paymentHandle", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("paymentNote", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("proof", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("fileObject", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("storage", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("session", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("credential", metadataJson, StringComparison.OrdinalIgnoreCase);

        using var metadata = JsonDocument.Parse(metadataJson);
        Assert.Equal("settlement_payment_cancellation", metadata.RootElement.GetProperty("workflowName").GetString());
        Assert.Equal(settlementRequestId.ToString("D"), metadata.RootElement.GetProperty("settlementRequestId").GetString());
        Assert.Equal(settlementPaymentId.ToString("D"), metadata.RootElement.GetProperty("settlementPaymentId").GetString());
        Assert.Equal(billId.ToString("D"), metadata.RootElement.GetProperty("sourceExpenseBillId").GetString());
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
        Assert.Equal(previousRequestStatus, metadata.RootElement.GetProperty("previousRequestStatus").GetString());
        Assert.Equal(newRequestStatus, metadata.RootElement.GetProperty("newRequestStatus").GetString());
        Assert.Equal(SettlementPaymentStatuses.Cancelled, metadata.RootElement.GetProperty("paymentStatus").GetString());
        Assert.Equal(SettlementPaymentStatuses.MarkedPaid, metadata.RootElement.GetProperty("previousPaymentStatus").GetString());
        Assert.Equal(SettlementPaymentStatuses.Cancelled, metadata.RootElement.GetProperty("newPaymentStatus").GetString());
        Assert.Equal(paymentAmount, metadata.RootElement.GetProperty("paymentAmount").GetString());
        Assert.Equal(activePaymentCoverageAmount, metadata.RootElement.GetProperty("activePaymentCoverageAmount").GetString());
        Assert.Equal(requestAmount, metadata.RootElement.GetProperty("requestAmount").GetString());
        Assert.Equal("USD", metadata.RootElement.GetProperty("currency").GetString());
        Assert.Equal("2026-05-09", metadata.RootElement.GetProperty("paymentDate").GetString());
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
        Assert.Equal("The requested settlement is unavailable.", payload.RootElement.GetProperty("detail").GetString());
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
        Assert.Equal("The requested settlement payment is unavailable.", payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertSettlementCancellationConflictProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Settlement cancellation conflict", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("The settlement cannot be cancelled for the current settlement state.", payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertSettlementPaymentCancellationConflictProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Settlement payment conflict", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("The settlement payment cannot be cancelled for the current settlement state.", payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertInvalidSettlementCancellationProblemAsync(
        HttpResponseMessage response,
        string unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain(unexpectedResponseText, content);
        AssertSafeProblemContent(content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid settlement cancellation", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("Settlement cancellation does not accept a request body.", payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertInvalidSettlementPaymentCancellationProblemAsync(
        HttpResponseMessage response,
        string unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain(unexpectedResponseText, content);
        AssertSafeProblemContent(content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid settlement payment cancellation", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("Settlement payment cancellation does not accept a request body.", payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertUnauthenticatedProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Unauthenticated", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(401, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("Authentication is required to access this resource.", payload.RootElement.GetProperty("detail").GetString());
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

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        SettlementCancellationTestTimeProvider TimeProvider);

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

    private sealed record MutationCounts(
        int SettlementRequestCount,
        int SettlementRequestLineCount,
        int SettlementPaymentCount,
        int SettlementPaymentAllocationCount,
        int SettlementProofAttachmentCount,
        int FileObjectCount,
        int UserPaymentProfileCount,
        int CancellationAuditEventCount);

    private sealed record SettlementState(
        IReadOnlyList<SettlementRequest> Requests,
        IReadOnlyList<SettlementPayment> Payments,
        IReadOnlyList<SettlementRequestLine> RequestLines,
        IReadOnlyList<SettlementPaymentAllocation> PaymentAllocations,
        IReadOnlyList<SettlementProofAttachment> ProofAttachments,
        IReadOnlyList<AuthAuditEvent> CancellationAuditEvents,
        MutationCounts MutationCounts);

    private sealed class SettlementCancellationTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public SettlementCancellationTestTimeProvider(DateTimeOffset utcNow)
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
