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

public sealed class SettlementDisputeEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string HiddenMerchantName = "Hidden Settlement Dispute Merchant";
    private const string HiddenItemName = "Hidden Settlement Dispute Item";
    private const string HiddenPaymentMethodLabel = "Hidden settlement dispute method label";
    private const string HiddenPaymentHandle = "hidden-settlement-dispute-handle";
    private const string HiddenPaymentNote = "hidden settlement dispute note";
    private const string HiddenStorageObjectKey = "hidden/settlement/dispute/object-key";
    private const string HiddenOriginalFilename = "hidden-settlement-dispute-proof.png";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 9, 1, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 9, 1, 15, 0, TimeSpan.Zero);
    private static readonly DateOnly PaymentDate = new(2026, 5, 9);

    private readonly WebApplicationFactory<Program> factory;

    public SettlementDisputeEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task DebtorCanDisputeRequestedSettlementRequest()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Request Dispute Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Request Dispute Creditor", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [new ParticipantSeed(debtorSession.UserProfileId, 25m), new ParticipantSeed(creditor.UserProfileId, 25m)],
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
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(2));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, debtorSession.AuthSessionId);

        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Post,
            SettlementRequestDisputePath(settlementId),
            debtorSession.RawSessionToken);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeResponseContent(content, debtorSession.RawSessionToken, sessionTokenHash, HiddenMerchantName, HiddenItemName);
        using var payload = JsonDocument.Parse(content);
        AssertSettlementRequestResponseShape(payload.RootElement);
        Assert.Equal(settlementId, payload.RootElement.GetProperty("id").GetGuid());
        Assert.Equal(SettlementRequestStatuses.Disputed, payload.RootElement.GetProperty("status").GetString());
        Assert.Equal(ValidationTimestamp, payload.RootElement.GetProperty("updatedAtUtc").GetDateTimeOffset());

        var persisted = await ReadSettlementStateAsync(testFactory);
        var settlementRequest = Assert.Single(persisted.Requests);
        Assert.Equal(SettlementRequestStatuses.Disputed, settlementRequest.Status);
        Assert.Equal(ValidationTimestamp, settlementRequest.DisputedAtUtc);
        Assert.Equal(ValidationTimestamp, settlementRequest.UpdatedAtUtc);
        Assert.Equal(SettlementRequestLineStatuses.Disputed, Assert.Single(persisted.RequestLines).Status);
        Assert.Empty(persisted.Payments);
        Assert.Empty(persisted.ProofAttachments);
        Assert.Equal(beforeCounts with { SettlementAuditEventCount = beforeCounts.SettlementAuditEventCount + 1 }, persisted.MutationCounts);

        var auditEvent = Assert.Single(persisted.SettlementAuditEvents);
        Assert.Equal("settlement.request_disputed", auditEvent.Action);
        Assert.Equal(debtorSession.AuthAccountId, auditEvent.ActorAuthAccountId);
        AssertBoundedRequestDisputeAuditMetadata(
            auditEvent.SafeMetadataJson,
            settlementId,
            billId,
            groupId: null,
            "personal",
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            SettlementRequestStatuses.Requested);
    }

    [Fact]
    public async Task CreditorCanDisputeMarkedPaidRequestWithoutRewritingPaymentProofOrPaymentDetails()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtor = await SeedAccountAsync(testFactory, "Request Payment Preservation Debtor", InitialTimestamp);
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Request Payment Preservation Creditor");
        await SeedPaymentProfileWithQrAsync(testFactory, creditorSession.UserProfileId, InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creditorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(debtor.UserProfileId, 30m), new ParticipantSeed(creditorSession.UserProfileId, 30m)],
            [new PayerSeed(creditorSession.UserProfileId, 60m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            creditorSession.UserProfileId,
            30m,
            SettlementRequestStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(2));
        var paymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            30m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
        var fileObjectId = await SeedSettlementProofAttachmentAsync(
            testFactory,
            paymentId,
            debtor.UserProfileId,
            InitialTimestamp.AddMinutes(4));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Post,
            SettlementRequestDisputePath(settlementId),
            creditorSession.RawSessionToken);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertSafeResponseContent(
            content,
            HiddenPaymentMethodLabel,
            HiddenPaymentHandle,
            HiddenPaymentNote,
            HiddenStorageObjectKey,
            HiddenOriginalFilename);

        var persisted = await ReadSettlementStateAsync(testFactory);
        Assert.Equal(SettlementRequestStatuses.Disputed, Assert.Single(persisted.Requests).Status);
        Assert.Equal(SettlementRequestLineStatuses.Disputed, Assert.Single(persisted.RequestLines).Status);
        var payment = Assert.Single(persisted.Payments);
        Assert.Equal(paymentId, payment.Id);
        Assert.Equal(SettlementPaymentStatuses.MarkedPaid, payment.Status);
        Assert.Equal(InitialTimestamp.AddMinutes(3), payment.UpdatedAtUtc);
        var proofAttachment = Assert.Single(persisted.ProofAttachments);
        Assert.Equal(paymentId, proofAttachment.SettlementPaymentId);
        Assert.Equal(fileObjectId, proofAttachment.FileObjectId);
        Assert.Equal(beforeCounts.FileObjectCount, persisted.MutationCounts.FileObjectCount);
        Assert.Equal(beforeCounts.UserPaymentProfileCount, persisted.MutationCounts.UserPaymentProfileCount);
        Assert.Equal(beforeCounts.SettlementPaymentCount, persisted.MutationCounts.SettlementPaymentCount);
        Assert.Equal(beforeCounts.SettlementProofAttachmentCount, persisted.MutationCounts.SettlementProofAttachmentCount);
        Assert.Equal(beforeCounts.SettlementAuditEventCount + 1, persisted.MutationCounts.SettlementAuditEventCount);
    }

    [Fact]
    public async Task CreditorCanDisputeMarkedPaidPaymentAndParentRequest()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtor = await SeedAccountAsync(testFactory, "Payment Dispute Debtor", InitialTimestamp);
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Payment Dispute Creditor");
        await SeedPaymentProfileWithQrAsync(testFactory, creditorSession.UserProfileId, InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creditorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(debtor.UserProfileId, 40m), new ParticipantSeed(creditorSession.UserProfileId, 40m)],
            [new PayerSeed(creditorSession.UserProfileId, 80m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            creditorSession.UserProfileId,
            40m,
            SettlementRequestStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(2));
        var paymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            40m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
        var fileObjectId = await SeedSettlementProofAttachmentAsync(
            testFactory,
            paymentId,
            debtor.UserProfileId,
            InitialTimestamp.AddMinutes(4));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, creditorSession.AuthSessionId);

        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentDisputePath(paymentId),
            creditorSession.RawSessionToken);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeResponseContent(
            content,
            creditorSession.RawSessionToken,
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
        Assert.Equal(SettlementPaymentStatuses.Disputed, payload.RootElement.GetProperty("status").GetString());
        Assert.Equal(ValidationTimestamp, payload.RootElement.GetProperty("updatedAtUtc").GetDateTimeOffset());
        Assert.Equal(SettlementRequestStatuses.Disputed, payload.RootElement.GetProperty("settlementRequestStatus").GetString());
        var allocationPayload = Assert.Single(payload.RootElement.GetProperty("allocations").EnumerateArray());
        Assert.Equal("40", allocationPayload.GetProperty("clearedAmount").GetString());

        var persisted = await ReadSettlementStateAsync(testFactory);
        var settlementRequest = Assert.Single(persisted.Requests);
        Assert.Equal(SettlementRequestStatuses.Disputed, settlementRequest.Status);
        Assert.Equal(ValidationTimestamp, settlementRequest.DisputedAtUtc);
        Assert.Equal(ValidationTimestamp, settlementRequest.UpdatedAtUtc);
        Assert.Equal(SettlementRequestLineStatuses.Disputed, Assert.Single(persisted.RequestLines).Status);
        var payment = Assert.Single(persisted.Payments);
        Assert.Equal(SettlementPaymentStatuses.Disputed, payment.Status);
        Assert.Equal(ValidationTimestamp, payment.DisputedAtUtc);
        Assert.Equal(ValidationTimestamp, payment.UpdatedAtUtc);
        Assert.Equal(40m, Assert.Single(persisted.PaymentAllocations).ClearedAmount);
        var proofAttachment = Assert.Single(persisted.ProofAttachments);
        Assert.Equal(fileObjectId, proofAttachment.FileObjectId);
        Assert.Equal(beforeCounts.FileObjectCount, persisted.MutationCounts.FileObjectCount);
        Assert.Equal(beforeCounts.UserPaymentProfileCount, persisted.MutationCounts.UserPaymentProfileCount);
        Assert.Equal(beforeCounts.SettlementRequestCount, persisted.MutationCounts.SettlementRequestCount);
        Assert.Equal(beforeCounts.SettlementPaymentCount, persisted.MutationCounts.SettlementPaymentCount);
        Assert.Equal(beforeCounts.SettlementProofAttachmentCount, persisted.MutationCounts.SettlementProofAttachmentCount);
        Assert.Equal(beforeCounts.SettlementAuditEventCount + 1, persisted.MutationCounts.SettlementAuditEventCount);

        var auditEvent = Assert.Single(persisted.SettlementAuditEvents);
        Assert.Equal("settlement.payment_disputed", auditEvent.Action);
        Assert.Equal(creditorSession.AuthAccountId, auditEvent.ActorAuthAccountId);
        AssertBoundedPaymentDisputeAuditMetadata(
            auditEvent.SafeMetadataJson,
            settlementId,
            paymentId,
            billId,
            groupId: null,
            "personal",
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            SettlementRequestStatuses.MarkedPaid,
            "40",
            "0");
    }

    [Fact]
    public async Task NonPartyGroupMemberAndWrongPaymentActorFailClosedWithoutMutation()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Dispute Denied Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Dispute Denied Creditor", InitialTimestamp.AddMinutes(1));
        var nonPartySession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Dispute Denied Non Party");
        var memberOnlySession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Dispute Denied Member Only");
        var groupId = await SeedGroupAsync(
            testFactory,
            creditor.UserProfileId,
            "Dispute Denied Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(debtorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(creditor.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(memberOnlySession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var billId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId,
            [new ParticipantSeed(debtorSession.UserProfileId, 20m), new ParticipantSeed(creditor.UserProfileId, 20m)],
            [new PayerSeed(creditor.UserProfileId, 40m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            20m,
            SettlementRequestStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(2));
        var paymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            20m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var nonPartyRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementRequestDisputePath(settlementId),
            nonPartySession.RawSessionToken);
        using var nonPartyResponse = await client.SendAsync(nonPartyRequest);
        await AssertSettlementUnavailableProblemAsync(nonPartyResponse);

        using var memberOnlyRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementRequestDisputePath(settlementId),
            memberOnlySession.RawSessionToken);
        using var memberOnlyResponse = await client.SendAsync(memberOnlyRequest);
        await AssertSettlementUnavailableProblemAsync(memberOnlyResponse);

        using var debtorPaymentRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentDisputePath(paymentId),
            debtorSession.RawSessionToken);
        using var debtorPaymentResponse = await client.SendAsync(debtorPaymentRequest);
        await AssertSettlementPaymentUnavailableProblemAsync(debtorPaymentResponse);

        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public async Task RemovedDeletedArchivedMissingOrUnrelatedSubjectsFailClosedWithoutSuccessAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Fail Closed Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Fail Closed Creditor", InitialTimestamp.AddMinutes(1));
        var removedCreditor = await SeedAccountAsync(testFactory, "Fail Closed Removed Creditor", InitialTimestamp.AddMinutes(2));
        var unrelatedDebtor = await SeedAccountAsync(testFactory, "Fail Closed Unrelated Debtor", InitialTimestamp.AddMinutes(3));
        var unrelatedCreditor = await SeedAccountAsync(testFactory, "Fail Closed Unrelated Creditor", InitialTimestamp.AddMinutes(4));
        var archivedSettlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            SettlementRequestStatuses.Requested,
            archivedAtUtc: InitialTimestamp.AddMinutes(10));
        var deletedCreditorSettlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            SettlementRequestStatuses.Requested);
        await MarkUserProfileDeletedAsync(testFactory, creditor.UserProfileId, InitialTimestamp.AddMinutes(20));
        var unrelatedSettlementId = await SeedBasicSettlementAsync(
            testFactory,
            unrelatedDebtor.UserProfileId,
            unrelatedCreditor.UserProfileId,
            SettlementRequestStatuses.Requested);
        var removedGroupId = await SeedGroupAsync(
            testFactory,
            removedCreditor.UserProfileId,
            "Removed Dispute Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(debtorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed),
            new MembershipSeed(removedCreditor.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var removedBillId = await SeedBillAsync(
            testFactory,
            removedCreditor.UserProfileId,
            removedGroupId,
            [new ParticipantSeed(debtorSession.UserProfileId, 8m), new ParticipantSeed(removedCreditor.UserProfileId, 8m)],
            [new PayerSeed(removedCreditor.UserProfileId, 16m)],
            InitialTimestamp);
        var removedSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            removedBillId,
            removedGroupId,
            debtorSession.UserProfileId,
            removedCreditor.UserProfileId,
            removedCreditor.UserProfileId,
            8m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(3));
        var unrelatedPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            unrelatedSettlementId,
            unrelatedDebtor.UserProfileId,
            unrelatedCreditor.UserProfileId,
            25m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(5));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        foreach (var settlementId in new[]
        {
            Guid.NewGuid(),
            archivedSettlementId,
            deletedCreditorSettlementId,
            unrelatedSettlementId,
            removedSettlementId
        })
        {
            using var request = CreateBearerRequest(
                HttpMethod.Post,
                SettlementRequestDisputePath(settlementId),
                debtorSession.RawSessionToken);
            using var response = await client.SendAsync(request);
            await AssertSettlementUnavailableProblemAsync(response);
        }

        using var paymentRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentDisputePath(unrelatedPaymentId),
            debtorSession.RawSessionToken);
        using var paymentResponse = await client.SendAsync(paymentRequest);
        await AssertSettlementPaymentUnavailableProblemAsync(paymentResponse);
        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Theory]
    [InlineData(SettlementRequestStatuses.Confirmed)]
    [InlineData(SettlementRequestStatuses.Disputed)]
    [InlineData(SettlementRequestStatuses.Cancelled)]
    public async Task FinalOrAlreadyDisputedRequestStatusesReturnConflictWithoutMutation(string requestStatus)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, $"Request Conflict Debtor {requestStatus}");
        var creditor = await SeedAccountAsync(testFactory, $"Request Conflict Creditor {requestStatus}", InitialTimestamp.AddMinutes(1));
        var settlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            requestStatus);
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Post,
            SettlementRequestDisputePath(settlementId),
            debtorSession.RawSessionToken);
        using var response = await client.SendAsync(request);

        await AssertSettlementDisputeConflictProblemAsync(response);
        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Theory]
    [InlineData(SettlementPaymentStatuses.Confirmed)]
    [InlineData(SettlementPaymentStatuses.Disputed)]
    [InlineData(SettlementPaymentStatuses.Cancelled)]
    public async Task FinalOrAlreadyDisputedPaymentStatusesReturnConflictWithoutMutation(string paymentStatus)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtor = await SeedAccountAsync(testFactory, $"Payment Conflict Debtor {paymentStatus}", InitialTimestamp);
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, $"Payment Conflict Creditor {paymentStatus}");
        var settlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            SettlementRequestStatuses.MarkedPaid);
        var paymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            25m,
            paymentStatus,
            InitialTimestamp.AddMinutes(2));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentDisputePath(paymentId),
            creditorSession.RawSessionToken);
        using var response = await client.SendAsync(request);

        await AssertSettlementPaymentDisputeConflictProblemAsync(response);
        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public async Task BodyOnBodylessDisputeEndpointsReturnsBoundedBadRequestWithoutMutation()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Bodyless Debtor");
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Bodyless Creditor");
        var settlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditorSession.UserProfileId,
            SettlementRequestStatuses.MarkedPaid);
        var paymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditorSession.UserProfileId,
            25m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(2));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var requestDispute = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementRequestDisputePath(settlementId),
            debtorSession.RawSessionToken,
            """{"rawBodySecret":"do-not-echo-this"}""");
        using var requestResponse = await client.SendAsync(requestDispute);
        await AssertInvalidSettlementDisputeProblemAsync(requestResponse, "do-not-echo-this");

        using var paymentDispute = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentDisputePath(paymentId),
            creditorSession.RawSessionToken,
            """{"rawBodySecret":"do-not-echo-this"}""");
        using var paymentResponse = await client.SendAsync(paymentDispute);
        await AssertInvalidSettlementPaymentDisputeProblemAsync(paymentResponse, "do-not-echo-this");

        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public void OpenApiAndGeneratedClientsExposeOnlySettlementDisputeMethodsForThisSlice()
    {
        var openApi = File.ReadAllText(FindRepoFile("packages/contracts/openapi/settleora.v1.yaml"));
        var webClient = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/client.ts"));
        var dartClient = File.ReadAllText(FindRepoFile("packages/client-dart/generated/client.dart"));

        Assert.Contains("operationId: disputeSettlementRequest", openApi, StringComparison.Ordinal);
        Assert.Contains("operationId: disputeSettlementPayment", openApi, StringComparison.Ordinal);
        Assert.Contains("disputeSettlementRequest", webClient, StringComparison.Ordinal);
        Assert.Contains("disputeSettlementPayment", webClient, StringComparison.Ordinal);
        Assert.Contains("disputeSettlementRequest", dartClient, StringComparison.Ordinal);
        Assert.Contains("disputeSettlementPayment", dartClient, StringComparison.Ordinal);

        foreach (var generatedClient in new[] { webClient, dartClient })
        {
            Assert.DoesNotContain("proofSettlement", generatedClient, StringComparison.Ordinal);
            Assert.DoesNotContain("uploadSettlement", generatedClient, StringComparison.Ordinal);
            Assert.DoesNotContain("downloadSettlement", generatedClient, StringComparison.Ordinal);
            Assert.DoesNotContain("counterpartyPayment", generatedClient, StringComparison.Ordinal);
            Assert.DoesNotContain("ocr", generatedClient, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("recurring", generatedClient, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("aiInsights", generatedClient, StringComparison.OrdinalIgnoreCase);
        }
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = $"settlement-dispute-endpoints-{Guid.NewGuid():D}";
        var timeProvider = new SettlementDisputeTestTimeProvider(ValidationTimestamp);

        var testFactory = factory.WithWebHostBuilder(builder =>
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
        SettlementDisputeTestTimeProvider timeProvider,
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
        SettlementDisputeTestTimeProvider timeProvider,
        SeededAccount account)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Settlement dispute endpoint test",
                UserAgentSummary: "Settlement dispute endpoint test user agent",
                NetworkAddressHash: "settlement-dispute-endpoint-test-network",
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

    private static async Task<Guid> SeedBasicSettlementAsync(
        WebApplicationFactory<Program> testFactory,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        string status,
        DateTimeOffset? archivedAtUtc = null)
    {
        var billId = await SeedBillAsync(
            testFactory,
            creditorUserProfileId,
            groupId: null,
            [new ParticipantSeed(debtorUserProfileId, 25m), new ParticipantSeed(creditorUserProfileId, 25m)],
            [new PayerSeed(creditorUserProfileId, 50m)],
            InitialTimestamp);

        return await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtorUserProfileId,
            creditorUserProfileId,
            creditorUserProfileId,
            25m,
            status,
            InitialTimestamp.AddMinutes(1),
            archivedAtUtc);
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
            PaymentDate = PaymentDate,
            CreatedByUserProfileId = paidByUserProfileId,
            ClaimedAtUtc = createdAtUtc,
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
                Currency = "USD",
                AllocationOrder = 0,
                CreatedAtUtc = createdAtUtc
            });
        }

        await dbContext.SaveChangesAsync();
        return paymentId;
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

    private static async Task MarkUserProfileDeletedAsync(
        WebApplicationFactory<Program> testFactory,
        Guid userProfileId,
        DateTimeOffset deletedAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var userProfile = await dbContext.Set<UserProfile>().SingleAsync(profile => profile.Id == userProfileId);
        userProfile.DeletedAtUtc = deletedAtUtc;
        userProfile.UpdatedAtUtc = deletedAtUtc;
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

    private static async Task<SettlementState> ReadSettlementStateAsync(WebApplicationFactory<Program> testFactory)
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
                .Where(auditEvent => IsSettlementDisputeAuditAction(auditEvent.Action))
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
            await dbContext.Set<AuthAuditEvent>().CountAsync(auditEvent => IsSettlementDisputeAuditAction(auditEvent.Action)));
    }

    private static bool IsSettlementDisputeAuditAction(string action)
    {
        return action is "settlement.request_disputed"
            or "settlement.payment_disputed";
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

    private static string SettlementRequestDisputePath(Guid settlementId)
    {
        return $"/api/v1/settlements/{settlementId:D}/dispute";
    }

    private static string SettlementPaymentDisputePath(Guid paymentId)
    {
        return $"/api/v1/settlement-payments/{paymentId:D}/dispute";
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

    private static void AssertBoundedRequestDisputeAuditMetadata(
        string? metadataJson,
        Guid settlementRequestId,
        Guid billId,
        Guid? groupId,
        string groupMode,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        string previousRequestStatus)
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
        Assert.Equal("settlement_request_dispute", metadata.RootElement.GetProperty("workflowName").GetString());
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
        Assert.Equal(SettlementRequestStatuses.Disputed, metadata.RootElement.GetProperty("requestStatus").GetString());
        Assert.Equal(previousRequestStatus, metadata.RootElement.GetProperty("previousRequestStatus").GetString());
        Assert.Equal(SettlementRequestStatuses.Disputed, metadata.RootElement.GetProperty("newRequestStatus").GetString());
        Assert.Equal("25", metadata.RootElement.GetProperty("amount").GetString());
        Assert.Equal("USD", metadata.RootElement.GetProperty("currency").GetString());
        Assert.Equal("request_status_transition", metadata.RootElement.GetProperty("candidateBasis").GetString());
    }

    private static void AssertBoundedPaymentDisputeAuditMetadata(
        string? metadataJson,
        Guid settlementRequestId,
        Guid settlementPaymentId,
        Guid billId,
        Guid? groupId,
        string groupMode,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        string previousRequestStatus,
        string paymentAmount,
        string activePaymentCoverageAmount)
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
        Assert.Equal("settlement_payment_dispute", metadata.RootElement.GetProperty("workflowName").GetString());
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
        Assert.Equal(SettlementRequestStatuses.Disputed, metadata.RootElement.GetProperty("newRequestStatus").GetString());
        Assert.Equal(SettlementPaymentStatuses.Disputed, metadata.RootElement.GetProperty("paymentStatus").GetString());
        Assert.Equal(SettlementPaymentStatuses.MarkedPaid, metadata.RootElement.GetProperty("previousPaymentStatus").GetString());
        Assert.Equal(SettlementPaymentStatuses.Disputed, metadata.RootElement.GetProperty("newPaymentStatus").GetString());
        Assert.Equal(paymentAmount, metadata.RootElement.GetProperty("paymentAmount").GetString());
        Assert.Equal(activePaymentCoverageAmount, metadata.RootElement.GetProperty("activePaymentCoverageAmount").GetString());
        Assert.Equal(paymentAmount, metadata.RootElement.GetProperty("requestAmount").GetString());
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

    private static async Task AssertSettlementDisputeConflictProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Settlement dispute conflict", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("The settlement cannot be disputed for the current settlement state.", payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertSettlementPaymentDisputeConflictProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Settlement payment conflict", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("The settlement payment cannot be disputed for the current settlement state.", payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertInvalidSettlementDisputeProblemAsync(
        HttpResponseMessage response,
        string unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain(unexpectedResponseText, content);
        AssertSafeProblemContent(content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid settlement dispute", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("Settlement dispute does not accept a request body.", payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertInvalidSettlementPaymentDisputeProblemAsync(
        HttpResponseMessage response,
        string unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain(unexpectedResponseText, content);
        AssertSafeProblemContent(content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid settlement payment dispute", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("Settlement payment dispute does not accept a request body.", payload.RootElement.GetProperty("detail").GetString());
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

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        SettlementDisputeTestTimeProvider TimeProvider);

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
        int SettlementAuditEventCount);

    private sealed record SettlementState(
        IReadOnlyList<SettlementRequest> Requests,
        IReadOnlyList<SettlementPayment> Payments,
        IReadOnlyList<SettlementRequestLine> RequestLines,
        IReadOnlyList<SettlementPaymentAllocation> PaymentAllocations,
        IReadOnlyList<SettlementProofAttachment> ProofAttachments,
        IReadOnlyList<AuthAuditEvent> SettlementAuditEvents,
        MutationCounts MutationCounts);

    private sealed class SettlementDisputeTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public SettlementDisputeTestTimeProvider(DateTimeOffset utcNow)
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
