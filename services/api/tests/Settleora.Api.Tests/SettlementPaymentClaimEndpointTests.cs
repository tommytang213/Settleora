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

        var persisted = await ReadSettlementStateAsync(testFactory);
        var settlementRequest = Assert.Single(persisted.Requests);
        Assert.Equal(SettlementRequestStatuses.MarkedPaid, settlementRequest.Status);
        Assert.Equal(ValidationTimestamp, settlementRequest.UpdatedAtUtc);
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
        Assert.Empty(persisted.ProofAttachments);

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

        var persisted = await ReadSettlementStateAsync(testFactory);
        var settlementRequest = Assert.Single(persisted.Requests);
        Assert.Equal(SettlementRequestStatuses.MarkedPaid, settlementRequest.Status);
        Assert.Equal([20m, 30m], persisted.Payments.OrderBy(payment => payment.CreatedAtUtc).Select(payment => payment.Amount).ToArray());
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
        dbContext.Set<SettlementRequest>().Add(new SettlementRequest
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
        });

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
        dbContext.Set<SettlementPayment>().Add(new SettlementPayment
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
        });

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
                .OrderBy(settlementRequest => settlementRequest.CreatedAtUtc)
                .ToListAsync(),
            await dbContext.Set<SettlementPayment>()
                .AsNoTracking()
                .OrderBy(payment => payment.CreatedAtUtc)
                .ToListAsync(),
            await dbContext.Set<SettlementProofAttachment>()
                .AsNoTracking()
                .ToListAsync(),
            await dbContext.Set<AuthAuditEvent>()
                .AsNoTracking()
                .Where(auditEvent => auditEvent.Action == "settlement.payment_marked_paid"
                    || auditEvent.Action == "settlement.payment_partially_paid")
                .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
                .ToListAsync(),
            await ReadMutationCountsAsync(testFactory));
    }

    private static async Task<MutationCounts> ReadMutationCountsAsync(WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return new MutationCounts(
            await dbContext.Set<SettlementPayment>().CountAsync(),
            await dbContext.Set<SettlementProofAttachment>().CountAsync(),
            await dbContext.Set<FileObject>().CountAsync(),
            await dbContext.Set<UserPaymentProfile>().CountAsync(),
            await dbContext.Set<AuthAuditEvent>().CountAsync(auditEvent =>
                auditEvent.Action == "settlement.payment_marked_paid"
                || auditEvent.Action == "settlement.payment_partially_paid"));
    }

    private static async Task AssertMutationCountsAsync(
        WebApplicationFactory<Program> testFactory,
        MutationCounts expectedCounts)
    {
        Assert.Equal(expectedCounts, await ReadMutationCountsAsync(testFactory));
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

    private static void AssertSettlementPaymentResponseShape(JsonElement response)
    {
        Assert.Equal(
            [
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
        string currency)
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
        Assert.Equal("settlement_payment_claim", metadata.RootElement.GetProperty("workflowName").GetString());
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
        Assert.Equal(SettlementPaymentStatuses.MarkedPaid, metadata.RootElement.GetProperty("paymentStatus").GetString());
        Assert.Equal(paymentAmount, metadata.RootElement.GetProperty("paymentAmount").GetString());
        Assert.Equal(activePaymentCoverageAmount, metadata.RootElement.GetProperty("activePaymentCoverageAmount").GetString());
        Assert.Equal(requestAmount, metadata.RootElement.GetProperty("requestAmount").GetString());
        Assert.Equal(currency, metadata.RootElement.GetProperty("currency").GetString());
        Assert.Equal("2026-05-08", metadata.RootElement.GetProperty("paymentDate").GetString());
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
        int SettlementPaymentCount,
        int SettlementProofAttachmentCount,
        int FileObjectCount,
        int UserPaymentProfileCount,
        int PaymentAuditEventCount);

    private sealed record SettlementState(
        IReadOnlyList<SettlementRequest> Requests,
        IReadOnlyList<SettlementPayment> Payments,
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
