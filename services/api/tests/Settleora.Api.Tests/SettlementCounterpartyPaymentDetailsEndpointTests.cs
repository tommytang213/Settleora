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

public sealed class SettlementCounterpartyPaymentDetailsEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string WrongRawToken = "visible-wrong-counterparty-payment-details-session-token";
    private const string CounterpartyViewedAction = "payment_details.viewed_by_counterparty";
    private const string HiddenMerchantName = "Hidden Counterparty Payment Merchant";
    private const string HiddenItemName = "Hidden Counterparty Payment Item";
    private const string HiddenPaymentMethodLabel = "Hidden counterparty bill method";
    private const string HiddenHandle = "hidden-counterparty-payment-handle";
    private const string HiddenNote = "hidden counterparty payment note";
    private const string HiddenStorageObjectKey = "hidden/counterparty/payment-qr-object-key";
    private const string HiddenOriginalFilename = "hidden-counterparty-payment-qr.png";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 9, 8, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 9, 8, 15, 0, TimeSpan.Zero);
    private static readonly byte[] ValidPngBytes = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x01];

    private readonly WebApplicationFactory<Program> factory;

    public SettlementCounterpartyPaymentDetailsEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task DebtorAndCreditorCanReadVisiblePersonalCounterpartyPaymentDetailsWithSafeAuditAndQrMetadata()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Counterparty Personal Debtor");
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Counterparty Personal Creditor");
        var creditorQrFileId = await SeedPaymentProfileWithQrAsync(
            testFactory,
            testContext.StorageProvider,
            creditorSession.UserProfileId,
            "FPS",
            "fps-creditor",
            "creditor note",
            UserPaymentProfileVisibilities.SettlementCounterpartiesOnly);
        await SeedPaymentProfileAsync(
            testFactory,
            debtorSession.UserProfileId,
            "PayMe",
            "payme-debtor",
            "debtor note",
            UserPaymentProfileVisibilities.SettlementCounterpartiesOnly);
        var billId = await SeedBillAsync(
            testFactory,
            creditorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(debtorSession.UserProfileId, 25m), new ParticipantSeed(creditorSession.UserProfileId, 25m)],
            [new PayerSeed(creditorSession.UserProfileId, 50m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtorSession.UserProfileId,
            creditorSession.UserProfileId,
            creditorSession.UserProfileId,
            InitialTimestamp.AddMinutes(1));
        var debtorSessionTokenHash = await ReadSessionTokenHashAsync(testFactory, debtorSession.AuthSessionId);

        using var client = testFactory.CreateClient();
        using var debtorRequest = CreateBearerRequest(
            HttpMethod.Get,
            PaymentDetailsPath(settlementId, creditorSession.UserProfileId),
            debtorSession.RawSessionToken);
        using var debtorResponse = await client.SendAsync(debtorRequest);
        var debtorContent = await debtorResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, debtorResponse.StatusCode);
        AssertSafePaymentDetailsResponseContent(
            debtorContent,
            debtorSession.RawSessionToken,
            debtorSessionTokenHash,
            HiddenMerchantName,
            HiddenItemName,
            HiddenPaymentMethodLabel,
            HiddenStorageObjectKey,
            HiddenOriginalFilename);
        var debtorPayload = ReadPaymentDetailsPayload(debtorContent);
        Assert.True(debtorPayload.IsConfigured);
        Assert.Equal(creditorSession.UserProfileId, debtorPayload.UserProfileId);
        Assert.Equal("FPS", debtorPayload.PreferredMethodLabel);
        Assert.Equal("fps-creditor", debtorPayload.PaymentHandle);
        Assert.Equal("creditor note", debtorPayload.PaymentNote);
        Assert.Equal(UserPaymentProfileVisibilities.SettlementCounterpartiesOnly, debtorPayload.VisibilityApplied);
        Assert.NotNull(debtorPayload.QrFile);
        Assert.Equal(creditorQrFileId, debtorPayload.QrFile!.Id);
        Assert.Equal("image/png", debtorPayload.QrFile.ContentType);

        using var creditorRequest = CreateBearerRequest(
            HttpMethod.Get,
            PaymentDetailsPath(settlementId, debtorSession.UserProfileId),
            creditorSession.RawSessionToken);
        using var creditorResponse = await client.SendAsync(creditorRequest);
        var creditorPayload = ReadPaymentDetailsPayload(await creditorResponse.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.OK, creditorResponse.StatusCode);
        Assert.True(creditorPayload.IsConfigured);
        Assert.Equal(debtorSession.UserProfileId, creditorPayload.UserProfileId);
        Assert.Equal("PayMe", creditorPayload.PreferredMethodLabel);
        Assert.Equal("payme-debtor", creditorPayload.PaymentHandle);
        Assert.Equal("debtor note", creditorPayload.PaymentNote);

        var auditEvents = await ReadCounterpartyAuditEventsAsync(testFactory);
        Assert.Equal(2, auditEvents.Count);
        AssertCounterpartyAuditMetadata(
            AssertSingleCounterpartyAuditEvent(
                auditEvents,
                debtorSession.UserProfileId,
                creditorSession.UserProfileId,
                "debtor_to_creditor"),
            settlementId,
            debtorSession.UserProfileId,
            creditorSession.UserProfileId,
            groupId: null,
            "personal",
            "debtor_to_creditor",
            isConfigured: true,
            "details_read",
            "fps-creditor",
            "creditor note",
            HiddenStorageObjectKey);
        AssertCounterpartyAuditMetadata(
            AssertSingleCounterpartyAuditEvent(
                auditEvents,
                creditorSession.UserProfileId,
                debtorSession.UserProfileId,
                "creditor_to_debtor"),
            settlementId,
            creditorSession.UserProfileId,
            debtorSession.UserProfileId,
            groupId: null,
            "personal",
            "creditor_to_debtor",
            isConfigured: true,
            "details_read",
            "payme-debtor",
            "debtor note");
    }

    [Fact]
    public async Task PrivateMissingAndDeletedPaymentProfilesReturnSafeNotConfiguredWithoutLeakingSensitiveFields()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Private Details Debtor");
        var privateCreditor = await SeedAccountAsync(testFactory, "Private Details Creditor", InitialTimestamp.AddMinutes(1));
        await SeedPaymentProfileWithQrAsync(
            testFactory,
            testContext.StorageProvider,
            privateCreditor.UserProfileId,
            "Private Method",
            HiddenHandle,
            HiddenNote,
            UserPaymentProfileVisibilities.Private);
        var missingProfileCreditor = await SeedAccountAsync(testFactory, "Missing Details Creditor", InitialTimestamp.AddMinutes(2));
        var deletedProfileCreditor = await SeedAccountAsync(testFactory, "Deleted Details Creditor", InitialTimestamp.AddMinutes(3));
        await SeedPaymentProfileAsync(
            testFactory,
            deletedProfileCreditor.UserProfileId,
            "Deleted Method",
            "deleted-handle",
            "deleted note",
            UserPaymentProfileVisibilities.SettlementCounterpartiesOnly,
            deletedAtUtc: InitialTimestamp.AddMinutes(4));
        var personalGroupSharedCreditor = await SeedAccountAsync(
            testFactory,
            "Personal Group Shared Details Creditor",
            InitialTimestamp.AddMinutes(5));
        await SeedPaymentProfileAsync(
            testFactory,
            personalGroupSharedCreditor.UserProfileId,
            "Personal Group Shared Method",
            "personal-group-shared-handle",
            "personal group shared note",
            UserPaymentProfileVisibilities.GroupMembersWhenShared);

        var privateSettlementId = await SeedPersonalSettlementForAsync(testFactory, debtorSession.UserProfileId, privateCreditor.UserProfileId);
        var missingSettlementId = await SeedPersonalSettlementForAsync(testFactory, debtorSession.UserProfileId, missingProfileCreditor.UserProfileId);
        var deletedSettlementId = await SeedPersonalSettlementForAsync(testFactory, debtorSession.UserProfileId, deletedProfileCreditor.UserProfileId);
        var personalGroupSharedSettlementId = await SeedPersonalSettlementForAsync(
            testFactory,
            debtorSession.UserProfileId,
            personalGroupSharedCreditor.UserProfileId);

        using var client = testFactory.CreateClient();
        foreach (var pair in new[]
        {
            new { SettlementId = privateSettlementId, TargetUserProfileId = privateCreditor.UserProfileId, Visibility = UserPaymentProfileVisibilities.Private },
            new { SettlementId = missingSettlementId, TargetUserProfileId = missingProfileCreditor.UserProfileId, Visibility = UserPaymentProfileVisibilities.SettlementCounterpartiesOnly },
            new { SettlementId = deletedSettlementId, TargetUserProfileId = deletedProfileCreditor.UserProfileId, Visibility = UserPaymentProfileVisibilities.SettlementCounterpartiesOnly },
            new { SettlementId = personalGroupSharedSettlementId, TargetUserProfileId = personalGroupSharedCreditor.UserProfileId, Visibility = UserPaymentProfileVisibilities.GroupMembersWhenShared }
        })
        {
            using var request = CreateBearerRequest(
                HttpMethod.Get,
                PaymentDetailsPath(pair.SettlementId, pair.TargetUserProfileId),
                debtorSession.RawSessionToken);
            using var response = await client.SendAsync(request);
            var content = await response.Content.ReadAsStringAsync();

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.DoesNotContain(HiddenHandle, content);
            Assert.DoesNotContain(HiddenNote, content);
            Assert.DoesNotContain("deleted-handle", content);
            Assert.DoesNotContain("deleted note", content);
            Assert.DoesNotContain("personal-group-shared-handle", content);
            Assert.DoesNotContain("personal group shared note", content);
            var payload = ReadPaymentDetailsPayload(content);
            Assert.False(payload.IsConfigured);
            Assert.Equal(pair.TargetUserProfileId, payload.UserProfileId);
            Assert.Null(payload.PreferredMethodLabel);
            Assert.Null(payload.PaymentHandle);
            Assert.Null(payload.PaymentNote);
            Assert.Null(payload.QrFile);
            Assert.Equal(pair.Visibility, payload.VisibilityApplied);
        }
    }

    [Fact]
    public async Task GroupVisibilityRequiresSettlementCounterpartyRelationshipNotMembershipAloneOrArbitrarySameGroupUser()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Details Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Group Details Creditor", InitialTimestamp.AddMinutes(1));
        var membershipOnlySession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Payment Directory Browser");
        var arbitraryMember = await SeedAccountAsync(testFactory, "Arbitrary Same Group Member", InitialTimestamp.AddMinutes(2));
        await SeedPaymentProfileAsync(
            testFactory,
            creditor.UserProfileId,
            "Shared Group Method",
            "shared-group-handle",
            "shared group note",
            UserPaymentProfileVisibilities.GroupMembersWhenShared);
        var groupId = await SeedGroupAsync(
            testFactory,
            debtorSession.UserProfileId,
            "Counterparty Payment Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(debtorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(creditor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(membershipOnlySession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(arbitraryMember.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var billId = await SeedBillAsync(
            testFactory,
            debtorSession.UserProfileId,
            groupId,
            [new ParticipantSeed(debtorSession.UserProfileId, 40m), new ParticipantSeed(creditor.UserProfileId, 40m)],
            [new PayerSeed(creditor.UserProfileId, 80m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            InitialTimestamp.AddMinutes(1));

        using var client = testFactory.CreateClient();
        using var validRequest = CreateBearerRequest(
            HttpMethod.Get,
            PaymentDetailsPath(settlementId, creditor.UserProfileId),
            debtorSession.RawSessionToken);
        using var validResponse = await client.SendAsync(validRequest);
        var validPayload = ReadPaymentDetailsPayload(await validResponse.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.OK, validResponse.StatusCode);
        Assert.True(validPayload.IsConfigured);
        Assert.Equal("shared-group-handle", validPayload.PaymentHandle);

        using var membershipOnlyRequest = CreateBearerRequest(
            HttpMethod.Get,
            PaymentDetailsPath(settlementId, creditor.UserProfileId),
            membershipOnlySession.RawSessionToken);
        using var membershipOnlyResponse = await client.SendAsync(membershipOnlyRequest);
        await AssertPaymentDetailsUnavailableProblemAsync(membershipOnlyResponse);

        using var arbitraryTargetRequest = CreateBearerRequest(
            HttpMethod.Get,
            PaymentDetailsPath(settlementId, arbitraryMember.UserProfileId),
            debtorSession.RawSessionToken);
        using var arbitraryTargetResponse = await client.SendAsync(arbitraryTargetRequest);
        await AssertPaymentDetailsUnavailableProblemAsync(arbitraryTargetResponse);
    }

    [Fact]
    public async Task UnrelatedActorArchivedSettlementDeletedTargetAndRemovedGroupMembershipFailClosed()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Fail Closed Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Fail Closed Creditor", InitialTimestamp.AddMinutes(1));
        var unrelatedSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Fail Closed Unrelated");
        var deletedTarget = await SeedAccountAsync(
            testFactory,
            "Deleted Counterparty Target",
            InitialTimestamp.AddMinutes(2),
            deletedAtUtc: InitialTimestamp.AddMinutes(3));
        await SeedPaymentProfileAsync(
            testFactory,
            creditor.UserProfileId,
            "Visible",
            "visible-handle",
            "visible note",
            UserPaymentProfileVisibilities.SettlementCounterpartiesOnly);
        var settlementId = await SeedPersonalSettlementForAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId);
        var archivedSettlementId = await SeedPersonalSettlementForAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            archivedAtUtc: InitialTimestamp.AddMinutes(10));
        var deletedTargetSettlementId = await SeedPersonalSettlementForAsync(
            testFactory,
            debtorSession.UserProfileId,
            deletedTarget.UserProfileId);

        var removedDebtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Removed Group Debtor");
        var groupCreditor = await SeedAccountAsync(testFactory, "Removed Group Creditor", InitialTimestamp.AddMinutes(4));
        var removedGroupId = await SeedGroupAsync(
            testFactory,
            groupCreditor.UserProfileId,
            "Removed Member Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(removedDebtorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed),
            new MembershipSeed(groupCreditor.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var removedBillId = await SeedBillAsync(
            testFactory,
            groupCreditor.UserProfileId,
            removedGroupId,
            [new ParticipantSeed(removedDebtorSession.UserProfileId, 10m), new ParticipantSeed(groupCreditor.UserProfileId, 10m)],
            [new PayerSeed(groupCreditor.UserProfileId, 20m)],
            InitialTimestamp);
        var removedSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            removedBillId,
            removedGroupId,
            removedDebtorSession.UserProfileId,
            groupCreditor.UserProfileId,
            groupCreditor.UserProfileId,
            InitialTimestamp.AddMinutes(5));

        using var client = testFactory.CreateClient();
        foreach (var scenario in new[]
        {
            new { Path = PaymentDetailsPath(settlementId, creditor.UserProfileId), Token = unrelatedSession.RawSessionToken },
            new { Path = PaymentDetailsPath(archivedSettlementId, creditor.UserProfileId), Token = debtorSession.RawSessionToken },
            new { Path = PaymentDetailsPath(deletedTargetSettlementId, deletedTarget.UserProfileId), Token = debtorSession.RawSessionToken },
            new { Path = PaymentDetailsPath(removedSettlementId, groupCreditor.UserProfileId), Token = removedDebtorSession.RawSessionToken }
        })
        {
            using var request = CreateBearerRequest(HttpMethod.Get, scenario.Path, scenario.Token);
            using var response = await client.SendAsync(request);
            await AssertPaymentDetailsUnavailableProblemAsync(response);
        }
    }

    [Fact]
    public async Task CounterpartyPaymentDetailsRejectsQueryOwnershipFieldsWithoutAuditingOrOpeningQrBytes()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Query Details Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Query Details Creditor", InitialTimestamp.AddMinutes(1));
        await SeedPaymentProfileWithQrAsync(
            testFactory,
            testContext.StorageProvider,
            creditor.UserProfileId,
            "Query Method",
            "query-handle",
            "query note",
            UserPaymentProfileVisibilities.SettlementCounterpartiesOnly);
        var settlementId = await SeedPersonalSettlementForAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId);

        using var client = testFactory.CreateClient();
        using (var detailsRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"{PaymentDetailsPath(settlementId, creditor.UserProfileId)}?accountId={Guid.NewGuid():D}&paymentDetailId={Guid.NewGuid():D}&settlementId={Guid.NewGuid():D}",
            debtorSession.RawSessionToken))
        using (var detailsResponse = await client.SendAsync(detailsRequest))
        {
            var detailsContent = await detailsResponse.Content.ReadAsStringAsync();

            Assert.Equal(HttpStatusCode.BadRequest, detailsResponse.StatusCode);
            Assert.Contains("Unsupported query fields are not allowed.", detailsContent);
            Assert.DoesNotContain("accountId", detailsContent);
            Assert.DoesNotContain("paymentDetailId", detailsContent);
            Assert.DoesNotContain("settlementId", detailsContent);
            Assert.DoesNotContain("query-handle", detailsContent);
        }

        using (var qrRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"{QrContentPath(settlementId, creditor.UserProfileId)}?ownerUserProfileId={Guid.NewGuid():D}&paymentQrId={Guid.NewGuid():D}&fileId={Guid.NewGuid():D}",
            debtorSession.RawSessionToken))
        using (var qrResponse = await client.SendAsync(qrRequest))
        {
            var qrContent = await qrResponse.Content.ReadAsStringAsync();

            Assert.Equal(HttpStatusCode.BadRequest, qrResponse.StatusCode);
            Assert.Contains("Unsupported query fields are not allowed.", qrContent);
            Assert.DoesNotContain("ownerUserProfileId", qrContent);
            Assert.DoesNotContain("paymentQrId", qrContent);
            Assert.DoesNotContain("fileId", qrContent);
            Assert.DoesNotContain("query-handle", qrContent);
        }

        using (var detailsBodyRequest = CreateBearerRequest(
            HttpMethod.Get,
            PaymentDetailsPath(settlementId, creditor.UserProfileId),
            debtorSession.RawSessionToken))
        {
            detailsBodyRequest.Content = new StringContent(
                "{\"paymentHandle\":\"query-handle\",\"storageObjectKey\":\"visible-body-storage-key\"}",
                Encoding.UTF8,
                "application/json");
            using var detailsBodyResponse = await client.SendAsync(detailsBodyRequest);
            var detailsBodyContent = await detailsBodyResponse.Content.ReadAsStringAsync();

            Assert.Equal(HttpStatusCode.BadRequest, detailsBodyResponse.StatusCode);
            Assert.Contains("Payment details read requests do not accept a request body.", detailsBodyContent);
            Assert.DoesNotContain("query-handle", detailsBodyContent);
            Assert.DoesNotContain("visible-body-storage-key", detailsBodyContent);
        }

        using (var qrBodyRequest = CreateBearerRequest(
            HttpMethod.Get,
            QrContentPath(settlementId, creditor.UserProfileId),
            debtorSession.RawSessionToken))
        {
            qrBodyRequest.Content = new StringContent(
                "{\"fileId\":\"visible-body-file-id\",\"paymentNote\":\"query note\"}",
                Encoding.UTF8,
                "application/json");
            using var qrBodyResponse = await client.SendAsync(qrBodyRequest);
            var qrBodyContent = await qrBodyResponse.Content.ReadAsStringAsync();

            Assert.Equal(HttpStatusCode.BadRequest, qrBodyResponse.StatusCode);
            Assert.Contains("Payment details read requests do not accept a request body.", qrBodyContent);
            Assert.DoesNotContain("visible-body-file-id", qrBodyContent);
            Assert.DoesNotContain("query note", qrBodyContent);
        }

        Assert.Empty(await ReadCounterpartyAuditEventsAsync(testFactory));
        Assert.Equal(0, testContext.StorageProvider.OpenReadCount);
    }

    [Fact]
    public async Task QrContentReadRequiresVisibleCounterpartyActivePaymentQrAndReturnsSafeHeaders()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "QR Content Debtor");
        var creditor = await SeedAccountAsync(testFactory, "QR Content Creditor", InitialTimestamp.AddMinutes(1));
        var qrFileId = await SeedPaymentProfileWithQrAsync(
            testFactory,
            testContext.StorageProvider,
            creditor.UserProfileId,
            "QR Method",
            "qr-visible-handle",
            "qr visible note",
            UserPaymentProfileVisibilities.SettlementCounterpartiesOnly);
        var settlementId = await SeedPersonalSettlementForAsync(testFactory, debtorSession.UserProfileId, creditor.UserProfileId);

        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Get,
            QrContentPath(settlementId, creditor.UserProfileId),
            debtorSession.RawSessionToken);
        using var response = await client.SendAsync(request);
        var bytes = await response.Content.ReadAsByteArrayAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("image/png", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(ValidPngBytes, bytes);
        Assert.True(response.Headers.TryGetValues("X-Content-Type-Options", out var nosniffValues));
        Assert.Contains("nosniff", nosniffValues);
        Assert.True(response.Content.Headers.TryGetValues("Content-Disposition", out var dispositionValues));
        Assert.Contains("attachment", dispositionValues);

        var qrAuditEvent = Assert.Single(await ReadCounterpartyAuditEventsAsync(testFactory));
        AssertCounterpartyAuditMetadata(
            qrAuditEvent,
            settlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            groupId: null,
            "personal",
            "debtor_to_creditor",
            isConfigured: true,
            "qr_content_read",
            "qr-visible-handle",
            "qr visible note",
            HiddenStorageObjectKey);
        Assert.Contains(qrFileId.ToString("D"), qrAuditEvent.SafeMetadataJson);

        var privateCreditor = await SeedAccountAsync(testFactory, "Private QR Creditor", InitialTimestamp.AddMinutes(2));
        await SeedPaymentProfileWithQrAsync(
            testFactory,
            testContext.StorageProvider,
            privateCreditor.UserProfileId,
            "Private QR",
            "private-qr-handle",
            "private qr note",
            UserPaymentProfileVisibilities.Private);
        var privateSettlementId = await SeedPersonalSettlementForAsync(testFactory, debtorSession.UserProfileId, privateCreditor.UserProfileId);
        using var privateRequest = CreateBearerRequest(
            HttpMethod.Get,
            QrContentPath(privateSettlementId, privateCreditor.UserProfileId),
            debtorSession.RawSessionToken);
        using var privateResponse = await client.SendAsync(privateRequest);
        await AssertPaymentDetailsUnavailableProblemAsync(privateResponse);

        var malformedCreditor = await SeedAccountAsync(testFactory, "Malformed QR Creditor", InitialTimestamp.AddMinutes(3));
        var wrongPurposeFileId = await SeedFileObjectAsync(
            testFactory,
            testContext.StorageProvider,
            malformedCreditor.UserProfileId,
            malformedCreditor.UserProfileId,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            "image/png",
            ValidPngBytes);
        await SeedPaymentProfileAsync(
            testFactory,
            malformedCreditor.UserProfileId,
            "Wrong Purpose QR",
            "wrong-purpose-handle",
            "wrong purpose note",
            UserPaymentProfileVisibilities.SettlementCounterpartiesOnly,
            qrFileObjectId: wrongPurposeFileId);
        var malformedSettlementId = await SeedPersonalSettlementForAsync(testFactory, debtorSession.UserProfileId, malformedCreditor.UserProfileId);
        using var malformedRequest = CreateBearerRequest(
            HttpMethod.Get,
            QrContentPath(malformedSettlementId, malformedCreditor.UserProfileId),
            debtorSession.RawSessionToken);
        using var malformedResponse = await client.SendAsync(malformedRequest);
        await AssertPaymentDetailsUnavailableProblemAsync(malformedResponse);
    }

    [Fact]
    public async Task OpenApiAddsOnlySettlementScopedCounterpartyPaymentDetailsSurfaceAndNoGenericFileApi()
    {
        var openApi = await File.ReadAllTextAsync(FindRepoFile("packages/contracts/openapi/settleora.v1.yaml"));

        Assert.Contains("/api/v1/settlements/{settlementId}/counterparties/{userProfileId}/payment-details:", openApi);
        Assert.Contains("/api/v1/settlements/{settlementId}/counterparties/{userProfileId}/payment-details/qr/content:", openApi);
        Assert.Contains("SettlementCounterpartyPaymentDetailsResponse:", openApi);
        Assert.Contains("SettlementCounterpartyPaymentDetailsQrFileResponse:", openApi);
        Assert.DoesNotContain("/api/v1/files/{fileId}", openApi, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("generic file", ExtractOpenApiPathBlock(openApi, "  /api/v1/settlements/{settlementId}/counterparties/{userProfileId}/payment-details:"), StringComparison.OrdinalIgnoreCase);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = $"settlement-counterparty-payment-details-{Guid.NewGuid():N}";
        var timeProvider = new CounterpartyPaymentDetailsTestTimeProvider(InitialTimestamp);
        var storageProvider = new TestCounterpartyPaymentDetailsStorageProvider();
        var testFactory = factory.WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Testing");
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
                services.RemoveAll<IFileObjectStorageProvider>();
                services.AddSingleton<IFileObjectStorageProvider>(storageProvider);
            });
        });

        return new FactoryTestContext(testFactory, timeProvider, storageProvider);
    }

    private static async Task<SeededSession> SeedSessionActorAsync(
        WebApplicationFactory<Program> testFactory,
        CounterpartyPaymentDetailsTestTimeProvider timeProvider,
        string displayName)
    {
        var account = await SeedAccountAsync(testFactory, displayName, InitialTimestamp);
        return await SeedSessionForAccountAsync(testFactory, timeProvider, account);
    }

    private static async Task<SeededSession> SeedSessionForAccountAsync(
        WebApplicationFactory<Program> testFactory,
        CounterpartyPaymentDetailsTestTimeProvider timeProvider,
        SeededAccount account)
    {
        timeProvider.SetUtcNow(InitialTimestamp);
        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Counterparty payment details endpoint test",
                UserAgentSummary: "Counterparty payment details endpoint test user agent",
                NetworkAddressHash: "counterparty-payment-details-test-network",
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

    private static async Task<Guid> SeedPersonalSettlementForAsync(
        WebApplicationFactory<Program> testFactory,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        DateTimeOffset? archivedAtUtc = null)
    {
        var billId = await SeedBillAsync(
            testFactory,
            creditorUserProfileId,
            groupId: null,
            [new ParticipantSeed(debtorUserProfileId, 15m), new ParticipantSeed(creditorUserProfileId, 15m)],
            [new PayerSeed(creditorUserProfileId, 30m)],
            InitialTimestamp);
        return await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtorUserProfileId,
            creditorUserProfileId,
            creditorUserProfileId,
            InitialTimestamp.AddMinutes(1),
            archivedAtUtc);
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
            Amount = 15m,
            Currency = "USD",
            Status = SettlementRequestStatuses.Requested,
            RequestedByUserProfileId = requestedByUserProfileId,
            RequestedAtUtc = requestedAtUtc,
            CreatedAtUtc = requestedAtUtc,
            UpdatedAtUtc = requestedAtUtc,
            ArchivedAtUtc = archivedAtUtc
        });

        await dbContext.SaveChangesAsync();
        return settlementId;
    }

    private static async Task<Guid> SeedPaymentProfileWithQrAsync(
        WebApplicationFactory<Program> testFactory,
        TestCounterpartyPaymentDetailsStorageProvider storageProvider,
        Guid userProfileId,
        string? preferredMethodLabel,
        string? paymentHandle,
        string? paymentNote,
        string visibility)
    {
        var fileObjectId = await SeedFileObjectAsync(
            testFactory,
            storageProvider,
            userProfileId,
            userProfileId,
            FileObjectPurposes.PaymentQr,
            FileObjectStatuses.Active,
            "image/png",
            ValidPngBytes);
        await SeedPaymentProfileAsync(
            testFactory,
            userProfileId,
            preferredMethodLabel,
            paymentHandle,
            paymentNote,
            visibility,
            qrFileObjectId: fileObjectId);
        return fileObjectId;
    }

    private static async Task<Guid> SeedPaymentProfileAsync(
        WebApplicationFactory<Program> testFactory,
        Guid userProfileId,
        string? preferredMethodLabel,
        string? paymentHandle,
        string? paymentNote,
        string visibility,
        Guid? qrFileObjectId = null,
        DateTimeOffset? deletedAtUtc = null)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var paymentProfileId = Guid.NewGuid();
        dbContext.Set<UserPaymentProfile>().Add(new UserPaymentProfile
        {
            Id = paymentProfileId,
            UserProfileId = userProfileId,
            PreferredMethodLabel = preferredMethodLabel,
            PaymentHandle = paymentHandle,
            PaymentNote = paymentNote,
            Visibility = visibility,
            QrFileObjectId = qrFileObjectId,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            DeletedAtUtc = deletedAtUtc
        });

        await dbContext.SaveChangesAsync();
        return paymentProfileId;
    }

    private static async Task<Guid> SeedFileObjectAsync(
        WebApplicationFactory<Program> testFactory,
        TestCounterpartyPaymentDetailsStorageProvider storageProvider,
        Guid ownerUserProfileId,
        Guid createdByUserProfileId,
        string purpose,
        string status,
        string contentType,
        byte[] bytes)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var fileObjectId = Guid.NewGuid();
        var objectKey = storageProvider.CreateObjectKey(purpose, fileObjectId, InitialTimestamp);
        storageProvider.Store(objectKey, bytes);
        dbContext.Set<FileObject>().Add(new FileObject
        {
            Id = fileObjectId,
            OwnerUserProfileId = ownerUserProfileId,
            CreatedByUserProfileId = createdByUserProfileId,
            Purpose = purpose,
            Status = status,
            ContentType = contentType,
            OriginalFilename = HiddenOriginalFilename,
            SizeBytes = bytes.LongLength,
            Sha256Hash = null,
            StorageProvider = StorageProviderNames.Local,
            StorageObjectKey = objectKey,
            EncryptionMode = FileObjectEncryptionModes.ServerManaged,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            DeletedAtUtc = status == FileObjectStatuses.Deleted ? InitialTimestamp.AddMinutes(1) : null
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

    private static async Task<IReadOnlyList<AuthAuditEvent>> ReadCounterpartyAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthAuditEvent>()
            .AsNoTracking()
            .Where(auditEvent => auditEvent.Action == CounterpartyViewedAction)
            .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
            .ThenBy(auditEvent => auditEvent.Id)
            .ToArrayAsync();
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

    private static string PaymentDetailsPath(Guid settlementId, Guid userProfileId)
    {
        return $"/api/v1/settlements/{settlementId:D}/counterparties/{userProfileId:D}/payment-details";
    }

    private static string QrContentPath(Guid settlementId, Guid userProfileId)
    {
        return $"/api/v1/settlements/{settlementId:D}/counterparties/{userProfileId:D}/payment-details/qr/content";
    }

    private static PaymentDetailsPayload ReadPaymentDetailsPayload(string content)
    {
        using var payload = JsonDocument.Parse(content);
        var root = payload.RootElement;

        Assert.Equal(
            [
                "isConfigured",
                "paymentHandle",
                "paymentNote",
                "preferredMethodLabel",
                "qrFile",
                "userProfileId",
                "visibilityApplied"
            ],
            root.EnumerateObject()
                .Select(property => property.Name)
                .Order(StringComparer.Ordinal)
                .ToArray());
        return new PaymentDetailsPayload(
            root.GetProperty("userProfileId").GetGuid(),
            root.GetProperty("isConfigured").GetBoolean(),
            ReadNullableString(root.GetProperty("preferredMethodLabel")),
            ReadNullableString(root.GetProperty("paymentHandle")),
            ReadNullableString(root.GetProperty("paymentNote")),
            root.GetProperty("visibilityApplied").GetString()!,
            ReadQrPayload(root.GetProperty("qrFile")));
    }

    private static PaymentQrPayload? ReadQrPayload(JsonElement value)
    {
        return value.ValueKind is JsonValueKind.Null
            ? null
            : new PaymentQrPayload(
                value.GetProperty("id").GetGuid(),
                value.GetProperty("contentType").GetString()!,
                value.GetProperty("sizeBytes").GetInt64(),
                value.GetProperty("updatedAtUtc").GetDateTimeOffset());
    }

    private static string? ReadNullableString(JsonElement value)
    {
        return value.ValueKind is JsonValueKind.Null
            ? null
            : value.GetString();
    }

    private static async Task AssertPaymentDetailsUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Payment details unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested payment details are unavailable.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static void AssertCounterpartyAuditMetadata(
        AuthAuditEvent auditEvent,
        Guid settlementId,
        Guid actorUserProfileId,
        Guid targetUserProfileId,
        Guid? groupId,
        string groupMode,
        string relationship,
        bool isConfigured,
        string changeCategory,
        params string[] forbiddenValues)
    {
        Assert.Equal(CounterpartyViewedAction, auditEvent.Action);
        Assert.Equal(AuthAuditOutcomes.Success, auditEvent.Outcome);
        Assert.NotNull(auditEvent.SafeMetadataJson);
        Assert.True(auditEvent.SafeMetadataJson!.Length <= 4096);
        AssertSafeAuditContent(auditEvent, forbiddenValues);

        using var metadata = JsonDocument.Parse(auditEvent.SafeMetadataJson);
        Assert.Equal("payment_details_counterparty_read", metadata.RootElement.GetProperty("workflowName").GetString());
        Assert.Equal(settlementId.ToString("D"), metadata.RootElement.GetProperty("settlementRequestId").GetString());
        Assert.Equal(actorUserProfileId.ToString("D"), metadata.RootElement.GetProperty("actorUserProfileId").GetString());
        Assert.Equal(targetUserProfileId.ToString("D"), metadata.RootElement.GetProperty("targetUserProfileId").GetString());
        Assert.Equal(groupMode, metadata.RootElement.GetProperty("groupMode").GetString());
        Assert.Equal(relationship, metadata.RootElement.GetProperty("relationship").GetString());
        Assert.Equal(isConfigured, metadata.RootElement.GetProperty("isConfigured").GetBoolean());
        Assert.Equal(changeCategory, metadata.RootElement.GetProperty("changeCategory").GetString());
        Assert.Contains(
            changeCategory,
            metadata.RootElement.GetProperty("fieldsChanged").EnumerateArray().Select(field => field.GetString()));
        if (groupId.HasValue)
        {
            Assert.Equal(groupId.Value.ToString("D"), metadata.RootElement.GetProperty("groupId").GetString());
        }
        else
        {
            Assert.False(metadata.RootElement.TryGetProperty("groupId", out _));
        }
    }

    private static AuthAuditEvent AssertSingleCounterpartyAuditEvent(
        IReadOnlyList<AuthAuditEvent> auditEvents,
        Guid actorUserProfileId,
        Guid targetUserProfileId,
        string relationship)
    {
        return Assert.Single(auditEvents, auditEvent =>
        {
            if (auditEvent.SafeMetadataJson is null)
            {
                return false;
            }

            using var metadata = JsonDocument.Parse(auditEvent.SafeMetadataJson);

            return metadata.RootElement.GetProperty("actorUserProfileId").GetString() == actorUserProfileId.ToString("D")
                && metadata.RootElement.GetProperty("targetUserProfileId").GetString() == targetUserProfileId.ToString("D")
                && metadata.RootElement.GetProperty("relationship").GetString() == relationship;
        });
    }

    private static void AssertSafePaymentDetailsResponseContent(
        string content,
        params string[] forbiddenValues)
    {
        var lowerContent = content.ToLowerInvariant();
        foreach (var forbiddenValue in forbiddenValues)
        {
            Assert.DoesNotContain(forbiddenValue, content);
        }

        Assert.DoesNotContain("auth", lowerContent);
        Assert.DoesNotContain("account", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("storageobjectkey", lowerContent);
        Assert.DoesNotContain("storage_object_key", lowerContent);
        Assert.DoesNotContain("objectkey", lowerContent);
        Assert.DoesNotContain("object_key", lowerContent);
        Assert.DoesNotContain("providerurl", lowerContent);
        Assert.DoesNotContain("rootpath", lowerContent);
        Assert.DoesNotContain("vault", lowerContent);
        Assert.DoesNotContain("merchant", lowerContent);
        Assert.DoesNotContain("item", lowerContent);
        Assert.DoesNotContain("filename", lowerContent);
    }

    private static void AssertSafeProblemContent(string content)
    {
        var lowerContent = content.ToLowerInvariant();
        Assert.DoesNotContain(WrongRawToken, content);
        Assert.DoesNotContain("merchant", lowerContent);
        Assert.DoesNotContain("item", lowerContent);
        Assert.DoesNotContain("paymenthandle", lowerContent);
        Assert.DoesNotContain("payment_handle", lowerContent);
        Assert.DoesNotContain("paymentnote", lowerContent);
        Assert.DoesNotContain("payment_note", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("objectkey", lowerContent);
        Assert.DoesNotContain("object_key", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
        Assert.DoesNotContain("vault", lowerContent);
        Assert.DoesNotContain("filename", lowerContent);
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

        Assert.DoesNotContain("requestbody", lowerAuditText);
        Assert.DoesNotContain("body", lowerAuditText);
        Assert.DoesNotContain("token", lowerAuditText);
        Assert.DoesNotContain("password", lowerAuditText);
        Assert.DoesNotContain("credential", lowerAuditText);
        Assert.DoesNotContain("paymenthandle", lowerAuditText);
        Assert.DoesNotContain("paymentnote", lowerAuditText);
        Assert.DoesNotContain("storageobjectkey", lowerAuditText);
        Assert.DoesNotContain("storage_object_key", lowerAuditText);
        Assert.DoesNotContain("path", lowerAuditText);
        Assert.DoesNotContain("vault", lowerAuditText);
        Assert.DoesNotContain("filename", lowerAuditText);
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
        CounterpartyPaymentDetailsTestTimeProvider TimeProvider,
        TestCounterpartyPaymentDetailsStorageProvider StorageProvider);

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

    private sealed record PaymentDetailsPayload(
        Guid UserProfileId,
        bool IsConfigured,
        string? PreferredMethodLabel,
        string? PaymentHandle,
        string? PaymentNote,
        string VisibilityApplied,
        PaymentQrPayload? QrFile);

    private sealed record PaymentQrPayload(
        Guid Id,
        string ContentType,
        long SizeBytes,
        DateTimeOffset UpdatedAtUtc);

    private sealed class CounterpartyPaymentDetailsTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public CounterpartyPaymentDetailsTestTimeProvider(DateTimeOffset utcNow)
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

    private sealed class TestCounterpartyPaymentDetailsStorageProvider : IFileObjectStorageProvider
    {
        private readonly Dictionary<string, byte[]> storedObjects = new(StringComparer.Ordinal);

        public string ProviderName => StorageProviderNames.Local;

        public int OpenReadCount { get; private set; }

        public string CreateObjectKey(string purpose, Guid fileObjectId, DateTimeOffset createdAtUtc)
        {
            return string.Join(
                '/',
                "file-objects",
                purpose,
                createdAtUtc.Year.ToString("0000"),
                createdAtUtc.Month.ToString("00"),
                createdAtUtc.Day.ToString("00"),
                fileObjectId.ToString("N"));
        }

        public Task WriteAsync(string objectKey, Stream content, CancellationToken cancellationToken)
        {
            throw new NotSupportedException("Counterparty payment details tests seed storage bytes directly.");
        }

        public Task<Stream> OpenReadAsync(string objectKey, CancellationToken cancellationToken)
        {
            OpenReadCount++;
            if (!storedObjects.TryGetValue(objectKey, out var bytes))
            {
                throw new FileNotFoundException("Simulated missing counterparty QR object.");
            }

            Stream stream = new MemoryStream(bytes, writable: false);
            return Task.FromResult(stream);
        }

        public Task DeleteAsync(string objectKey, CancellationToken cancellationToken)
        {
            storedObjects.Remove(objectKey);
            return Task.CompletedTask;
        }

        public void Store(string objectKey, byte[] bytes)
        {
            storedObjects[objectKey] = bytes;
        }
    }
}
