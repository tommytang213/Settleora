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

public sealed class SettlementPaymentClaimEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string WrongRawToken = "visible-wrong-settlement-payment-session-token";
    private const string HiddenMerchantName = "Hidden Settlement Payment Merchant";
    private const string HiddenItemName = "Hidden Settlement Payment Item";
    private const string HiddenPaymentMethodLabel = "Hidden settlement payment method label";
    private const string HiddenPaymentHandle = "hidden-settlement-payment-handle";
    private const string HiddenPaymentNote = "hidden settlement payment note";
    private const string HiddenStorageObjectKey = "hidden/settlement/payment/qr-object-key";
    private const string HiddenOriginalFilename = "hidden-settlement-payment-qr.png";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 8, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 8, 12, 15, 0, TimeSpan.Zero);
    private static readonly DateOnly PaymentDate = new(2026, 5, 8);

    private readonly WebApplicationFactory<Program> factory;

    public SettlementPaymentClaimEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task DebtorCanCreateFullPaymentClaimAndRequestMovesToMarkedPaidWithBoundedResponseAuditAndNoProofOrPaymentDetailMutation()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Full Payment Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Full Payment Creditor", InitialTimestamp.AddMinutes(1));
        await SeedPaymentProfileWithQrAsync(testFactory, creditor.UserProfileId, InitialTimestamp.AddMinutes(2));
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
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(3));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, debtorSession.AuthSessionId);

        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentsPath(settlementId),
            debtorSession.RawSessionToken,
            """{"amount":"50.00","currency":"USD","paymentDate":"2026-05-08"}""");

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        AssertSafePaymentResponseContent(
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
        var paymentId = payload.RootElement.GetProperty("paymentId").GetGuid();
        Assert.NotEqual(Guid.Empty, paymentId);
        Assert.Equal(settlementId, payload.RootElement.GetProperty("settlementRequestId").GetGuid());
        Assert.Equal(debtorSession.UserProfileId, payload.RootElement.GetProperty("paidByUserProfileId").GetGuid());
        Assert.Equal(creditor.UserProfileId, payload.RootElement.GetProperty("receivedByUserProfileId").GetGuid());
        Assert.Equal("50", payload.RootElement.GetProperty("amount").GetString());
        Assert.Equal("USD", payload.RootElement.GetProperty("currency").GetString());
        Assert.Equal(SettlementPaymentStatuses.MarkedPaid, payload.RootElement.GetProperty("status").GetString());
        Assert.Equal("2026-05-08", payload.RootElement.GetProperty("paymentDate").GetString());
        Assert.Equal(ValidationTimestamp, payload.RootElement.GetProperty("claimedAtUtc").GetDateTimeOffset());
        Assert.Equal(ValidationTimestamp, payload.RootElement.GetProperty("createdAtUtc").GetDateTimeOffset());
        Assert.Equal(ValidationTimestamp, payload.RootElement.GetProperty("updatedAtUtc").GetDateTimeOffset());
        Assert.Equal(SettlementRequestStatuses.MarkedPaid, payload.RootElement.GetProperty("settlementRequestStatus").GetString());
        var allocationPayload = Assert.Single(payload.RootElement.GetProperty("allocations").EnumerateArray());
        AssertSettlementPaymentAllocationResponseShape(allocationPayload);
        var allocationId = allocationPayload.GetProperty("id").GetGuid();
        Assert.NotEqual(Guid.Empty, allocationId);
        Assert.Equal("50", allocationPayload.GetProperty("clearedAmount").GetString());
        Assert.Equal("USD", allocationPayload.GetProperty("currency").GetString());
        Assert.Equal(0, allocationPayload.GetProperty("allocationOrder").GetInt32());
        Assert.Equal(ValidationTimestamp, allocationPayload.GetProperty("createdAtUtc").GetDateTimeOffset());

        var persisted = await ReadSettlementStateAsync(testFactory);
        var settlementRequest = Assert.Single(persisted.Requests);
        Assert.Equal(SettlementRequestStatuses.MarkedPaid, settlementRequest.Status);
        Assert.Equal(ValidationTimestamp, settlementRequest.UpdatedAtUtc);
        var requestLine = Assert.Single(persisted.RequestLines);
        Assert.Equal(SettlementRequestLineStatuses.Cleared, requestLine.Status);
        Assert.Equal(ValidationTimestamp, requestLine.UpdatedAtUtc);
        var payment = Assert.Single(persisted.Payments);
        Assert.Equal(paymentId, payment.Id);
        Assert.Equal(settlementId, payment.SettlementRequestId);
        Assert.Equal(debtorSession.UserProfileId, payment.PaidByUserProfileId);
        Assert.Equal(creditor.UserProfileId, payment.ReceivedByUserProfileId);
        Assert.Equal(50m, payment.Amount);
        Assert.Equal("USD", payment.Currency);
        Assert.Equal(SettlementPaymentStatuses.MarkedPaid, payment.Status);
        Assert.Equal(PaymentDate, payment.PaymentDate);
        Assert.Equal(debtorSession.UserProfileId, payment.CreatedByUserProfileId);
        Assert.Equal(ValidationTimestamp, payment.ClaimedAtUtc);
        var allocation = Assert.Single(persisted.PaymentAllocations);
        Assert.Equal(allocationId, allocation.Id);
        Assert.Equal(paymentId, allocation.SettlementPaymentId);
        Assert.Equal(requestLine.Id, allocation.SettlementRequestLineId);
        Assert.Equal(requestLine.Id, allocationPayload.GetProperty("settlementRequestLineId").GetGuid());
        Assert.Equal(50m, allocation.ClearedAmount);
        Assert.Equal("USD", allocation.Currency);
        Assert.Equal(0, allocation.AllocationOrder);
        Assert.Equal(ValidationTimestamp, allocation.CreatedAtUtc);
        Assert.Empty(persisted.ProofAttachments);

        Assert.Equal(beforeCounts.SettlementRequestLineCount, persisted.MutationCounts.SettlementRequestLineCount);
        Assert.Equal(beforeCounts.SettlementPaymentAllocationCount + 1, persisted.MutationCounts.SettlementPaymentAllocationCount);
        Assert.Equal(beforeCounts.FileObjectCount, persisted.MutationCounts.FileObjectCount);
        Assert.Equal(beforeCounts.UserPaymentProfileCount, persisted.MutationCounts.UserPaymentProfileCount);
        Assert.Equal(beforeCounts.SettlementProofAttachmentCount, persisted.MutationCounts.SettlementProofAttachmentCount);

        var auditEvent = Assert.Single(persisted.PaymentAuditEvents);
        Assert.Equal("settlement.payment_marked_paid", auditEvent.Action);
        Assert.Equal(AuthAuditOutcomes.Success, auditEvent.Outcome);
        Assert.Equal(debtorSession.AuthAccountId, auditEvent.ActorAuthAccountId);
        Assert.Equal(debtorSession.AuthAccountId, auditEvent.SubjectAuthAccountId);
        AssertBoundedPaymentAuditMetadata(
            auditEvent.SafeMetadataJson,
            settlementId,
            paymentId,
            billId,
            groupId: null,
            "personal",
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            SettlementRequestStatuses.Requested,
            SettlementRequestStatuses.MarkedPaid,
            "50",
            "50",
            "50",
            "USD");
    }

    [Fact]
    public async Task DebtorCanCreatePartialPaymentAndSecondPaymentCanCoverRemaining()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Partial Payment Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Partial Payment Creditor", InitialTimestamp.AddMinutes(1));
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
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(2));

        using var client = testFactory.CreateClient();
        using var firstRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentsPath(settlementId),
            debtorSession.RawSessionToken,
            """{"amount":"20.00","currency":"USD","paymentDate":"2026-05-08"}""");
        using var firstResponse = await client.SendAsync(firstRequest);
        var firstContent = await firstResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, firstResponse.StatusCode);
        using var firstPayload = JsonDocument.Parse(firstContent);
        Assert.Equal("20", firstPayload.RootElement.GetProperty("amount").GetString());
        Assert.Equal(SettlementRequestStatuses.PartiallyPaid, firstPayload.RootElement.GetProperty("settlementRequestStatus").GetString());
        var firstAllocation = Assert.Single(firstPayload.RootElement.GetProperty("allocations").EnumerateArray());
        Assert.Equal("20", firstAllocation.GetProperty("clearedAmount").GetString());

        var afterFirst = await ReadSettlementStateAsync(testFactory);
        Assert.Equal(SettlementRequestLineStatuses.PartiallyCleared, Assert.Single(afterFirst.RequestLines).Status);

        testContext.TimeProvider.SetUtcNow(ValidationTimestamp.AddMinutes(5));
        using var secondRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentsPath(settlementId),
            debtorSession.RawSessionToken,
            """{"amount":"30.00","currency":"USD","paymentDate":"2026-05-08"}""");
        using var secondResponse = await client.SendAsync(secondRequest);
        var secondContent = await secondResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, secondResponse.StatusCode);
        using var secondPayload = JsonDocument.Parse(secondContent);
        Assert.Equal("30", secondPayload.RootElement.GetProperty("amount").GetString());
        Assert.Equal(SettlementRequestStatuses.MarkedPaid, secondPayload.RootElement.GetProperty("settlementRequestStatus").GetString());
        var secondAllocation = Assert.Single(secondPayload.RootElement.GetProperty("allocations").EnumerateArray());
        Assert.Equal("30", secondAllocation.GetProperty("clearedAmount").GetString());

        var persisted = await ReadSettlementStateAsync(testFactory);
        var settlementRequest = Assert.Single(persisted.Requests);
        Assert.Equal(SettlementRequestStatuses.MarkedPaid, settlementRequest.Status);
        Assert.Equal(SettlementRequestLineStatuses.Cleared, Assert.Single(persisted.RequestLines).Status);
        Assert.Equal([20m, 30m], persisted.Payments.OrderBy(payment => payment.CreatedAtUtc).Select(payment => payment.Amount).ToArray());
        Assert.Equal([20m, 30m], persisted.PaymentAllocations.OrderBy(allocation => allocation.CreatedAtUtc).Select(allocation => allocation.ClearedAmount).ToArray());
        Assert.Equal(
            ["settlement.payment_partially_paid", "settlement.payment_marked_paid"],
            persisted.PaymentAuditEvents.OrderBy(auditEvent => auditEvent.OccurredAtUtc).Select(auditEvent => auditEvent.Action).ToArray());
    }

    [Fact]
    public async Task OverpaymentIsRejectedWithBoundedConflictAndNoSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Overpayment Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Overpayment Creditor", InitialTimestamp.AddMinutes(1));
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
            SettlementRequestStatuses.PartiallyPaid,
            InitialTimestamp.AddMinutes(2));
        await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            40m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentsPath(settlementId),
            debtorSession.RawSessionToken,
            """{"amount":"10.01","currency":"USD","paymentDate":"2026-05-08"}""");
        using var response = await client.SendAsync(request);

        await AssertSettlementPaymentConflictProblemAsync(response);
        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public async Task ExactPaymentWithResidualPolicyIsRejectedWithBoundedValidationAndNoSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Exact Residual Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Exact Residual Creditor", InitialTimestamp.AddMinutes(1));
        var settlementId = await SeedBasicSettlementAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId);
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentsPath(settlementId),
            debtorSession.RawSessionToken,
            """{"amount":"25.00","currency":"USD","paymentDate":"2026-05-08","proposedResidualPolicy":"remaining_balance"}""");
        using var response = await client.SendAsync(request);

        await AssertInvalidSettlementPaymentProblemAsync(
            response,
            "proposedResidualPolicy",
            "Exact payments must not carry residual policy.");
        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Theory]
    [InlineData(SettlementResidualPolicies.RemainingBalance)]
    [InlineData(SettlementResidualPolicies.CarriedForward)]
    [InlineData(SettlementResidualPolicies.Waived)]
    public async Task UnderpaymentWithSupportedResidualPolicyCreatesPendingResidualAndAllocatesActualPaidAmount(string policy)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, $"Underpayment Debtor {policy}");
        var creditor = await SeedAccountAsync(testFactory, $"Underpayment Creditor {policy}", InitialTimestamp.AddMinutes(1));
        var settlementId = await SeedBasicSettlementAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId);

        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentsPath(settlementId),
            debtorSession.RawSessionToken,
            $$"""{"amount":"24.50","currency":"USD","paymentDate":"2026-05-08","proposedResidualPolicy":"{{policy}}"}""");
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        AssertSafePaymentResponseContent(content, HiddenMerchantName, HiddenItemName, HiddenPaymentHandle, HiddenStorageObjectKey);
        using var payload = JsonDocument.Parse(content);
        AssertSettlementPaymentResponseShape(payload.RootElement);
        var paymentId = payload.RootElement.GetProperty("paymentId").GetGuid();
        Assert.Equal("24.5", payload.RootElement.GetProperty("amount").GetString());
        Assert.Equal(SettlementRequestStatuses.PartiallyPaid, payload.RootElement.GetProperty("settlementRequestStatus").GetString());
        Assert.Equal("24.5", Assert.Single(payload.RootElement.GetProperty("allocations").EnumerateArray()).GetProperty("clearedAmount").GetString());
        var residualPayload = Assert.Single(payload.RootElement.GetProperty("residuals").EnumerateArray());
        AssertSettlementPaymentResidualResponseShape(residualPayload);
        Assert.Equal(paymentId, residualPayload.GetProperty("settlementPaymentId").GetGuid());
        Assert.Equal(settlementId, residualPayload.GetProperty("settlementRequestId").GetGuid());
        Assert.Equal(SettlementResidualDirections.Underpayment, residualPayload.GetProperty("direction").GetString());
        Assert.Equal("0.5", residualPayload.GetProperty("amount").GetString());
        Assert.Equal("USD", residualPayload.GetProperty("currency").GetString());
        Assert.Equal(policy, residualPayload.GetProperty("policy").GetString());
        Assert.Equal(SettlementResidualStatuses.PendingReceiverConfirmation, residualPayload.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, residualPayload.GetProperty("resolvedAtUtc").ValueKind);

        var persisted = await ReadSettlementStateAsync(testFactory);
        Assert.Equal(SettlementRequestStatuses.PartiallyPaid, Assert.Single(persisted.Requests).Status);
        Assert.Equal(24.5m, Assert.Single(persisted.PaymentAllocations).ClearedAmount);
        var residual = Assert.Single(persisted.Residuals);
        Assert.Equal(paymentId, residual.SettlementPaymentId);
        Assert.Equal(settlementId, residual.SettlementRequestId);
        Assert.Equal(SettlementResidualDirections.Underpayment, residual.Direction);
        Assert.Equal(0.5m, residual.Amount);
        Assert.Equal(policy, residual.Policy);
        Assert.Equal(SettlementResidualStatuses.PendingReceiverConfirmation, residual.Status);
        Assert.Null(residual.ResolvedAtUtc);
    }

    [Theory]
    [InlineData(SettlementResidualPolicies.CreditForward)]
    [InlineData(SettlementResidualPolicies.WaivedByPayer)]
    public async Task OverpaymentWithSupportedResidualPolicyCreatesPendingResidualWithoutOverAllocatingRequestLines(string policy)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, $"Overpayment Policy Debtor {policy}");
        var creditor = await SeedAccountAsync(testFactory, $"Overpayment Policy Creditor {policy}", InitialTimestamp.AddMinutes(1));
        var settlementId = await SeedBasicSettlementAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId);

        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentsPath(settlementId),
            debtorSession.RawSessionToken,
            $$"""{"amount":"25.25","currency":"USD","paymentDate":"2026-05-08","proposedResidualPolicy":"{{policy}}"}""");
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var payload = JsonDocument.Parse(content);
        var paymentId = payload.RootElement.GetProperty("paymentId").GetGuid();
        Assert.Equal("25.25", payload.RootElement.GetProperty("amount").GetString());
        Assert.Equal(SettlementRequestStatuses.MarkedPaid, payload.RootElement.GetProperty("settlementRequestStatus").GetString());
        Assert.Equal("25", Assert.Single(payload.RootElement.GetProperty("allocations").EnumerateArray()).GetProperty("clearedAmount").GetString());
        var residualPayload = Assert.Single(payload.RootElement.GetProperty("residuals").EnumerateArray());
        Assert.Equal(SettlementResidualDirections.Overpayment, residualPayload.GetProperty("direction").GetString());
        Assert.Equal("0.25", residualPayload.GetProperty("amount").GetString());
        Assert.Equal(policy, residualPayload.GetProperty("policy").GetString());
        Assert.Equal(SettlementResidualStatuses.PendingReceiverConfirmation, residualPayload.GetProperty("status").GetString());

        var persisted = await ReadSettlementStateAsync(testFactory);
        Assert.Equal(SettlementRequestLineStatuses.Cleared, Assert.Single(persisted.RequestLines).Status);
        Assert.Equal(25.25m, Assert.Single(persisted.Payments).Amount);
        Assert.Equal(25m, Assert.Single(persisted.PaymentAllocations).ClearedAmount);
        var residual = Assert.Single(persisted.Residuals);
        Assert.Equal(paymentId, residual.SettlementPaymentId);
        Assert.Equal(0.25m, residual.Amount);
        Assert.Equal(SettlementResidualDirections.Overpayment, residual.Direction);
        Assert.Equal(policy, residual.Policy);
    }

    [Theory]
    [InlineData("24.50", "silently_discarded", "Residual policy is not supported.")]
    [InlineData("24.50", SettlementResidualPolicies.CreditForward, "Residual policy is not supported for the calculated residual direction.")]
    [InlineData("25.25", SettlementResidualPolicies.RemainingBalance, "Residual policy is not supported for the calculated residual direction.")]
    public async Task UnsupportedResidualPolicyOrDirectionIsRejectedWithBoundedValidationAndNoSideEffects(
        string amount,
        string policy,
        string expectedError)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, $"Unsupported Residual Debtor {policy}");
        var creditor = await SeedAccountAsync(testFactory, $"Unsupported Residual Creditor {policy}", InitialTimestamp.AddMinutes(1));
        var settlementId = await SeedBasicSettlementAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId);
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentsPath(settlementId),
            debtorSession.RawSessionToken,
            $$"""{"amount":"{{amount}}","currency":"USD","paymentDate":"2026-05-08","proposedResidualPolicy":"{{policy}}"}""");
        using var response = await client.SendAsync(request);

        await AssertInvalidSettlementPaymentProblemAsync(
            response,
            "proposedResidualPolicy",
            expectedError);
        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Theory]
    [InlineData(SettlementResidualPolicies.CreditForward, SettlementResidualStatuses.Credited, "0", "0.25")]
    [InlineData(SettlementResidualPolicies.WaivedByPayer, SettlementResidualStatuses.Waived, "0.25", "0")]
    public async Task CreditorCanConfirmOverpaymentResidualThenConfirmPaymentWithoutCreatingLedgerOrUnrelatedRows(
        string policy,
        string expectedResidualStatus,
        string expectedWaivedResidualAmount,
        string expectedCreditResidualAmount)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, $"Residual Confirm Overpayment Debtor {policy}");
        var creditor = await SeedAccountAsync(testFactory, $"Residual Confirm Overpayment Creditor {policy}", InitialTimestamp.AddMinutes(1));
        var creditorSession = await SeedSessionForAccountAsync(testFactory, testContext.TimeProvider, creditor);
        var settlementId = await SeedBasicSettlementAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId);
        var unrelatedDebtor = await SeedAccountAsync(testFactory, "Residual Confirm Unrelated Debtor", InitialTimestamp.AddMinutes(2));
        var unrelatedCreditor = await SeedAccountAsync(testFactory, "Residual Confirm Unrelated Creditor", InitialTimestamp.AddMinutes(3));
        var unrelatedSettlementId = await SeedBasicSettlementAsync(
            testFactory,
            unrelatedDebtor.UserProfileId,
            unrelatedCreditor.UserProfileId);

        using var client = testFactory.CreateClient();
        var residualClaim = await CreateResidualPaymentClaimWithResidualAsync(
            client,
            settlementId,
            debtorSession.RawSessionToken,
            "25.25",
            policy);
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using (var blockedConfirmRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentConfirmationPath(residualClaim.PaymentId),
            creditorSession.RawSessionToken))
        using (var blockedConfirmResponse = await client.SendAsync(blockedConfirmRequest))
        {
            await AssertSettlementPaymentConfirmationConflictProblemAsync(blockedConfirmResponse);
        }

        await AssertMutationCountsAsync(testFactory, beforeCounts);

        testContext.TimeProvider.SetUtcNow(ValidationTimestamp.AddMinutes(5));
        using (var residualConfirmRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentResidualConfirmationPath(residualClaim.PaymentId, residualClaim.ResidualId),
            creditorSession.RawSessionToken))
        using (var residualConfirmResponse = await client.SendAsync(residualConfirmRequest))
        {
            var content = await residualConfirmResponse.Content.ReadAsStringAsync();

            Assert.Equal(HttpStatusCode.OK, residualConfirmResponse.StatusCode);
            Assert.Equal("application/json", residualConfirmResponse.Content.Headers.ContentType?.MediaType);
            AssertSafePaymentResponseContent(content, HiddenMerchantName, HiddenItemName, HiddenPaymentHandle, HiddenStorageObjectKey);
            using var payload = JsonDocument.Parse(content);
            AssertSettlementPaymentResponseShape(payload.RootElement);
            Assert.Equal(residualClaim.PaymentId, payload.RootElement.GetProperty("paymentId").GetGuid());
            Assert.Equal(SettlementPaymentStatuses.MarkedPaid, payload.RootElement.GetProperty("status").GetString());
            Assert.Equal(SettlementRequestStatuses.MarkedPaid, payload.RootElement.GetProperty("settlementRequestStatus").GetString());
            Assert.Equal("25", Assert.Single(payload.RootElement.GetProperty("allocations").EnumerateArray()).GetProperty("clearedAmount").GetString());
            var residualPayload = Assert.Single(payload.RootElement.GetProperty("residuals").EnumerateArray());
            AssertSettlementPaymentResidualResponseShape(residualPayload);
            Assert.Equal(residualClaim.ResidualId, residualPayload.GetProperty("id").GetGuid());
            Assert.Equal(expectedResidualStatus, residualPayload.GetProperty("status").GetString());
            Assert.Equal(ValidationTimestamp.AddMinutes(5), residualPayload.GetProperty("resolvedAtUtc").GetDateTimeOffset());
        }

        var afterResidualConfirmation = await ReadSettlementStateAsync(testFactory);
        Assert.Equal(beforeCounts.SettlementPaymentCount, afterResidualConfirmation.MutationCounts.SettlementPaymentCount);
        Assert.Equal(beforeCounts.SettlementPaymentAllocationCount, afterResidualConfirmation.MutationCounts.SettlementPaymentAllocationCount);
        Assert.Equal(beforeCounts.FileObjectCount, afterResidualConfirmation.MutationCounts.FileObjectCount);
        Assert.Equal(beforeCounts.UserPaymentProfileCount, afterResidualConfirmation.MutationCounts.UserPaymentProfileCount);
        Assert.Equal(beforeCounts.SettlementProofAttachmentCount, afterResidualConfirmation.MutationCounts.SettlementProofAttachmentCount);
        Assert.Equal(beforeCounts.PaymentAuditEventCount + 1, afterResidualConfirmation.MutationCounts.PaymentAuditEventCount);
        var confirmedResidual = Assert.Single(afterResidualConfirmation.Residuals);
        Assert.Equal(expectedResidualStatus, confirmedResidual.Status);
        Assert.Equal(0.25m, confirmedResidual.Amount);
        Assert.Equal(ValidationTimestamp.AddMinutes(5), confirmedResidual.ResolvedAtUtc);
        var unrelatedRequest = Assert.Single(afterResidualConfirmation.Requests, request => request.Id == unrelatedSettlementId);
        Assert.Equal(SettlementRequestStatuses.Requested, unrelatedRequest.Status);

        var residualAudit = Assert.Single(afterResidualConfirmation.PaymentAuditEvents, audit => audit.Action == "settlement.residual_confirmed");
        AssertBoundedResidualAuditMetadata(
            residualAudit.SafeMetadataJson,
            settlementId,
            residualClaim.PaymentId,
            residualClaim.ResidualId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            SettlementResidualDirections.Overpayment,
            policy,
            SettlementResidualStatuses.PendingReceiverConfirmation,
            expectedResidualStatus,
            "0.25");

        testContext.TimeProvider.SetUtcNow(ValidationTimestamp.AddMinutes(10));
        using var paymentConfirmRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentConfirmationPath(residualClaim.PaymentId),
            creditorSession.RawSessionToken);
        using var paymentConfirmResponse = await client.SendAsync(paymentConfirmRequest);
        var paymentConfirmContent = await paymentConfirmResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, paymentConfirmResponse.StatusCode);
        using var paymentConfirmPayload = JsonDocument.Parse(paymentConfirmContent);
        Assert.Equal(SettlementPaymentStatuses.Confirmed, paymentConfirmPayload.RootElement.GetProperty("status").GetString());
        Assert.Equal(SettlementRequestStatuses.Confirmed, paymentConfirmPayload.RootElement.GetProperty("settlementRequestStatus").GetString());

        var persisted = await ReadSettlementStateAsync(testFactory);
        var payment = Assert.Single(persisted.Payments, candidate => candidate.Id == residualClaim.PaymentId);
        Assert.Equal(25.25m, payment.Amount);
        Assert.Equal(SettlementPaymentStatuses.Confirmed, payment.Status);
        Assert.Equal(25m, Assert.Single(persisted.PaymentAllocations, allocation => allocation.SettlementPaymentId == residualClaim.PaymentId).ClearedAmount);
        Assert.Equal(SettlementRequestStatuses.Confirmed, Assert.Single(persisted.Requests, request => request.Id == settlementId).Status);
        Assert.Equal(SettlementRequestStatuses.Requested, Assert.Single(persisted.Requests, request => request.Id == unrelatedSettlementId).Status);

        using var balanceRequest = CreateBearerRequest(
            HttpMethod.Get,
            SettlementBalancesPath(),
            debtorSession.RawSessionToken);
        using var balanceResponse = await client.SendAsync(balanceRequest);
        var balanceContent = await balanceResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, balanceResponse.StatusCode);
        using var balancePayload = JsonDocument.Parse(balanceContent);
        var balance = Assert.Single(balancePayload.RootElement.GetProperty("balances").EnumerateArray());
        Assert.Equal("25", balance.GetProperty("selectedLineAmount").GetString());
        Assert.Equal("25", balance.GetProperty("confirmedClearedAmount").GetString());
        Assert.Equal("0", balance.GetProperty("remainingUnclaimedAmount").GetString());
        Assert.Equal("0", balance.GetProperty("confirmedRemainingResidualAmount").GetString());
        Assert.Equal(expectedWaivedResidualAmount, balance.GetProperty("waivedResidualAmount").GetString());
        Assert.Equal(expectedCreditResidualAmount, balance.GetProperty("creditResidualAmount").GetString());
    }

    [Theory]
    [InlineData(SettlementResidualPolicies.RemainingBalance, SettlementResidualStatuses.Confirmed)]
    [InlineData(SettlementResidualPolicies.CarriedForward, SettlementResidualStatuses.CarriedForward)]
    public async Task CreditorCanConfirmDebtRetainingUnderpaymentResidualAndPaymentConfirmationKeepsDebtOutstanding(
        string policy,
        string expectedResidualStatus)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, $"Residual Confirm Underpayment Debtor {policy}");
        var creditor = await SeedAccountAsync(testFactory, $"Residual Confirm Underpayment Creditor {policy}", InitialTimestamp.AddMinutes(1));
        var creditorSession = await SeedSessionForAccountAsync(testFactory, testContext.TimeProvider, creditor);
        var settlementId = await SeedBasicSettlementAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId);

        using var client = testFactory.CreateClient();
        var residualClaim = await CreateResidualPaymentClaimWithResidualAsync(
            client,
            settlementId,
            debtorSession.RawSessionToken,
            "24.50",
            policy);

        testContext.TimeProvider.SetUtcNow(ValidationTimestamp.AddMinutes(5));
        using var residualConfirmRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentResidualConfirmationPath(residualClaim.PaymentId, residualClaim.ResidualId),
            creditorSession.RawSessionToken);
        using var residualConfirmResponse = await client.SendAsync(residualConfirmRequest);
        var residualConfirmContent = await residualConfirmResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, residualConfirmResponse.StatusCode);
        using (var payload = JsonDocument.Parse(residualConfirmContent))
        {
            var residualPayload = Assert.Single(payload.RootElement.GetProperty("residuals").EnumerateArray());
            Assert.Equal(expectedResidualStatus, residualPayload.GetProperty("status").GetString());
            Assert.Equal(ValidationTimestamp.AddMinutes(5), residualPayload.GetProperty("resolvedAtUtc").GetDateTimeOffset());
        }

        testContext.TimeProvider.SetUtcNow(ValidationTimestamp.AddMinutes(10));
        using var paymentConfirmRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentConfirmationPath(residualClaim.PaymentId),
            creditorSession.RawSessionToken);
        using var paymentConfirmResponse = await client.SendAsync(paymentConfirmRequest);
        var paymentConfirmContent = await paymentConfirmResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, paymentConfirmResponse.StatusCode);
        using (var payload = JsonDocument.Parse(paymentConfirmContent))
        {
            Assert.Equal(SettlementPaymentStatuses.Confirmed, payload.RootElement.GetProperty("status").GetString());
            Assert.Equal(SettlementRequestStatuses.PartiallyPaid, payload.RootElement.GetProperty("settlementRequestStatus").GetString());
            Assert.Equal("24.5", Assert.Single(payload.RootElement.GetProperty("allocations").EnumerateArray()).GetProperty("clearedAmount").GetString());
        }

        var persisted = await ReadSettlementStateAsync(testFactory);
        Assert.Equal(SettlementRequestStatuses.PartiallyPaid, Assert.Single(persisted.Requests).Status);
        Assert.Equal(SettlementRequestLineStatuses.PartiallyCleared, Assert.Single(persisted.RequestLines).Status);
        Assert.Equal(24.5m, Assert.Single(persisted.PaymentAllocations).ClearedAmount);
        Assert.Equal(expectedResidualStatus, Assert.Single(persisted.Residuals).Status);

        using var balanceRequest = CreateBearerRequest(
            HttpMethod.Get,
            SettlementBalancesPath(),
            debtorSession.RawSessionToken);
        using var balanceResponse = await client.SendAsync(balanceRequest);
        var balanceContent = await balanceResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, balanceResponse.StatusCode);
        using var balancePayload = JsonDocument.Parse(balanceContent);
        var balance = Assert.Single(balancePayload.RootElement.GetProperty("balances").EnumerateArray());
        Assert.Equal("25", balance.GetProperty("selectedLineAmount").GetString());
        Assert.Equal("0", balance.GetProperty("pendingClaimedAmount").GetString());
        Assert.Equal("24.5", balance.GetProperty("confirmedClearedAmount").GetString());
        Assert.Equal("0.5", balance.GetProperty("remainingUnclaimedAmount").GetString());
        Assert.Equal("0.5", balance.GetProperty("confirmedRemainingResidualAmount").GetString());
        Assert.Equal("0", balance.GetProperty("waivedResidualAmount").GetString());
        Assert.Equal("0", balance.GetProperty("creditResidualAmount").GetString());
    }

    [Fact]
    public async Task CreditorCanConfirmWaivedUnderpaymentResidualAndPaymentConfirmationClearsOnlyWaivedRequestDebt()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Residual Waiver Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Residual Waiver Creditor", InitialTimestamp.AddMinutes(1));
        var creditorSession = await SeedSessionForAccountAsync(testFactory, testContext.TimeProvider, creditor);
        var settlementId = await SeedBasicSettlementAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId);
        var unrelatedBillId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [new ParticipantSeed(debtorSession.UserProfileId, 12m), new ParticipantSeed(creditor.UserProfileId, 12m)],
            [new PayerSeed(creditor.UserProfileId, 24m)],
            InitialTimestamp.AddMinutes(2));
        var unrelatedSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            unrelatedBillId,
            groupId: null,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            12m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(3));

        using var client = testFactory.CreateClient();
        var residualClaim = await CreateResidualPaymentClaimWithResidualAsync(
            client,
            settlementId,
            debtorSession.RawSessionToken,
            "24.50",
            SettlementResidualPolicies.Waived);

        testContext.TimeProvider.SetUtcNow(ValidationTimestamp.AddMinutes(5));
        using (var residualConfirmRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentResidualConfirmationPath(residualClaim.PaymentId, residualClaim.ResidualId),
            creditorSession.RawSessionToken))
        using (var residualConfirmResponse = await client.SendAsync(residualConfirmRequest))
        {
            var residualConfirmContent = await residualConfirmResponse.Content.ReadAsStringAsync();

            Assert.Equal(HttpStatusCode.OK, residualConfirmResponse.StatusCode);
            using var payload = JsonDocument.Parse(residualConfirmContent);
            Assert.Equal(SettlementRequestStatuses.MarkedPaid, payload.RootElement.GetProperty("settlementRequestStatus").GetString());
            var residualPayload = Assert.Single(payload.RootElement.GetProperty("residuals").EnumerateArray());
            Assert.Equal(SettlementResidualStatuses.Waived, residualPayload.GetProperty("status").GetString());
            Assert.Equal(ValidationTimestamp.AddMinutes(5), residualPayload.GetProperty("resolvedAtUtc").GetDateTimeOffset());
        }

        testContext.TimeProvider.SetUtcNow(ValidationTimestamp.AddMinutes(10));
        using var paymentConfirmRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentConfirmationPath(residualClaim.PaymentId),
            creditorSession.RawSessionToken);
        using var paymentConfirmResponse = await client.SendAsync(paymentConfirmRequest);
        var paymentConfirmContent = await paymentConfirmResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, paymentConfirmResponse.StatusCode);
        using (var payload = JsonDocument.Parse(paymentConfirmContent))
        {
            Assert.Equal(SettlementPaymentStatuses.Confirmed, payload.RootElement.GetProperty("status").GetString());
            Assert.Equal(SettlementRequestStatuses.Confirmed, payload.RootElement.GetProperty("settlementRequestStatus").GetString());
            Assert.Equal("24.5", Assert.Single(payload.RootElement.GetProperty("allocations").EnumerateArray()).GetProperty("clearedAmount").GetString());
        }

        var persisted = await ReadSettlementStateAsync(testFactory);
        Assert.Equal(SettlementRequestStatuses.Confirmed, Assert.Single(persisted.Requests, request => request.Id == settlementId).Status);
        Assert.Equal(SettlementRequestStatuses.Requested, Assert.Single(persisted.Requests, request => request.Id == unrelatedSettlementId).Status);
        Assert.Equal(SettlementRequestLineStatuses.Waived, Assert.Single(persisted.RequestLines, line => line.SettlementRequestId == settlementId).Status);
        Assert.Equal(SettlementRequestLineStatuses.Open, Assert.Single(persisted.RequestLines, line => line.SettlementRequestId == unrelatedSettlementId).Status);
        Assert.Equal(24.5m, Assert.Single(persisted.PaymentAllocations).ClearedAmount);
        Assert.Equal(SettlementResidualStatuses.Waived, Assert.Single(persisted.Residuals).Status);

        using var balanceRequest = CreateBearerRequest(
            HttpMethod.Get,
            SettlementBalancesPath(),
            debtorSession.RawSessionToken);
        using var balanceResponse = await client.SendAsync(balanceRequest);
        var balanceContent = await balanceResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, balanceResponse.StatusCode);
        using var balancePayload = JsonDocument.Parse(balanceContent);
        var balance = Assert.Single(balancePayload.RootElement.GetProperty("balances").EnumerateArray());
        Assert.Equal("37", balance.GetProperty("selectedLineAmount").GetString());
        Assert.Equal("0", balance.GetProperty("pendingClaimedAmount").GetString());
        Assert.Equal("24.5", balance.GetProperty("confirmedClearedAmount").GetString());
        Assert.Equal("12", balance.GetProperty("remainingUnclaimedAmount").GetString());
        Assert.Equal("0", balance.GetProperty("confirmedRemainingResidualAmount").GetString());
        Assert.Equal("0.5", balance.GetProperty("waivedResidualAmount").GetString());
        Assert.Equal("0", balance.GetProperty("creditResidualAmount").GetString());
    }

    [Fact]
    public async Task DebtorRequesterAndNonPartyCannotConfirmResidual()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Residual Actor Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Residual Actor Creditor", InitialTimestamp.AddMinutes(1));
        var requesterSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Residual Actor Requester");
        var nonPartySession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Residual Actor Non Party");
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
            requesterSession.UserProfileId,
            25m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(1));

        using var client = testFactory.CreateClient();
        var residualClaim = await CreateResidualPaymentClaimWithResidualAsync(
            client,
            settlementId,
            debtorSession.RawSessionToken,
            "25.25",
            SettlementResidualPolicies.WaivedByPayer);
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        foreach (var rawSessionToken in new[]
        {
            debtorSession.RawSessionToken,
            requesterSession.RawSessionToken,
            nonPartySession.RawSessionToken
        })
        {
            using var request = CreateBearerRequest(
                HttpMethod.Post,
                SettlementPaymentResidualConfirmationPath(residualClaim.PaymentId, residualClaim.ResidualId),
                rawSessionToken);
            using var response = await client.SendAsync(request);

            await AssertSettlementPaymentUnavailableProblemAsync(response);
        }

        await AssertMutationCountsAsync(testFactory, beforeCounts);
        Assert.Equal(
            SettlementResidualStatuses.PendingReceiverConfirmation,
            Assert.Single((await ReadSettlementStateAsync(testFactory)).Residuals).Status);
    }

    [Fact]
    public async Task ResidualConfirmationRejectsRequestBodyWithoutRawBodyOrSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Residual Body Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Residual Body Creditor", InitialTimestamp.AddMinutes(1));
        var creditorSession = await SeedSessionForAccountAsync(testFactory, testContext.TimeProvider, creditor);
        var settlementId = await SeedBasicSettlementAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId);

        using var client = testFactory.CreateClient();
        var residualClaim = await CreateResidualPaymentClaimWithResidualAsync(
            client,
            settlementId,
            debtorSession.RawSessionToken,
            "25.25",
            SettlementResidualPolicies.CreditForward);
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentResidualConfirmationPath(residualClaim.PaymentId, residualClaim.ResidualId),
            creditorSession.RawSessionToken,
            """{"status":"credited","paymentHandle":"hidden-payment-handle","proofFileId":"hidden-proof-file"}""");
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);
        Assert.DoesNotContain("hidden-payment-handle", content, StringComparison.Ordinal);
        Assert.DoesNotContain("hidden-proof-file", content, StringComparison.Ordinal);
        await AssertMutationCountsAsync(testFactory, beforeCounts);
        Assert.Equal(
            SettlementResidualStatuses.PendingReceiverConfirmation,
            Assert.Single((await ReadSettlementStateAsync(testFactory)).Residuals).Status);
    }

    [Fact]
    public async Task ResidualConfirmationRejectsResolvedUnsafeOrWrongResidualStateWithConflict()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Residual Conflict Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Residual Conflict Creditor", InitialTimestamp.AddMinutes(1));
        var creditorSession = await SeedSessionForAccountAsync(testFactory, testContext.TimeProvider, creditor);
        var settlementId = await SeedBasicSettlementAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId);

        using var client = testFactory.CreateClient();
        var residualClaim = await CreateResidualPaymentClaimWithResidualAsync(
            client,
            settlementId,
            debtorSession.RawSessionToken,
            "25.25",
            SettlementResidualPolicies.CreditForward);

        using (var confirmRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentResidualConfirmationPath(residualClaim.PaymentId, residualClaim.ResidualId),
            creditorSession.RawSessionToken))
        using (var confirmResponse = await client.SendAsync(confirmRequest))
        {
            Assert.Equal(HttpStatusCode.OK, confirmResponse.StatusCode);
        }

        var beforeSecondConfirmCounts = await ReadMutationCountsAsync(testFactory);
        using (var secondConfirmRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentResidualConfirmationPath(residualClaim.PaymentId, residualClaim.ResidualId),
            creditorSession.RawSessionToken))
        using (var secondConfirmResponse = await client.SendAsync(secondConfirmRequest))
        {
            await AssertSettlementResidualConfirmationConflictProblemAsync(secondConfirmResponse);
        }

        await AssertMutationCountsAsync(testFactory, beforeSecondConfirmCounts);

        var unsafeSettlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditor.UserProfileId);
        var unsafeClaim = await CreateResidualPaymentClaimWithResidualAsync(
            client,
            unsafeSettlementId,
            debtorSession.RawSessionToken,
            "25.25",
            SettlementResidualPolicies.WaivedByPayer);
        await MutateResidualAsync(
            testFactory,
            unsafeClaim.ResidualId,
            residual =>
            {
                residual.Currency = "HKD";
            });
        var beforeUnsafeCounts = await ReadMutationCountsAsync(testFactory);

        using var unsafeRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentResidualConfirmationPath(unsafeClaim.PaymentId, unsafeClaim.ResidualId),
            creditorSession.RawSessionToken);
        using var unsafeResponse = await client.SendAsync(unsafeRequest);

        await AssertSettlementResidualConfirmationConflictProblemAsync(unsafeResponse);
        await AssertMutationCountsAsync(testFactory, beforeUnsafeCounts);
    }

    [Theory]
    [InlineData("cancel", SettlementResidualStatuses.Cancelled)]
    [InlineData("dispute", SettlementResidualStatuses.Disputed)]
    public async Task PaymentCancellationAndDisputeNeutralizePendingResidualsSafely(
        string action,
        string expectedResidualStatus)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, $"Residual Neutralize Debtor {action}");
        var creditor = await SeedAccountAsync(testFactory, $"Residual Neutralize Creditor {action}", InitialTimestamp.AddMinutes(1));
        var creditorSession = await SeedSessionForAccountAsync(testFactory, testContext.TimeProvider, creditor);
        var settlementId = await SeedBasicSettlementAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId);

        using var client = testFactory.CreateClient();
        var paymentId = await CreateResidualPaymentClaimAsync(
            client,
            settlementId,
            debtorSession.RawSessionToken,
            "25.25",
            SettlementResidualPolicies.WaivedByPayer);
        testContext.TimeProvider.SetUtcNow(ValidationTimestamp.AddMinutes(10));
        using var transitionRequest = action == "cancel"
            ? CreateBearerRequest(HttpMethod.Post, SettlementPaymentCancellationPath(paymentId), debtorSession.RawSessionToken)
            : CreateBearerRequest(HttpMethod.Post, SettlementPaymentDisputePath(paymentId), creditorSession.RawSessionToken);
        using var transitionResponse = await client.SendAsync(transitionRequest);
        var content = await transitionResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, transitionResponse.StatusCode);
        using var payload = JsonDocument.Parse(content);
        var residualPayload = Assert.Single(payload.RootElement.GetProperty("residuals").EnumerateArray());
        Assert.Equal(expectedResidualStatus, residualPayload.GetProperty("status").GetString());
        Assert.Equal(ValidationTimestamp.AddMinutes(10), residualPayload.GetProperty("resolvedAtUtc").GetDateTimeOffset());

        var persisted = await ReadSettlementStateAsync(testFactory);
        var residual = Assert.Single(persisted.Residuals);
        Assert.Equal(expectedResidualStatus, residual.Status);
        Assert.Equal(ValidationTimestamp.AddMinutes(10), residual.ResolvedAtUtc);
    }

    [Fact]
    public async Task UnrelatedActorCannotInferResidualExistenceFromPaymentRead()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Residual Hidden Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Residual Hidden Creditor", InitialTimestamp.AddMinutes(1));
        var nonPartySession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Residual Hidden Non Party");
        var settlementId = await SeedBasicSettlementAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId);

        using var client = testFactory.CreateClient();
        var paymentId = await CreateResidualPaymentClaimAsync(
            client,
            settlementId,
            debtorSession.RawSessionToken,
            "25.25",
            SettlementResidualPolicies.CreditForward);

        using var readRequest = CreateBearerRequest(
            HttpMethod.Get,
            SettlementPaymentPath(paymentId),
            nonPartySession.RawSessionToken);
        using var readResponse = await client.SendAsync(readRequest);

        await AssertSettlementPaymentUnavailableProblemAsync(readResponse);
    }

    [Theory]
    [InlineData("""{"amount":"0","currency":"USD","paymentDate":"2026-05-08"}""", "Zero amount is not allowed for this operation.")]
    [InlineData("""{"amount":"-1.00","currency":"USD","paymentDate":"2026-05-08"}""", "Negative amount is not allowed for this operation.")]
    [InlineData("""{"amount":"12.345","currency":"USD","paymentDate":"2026-05-08"}""", "Amount has too many fractional digits for this operation.")]
    [InlineData("""{"amount":"1e2","currency":"USD","paymentDate":"2026-05-08"}""", "Amount must be a plain base-10 decimal string.")]
    [InlineData("""{"amount":12.34,"currency":"USD","paymentDate":"2026-05-08"}""", "Amount must be a plain base-10 decimal string.")]
    public async Task ZeroNegativeOrMalformedAmountIsRejectedWithBoundedValidationAndNoSideEffects(
        string body,
        string expectedError)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Invalid Amount Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Invalid Amount Creditor", InitialTimestamp.AddMinutes(1));
        var settlementId = await SeedBasicSettlementAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId);
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentsPath(settlementId),
            debtorSession.RawSessionToken,
            body);
        using var response = await client.SendAsync(request);

        await AssertInvalidSettlementPaymentProblemAsync(response, "amount", expectedError);
        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public async Task CurrencyMismatchIsRejectedWithNoSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Currency Mismatch Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Currency Mismatch Creditor", InitialTimestamp.AddMinutes(1));
        var settlementId = await SeedBasicSettlementAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId);
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentsPath(settlementId),
            debtorSession.RawSessionToken,
            """{"amount":"10.00","currency":"HKD","paymentDate":"2026-05-08"}""");
        using var response = await client.SendAsync(request);

        await AssertSettlementPaymentConflictProblemAsync(response);
        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Theory]
    [InlineData("no_lines")]
    [InlineData("line_currency_mismatch")]
    [InlineData("line_cancelled")]
    [InlineData("line_total_mismatch")]
    public async Task UnsafeRequestLineStateIsRejectedWithNoPaymentAllocationSideEffects(string lineState)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, $"Unsafe Line Debtor {lineState}");
        var creditor = await SeedAccountAsync(testFactory, $"Unsafe Line Creditor {lineState}", InitialTimestamp.AddMinutes(1));
        var settlementId = await SeedBasicSettlementAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId);
        await MutateRequestLineAsync(testFactory, settlementId, lineState);
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentsPath(settlementId),
            debtorSession.RawSessionToken,
            """{"amount":"25.00","currency":"USD","paymentDate":"2026-05-08"}""");
        using var response = await client.SendAsync(request);

        await AssertSettlementPaymentConflictProblemAsync(response);
        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public async Task ActivePaymentCoverageInconsistencyIsRejectedWithNoNewAllocationSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Coverage Inconsistency Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Coverage Inconsistency Creditor", InitialTimestamp.AddMinutes(1));
        var settlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            status: SettlementRequestStatuses.PartiallyPaid);
        await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            10m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
        await RemovePaymentAllocationsAsync(testFactory, settlementId);
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentsPath(settlementId),
            debtorSession.RawSessionToken,
            """{"amount":"15.00","currency":"USD","paymentDate":"2026-05-08"}""");
        using var response = await client.SendAsync(request);

        await AssertSettlementPaymentConflictProblemAsync(response);
        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public async Task CreditorRequesterAndNonPartyCannotCreatePaymentClaim()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtor = await SeedAccountAsync(testFactory, "Actor Rule Debtor", InitialTimestamp);
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Actor Rule Creditor");
        var requesterSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Actor Rule Requester");
        var nonPartySession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Actor Rule Non Party");
        var billId = await SeedBillAsync(
            testFactory,
            creditorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(debtor.UserProfileId, 25m), new ParticipantSeed(creditorSession.UserProfileId, 25m)],
            [new PayerSeed(creditorSession.UserProfileId, 50m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            requesterSession.UserProfileId,
            25m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(1));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        foreach (var rawSessionToken in new[]
        {
            creditorSession.RawSessionToken,
            requesterSession.RawSessionToken,
            nonPartySession.RawSessionToken
        })
        {
            using var request = CreateJsonBearerRequest(
                HttpMethod.Post,
                SettlementPaymentsPath(settlementId),
                rawSessionToken,
                """{"amount":"25.00","currency":"USD","paymentDate":"2026-05-08"}""");
            using var response = await client.SendAsync(request);

            await AssertSettlementUnavailableProblemAsync(response);
        }

        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public async Task MissingArchivedUnrelatedOrDeletedSettlementFailsClosed()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Fail Closed Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Fail Closed Creditor", InitialTimestamp.AddMinutes(1));
        var deletedCreditor = await SeedAccountAsync(
            testFactory,
            "Fail Closed Deleted Creditor",
            InitialTimestamp.AddMinutes(2),
            deletedAtUtc: InitialTimestamp.AddMinutes(20));
        var unrelatedDebtor = await SeedAccountAsync(testFactory, "Fail Closed Unrelated Debtor", InitialTimestamp.AddMinutes(3));
        var archivedSettlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            archivedAtUtc: InitialTimestamp.AddMinutes(30));
        var unrelatedSettlementId = await SeedBasicSettlementAsync(
            testFactory,
            unrelatedDebtor.UserProfileId,
            creditor.UserProfileId);
        var deletedCreditorSettlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtorSession.UserProfileId,
            deletedCreditor.UserProfileId);
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        foreach (var settlementId in new[]
        {
            Guid.NewGuid(),
            archivedSettlementId,
            unrelatedSettlementId,
            deletedCreditorSettlementId
        })
        {
            using var request = CreateJsonBearerRequest(
                HttpMethod.Post,
                SettlementPaymentsPath(settlementId),
                debtorSession.RawSessionToken,
                """{"amount":"5.00","currency":"USD","paymentDate":"2026-05-08"}""");
            using var response = await client.SendAsync(request);

            await AssertSettlementUnavailableProblemAsync(response);
        }

        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public async Task DeletedDebtorFailsClosedWithoutPaymentOrSuccessAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Deleted Debtor Actor");
        var creditor = await SeedAccountAsync(testFactory, "Deleted Debtor Creditor", InitialTimestamp.AddMinutes(1));
        var settlementId = await SeedBasicSettlementAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId);
        await MarkUserProfileDeletedAsync(testFactory, debtorSession.UserProfileId, InitialTimestamp.AddMinutes(30));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentsPath(settlementId),
            debtorSession.RawSessionToken,
            """{"amount":"5.00","currency":"USD","paymentDate":"2026-05-08"}""");
        using var response = await client.SendAsync(request);

        await AssertSettlementUnavailableProblemAsync(response);
        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public async Task GroupScopedRequestRequiresActiveGroupAccessAndActiveRequiredParties()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Payment Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Group Payment Creditor", InitialTimestamp.AddMinutes(1));
        var requester = await SeedAccountAsync(testFactory, "Group Payment Requester", InitialTimestamp.AddMinutes(2));
        var activeGroupId = await SeedGroupAsync(
            testFactory,
            requester.UserProfileId,
            "Active Payment Claim Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(debtorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(creditor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(requester.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var activeSettlementId = await SeedGroupSettlementAsync(
            testFactory,
            activeGroupId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            requester.UserProfileId,
            10m);

        using var client = testFactory.CreateClient();
        using var activeRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentsPath(activeSettlementId),
            debtorSession.RawSessionToken,
            """{"amount":"10.00","currency":"USD","paymentDate":"2026-05-08"}""");
        using var activeResponse = await client.SendAsync(activeRequest);
        Assert.Equal(HttpStatusCode.Created, activeResponse.StatusCode);

        var removedActorGroupId = await SeedGroupAsync(
            testFactory,
            requester.UserProfileId,
            "Removed Actor Payment Claim Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(debtorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed),
            new MembershipSeed(creditor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(requester.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var removedCreditorGroupId = await SeedGroupAsync(
            testFactory,
            requester.UserProfileId,
            "Removed Creditor Payment Claim Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(debtorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(creditor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed),
            new MembershipSeed(requester.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var removedRequesterGroupId = await SeedGroupAsync(
            testFactory,
            requester.UserProfileId,
            "Removed Requester Payment Claim Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(debtorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(creditor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(requester.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Removed));
        var deletedGroupId = await SeedGroupAsync(
            testFactory,
            requester.UserProfileId,
            "Deleted Payment Claim Group",
            InitialTimestamp,
            deletedAtUtc: InitialTimestamp.AddMinutes(45),
            new MembershipSeed(debtorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(creditor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(requester.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var unavailableSettlementIds = new[]
        {
            await SeedGroupSettlementAsync(testFactory, removedActorGroupId, debtorSession.UserProfileId, creditor.UserProfileId, requester.UserProfileId, 11m),
            await SeedGroupSettlementAsync(testFactory, removedCreditorGroupId, debtorSession.UserProfileId, creditor.UserProfileId, requester.UserProfileId, 12m),
            await SeedGroupSettlementAsync(testFactory, removedRequesterGroupId, debtorSession.UserProfileId, creditor.UserProfileId, requester.UserProfileId, 13m),
            await SeedGroupSettlementAsync(testFactory, deletedGroupId, debtorSession.UserProfileId, creditor.UserProfileId, requester.UserProfileId, 14m)
        };
        var beforeUnavailableCounts = await ReadMutationCountsAsync(testFactory);

        foreach (var settlementId in unavailableSettlementIds)
        {
            using var request = CreateJsonBearerRequest(
                HttpMethod.Post,
                SettlementPaymentsPath(settlementId),
                debtorSession.RawSessionToken,
                """{"amount":"1.00","currency":"USD","paymentDate":"2026-05-08"}""");
            using var response = await client.SendAsync(request);

            await AssertSettlementUnavailableProblemAsync(response);
        }

        await AssertMutationCountsAsync(testFactory, beforeUnavailableCounts);
    }

    [Theory]
    [InlineData(SettlementRequestStatuses.MarkedPaid)]
    [InlineData(SettlementRequestStatuses.Confirmed)]
    [InlineData(SettlementRequestStatuses.Disputed)]
    [InlineData(SettlementRequestStatuses.Cancelled)]
    public async Task UnsupportedStatusTransitionIsRejectedWithoutPaymentOrSuccessAudit(string status)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, $"Unsupported Status Debtor {status}");
        var creditor = await SeedAccountAsync(testFactory, $"Unsupported Status Creditor {status}", InitialTimestamp.AddMinutes(1));
        var settlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            status: status);
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentsPath(settlementId),
            debtorSession.RawSessionToken,
            """{"amount":"1.00","currency":"USD","paymentDate":"2026-05-08"}""");
        using var response = await client.SendAsync(request);

        await AssertSettlementPaymentConflictProblemAsync(response);
        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public async Task UnsupportedFieldsAndInvalidPaymentDateAreRejectedWithoutRawBodyOrSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Unsupported Fields Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Unsupported Fields Creditor", InitialTimestamp.AddMinutes(1));
        var settlementId = await SeedBasicSettlementAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId);
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentsPath(settlementId),
            debtorSession.RawSessionToken,
            """{"amount":"5.00","currency":"USD","paymentDate":"05/08/2026","payerUserProfileId":"d2ba27b6-0f6d-4cb2-9416-740624756f64","proofFileIds":["hidden-proof-file"]}""");
        using var response = await client.SendAsync(request);

        await AssertInvalidSettlementPaymentProblemAsync(response, "body", "Unsupported fields are not allowed.");
        var content = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("payerUserProfileId", content, StringComparison.Ordinal);
        Assert.DoesNotContain("hidden-proof-file", content, StringComparison.Ordinal);
        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public async Task CreditorCanConfirmFullMarkedPaidPaymentAndRequestMovesToConfirmedWithBoundedResponseAuditAndNoUnrelatedMutation()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtor = await SeedAccountAsync(testFactory, "Full Confirmation Debtor", InitialTimestamp);
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Full Confirmation Creditor");
        await SeedPaymentProfileWithQrAsync(testFactory, creditorSession.UserProfileId, InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creditorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(debtor.UserProfileId, 25m), new ParticipantSeed(creditorSession.UserProfileId, 25m)],
            [new PayerSeed(creditorSession.UserProfileId, 50m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            creditorSession.UserProfileId,
            25m,
            SettlementRequestStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(2));
        var paymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            25m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, creditorSession.AuthSessionId);

        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentConfirmationPath(paymentId),
            creditorSession.RawSessionToken);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        AssertSafePaymentResponseContent(
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
        Assert.Equal(settlementId, payload.RootElement.GetProperty("settlementRequestId").GetGuid());
        Assert.Equal(debtor.UserProfileId, payload.RootElement.GetProperty("paidByUserProfileId").GetGuid());
        Assert.Equal(creditorSession.UserProfileId, payload.RootElement.GetProperty("receivedByUserProfileId").GetGuid());
        Assert.Equal("25", payload.RootElement.GetProperty("amount").GetString());
        Assert.Equal("USD", payload.RootElement.GetProperty("currency").GetString());
        Assert.Equal(SettlementPaymentStatuses.Confirmed, payload.RootElement.GetProperty("status").GetString());
        Assert.Equal("2026-05-08", payload.RootElement.GetProperty("paymentDate").GetString());
        Assert.Equal(InitialTimestamp.AddMinutes(3), payload.RootElement.GetProperty("claimedAtUtc").GetDateTimeOffset());
        Assert.Equal(InitialTimestamp.AddMinutes(3), payload.RootElement.GetProperty("createdAtUtc").GetDateTimeOffset());
        Assert.Equal(ValidationTimestamp, payload.RootElement.GetProperty("updatedAtUtc").GetDateTimeOffset());
        Assert.Equal(SettlementRequestStatuses.Confirmed, payload.RootElement.GetProperty("settlementRequestStatus").GetString());
        var allocationPayload = Assert.Single(payload.RootElement.GetProperty("allocations").EnumerateArray());
        Assert.Equal("25", allocationPayload.GetProperty("clearedAmount").GetString());

        var persisted = await ReadSettlementStateAsync(testFactory);
        var settlementRequest = Assert.Single(persisted.Requests);
        Assert.Equal(SettlementRequestStatuses.Confirmed, settlementRequest.Status);
        Assert.Equal(ValidationTimestamp, settlementRequest.ConfirmedAtUtc);
        Assert.Equal(ValidationTimestamp, settlementRequest.UpdatedAtUtc);
        Assert.Equal(SettlementRequestLineStatuses.Cleared, Assert.Single(persisted.RequestLines).Status);
        var payment = Assert.Single(persisted.Payments);
        Assert.Equal(SettlementPaymentStatuses.Confirmed, payment.Status);
        Assert.Equal(ValidationTimestamp, payment.ConfirmedAtUtc);
        Assert.Equal(ValidationTimestamp, payment.UpdatedAtUtc);
        Assert.Empty(persisted.ProofAttachments);

        Assert.Equal(beforeCounts.SettlementRequestCount, persisted.MutationCounts.SettlementRequestCount);
        Assert.Equal(beforeCounts.SettlementPaymentCount, persisted.MutationCounts.SettlementPaymentCount);
        Assert.Equal(beforeCounts.FileObjectCount, persisted.MutationCounts.FileObjectCount);
        Assert.Equal(beforeCounts.UserPaymentProfileCount, persisted.MutationCounts.UserPaymentProfileCount);
        Assert.Equal(beforeCounts.SettlementProofAttachmentCount, persisted.MutationCounts.SettlementProofAttachmentCount);
        Assert.Equal(beforeCounts.PaymentAuditEventCount + 1, persisted.MutationCounts.PaymentAuditEventCount);

        var auditEvent = Assert.Single(persisted.PaymentAuditEvents);
        Assert.Equal("settlement.payment_confirmed", auditEvent.Action);
        Assert.Equal(AuthAuditOutcomes.Success, auditEvent.Outcome);
        Assert.Equal(creditorSession.AuthAccountId, auditEvent.ActorAuthAccountId);
        Assert.Equal(creditorSession.AuthAccountId, auditEvent.SubjectAuthAccountId);
        AssertBoundedPaymentAuditMetadata(
            auditEvent.SafeMetadataJson,
            settlementId,
            paymentId,
            billId,
            groupId: null,
            "personal",
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            SettlementRequestStatuses.MarkedPaid,
            SettlementRequestStatuses.Confirmed,
            "25",
            "25",
            "25",
            "USD",
            expectedWorkflowName: "settlement_payment_confirmation",
            expectedPaymentStatus: SettlementPaymentStatuses.Confirmed);
    }

    [Fact]
    public async Task CreditorCanConfirmPartialPaymentAndFinalNeededPaymentMovesRequestToConfirmed()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtor = await SeedAccountAsync(testFactory, "Partial Confirmation Debtor", InitialTimestamp);
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Partial Confirmation Creditor");
        var billId = await SeedBillAsync(
            testFactory,
            creditorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(debtor.UserProfileId, 50m), new ParticipantSeed(creditorSession.UserProfileId, 50m)],
            [new PayerSeed(creditorSession.UserProfileId, 100m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            creditorSession.UserProfileId,
            50m,
            SettlementRequestStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(1));
        var firstPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            20m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(2));
        var secondPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            30m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));

        using var client = testFactory.CreateClient();
        using var firstRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentConfirmationPath(firstPaymentId),
            creditorSession.RawSessionToken);
        using var firstResponse = await client.SendAsync(firstRequest);
        var firstContent = await firstResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);
        using var firstPayload = JsonDocument.Parse(firstContent);
        Assert.Equal(SettlementPaymentStatuses.Confirmed, firstPayload.RootElement.GetProperty("status").GetString());
        Assert.Equal(SettlementRequestStatuses.MarkedPaid, firstPayload.RootElement.GetProperty("settlementRequestStatus").GetString());

        var afterFirst = await ReadSettlementStateAsync(testFactory);
        Assert.Equal(SettlementRequestStatuses.MarkedPaid, Assert.Single(afterFirst.Requests).Status);
        Assert.Equal(
            [SettlementPaymentStatuses.Confirmed, SettlementPaymentStatuses.MarkedPaid],
            afterFirst.Payments.OrderBy(payment => payment.CreatedAtUtc).Select(payment => payment.Status).ToArray());

        testContext.TimeProvider.SetUtcNow(ValidationTimestamp.AddMinutes(5));
        using var secondRequest = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentConfirmationPath(secondPaymentId),
            creditorSession.RawSessionToken);
        using var secondResponse = await client.SendAsync(secondRequest);
        var secondContent = await secondResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, secondResponse.StatusCode);
        using var secondPayload = JsonDocument.Parse(secondContent);
        Assert.Equal(SettlementPaymentStatuses.Confirmed, secondPayload.RootElement.GetProperty("status").GetString());
        Assert.Equal(SettlementRequestStatuses.Confirmed, secondPayload.RootElement.GetProperty("settlementRequestStatus").GetString());

        var persisted = await ReadSettlementStateAsync(testFactory);
        var settlementRequest = Assert.Single(persisted.Requests);
        Assert.Equal(SettlementRequestStatuses.Confirmed, settlementRequest.Status);
        Assert.Equal(ValidationTimestamp.AddMinutes(5), settlementRequest.ConfirmedAtUtc);
        Assert.Equal(
            [SettlementPaymentStatuses.Confirmed, SettlementPaymentStatuses.Confirmed],
            persisted.Payments.OrderBy(payment => payment.CreatedAtUtc).Select(payment => payment.Status).ToArray());
        Assert.Equal(
            ["settlement.payment_confirmed", "settlement.payment_confirmed"],
            persisted.PaymentAuditEvents.OrderBy(auditEvent => auditEvent.OccurredAtUtc).Select(auditEvent => auditEvent.Action).ToArray());
    }

    [Fact]
    public async Task CreditorConfirmingOnlyActivePartialCoverageKeepsRequestPartiallyPaid()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtor = await SeedAccountAsync(testFactory, "Single Partial Confirmation Debtor", InitialTimestamp);
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Single Partial Confirmation Creditor");
        var settlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            status: SettlementRequestStatuses.PartiallyPaid);
        var paymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            10m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));

        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentConfirmationPath(paymentId),
            creditorSession.RawSessionToken);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal(SettlementRequestStatuses.PartiallyPaid, payload.RootElement.GetProperty("settlementRequestStatus").GetString());
        var persisted = await ReadSettlementStateAsync(testFactory);
        Assert.Equal(SettlementRequestStatuses.PartiallyPaid, Assert.Single(persisted.Requests).Status);
        Assert.Equal(SettlementPaymentStatuses.Confirmed, Assert.Single(persisted.Payments).Status);
    }

    [Fact]
    public async Task DebtorRequesterAndNonPartyCannotConfirmPayment()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Confirm Actor Rule Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Confirm Actor Rule Creditor", InitialTimestamp.AddMinutes(1));
        var requesterSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Confirm Actor Rule Requester");
        var nonPartySession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Confirm Actor Rule Non Party");
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
            requesterSession.UserProfileId,
            25m,
            SettlementRequestStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(1));
        var paymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            25m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(2));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        foreach (var rawSessionToken in new[]
        {
            debtorSession.RawSessionToken,
            requesterSession.RawSessionToken,
            nonPartySession.RawSessionToken
        })
        {
            using var request = CreateBearerRequest(
                HttpMethod.Post,
                SettlementPaymentConfirmationPath(paymentId),
                rawSessionToken);
            using var response = await client.SendAsync(request);

            await AssertSettlementPaymentUnavailableProblemAsync(response);
        }

        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public async Task MissingArchivedDeletedWrongGroupInactiveGroupAndUnrelatedPaymentsFailClosed()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtor = await SeedAccountAsync(testFactory, "Unavailable Confirmation Debtor", InitialTimestamp);
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Unavailable Confirmation Creditor");
        var requester = await SeedAccountAsync(testFactory, "Unavailable Confirmation Requester", InitialTimestamp.AddMinutes(1));
        var archivedSettlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            status: SettlementRequestStatuses.MarkedPaid,
            archivedAtUtc: InitialTimestamp.AddMinutes(30));
        var archivedPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            archivedSettlementId,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            25m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(2));
        var deletedDebtorSettlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            status: SettlementRequestStatuses.MarkedPaid);
        var deletedDebtorPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            deletedDebtorSettlementId,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            25m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
        await MarkUserProfileDeletedAsync(testFactory, debtor.UserProfileId, InitialTimestamp.AddMinutes(40));

        var unrelatedDebtor = await SeedAccountAsync(testFactory, "Unavailable Unrelated Debtor", InitialTimestamp.AddMinutes(4));
        var unrelatedCreditor = await SeedAccountAsync(testFactory, "Unavailable Unrelated Creditor", InitialTimestamp.AddMinutes(5));
        var unrelatedSettlementId = await SeedBasicSettlementAsync(
            testFactory,
            unrelatedDebtor.UserProfileId,
            unrelatedCreditor.UserProfileId,
            status: SettlementRequestStatuses.MarkedPaid);
        var unrelatedPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            unrelatedSettlementId,
            unrelatedDebtor.UserProfileId,
            unrelatedCreditor.UserProfileId,
            25m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(6));

        var groupDebtor = await SeedAccountAsync(testFactory, "Unavailable Group Debtor", InitialTimestamp.AddMinutes(6));
        var wrongGroupId = await SeedGroupAsync(
            testFactory,
            requester.UserProfileId,
            "Wrong Confirmation Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(groupDebtor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(requester.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var wrongGroupSettlementId = await SeedGroupSettlementAsync(
            testFactory,
            wrongGroupId,
            groupDebtor.UserProfileId,
            creditorSession.UserProfileId,
            requester.UserProfileId,
            10m);
        var wrongGroupPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            wrongGroupSettlementId,
            groupDebtor.UserProfileId,
            creditorSession.UserProfileId,
            10m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(7));

        var removedCreditorGroupId = await SeedGroupAsync(
            testFactory,
            requester.UserProfileId,
            "Removed Confirmation Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(groupDebtor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(creditorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed),
            new MembershipSeed(requester.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var removedGroupSettlementId = await SeedGroupSettlementAsync(
            testFactory,
            removedCreditorGroupId,
            groupDebtor.UserProfileId,
            creditorSession.UserProfileId,
            requester.UserProfileId,
            11m);
        var removedGroupPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            removedGroupSettlementId,
            groupDebtor.UserProfileId,
            creditorSession.UserProfileId,
            11m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(8));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        foreach (var paymentId in new[]
        {
            Guid.NewGuid(),
            archivedPaymentId,
            deletedDebtorPaymentId,
            unrelatedPaymentId,
            wrongGroupPaymentId,
            removedGroupPaymentId
        })
        {
            using var request = CreateBearerRequest(
                HttpMethod.Post,
                SettlementPaymentConfirmationPath(paymentId),
                creditorSession.RawSessionToken);
            using var response = await client.SendAsync(request);

            await AssertSettlementPaymentUnavailableProblemAsync(response);
        }

        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Theory]
    [InlineData(SettlementPaymentStatuses.Confirmed)]
    [InlineData(SettlementPaymentStatuses.Disputed)]
    [InlineData(SettlementPaymentStatuses.Cancelled)]
    public async Task AlreadyConfirmedDisputedOrCancelledPaymentReturnsConflictWithoutSideEffects(string paymentStatus)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtor = await SeedAccountAsync(testFactory, $"Payment Status Debtor {paymentStatus}", InitialTimestamp);
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, $"Payment Status Creditor {paymentStatus}");
        var settlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            status: SettlementRequestStatuses.MarkedPaid);
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
            SettlementPaymentConfirmationPath(paymentId),
            creditorSession.RawSessionToken);
        using var response = await client.SendAsync(request);

        await AssertSettlementPaymentConfirmationConflictProblemAsync(response);
        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Theory]
    [InlineData(SettlementRequestStatuses.Requested)]
    [InlineData(SettlementRequestStatuses.Confirmed)]
    [InlineData(SettlementRequestStatuses.Disputed)]
    [InlineData(SettlementRequestStatuses.Cancelled)]
    public async Task ParentRequestStatusThatDoesNotAllowConfirmationReturnsConflictWithoutSideEffects(string requestStatus)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtor = await SeedAccountAsync(testFactory, $"Parent Status Debtor {requestStatus}", InitialTimestamp);
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, $"Parent Status Creditor {requestStatus}");
        var settlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            status: requestStatus);
        var paymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            25m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(2));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Post,
            SettlementPaymentConfirmationPath(paymentId),
            creditorSession.RawSessionToken);
        using var response = await client.SendAsync(request);

        await AssertSettlementPaymentConfirmationConflictProblemAsync(response);
        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public async Task CorruptCurrencyAmountOrCoverageDataReturnsConflictWithoutSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtor = await SeedAccountAsync(testFactory, "Corrupt Confirmation Debtor", InitialTimestamp);
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Corrupt Confirmation Creditor");
        var currencyMismatchSettlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            status: SettlementRequestStatuses.MarkedPaid);
        var currencyMismatchPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            currencyMismatchSettlementId,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            25m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(2),
            currency: "HKD");
        var zeroAmountSettlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            status: SettlementRequestStatuses.PartiallyPaid);
        var zeroAmountPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            zeroAmountSettlementId,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            0m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
        var overCoverageSettlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            status: SettlementRequestStatuses.MarkedPaid);
        var overCoveragePaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            overCoverageSettlementId,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            20m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(4));
        await SeedSettlementPaymentAsync(
            testFactory,
            overCoverageSettlementId,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            10m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(5));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        foreach (var paymentId in new[]
        {
            currencyMismatchPaymentId,
            zeroAmountPaymentId,
            overCoveragePaymentId
        })
        {
            using var request = CreateBearerRequest(
                HttpMethod.Post,
                SettlementPaymentConfirmationPath(paymentId),
                creditorSession.RawSessionToken);
            using var response = await client.SendAsync(request);

            await AssertSettlementPaymentConfirmationConflictProblemAsync(response);
        }

        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public async Task ConfirmationRejectsClientSubmittedBodyFieldsWithoutRawBodyOrSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtor = await SeedAccountAsync(testFactory, "Confirm Body Debtor", InitialTimestamp);
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Confirm Body Creditor");
        var settlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            status: SettlementRequestStatuses.MarkedPaid);
        var paymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            25m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(2));
        var beforeCounts = await ReadMutationCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentConfirmationPath(paymentId),
            creditorSession.RawSessionToken,
            """{"status":"confirmed","proofFileId":"hidden-proof-file","paymentHandle":"hidden-payment-handle"}""");
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);
        Assert.DoesNotContain("hidden-proof-file", content, StringComparison.Ordinal);
        Assert.DoesNotContain("hidden-payment-handle", content, StringComparison.Ordinal);
        await AssertMutationCountsAsync(testFactory, beforeCounts);
    }

    [Fact]
    public async Task MissingOrWrongBearerTokenReturnsUnauthenticated()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Unauthenticated Payment Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Unauthenticated Payment Creditor", InitialTimestamp.AddMinutes(1));
        var settlementId = await SeedBasicSettlementAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId);

        using var client = testFactory.CreateClient();
        using var missingRequest = CreateJsonRequest(
            HttpMethod.Post,
            SettlementPaymentsPath(settlementId),
            """{"amount":"5.00","currency":"USD","paymentDate":"2026-05-08"}""");
        using var missingResponse = await client.SendAsync(missingRequest);
        await AssertUnauthenticatedProblemAsync(missingResponse);

        using var wrongRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentsPath(settlementId),
            WrongRawToken,
            """{"amount":"5.00","currency":"USD","paymentDate":"2026-05-08"}""");
        using var wrongResponse = await client.SendAsync(wrongRequest);
        await AssertUnauthenticatedProblemAsync(wrongResponse, WrongRawToken);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new SettlementPaymentClaimTestTimeProvider(InitialTimestamp);
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
        SettlementPaymentClaimTestTimeProvider timeProvider,
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
        SettlementPaymentClaimTestTimeProvider timeProvider,
        SeededAccount account)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Settlement payment claim endpoint test",
                UserAgentSummary: "Settlement payment claim endpoint test user agent",
                NetworkAddressHash: "settlement-payment-claim-endpoint-test-network",
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
        string status = SettlementRequestStatuses.Requested,
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

    private static async Task<Guid> SeedGroupSettlementAsync(
        WebApplicationFactory<Program> testFactory,
        Guid groupId,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        Guid requestedByUserProfileId,
        decimal amount)
    {
        var billId = await SeedBillAsync(
            testFactory,
            requestedByUserProfileId,
            groupId,
            [new ParticipantSeed(debtorUserProfileId, amount), new ParticipantSeed(creditorUserProfileId, amount)],
            [new PayerSeed(creditorUserProfileId, amount * 2m)],
            InitialTimestamp);

        return await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId,
            debtorUserProfileId,
            creditorUserProfileId,
            requestedByUserProfileId,
            amount,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(2));
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
        DateTimeOffset createdAtUtc,
        string currency = "USD")
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

    private static async Task MutateRequestLineAsync(
        WebApplicationFactory<Program> testFactory,
        Guid settlementId,
        string lineState)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var requestLine = await dbContext.Set<SettlementRequestLine>()
            .SingleAsync(line => line.SettlementRequestId == settlementId);

        switch (lineState)
        {
            case "no_lines":
                dbContext.Set<SettlementRequestLine>().Remove(requestLine);
                break;
            case "line_currency_mismatch":
                requestLine.Currency = "HKD";
                break;
            case "line_cancelled":
                requestLine.Status = SettlementRequestLineStatuses.Cancelled;
                break;
            case "line_total_mismatch":
                requestLine.ExactAmount -= 1m;
                break;
            default:
                throw new InvalidOperationException($"Unsupported line state {lineState}.");
        }

        await dbContext.SaveChangesAsync();
    }

    private static async Task MutateResidualAsync(
        WebApplicationFactory<Program> testFactory,
        Guid residualId,
        Action<SettlementResidual> mutate)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var residual = await dbContext.Set<SettlementResidual>().SingleAsync(candidate => candidate.Id == residualId);
        mutate(residual);
        await dbContext.SaveChangesAsync();
    }

    private static async Task RemovePaymentAllocationsAsync(
        WebApplicationFactory<Program> testFactory,
        Guid settlementId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var allocations = await dbContext.Set<SettlementPaymentAllocation>()
            .Where(allocation => allocation.SettlementPayment.SettlementRequestId == settlementId)
            .ToListAsync();
        dbContext.Set<SettlementPaymentAllocation>().RemoveRange(allocations);
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
            await dbContext.Set<SettlementResidual>()
                .AsNoTracking()
                .OrderBy(residual => residual.CreatedAtUtc)
                .ToListAsync(),
            await dbContext.Set<SettlementProofAttachment>()
                .AsNoTracking()
                .ToListAsync(),
            await dbContext.Set<AuthAuditEvent>()
                .AsNoTracking()
                .Where(auditEvent => IsSettlementPaymentAuditAction(auditEvent.Action))
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
            await dbContext.Set<AuthAuditEvent>().CountAsync(auditEvent =>
                IsSettlementPaymentAuditAction(auditEvent.Action)));
    }

    private static bool IsSettlementPaymentAuditAction(string action)
    {
        return action is "settlement.payment_marked_paid"
            or "settlement.payment_partially_paid"
            or "settlement.payment_confirmed"
            or "settlement.residual_confirmed";
    }

    private static async Task AssertMutationCountsAsync(
        WebApplicationFactory<Program> testFactory,
        MutationCounts expectedCounts)
    {
        Assert.Equal(expectedCounts, await ReadMutationCountsAsync(testFactory));
    }

    private static async Task<Guid> CreateResidualPaymentClaimAsync(
        HttpClient client,
        Guid settlementId,
        string rawSessionToken,
        string amount,
        string policy)
    {
        return (await CreateResidualPaymentClaimWithResidualAsync(
            client,
            settlementId,
            rawSessionToken,
            amount,
            policy)).PaymentId;
    }

    private static async Task<ResidualPaymentClaimResult> CreateResidualPaymentClaimWithResidualAsync(
        HttpClient client,
        Guid settlementId,
        string rawSessionToken,
        string amount,
        string policy)
    {
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            SettlementPaymentsPath(settlementId),
            rawSessionToken,
            $$"""{"amount":"{{amount}}","currency":"USD","paymentDate":"2026-05-08","proposedResidualPolicy":"{{policy}}"}""");
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var payload = JsonDocument.Parse(content);
        var residual = Assert.Single(payload.RootElement.GetProperty("residuals").EnumerateArray());
        return new ResidualPaymentClaimResult(
            payload.RootElement.GetProperty("paymentId").GetGuid(),
            residual.GetProperty("id").GetGuid());
    }

    private static HttpRequestMessage CreateJsonBearerRequest(
        HttpMethod method,
        string path,
        string rawSessionToken,
        string body)
    {
        var request = CreateJsonRequest(method, path, body);
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

    private static HttpRequestMessage CreateJsonRequest(
        HttpMethod method,
        string path,
        string body)
    {
        return new HttpRequestMessage(method, path)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
    }

    private static string SettlementPaymentsPath(Guid settlementId)
    {
        return $"/api/v1/settlements/{settlementId:D}/payments";
    }

    private static string SettlementPaymentConfirmationPath(Guid paymentId)
    {
        return $"/api/v1/settlement-payments/{paymentId:D}/confirm";
    }

    private static string SettlementPaymentResidualConfirmationPath(Guid paymentId, Guid residualId)
    {
        return $"/api/v1/settlement-payments/{paymentId:D}/residuals/{residualId:D}/confirm";
    }

    private static string SettlementPaymentPath(Guid paymentId)
    {
        return $"/api/v1/settlement-payments/{paymentId:D}";
    }

    private static string SettlementPaymentCancellationPath(Guid paymentId)
    {
        return $"/api/v1/settlement-payments/{paymentId:D}/cancel";
    }

    private static string SettlementPaymentDisputePath(Guid paymentId)
    {
        return $"/api/v1/settlement-payments/{paymentId:D}/dispute";
    }

    private static string SettlementBalancesPath()
    {
        return "/api/v1/settlement-balances";
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

    private static void AssertSettlementPaymentResidualResponseShape(JsonElement response)
    {
        Assert.Equal(
            [
                "amount",
                "createdAtUtc",
                "currency",
                "direction",
                "id",
                "policy",
                "resolvedAtUtc",
                "settlementPaymentId",
                "settlementRequestId",
                "status"
            ],
            response.EnumerateObject()
                .Select(property => property.Name)
                .Order(StringComparer.Ordinal)
                .ToArray());
    }

    private static void AssertSafePaymentResponseContent(
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

    private static void AssertBoundedPaymentAuditMetadata(
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
        string requestAmount,
        string currency,
        string expectedWorkflowName = "settlement_payment_claim",
        string expectedPaymentStatus = SettlementPaymentStatuses.MarkedPaid)
    {
        Assert.NotNull(metadataJson);
        Assert.DoesNotContain("requestBody", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("paymentHandle", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("paymentNote", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("merchant", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("item", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("proof", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("fileObject", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("file_object", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("storage", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("session", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("credential", metadataJson, StringComparison.OrdinalIgnoreCase);

        using var metadata = JsonDocument.Parse(metadataJson);
        Assert.Equal(expectedWorkflowName, metadata.RootElement.GetProperty("workflowName").GetString());
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
        Assert.Equal(expectedPaymentStatus, metadata.RootElement.GetProperty("paymentStatus").GetString());
        Assert.Equal(paymentAmount, metadata.RootElement.GetProperty("paymentAmount").GetString());
        Assert.Equal(activePaymentCoverageAmount, metadata.RootElement.GetProperty("activePaymentCoverageAmount").GetString());
        Assert.Equal(requestAmount, metadata.RootElement.GetProperty("requestAmount").GetString());
        Assert.Equal(currency, metadata.RootElement.GetProperty("currency").GetString());
        Assert.Equal("2026-05-08", metadata.RootElement.GetProperty("paymentDate").GetString());
    }

    private static void AssertBoundedResidualAuditMetadata(
        string? metadataJson,
        Guid settlementRequestId,
        Guid settlementPaymentId,
        Guid settlementResidualId,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        string residualDirection,
        string residualPolicy,
        string previousResidualStatus,
        string newResidualStatus,
        string residualAmount)
    {
        Assert.NotNull(metadataJson);
        Assert.DoesNotContain("requestBody", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("paymentHandle", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("paymentNote", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("merchant", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("item", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("proof", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("fileObject", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("storage", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("session", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("credential", metadataJson, StringComparison.OrdinalIgnoreCase);

        using var metadata = JsonDocument.Parse(metadataJson);
        Assert.Equal("settlement_residual_confirmation", metadata.RootElement.GetProperty("workflowName").GetString());
        Assert.Equal(settlementRequestId.ToString("D"), metadata.RootElement.GetProperty("settlementRequestId").GetString());
        Assert.Equal(settlementPaymentId.ToString("D"), metadata.RootElement.GetProperty("settlementPaymentId").GetString());
        Assert.Equal(settlementResidualId.ToString("D"), metadata.RootElement.GetProperty("settlementResidualId").GetString());
        Assert.Equal(debtorUserProfileId.ToString("D"), metadata.RootElement.GetProperty("debtorUserProfileId").GetString());
        Assert.Equal(creditorUserProfileId.ToString("D"), metadata.RootElement.GetProperty("creditorUserProfileId").GetString());
        Assert.Equal("residual_confirmed", metadata.RootElement.GetProperty("actionCategory").GetString());
        Assert.Equal(residualDirection, metadata.RootElement.GetProperty("residualDirection").GetString());
        Assert.Equal(residualPolicy, metadata.RootElement.GetProperty("residualPolicy").GetString());
        Assert.Equal(previousResidualStatus, metadata.RootElement.GetProperty("previousResidualStatus").GetString());
        Assert.Equal(newResidualStatus, metadata.RootElement.GetProperty("newResidualStatus").GetString());
        Assert.Equal(residualAmount, metadata.RootElement.GetProperty("residualAmount").GetString());
    }

    private static async Task AssertSettlementPaymentConflictProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Settlement payment conflict", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The settlement payment cannot be claimed for the current settlement state.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertSettlementPaymentConfirmationConflictProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Settlement payment conflict", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The settlement payment cannot be confirmed for the current settlement state.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertSettlementResidualConfirmationConflictProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Settlement payment conflict", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The settlement residual cannot be confirmed for the current settlement state.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertInvalidSettlementPaymentProblemAsync(
        HttpResponseMessage response,
        string expectedErrorField,
        string expectedError)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid settlement payment", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The submitted settlement payment is invalid.",
            payload.RootElement.GetProperty("detail").GetString());
        var errors = payload.RootElement.GetProperty("errors");
        Assert.Contains(
            expectedError,
            errors.GetProperty(expectedErrorField).EnumerateArray().Select(error => error.GetString()).ToArray());
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

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        SettlementPaymentClaimTestTimeProvider TimeProvider);

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
        int PaymentAuditEventCount);

    private sealed record ResidualPaymentClaimResult(Guid PaymentId, Guid ResidualId);

    private sealed record SettlementState(
        IReadOnlyList<SettlementRequest> Requests,
        IReadOnlyList<SettlementPayment> Payments,
        IReadOnlyList<SettlementRequestLine> RequestLines,
        IReadOnlyList<SettlementPaymentAllocation> PaymentAllocations,
        IReadOnlyList<SettlementResidual> Residuals,
        IReadOnlyList<SettlementProofAttachment> ProofAttachments,
        IReadOnlyList<AuthAuditEvent> PaymentAuditEvents,
        MutationCounts MutationCounts);

    private sealed class SettlementPaymentClaimTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public SettlementPaymentClaimTestTimeProvider(DateTimeOffset utcNow)
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
