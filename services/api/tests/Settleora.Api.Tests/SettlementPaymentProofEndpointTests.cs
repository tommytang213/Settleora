using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
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

public sealed class SettlementPaymentProofEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string WrongRawToken = "visible-wrong-settlement-proof-session-token";
    private const string HiddenMerchantName = "Hidden Settlement Proof Merchant";
    private const string HiddenItemName = "Hidden Settlement Proof Item";
    private const string HiddenPaymentMethodLabel = "Hidden settlement proof method";
    private const string HiddenPaymentHandle = "hidden-settlement-proof-handle";
    private const string HiddenPaymentNote = "hidden settlement proof note";
    private const string HiddenOriginalFilename = "secret-settlement-proof.pdf";
    private const string HiddenStorageObjectKey = "hidden/settlement/proof/object-key";
    private const string ProofAttachedAction = "settlement.proof_attached";
    private const string ProofRemovedAction = "settlement.proof_removed";
    private const string ProofReadAction = "settlement.proof_read";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 9, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 9, 12, 15, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 5, 9, 12, 30, 0, TimeSpan.Zero);
    private static readonly DateOnly PaymentDate = new(2026, 5, 9);
    private static readonly byte[] ValidPngBytes = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x01];
    private static readonly byte[] ValidPdfBytes = [0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A, 0x25, 0x45, 0x4F, 0x46];
    private static readonly byte[] ValidWebpBytes = [0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x00];

    private readonly WebApplicationFactory<Program> factory;

    public SettlementPaymentProofEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task DebtorCanUploadListCreditorReadAndDebtorRemoveProofWithSafeMetadataStorageAndAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Proof Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Proof Creditor", InitialTimestamp.AddMinutes(1));
        var creditorSession = await SeedSessionForAccountAsync(testFactory, testContext.TimeProvider, creditor);
        var settlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            SettlementRequestStatuses.PartiallyPaid);
        var paymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            12.50m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();

        using var uploadRequest = CreateProofUploadRequest(
            paymentId,
            debtorSession.RawSessionToken,
            ValidPdfBytes,
            "application/pdf",
            HiddenOriginalFilename);
        using var uploadResponse = await client.SendAsync(uploadRequest);
        var uploadContent = await uploadResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, uploadResponse.StatusCode);
        AssertSafeProofJsonContent(
            uploadContent,
            HiddenOriginalFilename,
            debtorSession.RawSessionToken,
            HiddenStorageObjectKey,
            HiddenPaymentHandle,
            HiddenPaymentNote,
            HiddenMerchantName,
            HiddenItemName);
        var proof = ReadProofPayload(uploadContent);
        Assert.Equal(paymentId, proof.SettlementPaymentId);
        Assert.Equal("application/pdf", proof.ContentType);
        Assert.Equal(ValidPdfBytes.LongLength, proof.SizeBytes);
        Assert.Equal(WriteTimestamp, proof.UploadedAtUtc);
        Assert.Equal(WriteTimestamp, proof.UpdatedAtUtc);

        var fileObject = await ReadFileObjectAsync(testFactory, proof.FileId);
        AssertSettlementProofFileObject(
            fileObject,
            debtorSession.UserProfileId,
            FileObjectStatuses.Active,
            "application/pdf",
            ValidPdfBytes);
        Assert.Null(fileObject.OriginalFilename);
        Assert.DoesNotContain(HiddenOriginalFilename, fileObject.StorageObjectKey, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(ValidPdfBytes, testContext.StorageProvider.ReadStoredBytes(fileObject.StorageObjectKey));

        var attachment = await ReadProofAttachmentAsync(testFactory, paymentId, proof.FileId);
        Assert.Equal(debtorSession.UserProfileId, attachment.CreatedByUserProfileId);
        Assert.Null(attachment.RemovedAtUtc);

        using (var listRequest = CreateBearerRequest(HttpMethod.Get, ProofPath(paymentId), debtorSession.RawSessionToken))
        using (var listResponse = await client.SendAsync(listRequest))
        {
            var listContent = await listResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
            AssertSafeProofJsonContent(listContent, HiddenOriginalFilename, HiddenStorageObjectKey);
            var proofs = ReadProofListPayload(listContent);
            var listedProof = Assert.Single(proofs);
            Assert.Equal(proof, listedProof);
        }

        using (var contentRequest = CreateBearerRequest(
            HttpMethod.Get,
            ProofContentPath(paymentId, proof.FileId),
            creditorSession.RawSessionToken))
        using (var contentResponse = await client.SendAsync(contentRequest))
        {
            var bytes = await contentResponse.Content.ReadAsByteArrayAsync();
            Assert.Equal(HttpStatusCode.OK, contentResponse.StatusCode);
            Assert.Equal("application/pdf", contentResponse.Content.Headers.ContentType?.MediaType);
            Assert.Equal(ValidPdfBytes, bytes);
            Assert.True(contentResponse.Headers.TryGetValues("X-Content-Type-Options", out var nosniffValues));
            Assert.Contains("nosniff", nosniffValues);
            Assert.True(contentResponse.Content.Headers.TryGetValues("Content-Disposition", out var dispositionValues));
            Assert.Contains("attachment", dispositionValues);
        }

        using (var deleteRequest = CreateBearerRequest(
            HttpMethod.Delete,
            ProofFilePath(paymentId, proof.FileId),
            debtorSession.RawSessionToken))
        using (var deleteResponse = await client.SendAsync(deleteRequest))
        {
            Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);
        }

        var removedAttachment = await ReadProofAttachmentAsync(testFactory, paymentId, proof.FileId);
        Assert.Equal(WriteTimestamp, removedAttachment.RemovedAtUtc);
        var deletedFileObject = await ReadFileObjectAsync(testFactory, proof.FileId);
        Assert.Equal(FileObjectStatuses.Deleted, deletedFileObject.Status);
        Assert.Equal(WriteTimestamp, deletedFileObject.DeletedAtUtc);

        using (var postRemoveListRequest = CreateBearerRequest(HttpMethod.Get, ProofPath(paymentId), debtorSession.RawSessionToken))
        using (var postRemoveListResponse = await client.SendAsync(postRemoveListRequest))
        {
            var listContent = await postRemoveListResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, postRemoveListResponse.StatusCode);
            Assert.Empty(ReadProofListPayload(listContent));
        }

        var proofAuditEvents = await ReadSettlementProofAuditEventsAsync(testFactory);
        Assert.Equal([ProofAttachedAction, ProofReadAction, ProofRemovedAction], proofAuditEvents.Select(audit => audit.Action).ToArray());
        AssertProofAuditMetadata(
            proofAuditEvents[0],
            ProofAttachedAction,
            settlementId,
            paymentId,
            proof.FileId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            "proof_attached",
            HiddenOriginalFilename,
            HiddenStorageObjectKey);
        AssertProofAuditMetadata(
            proofAuditEvents[1],
            ProofReadAction,
            settlementId,
            paymentId,
            proof.FileId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            "proof_read",
            HiddenOriginalFilename,
            HiddenStorageObjectKey);
        AssertProofAuditMetadata(
            proofAuditEvents[2],
            ProofRemovedAction,
            settlementId,
            paymentId,
            proof.FileId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            "proof_removed",
            HiddenOriginalFilename,
            HiddenStorageObjectKey);

        var lifecycleActions = (await ReadFileLifecycleAuditEventsAsync(testFactory))
            .Select(audit => audit.Action)
            .Order(StringComparer.Ordinal)
            .ToArray();
        Assert.Equal(["file.deleted", "file.upload_completed", "file.upload_started"], lifecycleActions);
    }

    [Fact]
    public async Task CreditorCanListAndReadButCannotAttachOrRemoveProof()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Creditor Read Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Creditor Read Creditor", InitialTimestamp.AddMinutes(1));
        var creditorSession = await SeedSessionForAccountAsync(testFactory, testContext.TimeProvider, creditor);
        var settlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            SettlementRequestStatuses.MarkedPaid);
        var paymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            25m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
        var proofFileId = await SeedProofAttachmentAsync(
            testFactory,
            testContext.StorageProvider,
            paymentId,
            debtorSession.UserProfileId,
            ValidPngBytes,
            "image/png",
            FileObjectPurposes.SettlementProof,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        using var client = testFactory.CreateClient();

        using (var listRequest = CreateBearerRequest(HttpMethod.Get, ProofPath(paymentId), creditorSession.RawSessionToken))
        using (var listResponse = await client.SendAsync(listRequest))
        {
            var content = await listResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
            var listedProof = Assert.Single(ReadProofListPayload(content));
            Assert.Equal(proofFileId, listedProof.FileId);
        }

        using (var readRequest = CreateBearerRequest(
            HttpMethod.Get,
            ProofContentPath(paymentId, proofFileId),
            creditorSession.RawSessionToken))
        using (var readResponse = await client.SendAsync(readRequest))
        {
            Assert.Equal(HttpStatusCode.OK, readResponse.StatusCode);
            Assert.Equal(ValidPngBytes, await readResponse.Content.ReadAsByteArrayAsync());
        }

        using (var uploadRequest = CreateProofUploadRequest(
            paymentId,
            creditorSession.RawSessionToken,
            ValidPngBytes,
            "image/png",
            "creditor-secret.png"))
        using (var uploadResponse = await client.SendAsync(uploadRequest))
        {
            await AssertSettlementPaymentUnavailableProblemAsync(uploadResponse, "creditor-secret.png");
        }

        using (var removeRequest = CreateBearerRequest(
            HttpMethod.Delete,
            ProofFilePath(paymentId, proofFileId),
            creditorSession.RawSessionToken))
        using (var removeResponse = await client.SendAsync(removeRequest))
        {
            await AssertSettlementPaymentUnavailableProblemAsync(removeResponse);
        }

        var attachment = await ReadProofAttachmentAsync(testFactory, paymentId, proofFileId);
        Assert.Null(attachment.RemovedAtUtc);
        Assert.Equal(FileObjectStatuses.Active, (await ReadFileObjectAsync(testFactory, proofFileId)).Status);
    }

    [Fact]
    public async Task GroupMembershipOnlyAndRemovedRequiredPartyFailClosed()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Proof Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Group Proof Creditor", InitialTimestamp.AddMinutes(1));
        var requester = await SeedAccountAsync(testFactory, "Group Proof Requester", InitialTimestamp.AddMinutes(2));
        var outsiderSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Proof Outsider");
        var groupId = await SeedGroupAsync(
            testFactory,
            requester.UserProfileId,
            "Settlement Proof Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(debtorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(creditor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(requester.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(outsiderSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var settlementId = await SeedGroupSettlementAsync(
            testFactory,
            groupId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            requester.UserProfileId,
            25m,
            SettlementRequestStatuses.PartiallyPaid);
        var paymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            25m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
        await SeedProofAttachmentAsync(
            testFactory,
            testContext.StorageProvider,
            paymentId,
            debtorSession.UserProfileId,
            ValidPngBytes,
            "image/png",
            FileObjectPurposes.SettlementProof,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        using var client = testFactory.CreateClient();

        using (var outsiderRequest = CreateBearerRequest(HttpMethod.Get, ProofPath(paymentId), outsiderSession.RawSessionToken))
        using (var outsiderResponse = await client.SendAsync(outsiderRequest))
        {
            await AssertSettlementPaymentUnavailableProblemAsync(outsiderResponse);
        }

        await UpdateMembershipStatusAsync(
            testFactory,
            groupId,
            creditor.UserProfileId,
            GroupMembershipStatuses.Removed);

        using (var removedPartyRequest = CreateBearerRequest(HttpMethod.Get, ProofPath(paymentId), debtorSession.RawSessionToken))
        using (var removedPartyResponse = await client.SendAsync(removedPartyRequest))
        {
            await AssertSettlementPaymentUnavailableProblemAsync(removedPartyResponse);
        }
    }

    [Fact]
    public async Task WrongPurposeRemovedDeletedInactiveAndWrongOwnerProofsFailClosed()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Malformed Proof Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Malformed Proof Creditor", InitialTimestamp.AddMinutes(1));
        var other = await SeedAccountAsync(testFactory, "Malformed Proof Other", InitialTimestamp.AddMinutes(2));
        var settlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            SettlementRequestStatuses.PartiallyPaid);
        var paymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            25m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
        var readableFileId = await SeedProofAttachmentAsync(
            testFactory,
            testContext.StorageProvider,
            paymentId,
            debtorSession.UserProfileId,
            ValidPngBytes,
            "image/png",
            FileObjectPurposes.SettlementProof,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var wrongPurposeFileId = await SeedProofAttachmentAsync(
            testFactory,
            testContext.StorageProvider,
            paymentId,
            debtorSession.UserProfileId,
            ValidPngBytes,
            "image/png",
            FileObjectPurposes.PaymentQr,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var deletedFileId = await SeedProofAttachmentAsync(
            testFactory,
            testContext.StorageProvider,
            paymentId,
            debtorSession.UserProfileId,
            ValidPngBytes,
            "image/png",
            FileObjectPurposes.SettlementProof,
            FileObjectStatuses.Deleted,
            removedAtUtc: null);
        var inactiveFileId = await SeedProofAttachmentAsync(
            testFactory,
            testContext.StorageProvider,
            paymentId,
            debtorSession.UserProfileId,
            ValidPngBytes,
            "image/png",
            FileObjectPurposes.SettlementProof,
            FileObjectStatuses.UploadFailed,
            removedAtUtc: null);
        var wrongOwnerFileId = await SeedProofAttachmentAsync(
            testFactory,
            testContext.StorageProvider,
            paymentId,
            other.UserProfileId,
            ValidPngBytes,
            "image/png",
            FileObjectPurposes.SettlementProof,
            FileObjectStatuses.Active,
            removedAtUtc: null,
            attachmentCreatedByUserProfileId: debtorSession.UserProfileId);
        var removedFileId = await SeedProofAttachmentAsync(
            testFactory,
            testContext.StorageProvider,
            paymentId,
            debtorSession.UserProfileId,
            ValidPngBytes,
            "image/png",
            FileObjectPurposes.SettlementProof,
            FileObjectStatuses.Active,
            removedAtUtc: InitialTimestamp.AddMinutes(20));
        using var client = testFactory.CreateClient();

        using (var listRequest = CreateBearerRequest(HttpMethod.Get, ProofPath(paymentId), debtorSession.RawSessionToken))
        using (var listResponse = await client.SendAsync(listRequest))
        {
            var content = await listResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
            var listedProof = Assert.Single(ReadProofListPayload(content));
            Assert.Equal(readableFileId, listedProof.FileId);
        }

        foreach (var blockedFileId in new[]
        {
            wrongPurposeFileId,
            deletedFileId,
            inactiveFileId,
            wrongOwnerFileId,
            removedFileId
        })
        {
            using var contentRequest = CreateBearerRequest(
                HttpMethod.Get,
                ProofContentPath(paymentId, blockedFileId),
                debtorSession.RawSessionToken);
            using var contentResponse = await client.SendAsync(contentRequest);
            await AssertSettlementPaymentUnavailableProblemAsync(contentResponse);
        }
    }

    [Fact]
    public async Task InvalidUploadsAreRejectedWithoutProofRowsOrSensitiveEcho()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Invalid Upload Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Invalid Upload Creditor", InitialTimestamp.AddMinutes(1));
        var settlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            SettlementRequestStatuses.PartiallyPaid);
        var paymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            25m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
        using var client = testFactory.CreateClient();

        using (var missingAuthRequest = CreateProofUploadRequest(
            paymentId,
            rawSessionToken: null,
            ValidPngBytes,
            "image/png",
            "missing-auth-secret.png"))
        using (var missingAuthResponse = await client.SendAsync(missingAuthRequest))
        {
            await AssertUnauthenticatedProblemAsync(missingAuthResponse, "missing-auth-secret.png");
        }

        using (var invalidTokenRequest = CreateBearerRequest(HttpMethod.Get, ProofPath(paymentId), WrongRawToken))
        using (var invalidTokenResponse = await client.SendAsync(invalidTokenRequest))
        {
            await AssertUnauthenticatedProblemAsync(invalidTokenResponse, WrongRawToken);
        }

        using (var unsupportedRequest = CreateProofUploadRequest(
            paymentId,
            debtorSession.RawSessionToken,
            [0x4D, 0x5A, 0x00, 0x00],
            "application/octet-stream",
            "secret.exe"))
        using (var unsupportedResponse = await client.SendAsync(unsupportedRequest))
        {
            await AssertInvalidProofUploadProblemAsync(unsupportedResponse, "secret.exe");
        }

        using (var mismatchRequest = CreateProofUploadRequest(
            paymentId,
            debtorSession.RawSessionToken,
            ValidPngBytes,
            "application/pdf",
            "mismatch-secret.pdf"))
        using (var mismatchResponse = await client.SendAsync(mismatchRequest))
        {
            await AssertInvalidProofUploadProblemAsync(mismatchResponse, "mismatch-secret.pdf");
        }

        var oversized = new byte[(5 * 1024 * 1024) + 1];
        Array.Copy(ValidPngBytes, oversized, ValidPngBytes.Length);
        using (var oversizedRequest = CreateProofUploadRequest(
            paymentId,
            debtorSession.RawSessionToken,
            oversized,
            "image/png",
            "oversized-secret.png"))
        using (var oversizedResponse = await client.SendAsync(oversizedRequest))
        {
            await AssertInvalidProofUploadProblemAsync(oversizedResponse, "oversized-secret.png");
        }

        using (var wrongFieldRequest = CreateProofUploadRequest(
            paymentId,
            debtorSession.RawSessionToken,
            ValidPngBytes,
            "image/png",
            "wrong-field-secret.png",
            fieldName: "receipt"))
        using (var wrongFieldResponse = await client.SendAsync(wrongFieldRequest))
        {
            await AssertInvalidProofUploadProblemAsync(wrongFieldResponse, "wrong-field-secret.png");
        }

        Assert.Empty(await ReadProofAttachmentsAsync(testFactory));
        Assert.Empty(await ReadFileObjectsAsync(testFactory));
        Assert.Empty(await ReadSettlementProofAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task StorageWriteFailureMarksUploadFailedAndDoesNotCreateActiveProofAssociation()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Storage Failure Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Storage Failure Creditor", InitialTimestamp.AddMinutes(1));
        var settlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            SettlementRequestStatuses.PartiallyPaid);
        var paymentId = await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            25m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
        testContext.StorageProvider.FailWrites = true;
        using var client = testFactory.CreateClient();
        using var request = CreateProofUploadRequest(
            paymentId,
            debtorSession.RawSessionToken,
            ValidWebpBytes,
            "image/webp",
            "storage-failure-secret.webp");

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        AssertSafeProblemContent(content, "storage-failure-secret.webp");
        Assert.Empty(await ReadProofAttachmentsAsync(testFactory));
        Assert.Empty(await ReadSettlementProofAuditEventsAsync(testFactory));
        var fileObject = Assert.Single(await ReadFileObjectsAsync(testFactory));
        Assert.Equal(FileObjectPurposes.SettlementProof, fileObject.Purpose);
        Assert.Equal(FileObjectStatuses.UploadFailed, fileObject.Status);
        Assert.Equal(debtorSession.UserProfileId, fileObject.OwnerUserProfileId);
        var lifecycleActions = (await ReadFileLifecycleAuditEventsAsync(testFactory))
            .Select(audit => audit.Action)
            .Order(StringComparer.Ordinal)
            .ToArray();
        Assert.Equal(["file.upload_failed", "file.upload_started"], lifecycleActions);
    }

    [Fact]
    public async Task ConfirmedPaymentAndWrongRequestStateBlockProofChangesWithConflict()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Conflict Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Conflict Creditor", InitialTimestamp.AddMinutes(1));
        var confirmedSettlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            SettlementRequestStatuses.Confirmed);
        var confirmedPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            confirmedSettlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            25m,
            SettlementPaymentStatuses.Confirmed,
            InitialTimestamp.AddMinutes(3));
        var requestedSettlementId = await SeedBasicSettlementAsync(
            testFactory,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            SettlementRequestStatuses.Requested);
        var markedPaidPaymentId = await SeedSettlementPaymentAsync(
            testFactory,
            requestedSettlementId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            25m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(4));
        using var client = testFactory.CreateClient();

        foreach (var paymentId in new[] { confirmedPaymentId, markedPaidPaymentId })
        {
            using var request = CreateProofUploadRequest(
                paymentId,
                debtorSession.RawSessionToken,
                ValidPngBytes,
                "image/png",
                "conflict-secret.png");
            using var response = await client.SendAsync(request);
            await AssertSettlementProofConflictProblemAsync(response, "conflict-secret.png");
        }

        Assert.Empty(await ReadProofAttachmentsAsync(testFactory));
        Assert.Empty(await ReadFileObjectsAsync(testFactory));
        Assert.Empty(await ReadSettlementProofAuditEventsAsync(testFactory));
    }

    [Fact]
    public void OpenApiAndGeneratedClientsExposeOnlySettlementProofEndpointsAndNoGenericFileApi()
    {
        var openApi = File.ReadAllText(FindRepoFile("packages/contracts/openapi/settleora.v1.yaml"));
        var proofBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/settlement-payments/{paymentId}/proof:");
        var deleteBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/settlement-payments/{paymentId}/proof/{fileId}:");
        var contentBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/settlement-payments/{paymentId}/proof/{fileId}/content:");
        var responseSchema = ExtractOpenApiSchemaBlock(openApi, "SettlementPaymentProofResponse:");
        var listSchema = ExtractOpenApiSchemaBlock(openApi, "SettlementPaymentProofListResponse:");
        var uploadSchema = ExtractOpenApiSchemaBlock(openApi, "AttachSettlementPaymentProofRequest:");

        Assert.Contains("operationId: attachSettlementPaymentProof", proofBlock);
        Assert.Contains("operationId: listSettlementPaymentProofs", proofBlock);
        Assert.Contains("operationId: removeSettlementPaymentProof", deleteBlock);
        Assert.Contains("multipart/form-data", proofBlock);
        Assert.Contains("operationId: getSettlementPaymentProofContent", contentBlock);
        Assert.Contains("image/png", contentBlock);
        Assert.Contains("image/jpeg", contentBlock);
        Assert.Contains("image/webp", contentBlock);
        Assert.Contains("application/pdf", contentBlock);
        Assert.Contains("fileId", responseSchema);
        Assert.Contains("settlementPaymentId", responseSchema);
        Assert.Contains("proofs", listSchema);
        Assert.Contains("maxLength: 5242880", uploadSchema);
        Assert.DoesNotContain("storageObjectKey", responseSchema + listSchema);
        Assert.DoesNotContain("storagePath", responseSchema + listSchema);
        Assert.DoesNotContain("providerUrl", responseSchema + listSchema);
        Assert.DoesNotContain("originalFilename", responseSchema + listSchema);
        Assert.DoesNotContain("/api/v1/files", openApi);
    }

    [Fact]
    public void GeneratedClientsExposeSettlementProofOperationsFromOpenApi()
    {
        var webClient = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/client.ts"));
        var dartClient = File.ReadAllText(FindRepoFile("packages/client-dart/generated/client.dart"));
        var webModels = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/models.ts"));
        var dartModels = File.ReadAllText(FindRepoFile("packages/client-dart/generated/models.dart"));

        Assert.Contains("attachSettlementPaymentProof", webClient);
        Assert.Contains("listSettlementPaymentProofs", webClient);
        Assert.Contains("getSettlementPaymentProofContent", webClient);
        Assert.Contains("removeSettlementPaymentProof", webClient);
        Assert.Contains("attachSettlementPaymentProof", dartClient);
        Assert.Contains("listSettlementPaymentProofs", dartClient);
        Assert.Contains("getSettlementPaymentProofContent", dartClient);
        Assert.Contains("removeSettlementPaymentProof", dartClient);
        Assert.Contains("SettlementPaymentProofResponse", webModels);
        Assert.Contains("SettlementPaymentProofListResponse", webModels);
        Assert.Contains("class SettlementPaymentProofResponse", dartModels);
        Assert.Contains("class SettlementPaymentProofListResponse", dartModels);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new SettlementPaymentProofTestTimeProvider(InitialTimestamp);
        var storageProvider = new TestSettlementProofStorageProvider();
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

                services.RemoveAll<IFileObjectStorageProvider>();
                services.AddSingleton<IFileObjectStorageProvider>(storageProvider);
            });
        });

        return new FactoryTestContext(testFactory, timeProvider, storageProvider);
    }

    private static HttpRequestMessage CreateProofUploadRequest(
        Guid paymentId,
        string? rawSessionToken,
        byte[] bytes,
        string? contentType,
        string filename,
        string fieldName = "file")
    {
        var request = new HttpRequestMessage(HttpMethod.Post, ProofPath(paymentId));
        if (rawSessionToken is not null)
        {
            request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");
        }

        var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(bytes);
        if (!string.IsNullOrWhiteSpace(contentType))
        {
            fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
        }

        form.Add(fileContent, fieldName, filename);
        request.Content = form;
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

    private static async Task<SeededSession> SeedSessionActorAsync(
        WebApplicationFactory<Program> testFactory,
        SettlementPaymentProofTestTimeProvider timeProvider,
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
        SettlementPaymentProofTestTimeProvider timeProvider,
        SeededAccount account)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Settlement proof endpoint test",
                UserAgentSummary: "Settlement proof endpoint test user agent",
                NetworkAddressHash: "settlement-proof-endpoint-test-network",
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
        string status)
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
            InitialTimestamp.AddMinutes(2));
    }

    private static async Task<Guid> SeedGroupSettlementAsync(
        WebApplicationFactory<Program> testFactory,
        Guid groupId,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        Guid requestedByUserProfileId,
        decimal amount,
        string status)
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
            status,
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
        DateTimeOffset requestedAtUtc)
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
            UpdatedAtUtc = requestedAtUtc
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

    private static async Task<Guid> SeedProofAttachmentAsync(
        WebApplicationFactory<Program> testFactory,
        TestSettlementProofStorageProvider storageProvider,
        Guid paymentId,
        Guid fileOwnerUserProfileId,
        byte[] bytes,
        string contentType,
        string purpose,
        string status,
        DateTimeOffset? removedAtUtc,
        Guid? attachmentCreatedByUserProfileId = null)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var fileObjectId = Guid.NewGuid();
        var storageObjectKey = $"file-objects/settlement_proof/2026/05/09/{fileObjectId:N}";
        dbContext.Set<FileObject>().Add(new FileObject
        {
            Id = fileObjectId,
            OwnerUserProfileId = fileOwnerUserProfileId,
            CreatedByUserProfileId = fileOwnerUserProfileId,
            Purpose = purpose,
            Status = status,
            ContentType = contentType,
            OriginalFilename = HiddenOriginalFilename,
            SizeBytes = bytes.LongLength,
            Sha256Hash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(),
            StorageProvider = StorageProviderNames.Local,
            StorageObjectKey = storageObjectKey,
            EncryptionMode = FileObjectEncryptionModes.ServerManaged,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            DeletedAtUtc = status == FileObjectStatuses.Deleted ? InitialTimestamp : null
        });
        dbContext.Set<SettlementProofAttachment>().Add(new SettlementProofAttachment
        {
            SettlementPaymentId = paymentId,
            FileObjectId = fileObjectId,
            CreatedByUserProfileId = attachmentCreatedByUserProfileId ?? fileOwnerUserProfileId,
            CreatedAtUtc = InitialTimestamp,
            RemovedAtUtc = removedAtUtc
        });

        storageProvider.SeedObject(storageObjectKey, bytes);
        await dbContext.SaveChangesAsync();
        return fileObjectId;
    }

    private static async Task UpdateMembershipStatusAsync(
        WebApplicationFactory<Program> testFactory,
        Guid groupId,
        Guid userProfileId,
        string status)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var membership = await dbContext.Set<GroupMembership>()
            .SingleAsync(candidate => candidate.GroupId == groupId && candidate.UserProfileId == userProfileId);
        membership.Status = status;
        membership.UpdatedAtUtc = ValidationTimestamp;
        await dbContext.SaveChangesAsync();
    }

    private static async Task<FileObject> ReadFileObjectAsync(
        WebApplicationFactory<Program> testFactory,
        Guid fileObjectId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<FileObject>()
            .AsNoTracking()
            .SingleAsync(fileObject => fileObject.Id == fileObjectId);
    }

    private static async Task<IReadOnlyList<FileObject>> ReadFileObjectsAsync(WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<FileObject>()
            .AsNoTracking()
            .OrderBy(fileObject => fileObject.CreatedAtUtc)
            .ThenBy(fileObject => fileObject.Id)
            .ToArrayAsync();
    }

    private static async Task<SettlementProofAttachment> ReadProofAttachmentAsync(
        WebApplicationFactory<Program> testFactory,
        Guid paymentId,
        Guid fileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<SettlementProofAttachment>()
            .AsNoTracking()
            .SingleAsync(attachment => attachment.SettlementPaymentId == paymentId
                && attachment.FileObjectId == fileId);
    }

    private static async Task<IReadOnlyList<SettlementProofAttachment>> ReadProofAttachmentsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<SettlementProofAttachment>()
            .AsNoTracking()
            .OrderBy(attachment => attachment.CreatedAtUtc)
            .ToArrayAsync();
    }

    private static async Task<IReadOnlyList<AuthAuditEvent>> ReadSettlementProofAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthAuditEvent>()
            .AsNoTracking()
            .Where(auditEvent => auditEvent.Action == ProofAttachedAction
                || auditEvent.Action == ProofRemovedAction
                || auditEvent.Action == ProofReadAction)
            .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
            .ThenBy(auditEvent => auditEvent.Action)
            .ToArrayAsync();
    }

    private static async Task<IReadOnlyList<AuthAuditEvent>> ReadFileLifecycleAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthAuditEvent>()
            .AsNoTracking()
            .Where(auditEvent => auditEvent.Action.StartsWith("file."))
            .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
            .ThenBy(auditEvent => auditEvent.Action)
            .ToArrayAsync();
    }

    private static SettlementPaymentProofPayload ReadProofPayload(string content)
    {
        using var document = JsonDocument.Parse(content);
        var root = document.RootElement;
        Assert.Equal(
            [
                "contentType",
                "fileId",
                "settlementPaymentId",
                "sizeBytes",
                "updatedAtUtc",
                "uploadedAtUtc"
            ],
            root.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal).ToArray());

        return new SettlementPaymentProofPayload(
            root.GetProperty("fileId").GetGuid(),
            root.GetProperty("settlementPaymentId").GetGuid(),
            root.GetProperty("contentType").GetString()!,
            root.GetProperty("sizeBytes").GetInt64(),
            root.GetProperty("uploadedAtUtc").GetDateTimeOffset(),
            root.GetProperty("updatedAtUtc").GetDateTimeOffset());
    }

    private static IReadOnlyList<SettlementPaymentProofPayload> ReadProofListPayload(string content)
    {
        using var document = JsonDocument.Parse(content);
        var root = document.RootElement;
        Assert.Equal(["proofs"], root.EnumerateObject().Select(property => property.Name).ToArray());

        return root.GetProperty("proofs")
            .EnumerateArray()
            .Select(proof => new SettlementPaymentProofPayload(
                proof.GetProperty("fileId").GetGuid(),
                proof.GetProperty("settlementPaymentId").GetGuid(),
                proof.GetProperty("contentType").GetString()!,
                proof.GetProperty("sizeBytes").GetInt64(),
                proof.GetProperty("uploadedAtUtc").GetDateTimeOffset(),
                proof.GetProperty("updatedAtUtc").GetDateTimeOffset()))
            .ToArray();
    }

    private static void AssertSettlementProofFileObject(
        FileObject fileObject,
        Guid expectedUserProfileId,
        string expectedStatus,
        string expectedContentType,
        byte[] expectedBytes)
    {
        Assert.Equal(expectedUserProfileId, fileObject.OwnerUserProfileId);
        Assert.Equal(expectedUserProfileId, fileObject.CreatedByUserProfileId);
        Assert.Equal(FileObjectPurposes.SettlementProof, fileObject.Purpose);
        Assert.Equal(expectedStatus, fileObject.Status);
        Assert.Equal(expectedContentType, fileObject.ContentType);
        Assert.Equal(expectedBytes.LongLength, fileObject.SizeBytes);
        Assert.Equal(Convert.ToHexString(SHA256.HashData(expectedBytes)).ToLowerInvariant(), fileObject.Sha256Hash);
        Assert.Equal(StorageProviderNames.Local, fileObject.StorageProvider);
        Assert.Equal(FileObjectEncryptionModes.ServerManaged, fileObject.EncryptionMode);
        Assert.Null(fileObject.VaultKeyRef);
        Assert.Null(fileObject.RetentionPolicy);
        Assert.DoesNotContain("storage-root", fileObject.StorageObjectKey, StringComparison.OrdinalIgnoreCase);
    }

    private static void AssertProofAuditMetadata(
        AuthAuditEvent auditEvent,
        string expectedAction,
        Guid expectedSettlementRequestId,
        Guid expectedPaymentId,
        Guid expectedFileId,
        Guid expectedDebtorUserProfileId,
        Guid expectedCreditorUserProfileId,
        string expectedActionCategory,
        params string[] forbiddenValues)
    {
        Assert.Equal(expectedAction, auditEvent.Action);
        Assert.Equal(AuthAuditOutcomes.Success, auditEvent.Outcome);
        Assert.NotNull(auditEvent.SafeMetadataJson);
        Assert.True(auditEvent.SafeMetadataJson!.Length <= 4096);

        using var metadata = JsonDocument.Parse(auditEvent.SafeMetadataJson);
        Assert.Equal("settlement_payment_proof", metadata.RootElement.GetProperty("workflowName").GetString());
        Assert.Equal(expectedSettlementRequestId.ToString("D"), metadata.RootElement.GetProperty("settlementRequestId").GetString());
        Assert.Equal(expectedPaymentId.ToString("D"), metadata.RootElement.GetProperty("settlementPaymentId").GetString());
        Assert.Equal(expectedFileId.ToString("D"), metadata.RootElement.GetProperty("fileObjectId").GetString());
        Assert.Equal(expectedDebtorUserProfileId.ToString("D"), metadata.RootElement.GetProperty("debtorUserProfileId").GetString());
        Assert.Equal(expectedCreditorUserProfileId.ToString("D"), metadata.RootElement.GetProperty("creditorUserProfileId").GetString());
        Assert.Equal(expectedActionCategory, metadata.RootElement.GetProperty("actionCategory").GetString());
        Assert.Equal(SettlementPaymentStatuses.MarkedPaid, metadata.RootElement.GetProperty("paymentStatus").GetString());
        Assert.Equal("USD", metadata.RootElement.GetProperty("currency").GetString());
        Assert.Equal("2026-05-09", metadata.RootElement.GetProperty("paymentDate").GetString());

        AssertSafeAuditContent(auditEvent, forbiddenValues);
    }

    private static async Task AssertUnauthenticatedProblemAsync(
        HttpResponseMessage response,
        string? unexpectedResponseText = null)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content, unexpectedResponseText);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Unauthenticated", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(401, payload.RootElement.GetProperty("status").GetInt32());
    }

    private static async Task AssertSettlementPaymentUnavailableProblemAsync(
        HttpResponseMessage response,
        string? unexpectedResponseText = null)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content, unexpectedResponseText);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Settlement payment unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
    }

    private static async Task AssertInvalidProofUploadProblemAsync(
        HttpResponseMessage response,
        string unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content, unexpectedResponseText);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid settlement proof upload", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.True(payload.RootElement.TryGetProperty("errors", out _));
    }

    private static async Task AssertSettlementProofConflictProblemAsync(
        HttpResponseMessage response,
        string unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content, unexpectedResponseText);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Settlement proof conflict", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
    }

    private static void AssertSafeProblemContent(
        string content,
        string? unexpectedResponseText = null)
    {
        var lowerContent = content.ToLowerInvariant();
        if (unexpectedResponseText is not null)
        {
            Assert.DoesNotContain(unexpectedResponseText, content);
        }

        Assert.DoesNotContain(WrongRawToken, content);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("payload", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("objectkey", lowerContent);
        Assert.DoesNotContain("object_key", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
        Assert.DoesNotContain("vault", lowerContent);
        Assert.DoesNotContain("merchant", lowerContent);
        Assert.DoesNotContain("item", lowerContent);
        Assert.DoesNotContain("paymenthandle", lowerContent);
        Assert.DoesNotContain("paymentnote", lowerContent);
    }

    private static void AssertSafeProofJsonContent(
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
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("providerurl", lowerContent);
        Assert.DoesNotContain("storageobjectkey", lowerContent);
        Assert.DoesNotContain("storage_object_key", lowerContent);
        Assert.DoesNotContain("storagepath", lowerContent);
        Assert.DoesNotContain("rootpath", lowerContent);
        Assert.DoesNotContain("vault", lowerContent);
        Assert.DoesNotContain("paymenthandle", lowerContent);
        Assert.DoesNotContain("payment_handle", lowerContent);
        Assert.DoesNotContain("paymentnote", lowerContent);
        Assert.DoesNotContain("payment_note", lowerContent);
        Assert.DoesNotContain("merchant", lowerContent);
        Assert.DoesNotContain("item", lowerContent);
        Assert.DoesNotContain("ocr", lowerContent);
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
        Assert.DoesNotContain("request_body", lowerAuditText);
        Assert.DoesNotContain("token", lowerAuditText);
        Assert.DoesNotContain("password", lowerAuditText);
        Assert.DoesNotContain("credential", lowerAuditText);
        Assert.DoesNotContain("verifier", lowerAuditText);
        Assert.DoesNotContain("providerurl", lowerAuditText);
        Assert.DoesNotContain("storageobjectkey", lowerAuditText);
        Assert.DoesNotContain("storage_object_key", lowerAuditText);
        Assert.DoesNotContain("path", lowerAuditText);
        Assert.DoesNotContain("vault", lowerAuditText);
        Assert.DoesNotContain("filename", lowerAuditText);
        Assert.DoesNotContain("merchant", lowerAuditText);
        Assert.DoesNotContain("item", lowerAuditText);
    }

    private static string ProofPath(Guid paymentId)
    {
        return $"/api/v1/settlement-payments/{paymentId:D}/proof";
    }

    private static string ProofFilePath(Guid paymentId, Guid fileId)
    {
        return $"/api/v1/settlement-payments/{paymentId:D}/proof/{fileId:D}";
    }

    private static string ProofContentPath(Guid paymentId, Guid fileId)
    {
        return $"/api/v1/settlement-payments/{paymentId:D}/proof/{fileId:D}/content";
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
        SettlementPaymentProofTestTimeProvider TimeProvider,
        TestSettlementProofStorageProvider StorageProvider);

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

    private sealed record SettlementPaymentProofPayload(
        Guid FileId,
        Guid SettlementPaymentId,
        string ContentType,
        long SizeBytes,
        DateTimeOffset UploadedAtUtc,
        DateTimeOffset UpdatedAtUtc);

    private sealed class SettlementPaymentProofTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public SettlementPaymentProofTestTimeProvider(DateTimeOffset utcNow)
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

    private sealed class TestSettlementProofStorageProvider : IFileObjectStorageProvider
    {
        private readonly Dictionary<string, byte[]> storedObjects = new(StringComparer.Ordinal);

        public string ProviderName => StorageProviderNames.Local;

        public bool FailWrites { get; set; }

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

        public async Task WriteAsync(string objectKey, Stream content, CancellationToken cancellationToken)
        {
            if (FailWrites)
            {
                throw new IOException("Simulated proof storage write failure.");
            }

            await using var buffer = new MemoryStream();
            await content.CopyToAsync(buffer, cancellationToken);
            storedObjects.Add(objectKey, buffer.ToArray());
        }

        public Task<Stream> OpenReadAsync(string objectKey, CancellationToken cancellationToken)
        {
            if (!storedObjects.TryGetValue(objectKey, out var bytes))
            {
                throw new FileNotFoundException("Simulated missing proof object.");
            }

            Stream stream = new MemoryStream(bytes, writable: false);
            return Task.FromResult(stream);
        }

        public Task DeleteAsync(string objectKey, CancellationToken cancellationToken)
        {
            storedObjects.Remove(objectKey);
            return Task.CompletedTask;
        }

        public void SeedObject(string objectKey, byte[] bytes)
        {
            storedObjects[objectKey] = bytes;
        }

        public byte[] ReadStoredBytes(string objectKey)
        {
            return storedObjects[objectKey];
        }
    }
}
