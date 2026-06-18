using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
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
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Storage;

namespace Settleora.Api.Tests;

public sealed class BillAttachmentEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string WrongRawToken = "visible-wrong-bill-attachment-session-token";
    private const string HiddenMerchantName = "Hidden Bill Attachment Merchant";
    private const string HiddenItemName = "Hidden Bill Attachment Item";
    private const string HiddenOriginalFilename = "secret-bill-attachment.pdf";
    private const string HiddenStorageObjectKey = "hidden/bill/attachment/object-key";
    private const string AttachmentAttachedAction = "bill_attachment.attached";
    private const string AttachmentRemovedAction = "bill_attachment.removed";
    private const string AttachmentReadAction = "bill_attachment.content_read";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 12, 0, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 12, 0, 15, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 5, 12, 0, 30, 0, TimeSpan.Zero);
    private static readonly byte[] ValidPngBytes = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x01];
    private static readonly byte[] ValidPdfBytes = [0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A, 0x25, 0x45, 0x4F, 0x46];

    private readonly WebApplicationFactory<Program> factory;

    public BillAttachmentEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task PersonalBillOwnerCanUploadParticipantCanReadAndOwnerCanRemoveAttachmentWithSafeMetadataStorageAndAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Personal Attachment Owner");
        var participant = await SeedAccountAsync(testFactory, "Personal Attachment Participant", InitialTimestamp.AddMinutes(1));
        var participantSession = await SeedSessionForAccountAsync(testFactory, testContext.TimeProvider, participant);
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId, participant.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(2));
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();

        using var uploadRequest = CreateAttachmentUploadRequest(
            PersonalAttachmentPath(billId),
            ownerSession.RawSessionToken,
            ExpenseBillAttachmentPurposes.Receipt,
            ValidPngBytes,
            "image/png",
            HiddenOriginalFilename);
        using var uploadResponse = await client.SendAsync(uploadRequest);
        var uploadContent = await uploadResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, uploadResponse.StatusCode);
        AssertSafeAttachmentJsonContent(uploadContent, HiddenOriginalFilename, HiddenStorageObjectKey, HiddenMerchantName, HiddenItemName);
        var attachment = ReadAttachmentPayload(uploadContent);
        Assert.Equal(billId, attachment.BillId);
        Assert.Equal(ExpenseBillAttachmentPurposes.Receipt, attachment.Purpose);
        Assert.Equal("image/png", attachment.ContentType);
        Assert.Equal(ValidPngBytes.LongLength, attachment.SizeBytes);
        Assert.Equal(WriteTimestamp, attachment.UploadedAtUtc);
        Assert.Equal(WriteTimestamp, attachment.UpdatedAtUtc);
        Assert.Equal(PersonalAttachmentContentPath(billId, attachment.FileId), uploadResponse.Headers.Location?.OriginalString);

        var fileObject = await ReadFileObjectAsync(testFactory, attachment.FileId);
        AssertBillAttachmentFileObject(
            fileObject,
            ownerSession.UserProfileId,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            "image/png",
            ValidPngBytes);
        Assert.Null(fileObject.OriginalFilename);
        Assert.DoesNotContain(HiddenOriginalFilename, fileObject.StorageObjectKey, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(ValidPngBytes, testContext.StorageProvider.ReadStoredBytes(fileObject.StorageObjectKey));

        var savedAttachment = await ReadBillAttachmentAsync(testFactory, billId, attachment.FileId);
        Assert.Equal(ownerSession.UserProfileId, savedAttachment.CreatedByUserProfileId);
        Assert.Equal(ExpenseBillAttachmentPurposes.Receipt, savedAttachment.Purpose);
        Assert.Null(savedAttachment.RemovedAtUtc);

        using (var listRequest = CreateBearerRequest(HttpMethod.Get, PersonalAttachmentPath(billId), ownerSession.RawSessionToken))
        using (var listResponse = await client.SendAsync(listRequest))
        {
            var listContent = await listResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
            AssertSafeAttachmentJsonContent(listContent, HiddenOriginalFilename, HiddenStorageObjectKey);
            Assert.Equal(attachment, Assert.Single(ReadAttachmentListPayload(listContent)));
        }

        using (var contentRequest = CreateBearerRequest(
            HttpMethod.Get,
            PersonalAttachmentContentPath(billId, attachment.FileId),
            participantSession.RawSessionToken))
        using (var contentResponse = await client.SendAsync(contentRequest))
        {
            Assert.Equal(HttpStatusCode.OK, contentResponse.StatusCode);
            Assert.Equal("image/png", contentResponse.Content.Headers.ContentType?.MediaType);
            Assert.Equal(ValidPngBytes, await contentResponse.Content.ReadAsByteArrayAsync());
            Assert.True(contentResponse.Headers.TryGetValues("X-Content-Type-Options", out var nosniffValues));
            Assert.Contains("nosniff", nosniffValues);
            Assert.True(contentResponse.Content.Headers.TryGetValues("Content-Disposition", out var dispositionValues));
            Assert.Contains("attachment", dispositionValues);
        }

        using (var deleteRequest = CreateBearerRequest(
            HttpMethod.Delete,
            PersonalAttachmentFilePath(billId, attachment.FileId),
            ownerSession.RawSessionToken))
        using (var deleteResponse = await client.SendAsync(deleteRequest))
        {
            Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);
        }

        var removedAttachment = await ReadBillAttachmentAsync(testFactory, billId, attachment.FileId);
        Assert.Equal(WriteTimestamp, removedAttachment.RemovedAtUtc);
        var deletedFileObject = await ReadFileObjectAsync(testFactory, attachment.FileId);
        Assert.Equal(FileObjectStatuses.Deleted, deletedFileObject.Status);
        Assert.Equal(WriteTimestamp, deletedFileObject.DeletedAtUtc);

        var billAttachmentAudits = await ReadBillAttachmentAuditEventsAsync(testFactory);
        Assert.Equal([AttachmentAttachedAction, AttachmentReadAction, AttachmentRemovedAction], billAttachmentAudits.Select(audit => audit.Action).ToArray());
        AssertAttachmentAuditMetadata(
            billAttachmentAudits[0],
            AttachmentAttachedAction,
            billId,
            groupId: null,
            attachment.FileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            "attachment_attached",
            HiddenOriginalFilename,
            HiddenStorageObjectKey);
        AssertAttachmentAuditMetadata(
            billAttachmentAudits[1],
            AttachmentReadAction,
            billId,
            groupId: null,
            attachment.FileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            "attachment_content_read",
            HiddenOriginalFilename,
            HiddenStorageObjectKey);
        AssertAttachmentAuditMetadata(
            billAttachmentAudits[2],
            AttachmentRemovedAction,
            billId,
            groupId: null,
            attachment.FileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            "attachment_removed",
            HiddenOriginalFilename,
            HiddenStorageObjectKey);

        var lifecycleActions = (await ReadFileLifecycleAuditEventsAsync(testFactory))
            .Select(audit => audit.Action)
            .Order(StringComparer.Ordinal)
            .ToArray();
        Assert.Equal(["file.deleted", "file.upload_completed", "file.upload_started"], lifecycleActions);
    }

    [Fact]
    public async Task GroupBillOwnerCanUploadParticipantCanReadAndOwnerCanRemoveSupportingAttachment()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Attachment Owner");
        var participant = await SeedAccountAsync(testFactory, "Group Attachment Participant", InitialTimestamp.AddMinutes(1));
        var participantSession = await SeedSessionForAccountAsync(testFactory, testContext.TimeProvider, participant);
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Bill Attachment Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(participant.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId, participant.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(2));
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();

        using var uploadRequest = CreateAttachmentUploadRequest(
            GroupAttachmentPath(groupId, billId),
            ownerSession.RawSessionToken,
            ExpenseBillAttachmentPurposes.SupportingAttachment,
            ValidPdfBytes,
            "application/pdf",
            HiddenOriginalFilename);
        using var uploadResponse = await client.SendAsync(uploadRequest);
        var uploadContent = await uploadResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, uploadResponse.StatusCode);
        var attachment = ReadAttachmentPayload(uploadContent);
        Assert.Equal(ExpenseBillAttachmentPurposes.SupportingAttachment, attachment.Purpose);
        Assert.Equal("application/pdf", attachment.ContentType);
        Assert.Equal(GroupAttachmentContentPath(groupId, billId, attachment.FileId), uploadResponse.Headers.Location?.OriginalString);

        var fileObject = await ReadFileObjectAsync(testFactory, attachment.FileId);
        AssertBillAttachmentFileObject(
            fileObject,
            ownerSession.UserProfileId,
            FileObjectPurposes.SupportingAttachment,
            FileObjectStatuses.Active,
            "application/pdf",
            ValidPdfBytes);

        using (var listRequest = CreateBearerRequest(HttpMethod.Get, GroupAttachmentPath(groupId, billId), participantSession.RawSessionToken))
        using (var listResponse = await client.SendAsync(listRequest))
        {
            var listContent = await listResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
            Assert.Equal(attachment, Assert.Single(ReadAttachmentListPayload(listContent)));
        }

        using (var contentRequest = CreateBearerRequest(
            HttpMethod.Get,
            GroupAttachmentContentPath(groupId, billId, attachment.FileId),
            participantSession.RawSessionToken))
        using (var contentResponse = await client.SendAsync(contentRequest))
        {
            Assert.Equal(HttpStatusCode.OK, contentResponse.StatusCode);
            Assert.Equal("application/pdf", contentResponse.Content.Headers.ContentType?.MediaType);
            Assert.Equal(ValidPdfBytes, await contentResponse.Content.ReadAsByteArrayAsync());
        }

        using (var deleteRequest = CreateBearerRequest(
            HttpMethod.Delete,
            GroupAttachmentFilePath(groupId, billId, attachment.FileId),
            ownerSession.RawSessionToken))
        using (var deleteResponse = await client.SendAsync(deleteRequest))
        {
            Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);
        }

        Assert.Equal(WriteTimestamp, (await ReadBillAttachmentAsync(testFactory, billId, attachment.FileId)).RemovedAtUtc);
        Assert.Equal(FileObjectStatuses.Deleted, (await ReadFileObjectAsync(testFactory, attachment.FileId)).Status);
    }

    [Fact]
    public async Task GroupAttachmentRoutesRequireRouteBillFileCouplingWithoutStorageReadOrAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Attachment Route Owner");
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Attachment Route Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var otherGroupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Attachment Body Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var routeBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(2));
        var otherBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            otherGroupId,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(3));
        var routeFileId = await SeedBillAttachmentAsync(
            testFactory,
            testContext.StorageProvider,
            routeBillId,
            ownerSession.UserProfileId,
            ValidPngBytes,
            "image/png",
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var otherFileId = await SeedBillAttachmentAsync(
            testFactory,
            testContext.StorageProvider,
            otherBillId,
            ownerSession.UserProfileId,
            ValidPngBytes,
            "image/png",
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        using var client = testFactory.CreateClient();

        using (var crossFileReadRequest = CreateBearerRequest(
            HttpMethod.Get,
            GroupAttachmentContentPath(groupId, routeBillId, otherFileId),
            ownerSession.RawSessionToken))
        using (var crossFileReadResponse = await client.SendAsync(crossFileReadRequest))
        {
            await AssertBillUnavailableProblemAsync(crossFileReadResponse);
        }

        using (var crossGroupReadRequest = CreateBearerRequest(
            HttpMethod.Get,
            GroupAttachmentContentPath(otherGroupId, routeBillId, routeFileId),
            ownerSession.RawSessionToken))
        using (var crossGroupReadResponse = await client.SendAsync(crossGroupReadRequest))
        {
            await AssertBillUnavailableProblemAsync(crossGroupReadResponse);
        }

        using (var crossFileRemoveRequest = CreateBearerRequest(
            HttpMethod.Delete,
            GroupAttachmentFilePath(groupId, routeBillId, otherFileId),
            ownerSession.RawSessionToken))
        using (var crossFileRemoveResponse = await client.SendAsync(crossFileRemoveRequest))
        {
            await AssertBillUnavailableProblemAsync(crossFileRemoveResponse);
        }

        Assert.Equal(0, testContext.StorageProvider.OpenReadCount);
        Assert.Null((await ReadBillAttachmentAsync(testFactory, routeBillId, routeFileId)).RemovedAtUtc);
        Assert.Null((await ReadBillAttachmentAsync(testFactory, otherBillId, otherFileId)).RemovedAtUtc);
        Assert.Equal(FileObjectStatuses.Active, (await ReadFileObjectAsync(testFactory, routeFileId)).Status);
        Assert.Equal(FileObjectStatuses.Active, (await ReadFileObjectAsync(testFactory, otherFileId)).Status);
        Assert.Empty(await ReadBillAttachmentAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task UnrelatedActorsRemovedGroupMembersAndVisibleParticipantsWithoutWritePermissionFailClosed()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Denied Attachment Owner");
        var participant = await SeedAccountAsync(testFactory, "Denied Attachment Participant", InitialTimestamp.AddMinutes(1));
        var participantSession = await SeedSessionForAccountAsync(testFactory, testContext.TimeProvider, participant);
        var outsiderSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Denied Attachment Outsider");
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Denied Bill Attachment Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(participant.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(outsiderSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId, participant.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(2));
        var attachmentFileId = await SeedBillAttachmentAsync(
            testFactory,
            testContext.StorageProvider,
            billId,
            ownerSession.UserProfileId,
            ValidPngBytes,
            "image/png",
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        using var client = testFactory.CreateClient();

        using (var outsiderListRequest = CreateBearerRequest(HttpMethod.Get, GroupAttachmentPath(groupId, billId), outsiderSession.RawSessionToken))
        using (var outsiderListResponse = await client.SendAsync(outsiderListRequest))
        {
            await AssertBillUnavailableProblemAsync(outsiderListResponse);
        }

        using (var participantUploadRequest = CreateAttachmentUploadRequest(
            GroupAttachmentPath(groupId, billId),
            participantSession.RawSessionToken,
            ExpenseBillAttachmentPurposes.Receipt,
            ValidPngBytes,
            "image/png",
            "participant-secret.png"))
        using (var participantUploadResponse = await client.SendAsync(participantUploadRequest))
        {
            await AssertBillUnavailableProblemAsync(participantUploadResponse, "participant-secret.png");
        }

        using (var participantRemoveRequest = CreateBearerRequest(
            HttpMethod.Delete,
            GroupAttachmentFilePath(groupId, billId, attachmentFileId),
            participantSession.RawSessionToken))
        using (var participantRemoveResponse = await client.SendAsync(participantRemoveRequest))
        {
            await AssertBillUnavailableProblemAsync(participantRemoveResponse);
        }

        await UpdateMembershipStatusAsync(testFactory, groupId, participant.UserProfileId, GroupMembershipStatuses.Removed);

        using (var removedMemberReadRequest = CreateBearerRequest(
            HttpMethod.Get,
            GroupAttachmentContentPath(groupId, billId, attachmentFileId),
            participantSession.RawSessionToken))
        using (var removedMemberReadResponse = await client.SendAsync(removedMemberReadRequest))
        {
            await AssertBillUnavailableProblemAsync(removedMemberReadResponse);
        }

        Assert.Equal(0, testContext.StorageProvider.WriteCount);
        Assert.Equal(0, testContext.StorageProvider.OpenReadCount);
        Assert.Single(await ReadFileObjectsAsync(testFactory));
        Assert.Empty(await ReadBillAttachmentAuditEventsAsync(testFactory));
        Assert.Empty(await ReadFileLifecycleAuditEventsAsync(testFactory));
        Assert.Null((await ReadBillAttachmentAsync(testFactory, billId, attachmentFileId)).RemovedAtUtc);
        Assert.Equal(FileObjectStatuses.Active, (await ReadFileObjectAsync(testFactory, attachmentFileId)).Status);
    }

    [Fact]
    public async Task ArchivedFinalizedAndMalformedAttachmentsFailClosedWithoutOrphanActiveRows()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "State Attachment Owner");
        var archivedBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: InitialTimestamp.AddMinutes(5),
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(2));
        var finalizedBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            ExpenseBillStatuses.Finalized,
            archivedAtUtc: null,
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(3));
        var readableFileId = await SeedBillAttachmentAsync(
            testFactory,
            testContext.StorageProvider,
            finalizedBillId,
            ownerSession.UserProfileId,
            ValidPngBytes,
            "image/png",
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var wrongPurposeFileId = await SeedBillAttachmentAsync(
            testFactory,
            testContext.StorageProvider,
            finalizedBillId,
            ownerSession.UserProfileId,
            ValidPngBytes,
            "image/png",
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.PaymentQr,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var deletedFileId = await SeedBillAttachmentAsync(
            testFactory,
            testContext.StorageProvider,
            finalizedBillId,
            ownerSession.UserProfileId,
            ValidPngBytes,
            "image/png",
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Deleted,
            removedAtUtc: null);
        var removedFileId = await SeedBillAttachmentAsync(
            testFactory,
            testContext.StorageProvider,
            finalizedBillId,
            ownerSession.UserProfileId,
            ValidPngBytes,
            "image/png",
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: InitialTimestamp.AddMinutes(8));
        using var client = testFactory.CreateClient();

        using (var archivedRequest = CreateBearerRequest(HttpMethod.Get, PersonalAttachmentPath(archivedBillId), ownerSession.RawSessionToken))
        using (var archivedResponse = await client.SendAsync(archivedRequest))
        {
            await AssertBillUnavailableProblemAsync(archivedResponse);
        }

        using (var finalizedUploadRequest = CreateAttachmentUploadRequest(
            PersonalAttachmentPath(finalizedBillId),
            ownerSession.RawSessionToken,
            ExpenseBillAttachmentPurposes.Receipt,
            ValidPngBytes,
            "image/png",
            "finalized-secret.png"))
        using (var finalizedUploadResponse = await client.SendAsync(finalizedUploadRequest))
        {
            await AssertBillAttachmentConflictProblemAsync(finalizedUploadResponse, "finalized-secret.png");
        }

        using (var listRequest = CreateBearerRequest(HttpMethod.Get, PersonalAttachmentPath(finalizedBillId), ownerSession.RawSessionToken))
        using (var listResponse = await client.SendAsync(listRequest))
        {
            var content = await listResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
            Assert.Equal(readableFileId, Assert.Single(ReadAttachmentListPayload(content)).FileId);
        }

        foreach (var blockedFileId in new[] { wrongPurposeFileId, deletedFileId, removedFileId })
        {
            using var readRequest = CreateBearerRequest(
                HttpMethod.Get,
                PersonalAttachmentContentPath(finalizedBillId, blockedFileId),
                ownerSession.RawSessionToken);
            using var readResponse = await client.SendAsync(readRequest);
            await AssertBillUnavailableProblemAsync(readResponse);
        }

        Assert.Equal(0, testContext.StorageProvider.WriteCount);
        Assert.Equal(0, testContext.StorageProvider.OpenReadCount);
        Assert.Equal(4, (await ReadFileObjectsAsync(testFactory)).Count);
        Assert.Empty(await ReadBillAttachmentAuditEventsAsync(testFactory));
        Assert.Empty(await ReadFileLifecycleAuditEventsAsync(testFactory));
        Assert.Null((await ReadBillAttachmentAsync(testFactory, finalizedBillId, readableFileId)).RemovedAtUtc);
    }

    [Fact]
    public async Task InvalidUploadsAndStorageWriteFailureDoNotCreateActiveAttachmentRowsOrLeakSensitiveInput()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Invalid Attachment Owner");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(2));
        using var client = testFactory.CreateClient();

        using (var missingAuthRequest = CreateAttachmentUploadRequest(
            PersonalAttachmentPath(billId),
            rawSessionToken: null,
            ExpenseBillAttachmentPurposes.Receipt,
            ValidPngBytes,
            "image/png",
            "missing-auth-secret.png"))
        using (var missingAuthResponse = await client.SendAsync(missingAuthRequest))
        {
            await AssertUnauthenticatedProblemAsync(missingAuthResponse, "missing-auth-secret.png");
        }

        using (var invalidTokenRequest = CreateBearerRequest(HttpMethod.Get, PersonalAttachmentPath(billId), WrongRawToken))
        using (var invalidTokenResponse = await client.SendAsync(invalidTokenRequest))
        {
            await AssertUnauthenticatedProblemAsync(invalidTokenResponse, WrongRawToken);
        }

        using (var unsupportedPurposeRequest = CreateAttachmentUploadRequest(
            PersonalAttachmentPath(billId),
            ownerSession.RawSessionToken,
            "storage_path",
            ValidPngBytes,
            "image/png",
            "bad-purpose-secret.png"))
        using (var unsupportedPurposeResponse = await client.SendAsync(unsupportedPurposeRequest))
        {
            await AssertInvalidBillAttachmentUploadProblemAsync(unsupportedPurposeResponse, "bad-purpose-secret.png");
        }

        using (var receiptPdfRequest = CreateAttachmentUploadRequest(
            PersonalAttachmentPath(billId),
            ownerSession.RawSessionToken,
            ExpenseBillAttachmentPurposes.Receipt,
            ValidPdfBytes,
            "application/pdf",
            "receipt-pdf-secret.pdf"))
        using (var receiptPdfResponse = await client.SendAsync(receiptPdfRequest))
        {
            await AssertInvalidBillAttachmentUploadProblemAsync(receiptPdfResponse, "receipt-pdf-secret.pdf");
        }

        using (var mismatchRequest = CreateAttachmentUploadRequest(
            PersonalAttachmentPath(billId),
            ownerSession.RawSessionToken,
            ExpenseBillAttachmentPurposes.SupportingAttachment,
            ValidPngBytes,
            "application/pdf",
            "mismatch-secret.pdf"))
        using (var mismatchResponse = await client.SendAsync(mismatchRequest))
        {
            await AssertInvalidBillAttachmentUploadProblemAsync(mismatchResponse, "mismatch-secret.pdf");
        }

        Assert.Empty(await ReadBillAttachmentsAsync(testFactory));
        Assert.Empty(await ReadFileObjectsAsync(testFactory));
        Assert.Empty(await ReadBillAttachmentAuditEventsAsync(testFactory));
        Assert.Equal(0, testContext.StorageProvider.WriteCount);
        Assert.Equal(0, testContext.StorageProvider.OpenReadCount);

        testContext.StorageProvider.FailWrites = true;
        using (var storageFailureRequest = CreateAttachmentUploadRequest(
            PersonalAttachmentPath(billId),
            ownerSession.RawSessionToken,
            ExpenseBillAttachmentPurposes.SupportingAttachment,
            ValidPdfBytes,
            "application/pdf",
            "storage-failure-secret.pdf"))
        using (var storageFailureResponse = await client.SendAsync(storageFailureRequest))
        {
            var content = await storageFailureResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.InternalServerError, storageFailureResponse.StatusCode);
            AssertSafeProblemContent(content, "storage-failure-secret.pdf");
        }

        Assert.Empty(await ReadBillAttachmentsAsync(testFactory));
        Assert.Empty(await ReadBillAttachmentAuditEventsAsync(testFactory));
        var failedFileObject = Assert.Single(await ReadFileObjectsAsync(testFactory));
        Assert.Equal(FileObjectPurposes.SupportingAttachment, failedFileObject.Purpose);
        Assert.Equal(FileObjectStatuses.UploadFailed, failedFileObject.Status);
        Assert.Equal(ownerSession.UserProfileId, failedFileObject.OwnerUserProfileId);
    }

    [Fact]
    public void OpenApiAndGeneratedClientsExposeBillAttachmentOperationsAndNoGenericFileApi()
    {
        var openApi = File.ReadAllText(FindRepoFile("packages/contracts/openapi/settleora.v1.yaml"));
        var personalBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/bills/{billId}/attachments:");
        var personalFileBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/bills/{billId}/attachments/{fileId}:");
        var personalContentBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/bills/{billId}/attachments/{fileId}/content:");
        var groupBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/groups/{groupId}/bills/{billId}/attachments:");
        var groupFileBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}:");
        var groupContentBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/content:");
        var responseSchema = ExtractOpenApiSchemaBlock(openApi, "BillAttachmentResponse:");
        var listSchema = ExtractOpenApiSchemaBlock(openApi, "BillAttachmentListResponse:");
        var uploadSchema = ExtractOpenApiSchemaBlock(openApi, "AttachBillAttachmentRequest:");

        Assert.Contains("operationId: attachPersonalBillAttachment", personalBlock);
        Assert.Contains("operationId: listPersonalBillAttachments", personalBlock);
        Assert.Contains("operationId: removePersonalBillAttachment", personalFileBlock);
        Assert.Contains("operationId: getPersonalBillAttachmentContent", personalContentBlock);
        Assert.Contains("operationId: attachGroupBillAttachment", groupBlock);
        Assert.Contains("operationId: listGroupBillAttachments", groupBlock);
        Assert.Contains("operationId: removeGroupBillAttachment", groupFileBlock);
        Assert.Contains("operationId: getGroupBillAttachmentContent", groupContentBlock);
        Assert.Contains("multipart/form-data", personalBlock);
        Assert.Contains("multipart/form-data", groupBlock);
        Assert.Contains("receipt", uploadSchema);
        Assert.Contains("supporting_attachment", uploadSchema);
        Assert.Contains("maxLength: 5242880", uploadSchema);
        Assert.Contains("attachments", listSchema);
        Assert.Contains("fileId", responseSchema);
        Assert.Contains("billId", responseSchema);
        Assert.Contains("purpose", responseSchema);
        Assert.Contains("image/png", personalContentBlock);
        Assert.Contains("application/pdf", groupContentBlock);
        Assert.DoesNotContain("storageObjectKey", responseSchema + listSchema);
        Assert.DoesNotContain("storagePath", responseSchema + listSchema);
        Assert.DoesNotContain("providerUrl", responseSchema + listSchema);
        Assert.DoesNotContain("originalFilename", responseSchema + listSchema);
        Assert.DoesNotContain("/api/v1/files", openApi);

        var webClient = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/client.ts"));
        var dartClient = File.ReadAllText(FindRepoFile("packages/client-dart/lib/generated/client.dart"));
        var webModels = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/models.ts"));
        var dartModels = File.ReadAllText(FindRepoFile("packages/client-dart/lib/generated/models.dart"));

        Assert.Contains("attachPersonalBillAttachment", webClient);
        Assert.Contains("listPersonalBillAttachments", webClient);
        Assert.Contains("getPersonalBillAttachmentContent", webClient);
        Assert.Contains("removePersonalBillAttachment", webClient);
        Assert.Contains("attachGroupBillAttachment", dartClient);
        Assert.Contains("listGroupBillAttachments", dartClient);
        Assert.Contains("getGroupBillAttachmentContent", dartClient);
        Assert.Contains("removeGroupBillAttachment", dartClient);
        Assert.Contains("BillAttachmentResponse", webModels);
        Assert.Contains("BillAttachmentListResponse", webModels);
        Assert.Contains("class BillAttachmentResponse", dartModels);
        Assert.Contains("class BillAttachmentListResponse", dartModels);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new BillAttachmentTestTimeProvider(InitialTimestamp);
        var storageProvider = new TestBillAttachmentStorageProvider();
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

    private static HttpRequestMessage CreateAttachmentUploadRequest(
        string path,
        string? rawSessionToken,
        string purpose,
        byte[] bytes,
        string? contentType,
        string filename,
        string fieldName = "file")
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path);
        if (rawSessionToken is not null)
        {
            request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");
        }

        var form = new MultipartFormDataContent();
        form.Add(new StringContent(purpose, Encoding.UTF8), "purpose");
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
        BillAttachmentTestTimeProvider timeProvider,
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
        BillAttachmentTestTimeProvider timeProvider,
        SeededAccount account)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Bill attachment endpoint test",
                UserAgentSummary: "Bill attachment endpoint test user agent",
                NetworkAddressHash: "bill-attachment-endpoint-test-network",
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
        Guid ownerProfileId,
        Guid? groupId,
        string status,
        DateTimeOffset? archivedAtUtc,
        IReadOnlyList<Guid> participantIds,
        IReadOnlyList<Guid> payerIds,
        DateTimeOffset createdAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var billId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var totalAmount = participantIds.Count * 10m;
        var bill = new ExpenseBill
        {
            Id = billId,
            CreatedByUserProfileId = ownerProfileId,
            BillOwnerUserProfileId = ownerProfileId,
            GroupId = groupId,
            MerchantName = HiddenMerchantName,
            BillDate = DateOnly.FromDateTime(createdAtUtc.UtcDateTime),
            Status = status,
            TotalAmount = totalAmount,
            TotalCurrency = "USD",
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
            Currency = "USD",
            SortOrder = 0,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        };

        for (var index = 0; index < participantIds.Count; index++)
        {
            var participantId = participantIds[index];
            bill.Participants.Add(new ExpenseBillParticipant
            {
                ExpenseBillId = billId,
                UserProfileId = participantId,
                Status = ExpenseBillParticipantStatuses.Accepted,
                ResolvedShareAmount = 10m,
                ResolvedShareCurrency = "USD",
                AcceptedAtUtc = createdAtUtc,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
            item.Splits.Add(new ExpenseBillItemSplit
            {
                Id = Guid.NewGuid(),
                ExpenseBillItemId = itemId,
                UserProfileId = participantId,
                SplitMethod = ExpenseBillItemSplitMethods.ExactAmount,
                BasisValue = 10m,
                ResolvedAmount = 10m,
                ResolvedCurrency = "USD",
                AllocationOrder = index,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        bill.Items.Add(item);
        foreach (var payerId in payerIds)
        {
            bill.Payers.Add(new ExpenseBillPayer
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = billId,
                UserProfileId = payerId,
                Amount = totalAmount,
                Currency = "USD",
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        dbContext.Set<ExpenseBill>().Add(bill);
        await dbContext.SaveChangesAsync();
        return billId;
    }

    private static async Task<Guid> SeedBillAttachmentAsync(
        WebApplicationFactory<Program> testFactory,
        TestBillAttachmentStorageProvider storageProvider,
        Guid billId,
        Guid fileOwnerUserProfileId,
        byte[] bytes,
        string contentType,
        string attachmentPurpose,
        string fileObjectPurpose,
        string status,
        DateTimeOffset? removedAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var fileObjectId = Guid.NewGuid();
        var storageObjectKey = $"file-objects/{fileObjectPurpose}/2026/05/12/{fileObjectId:N}";
        dbContext.Set<FileObject>().Add(new FileObject
        {
            Id = fileObjectId,
            OwnerUserProfileId = fileOwnerUserProfileId,
            CreatedByUserProfileId = fileOwnerUserProfileId,
            Purpose = fileObjectPurpose,
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
        dbContext.Set<ExpenseBillAttachment>().Add(new ExpenseBillAttachment
        {
            ExpenseBillId = billId,
            FileObjectId = fileObjectId,
            Purpose = attachmentPurpose,
            CreatedByUserProfileId = fileOwnerUserProfileId,
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

    private static async Task<ExpenseBillAttachment> ReadBillAttachmentAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId,
        Guid fileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ExpenseBillAttachment>()
            .AsNoTracking()
            .SingleAsync(attachment => attachment.ExpenseBillId == billId
                && attachment.FileObjectId == fileId);
    }

    private static async Task<IReadOnlyList<ExpenseBillAttachment>> ReadBillAttachmentsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ExpenseBillAttachment>()
            .AsNoTracking()
            .OrderBy(attachment => attachment.CreatedAtUtc)
            .ToArrayAsync();
    }

    private static async Task<IReadOnlyList<AuthAuditEvent>> ReadBillAttachmentAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthAuditEvent>()
            .AsNoTracking()
            .Where(auditEvent => auditEvent.Action.StartsWith("bill_attachment."))
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

    private static BillAttachmentPayload ReadAttachmentPayload(string content)
    {
        using var document = JsonDocument.Parse(content);
        var root = document.RootElement;
        Assert.Equal(
            [
                "billId",
                "contentType",
                "fileId",
                "purpose",
                "sizeBytes",
                "updatedAtUtc",
                "uploadedAtUtc"
            ],
            root.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal).ToArray());

        return new BillAttachmentPayload(
            root.GetProperty("fileId").GetGuid(),
            root.GetProperty("billId").GetGuid(),
            root.GetProperty("purpose").GetString()!,
            root.GetProperty("contentType").GetString()!,
            root.GetProperty("sizeBytes").GetInt64(),
            root.GetProperty("uploadedAtUtc").GetDateTimeOffset(),
            root.GetProperty("updatedAtUtc").GetDateTimeOffset());
    }

    private static IReadOnlyList<BillAttachmentPayload> ReadAttachmentListPayload(string content)
    {
        using var document = JsonDocument.Parse(content);
        var root = document.RootElement;
        Assert.Equal(["attachments"], root.EnumerateObject().Select(property => property.Name).ToArray());

        return root.GetProperty("attachments")
            .EnumerateArray()
            .Select(attachment => new BillAttachmentPayload(
                attachment.GetProperty("fileId").GetGuid(),
                attachment.GetProperty("billId").GetGuid(),
                attachment.GetProperty("purpose").GetString()!,
                attachment.GetProperty("contentType").GetString()!,
                attachment.GetProperty("sizeBytes").GetInt64(),
                attachment.GetProperty("uploadedAtUtc").GetDateTimeOffset(),
                attachment.GetProperty("updatedAtUtc").GetDateTimeOffset()))
            .ToArray();
    }

    private static void AssertBillAttachmentFileObject(
        FileObject fileObject,
        Guid expectedUserProfileId,
        string expectedPurpose,
        string expectedStatus,
        string expectedContentType,
        byte[] expectedBytes)
    {
        Assert.Equal(expectedUserProfileId, fileObject.OwnerUserProfileId);
        Assert.Equal(expectedUserProfileId, fileObject.CreatedByUserProfileId);
        Assert.Equal(expectedPurpose, fileObject.Purpose);
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

    private static void AssertAttachmentAuditMetadata(
        AuthAuditEvent auditEvent,
        string expectedAction,
        Guid expectedBillId,
        Guid? groupId,
        Guid expectedFileId,
        string expectedAttachmentPurpose,
        string expectedFilePurpose,
        string expectedActionCategory,
        params string[] forbiddenValues)
    {
        Assert.Equal(expectedAction, auditEvent.Action);
        Assert.Equal(AuthAuditOutcomes.Success, auditEvent.Outcome);
        Assert.NotNull(auditEvent.SafeMetadataJson);
        Assert.True(auditEvent.SafeMetadataJson!.Length <= 4096);

        using var metadata = JsonDocument.Parse(auditEvent.SafeMetadataJson);
        Assert.Equal("bill_attachment_file", metadata.RootElement.GetProperty("workflowName").GetString());
        Assert.Equal(expectedBillId.ToString("D"), metadata.RootElement.GetProperty("billId").GetString());
        if (groupId.HasValue)
        {
            Assert.Equal(groupId.Value.ToString("D"), metadata.RootElement.GetProperty("groupId").GetString());
            Assert.Equal("group", metadata.RootElement.GetProperty("groupMode").GetString());
        }
        else
        {
            Assert.False(metadata.RootElement.TryGetProperty("groupId", out _));
            Assert.Equal("personal", metadata.RootElement.GetProperty("groupMode").GetString());
        }

        Assert.Equal(ExpenseBillStatuses.Confirmed, metadata.RootElement.GetProperty("billStatus").GetString());
        Assert.Equal(expectedFileId.ToString("D"), metadata.RootElement.GetProperty("fileObjectId").GetString());
        Assert.Equal(expectedAttachmentPurpose, metadata.RootElement.GetProperty("attachmentPurpose").GetString());
        Assert.Equal(expectedFilePurpose, metadata.RootElement.GetProperty("filePurpose").GetString());
        Assert.Equal(expectedActionCategory, metadata.RootElement.GetProperty("actionCategory").GetString());
        Assert.Equal(ValidPngBytes.LongLength, metadata.RootElement.GetProperty("sizeBytes").GetInt64());

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

    private static async Task AssertBillUnavailableProblemAsync(
        HttpResponseMessage response,
        string? unexpectedResponseText = null)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content, unexpectedResponseText);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Bill unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
    }

    private static async Task AssertInvalidBillAttachmentUploadProblemAsync(
        HttpResponseMessage response,
        string unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content, unexpectedResponseText);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid bill attachment upload", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.True(payload.RootElement.TryGetProperty("errors", out _));
    }

    private static async Task AssertBillAttachmentConflictProblemAsync(
        HttpResponseMessage response,
        string unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content, unexpectedResponseText);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Bill attachment conflict", payload.RootElement.GetProperty("title").GetString());
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
    }

    private static void AssertSafeAttachmentJsonContent(
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

    private static string PersonalAttachmentPath(Guid billId)
    {
        return $"/api/v1/bills/{billId:D}/attachments";
    }

    private static string PersonalAttachmentFilePath(Guid billId, Guid fileId)
    {
        return $"/api/v1/bills/{billId:D}/attachments/{fileId:D}";
    }

    private static string PersonalAttachmentContentPath(Guid billId, Guid fileId)
    {
        return $"/api/v1/bills/{billId:D}/attachments/{fileId:D}/content";
    }

    private static string GroupAttachmentPath(Guid groupId, Guid billId)
    {
        return $"/api/v1/groups/{groupId:D}/bills/{billId:D}/attachments";
    }

    private static string GroupAttachmentFilePath(Guid groupId, Guid billId, Guid fileId)
    {
        return $"/api/v1/groups/{groupId:D}/bills/{billId:D}/attachments/{fileId:D}";
    }

    private static string GroupAttachmentContentPath(Guid groupId, Guid billId, Guid fileId)
    {
        return $"/api/v1/groups/{groupId:D}/bills/{billId:D}/attachments/{fileId:D}/content";
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
        BillAttachmentTestTimeProvider TimeProvider,
        TestBillAttachmentStorageProvider StorageProvider);

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

    private sealed record BillAttachmentPayload(
        Guid FileId,
        Guid BillId,
        string Purpose,
        string ContentType,
        long SizeBytes,
        DateTimeOffset UploadedAtUtc,
        DateTimeOffset UpdatedAtUtc);

    private sealed class BillAttachmentTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public BillAttachmentTestTimeProvider(DateTimeOffset utcNow)
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

    private sealed class TestBillAttachmentStorageProvider : IFileObjectStorageProvider
    {
        private readonly Dictionary<string, byte[]> storedObjects = new(StringComparer.Ordinal);

        public string ProviderName => StorageProviderNames.Local;

        public bool FailWrites { get; set; }

        public int WriteCount { get; private set; }

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

        public async Task WriteAsync(string objectKey, Stream content, CancellationToken cancellationToken)
        {
            WriteCount++;

            if (FailWrites)
            {
                throw new IOException("Simulated bill attachment storage write failure.");
            }

            await using var buffer = new MemoryStream();
            await content.CopyToAsync(buffer, cancellationToken);
            storedObjects.Add(objectKey, buffer.ToArray());
        }

        public Task<Stream> OpenReadAsync(string objectKey, CancellationToken cancellationToken)
        {
            OpenReadCount++;

            if (!storedObjects.TryGetValue(objectKey, out var bytes))
            {
                throw new FileNotFoundException("Simulated missing bill attachment object.");
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
