using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
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

public sealed class ReceiptOcrReviewEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string WrongRawToken = "wrong-receipt-ocr-review-session-token";
    private const string HiddenOriginalFilename = "private-receipt-name.png";
    private const string HiddenStorageObjectKey = "private/storage/object-key";
    private const string HiddenRawOcrText = "RAW OCR FULL TEXT SECRET";
    private const string ReviewSavedAction = "bill_attachment.ocr_review_saved";
    private const string ReviewReadAction = "bill_attachment.ocr_review_read";
    private const string ReviewRemovedAction = "bill_attachment.ocr_review_removed";
    private const string ReviewAppliedAction = "bill_attachment.ocr_review_applied";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 12, 1, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 12, 1, 15, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 5, 12, 1, 30, 0, TimeSpan.Zero);
    private static readonly byte[] ValidPngBytes = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x01];

    private readonly WebApplicationFactory<Program> factory;

    public ReceiptOcrReviewEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task PersonalBillOwnerCanSaveParticipantCanReadAndOwnerCanRemoveReceiptOcrReviewWithoutMutatingBillTruth()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Receipt OCR Owner");
        var participant = await SeedAccountAsync(testFactory, "Receipt OCR Participant", InitialTimestamp.AddMinutes(1));
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
        var fileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var beforeBillItems = await CountBillItemsAsync(testFactory, billId);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();

        using var putRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            PersonalOcrReviewPath(billId, fileId),
            ownerSession.RawSessionToken,
            ValidReviewJson());
        using var putResponse = await client.SendAsync(putRequest);
        var putContent = await putResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, putResponse.StatusCode);
        Assert.Equal(PersonalOcrReviewPath(billId, fileId), putResponse.Headers.Location?.OriginalString);
        AssertSafeReviewJson(putContent);
        var savedPayload = ReadReviewPayload(putContent);
        Assert.Equal(billId, savedPayload.BillId);
        Assert.Equal(fileId, savedPayload.FileId);
        Assert.Null(savedPayload.GroupId);
        Assert.Equal(ReceiptOcrReviewStatuses.Provisional, savedPayload.Status);
        Assert.Equal(ReceiptOcrReviewSources.OnDevice, savedPayload.Source);
        Assert.Equal("Cafe Central", savedPayload.MerchantText);
        Assert.Equal("USD", savedPayload.Currency);
        Assert.Equal("11.5", savedPayload.GrandTotalAmount);
        Assert.Equal(["Latte", "Bagel"], savedPayload.Lines.Select(line => line.Text).ToArray());

        var savedReview = await ReadReceiptOcrReviewAsync(testFactory, savedPayload.Id);
        Assert.Equal(ownerSession.UserProfileId, savedReview.CreatedByUserProfileId);
        Assert.Equal(2, savedReview.Lines.Count);
        Assert.Null(savedReview.RemovedAtUtc);
        Assert.Equal(beforeBillItems, await CountBillItemsAsync(testFactory, billId));
        Assert.Empty(await ReadSettlementRequestsAsync(testFactory));
        Assert.Null((await ReadBillAttachmentAsync(testFactory, billId, fileId)).RemovedAtUtc);
        Assert.Equal(FileObjectStatuses.Active, (await ReadFileObjectAsync(testFactory, fileId)).Status);

        testContext.TimeProvider.SetUtcNow(WriteTimestamp.AddMinutes(1));
        using (var getRequest = CreateBearerRequest(HttpMethod.Get, PersonalOcrReviewPath(billId, fileId), participantSession.RawSessionToken))
        using (var getResponse = await client.SendAsync(getRequest))
        {
            var getContent = await getResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
            AssertSafeReviewJson(getContent);
            Assert.Equal(savedPayload.Id, ReadReviewPayload(getContent).Id);
        }

        testContext.TimeProvider.SetUtcNow(WriteTimestamp.AddMinutes(2));
        using (var deleteRequest = CreateBearerRequest(HttpMethod.Delete, PersonalOcrReviewPath(billId, fileId), ownerSession.RawSessionToken))
        using (var deleteResponse = await client.SendAsync(deleteRequest))
        {
            Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);
        }

        var removedReview = await ReadReceiptOcrReviewAsync(testFactory, savedPayload.Id);
        Assert.Equal(WriteTimestamp.AddMinutes(2), removedReview.RemovedAtUtc);
        Assert.Equal(FileObjectStatuses.Active, (await ReadFileObjectAsync(testFactory, fileId)).Status);
        Assert.Null((await ReadBillAttachmentAsync(testFactory, billId, fileId)).RemovedAtUtc);

        using (var removedGetRequest = CreateBearerRequest(HttpMethod.Get, PersonalOcrReviewPath(billId, fileId), ownerSession.RawSessionToken))
        using (var removedGetResponse = await client.SendAsync(removedGetRequest))
        {
            await AssertReceiptOcrReviewUnavailableProblemAsync(removedGetResponse);
        }

        var audits = await ReadReceiptOcrReviewAuditEventsAsync(testFactory);
        Assert.Equal([ReviewSavedAction, ReviewReadAction, ReviewRemovedAction], audits.Select(audit => audit.Action).ToArray());
        AssertReviewAuditMetadata(audits[0], ReviewSavedAction, billId, groupId: null, fileId, savedPayload.Id, "ocr_review_saved");
        AssertReviewAuditMetadata(audits[1], ReviewReadAction, billId, groupId: null, fileId, savedPayload.Id, "ocr_review_read");
        AssertReviewAuditMetadata(audits[2], ReviewRemovedAction, billId, groupId: null, fileId, savedPayload.Id, "ocr_review_removed");
    }

    [Fact]
    public async Task PersonalBillOwnerCanUpdateExistingReceiptOcrReviewAndReplacePriorLines()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Receipt OCR Update Owner");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(2));
        var fileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var createRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            PersonalOcrReviewPath(billId, fileId),
            ownerSession.RawSessionToken,
            ValidReviewJson());
        using var createResponse = await client.SendAsync(createRequest);
        var createContent = await createResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        var createPayload = ReadReviewPayload(createContent);
        Assert.Equal(["Latte", "Bagel"], createPayload.Lines.Select(line => line.Text).ToArray());

        testContext.TimeProvider.SetUtcNow(WriteTimestamp.AddMinutes(1));
        using var updateRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            PersonalOcrReviewPath(billId, fileId),
            ownerSession.RawSessionToken,
            ReplacementReviewJson());
        using var updateResponse = await client.SendAsync(updateRequest);
        var updateContent = await updateResponse.Content.ReadAsStringAsync();

        Assert.True(updateResponse.StatusCode == HttpStatusCode.OK, updateContent);
        var updatePayload = ReadReviewPayload(updateContent);
        Assert.Equal(createPayload.Id, updatePayload.Id);
        Assert.Equal(ReceiptOcrReviewStatuses.Reviewed, updatePayload.Status);
        Assert.Equal("9.75", updatePayload.GrandTotalAmount);
        Assert.Equal(["Flat white"], updatePayload.Lines.Select(line => line.Text).ToArray());

        var persistedReview = await ReadReceiptOcrReviewAsync(testFactory, createPayload.Id);
        Assert.Equal(WriteTimestamp.AddMinutes(1), persistedReview.UpdatedAtUtc);
        Assert.Equal(ReceiptOcrReviewStatuses.Reviewed, persistedReview.Status);
        Assert.Equal(["Flat white"], persistedReview.Lines.OrderBy(line => line.SortOrder).Select(line => line.Text).ToArray());
        Assert.Equal(1.5m, persistedReview.Lines.Single().Quantity);
        Assert.Equal(9.75m, persistedReview.Lines.Single().LineTotalAmount);
        Assert.DoesNotContain(persistedReview.Lines, line => line.Text is "Latte" or "Bagel");

        var allPersistedLines = await ReadReceiptOcrReviewLinesAsync(testFactory);
        Assert.Single(allPersistedLines);
        Assert.Equal(persistedReview.Id, allPersistedLines.Single().ReceiptOcrReviewId);
    }

    [Fact]
    public async Task GroupBillReceiptOcrReviewUsesRouteGroupAccessAndSafeGroupScopedResponse()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group OCR Owner");
        var participant = await SeedAccountAsync(testFactory, "Group OCR Participant", InitialTimestamp.AddMinutes(1));
        var participantSession = await SeedSessionForAccountAsync(testFactory, testContext.TimeProvider, participant);
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Receipt OCR Group",
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
        var fileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();

        using var putRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            GroupOcrReviewPath(groupId, billId, fileId),
            ownerSession.RawSessionToken,
            ValidReviewJson(ReceiptOcrReviewStatuses.Reviewed, ReceiptOcrReviewSources.ManualEntry));
        using var putResponse = await client.SendAsync(putRequest);
        var putContent = await putResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, putResponse.StatusCode);
        var savedPayload = ReadReviewPayload(putContent);
        Assert.Equal(groupId, savedPayload.GroupId);
        Assert.Equal(ReceiptOcrReviewStatuses.Reviewed, savedPayload.Status);
        Assert.Equal(ReceiptOcrReviewSources.ManualEntry, savedPayload.Source);

        using var getRequest = CreateBearerRequest(
            HttpMethod.Get,
            GroupOcrReviewPath(groupId, billId, fileId),
            participantSession.RawSessionToken);
        using var getResponse = await client.SendAsync(getRequest);
        var getContent = await getResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        AssertSafeReviewJson(getContent);
        Assert.Equal(savedPayload.Id, ReadReviewPayload(getContent).Id);
    }

    [Fact]
    public async Task PersonalReceiptOcrReviewApplyPreviewBuildsSafeDraftPreviewForVisibleParticipantWithoutMutationOrAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Apply Preview OCR Owner");
        var participant = await SeedAccountAsync(testFactory, "Apply Preview OCR Participant", InitialTimestamp.AddMinutes(1));
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
        var fileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var putRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            PersonalOcrReviewPath(billId, fileId),
            ownerSession.RawSessionToken,
            ApplyPreviewReadyReviewJson());
        using var putResponse = await client.SendAsync(putRequest);
        var putContent = await putResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, putResponse.StatusCode);
        var savedPayload = ReadReviewPayload(putContent);
        var reviewBeforePreview = await ReadReceiptOcrReviewAsync(testFactory, savedPayload.Id);
        var billItemsBeforePreview = await CountBillItemsAsync(testFactory, billId);
        var billItemSplitsBeforePreview = await CountBillItemSplitsAsync(testFactory, billId);
        var billParticipantsBeforePreview = await CountBillParticipantsAsync(testFactory, billId);
        var billPayersBeforePreview = await CountBillPayersAsync(testFactory, billId);
        var billAdjustmentsBeforePreview = await CountBillAdjustmentsAsync(testFactory, billId);
        var reviewAuditsBeforePreview = await ReadReceiptOcrReviewAuditEventsAsync(testFactory);

        using var previewRequest = CreateBearerRequest(
            HttpMethod.Get,
            PersonalOcrReviewApplyPreviewPath(billId, fileId),
            participantSession.RawSessionToken);
        using var previewResponse = await client.SendAsync(previewRequest);
        var previewContent = await previewResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, previewResponse.StatusCode);
        AssertSafeReviewJson(previewContent);
        var previewPayload = ReadApplyPreviewPayload(previewContent);
        Assert.Equal(savedPayload.Id, previewPayload.ReviewId);
        Assert.Equal(billId, previewPayload.BillId);
        Assert.Equal(fileId, previewPayload.FileId);
        Assert.Null(previewPayload.GroupId);
        Assert.True(previewPayload.CanApply);
        Assert.Empty(previewPayload.BlockedReasons);
        Assert.Empty(previewPayload.Warnings);
        Assert.Equal("Preview Cafe", previewPayload.ProposedMerchantText);
        Assert.Equal("USD", previewPayload.ProposedCurrency);
        Assert.Equal("11.5", previewPayload.ProposedGrandTotalAmount);
        Assert.Equal(["Toast", "Tea"], previewPayload.ProposedLines.Select(line => line.Text).ToArray());
        Assert.Equal(["5.25", "5"], previewPayload.ProposedLines.Select(line => line.ProposedLineTotalAmount!).ToArray());
        Assert.Equal(2, previewPayload.Summary.LineCount);
        Assert.Equal(2, previewPayload.Summary.LinesWithProposedTotalCount);
        Assert.Equal(0, previewPayload.Summary.LinesMissingProposedTotalCount);
        Assert.Equal("10.25", previewPayload.Summary.ProposedLineTotalSumAmount);
        Assert.Equal("11.5", previewPayload.Summary.ExpectedHeaderTotalAmount);

        var reviewAfterPreview = await ReadReceiptOcrReviewAsync(testFactory, savedPayload.Id);
        Assert.Equal(reviewBeforePreview.UpdatedAtUtc, reviewAfterPreview.UpdatedAtUtc);
        Assert.Equal(reviewBeforePreview.Lines.Count, reviewAfterPreview.Lines.Count);
        Assert.Equal(billItemsBeforePreview, await CountBillItemsAsync(testFactory, billId));
        Assert.Equal(billItemSplitsBeforePreview, await CountBillItemSplitsAsync(testFactory, billId));
        Assert.Equal(billParticipantsBeforePreview, await CountBillParticipantsAsync(testFactory, billId));
        Assert.Equal(billPayersBeforePreview, await CountBillPayersAsync(testFactory, billId));
        Assert.Equal(billAdjustmentsBeforePreview, await CountBillAdjustmentsAsync(testFactory, billId));
        Assert.Empty(await ReadSettlementRequestsAsync(testFactory));
        Assert.Empty(await ReadSettlementPaymentsAsync(testFactory));
        Assert.Empty(await ReadSettlementPaymentAllocationsAsync(testFactory));
        Assert.Empty(await ReadSettlementResidualsAsync(testFactory));
        Assert.Equal(FileObjectStatuses.Active, (await ReadFileObjectAsync(testFactory, fileId)).Status);
        Assert.Null((await ReadBillAttachmentAsync(testFactory, billId, fileId)).RemovedAtUtc);
        Assert.Equal(
            reviewAuditsBeforePreview.Select(audit => audit.Id).ToArray(),
            (await ReadReceiptOcrReviewAuditEventsAsync(testFactory)).Select(audit => audit.Id).ToArray());
    }

    [Fact]
    public async Task GroupReceiptOcrReviewApplyPreviewUsesVisibleBillAccessAndFailsClosedWithoutAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Apply Preview OCR Owner");
        var participant = await SeedAccountAsync(testFactory, "Group Apply Preview OCR Participant", InitialTimestamp.AddMinutes(1));
        var participantSession = await SeedSessionForAccountAsync(testFactory, testContext.TimeProvider, participant);
        var outsider = await SeedAccountAsync(testFactory, "Group Apply Preview OCR Outsider", InitialTimestamp.AddMinutes(2));
        var outsiderSession = await SeedSessionForAccountAsync(testFactory, testContext.TimeProvider, outsider);
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Group Apply Preview OCR Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(participant.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(outsider.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId, participant.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(3));
        var fileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var reviewId = await SeedReceiptOcrReviewAsync(
            testFactory,
            billId,
            fileId,
            ownerSession.UserProfileId,
            groupId,
            ReceiptOcrReviewStatuses.Reviewed,
            ReceiptOcrReviewSources.ManualEntry,
            "Group Preview Cafe",
            "USD",
            InitialTimestamp.AddMinutes(10),
            lineCount: 1);
        using var client = testFactory.CreateClient();

        using (var participantRequest = CreateBearerRequest(
            HttpMethod.Get,
            GroupOcrReviewApplyPreviewPath(groupId, billId, fileId),
            participantSession.RawSessionToken))
        using (var participantResponse = await client.SendAsync(participantRequest))
        {
            var previewContent = await participantResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, participantResponse.StatusCode);
            var previewPayload = ReadApplyPreviewPayload(previewContent);
            Assert.Equal(reviewId, previewPayload.ReviewId);
            Assert.Equal(groupId, previewPayload.GroupId);
            Assert.True(previewPayload.CanApply);
        }

        using (var outsiderRequest = CreateBearerRequest(
            HttpMethod.Get,
            GroupOcrReviewApplyPreviewPath(groupId, billId, fileId),
            outsiderSession.RawSessionToken))
        using (var outsiderResponse = await client.SendAsync(outsiderRequest))
        {
            await AssertBillUnavailableProblemAsync(outsiderResponse);
        }

        await UpdateMembershipStatusAsync(testFactory, groupId, participant.UserProfileId, GroupMembershipStatuses.Removed);
        using (var removedMemberRequest = CreateBearerRequest(
            HttpMethod.Get,
            GroupOcrReviewApplyPreviewPath(groupId, billId, fileId),
            participantSession.RawSessionToken))
        using (var removedMemberResponse = await client.SendAsync(removedMemberRequest))
        {
            await AssertBillUnavailableProblemAsync(removedMemberResponse);
        }

        Assert.Empty(await ReadReceiptOcrReviewAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task ReceiptOcrReviewApplyPreviewReturnsBoundedWarningCodesForUnsafeRowsWithoutMutatingState()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Warning Apply Preview OCR Owner");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(2));
        var mismatchFileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var derivableFileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var emptyFileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var mismatchReviewId = await SeedCustomReceiptOcrReviewAsync(
            testFactory,
            billId,
            mismatchFileId,
            ownerSession.UserProfileId,
            groupId: null,
            ReceiptOcrReviewStatuses.Reviewed,
            ReceiptOcrReviewSources.OnDevice,
            "Mismatch Preview Cafe",
            "HKD",
            subtotalAmount: null,
            taxAmount: null,
            serviceChargeAmount: null,
            discountAmount: null,
            grandTotalAmount: 12m,
            createdAtUtc: InitialTimestamp.AddMinutes(10),
            lines: [new ReceiptOcrReviewLineSeed("Mismatched latte", 2m, 5m, 11m)]);
        await SeedCustomReceiptOcrReviewAsync(
            testFactory,
            billId,
            derivableFileId,
            ownerSession.UserProfileId,
            groupId: null,
            ReceiptOcrReviewStatuses.Reviewed,
            ReceiptOcrReviewSources.OnDevice,
            "Derivable Preview Cafe",
            "USD",
            subtotalAmount: 10m,
            taxAmount: null,
            serviceChargeAmount: null,
            discountAmount: null,
            grandTotalAmount: 10m,
            createdAtUtc: InitialTimestamp.AddMinutes(11),
            lines: [new ReceiptOcrReviewLineSeed("Derivable latte", 2m, 5m, null)]);
        await SeedCustomReceiptOcrReviewAsync(
            testFactory,
            billId,
            emptyFileId,
            ownerSession.UserProfileId,
            groupId: null,
            ReceiptOcrReviewStatuses.Reviewed,
            ReceiptOcrReviewSources.OnDevice,
            "Empty Preview Cafe",
            "USD",
            subtotalAmount: null,
            taxAmount: null,
            serviceChargeAmount: null,
            discountAmount: null,
            grandTotalAmount: null,
            createdAtUtc: InitialTimestamp.AddMinutes(12));
        var billItemsBeforePreview = await CountBillItemsAsync(testFactory, billId);
        using var client = testFactory.CreateClient();

        using (var mismatchRequest = CreateBearerRequest(
            HttpMethod.Get,
            PersonalOcrReviewApplyPreviewPath(billId, mismatchFileId),
            ownerSession.RawSessionToken))
        using (var mismatchResponse = await client.SendAsync(mismatchRequest))
        {
            var content = await mismatchResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, mismatchResponse.StatusCode);
            var previewPayload = ReadApplyPreviewPayload(content);
            Assert.Equal(mismatchReviewId, previewPayload.ReviewId);
            Assert.False(previewPayload.CanApply);
            Assert.Contains(ReceiptOcrReviewApplyPreviewIssueCodes.CurrencyMismatch, previewPayload.BlockedReasons);
            Assert.Contains(ReceiptOcrReviewApplyPreviewIssueCodes.LineTotalMismatch, previewPayload.BlockedReasons);
            Assert.All(previewPayload.BlockedReasons, code => Assert.True(ReceiptOcrReviewApplyPreviewIssueCodes.IsSupported(code)));
            Assert.All(previewPayload.Warnings, code => Assert.True(ReceiptOcrReviewApplyPreviewIssueCodes.IsSupported(code)));
        }

        using (var derivableRequest = CreateBearerRequest(
            HttpMethod.Get,
            PersonalOcrReviewApplyPreviewPath(billId, derivableFileId),
            ownerSession.RawSessionToken))
        using (var derivableResponse = await client.SendAsync(derivableRequest))
        {
            var content = await derivableResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, derivableResponse.StatusCode);
            var previewPayload = ReadApplyPreviewPayload(content);
            Assert.True(previewPayload.CanApply);
            Assert.Empty(previewPayload.BlockedReasons);
            Assert.Equal([ReceiptOcrReviewApplyPreviewIssueCodes.LineTotalMissing], previewPayload.Warnings);
            Assert.Equal("10", Assert.Single(previewPayload.ProposedLines).ProposedLineTotalAmount);
        }

        using (var emptyRequest = CreateBearerRequest(
            HttpMethod.Get,
            PersonalOcrReviewApplyPreviewPath(billId, emptyFileId),
            ownerSession.RawSessionToken))
        using (var emptyResponse = await client.SendAsync(emptyRequest))
        {
            var content = await emptyResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, emptyResponse.StatusCode);
            var previewPayload = ReadApplyPreviewPayload(content);
            Assert.False(previewPayload.CanApply);
            Assert.Contains(ReceiptOcrReviewApplyPreviewIssueCodes.MissingGrandTotal, previewPayload.BlockedReasons);
            Assert.Contains(ReceiptOcrReviewApplyPreviewIssueCodes.EmptyLineSet, previewPayload.BlockedReasons);
            Assert.Equal(0, previewPayload.Summary.LineCount);
        }

        Assert.Equal(billItemsBeforePreview, await CountBillItemsAsync(testFactory, billId));
        Assert.Empty(await ReadSettlementRequestsAsync(testFactory));
        Assert.Empty(await ReadReceiptOcrReviewAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task PersonalBillOwnerCanApplyReviewedOcrReviewToDraftItemsAndReplaceOnlyPriorOcrCandidates()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Apply OCR Owner");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            ExpenseBillStatuses.Draft,
            archivedAtUtc: null,
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(2));
        var fileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var putRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            PersonalOcrReviewPath(billId, fileId),
            ownerSession.RawSessionToken,
            ApplyPreviewReadyReviewJson());
        using var putResponse = await client.SendAsync(putRequest);
        var putContent = await putResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, putResponse.StatusCode);
        var savedPayload = ReadReviewPayload(putContent);
        var reviewBeforeApply = await ReadReceiptOcrReviewAsync(testFactory, savedPayload.Id);
        var billItemSplitsBeforeApply = await CountBillItemSplitsAsync(testFactory, billId);
        var billParticipantsBeforeApply = await CountBillParticipantsAsync(testFactory, billId);
        var billPayersBeforeApply = await CountBillPayersAsync(testFactory, billId);

        testContext.TimeProvider.SetUtcNow(WriteTimestamp.AddMinutes(1));
        using var applyRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            PersonalOcrReviewApplyPath(billId, fileId),
            ownerSession.RawSessionToken,
            ApplyRequestJson(reviewBeforeApply.UpdatedAtUtc));
        using var applyResponse = await client.SendAsync(applyRequest);
        var applyContent = await applyResponse.Content.ReadAsStringAsync();

        Assert.True(applyResponse.StatusCode == HttpStatusCode.OK, applyContent);
        AssertSafeReviewJson(applyContent);
        var applyPayload = ReadApplyPayload(applyContent);
        Assert.Equal(savedPayload.Id, applyPayload.ReviewId);
        Assert.Equal(billId, applyPayload.BillId);
        Assert.Equal(fileId, applyPayload.FileId);
        Assert.Equal(ReceiptOcrReviewApplyModes.ReplaceDraftOcrItems, applyPayload.ApplyMode);
        Assert.Equal(2, applyPayload.AppliedItemCount);
        Assert.Equal("USD", applyPayload.Currency);
        Assert.Equal("10.25", applyPayload.SubtotalAmount);
        Assert.Equal("11.5", applyPayload.GrandTotalAmount);
        Assert.Empty(applyPayload.BlockedReasons);
        Assert.Empty(applyPayload.Warnings);
        Assert.Equal(WriteTimestamp.AddMinutes(1), applyPayload.AppliedAtUtc);

        var billAfterFirstApply = await ReadBillAsync(testFactory, billId);
        Assert.Equal(20.25m, billAfterFirstApply.TotalAmount);
        Assert.Equal("USD", billAfterFirstApply.TotalCurrency);
        Assert.Equal(3, billAfterFirstApply.Items.Count(item => item.DeletedAtUtc is null));
        Assert.Equal(billItemSplitsBeforeApply + 2, await CountBillItemSplitsAsync(testFactory, billId));
        Assert.Equal(billParticipantsBeforeApply, await CountBillParticipantsAsync(testFactory, billId));
        Assert.Equal(billPayersBeforeApply, await CountBillPayersAsync(testFactory, billId));
        var manualItem = Assert.Single(billAfterFirstApply.Items, item => item.SourceKind is null);
        Assert.Null(manualItem.DeletedAtUtc);
        var firstAppliedItems = billAfterFirstApply.Items
            .Where(item => item.SourceKind == ExpenseBillItemSourceKinds.ReceiptOcrReviewApply)
            .OrderBy(item => item.SortOrder)
            .ToArray();
        Assert.Equal(["Toast", "Tea"], firstAppliedItems.Select(item => item.Name).ToArray());
        Assert.All(firstAppliedItems, item =>
        {
            Assert.Equal(savedPayload.Id, item.SourceReceiptOcrReviewId);
            Assert.NotNull(item.SourceReceiptOcrReviewLineId);
            var split = Assert.Single(item.Splits);
            Assert.Equal(ownerSession.UserProfileId, split.UserProfileId);
            Assert.Equal(ExpenseBillItemSplitMethods.ExactAmount, split.SplitMethod);
        });
        Assert.Equal(reviewBeforeApply.UpdatedAtUtc, (await ReadReceiptOcrReviewAsync(testFactory, savedPayload.Id)).UpdatedAtUtc);
        Assert.Empty(await ReadSettlementRequestsAsync(testFactory));
        Assert.Empty(await ReadSettlementPaymentsAsync(testFactory));
        Assert.Empty(await ReadSettlementPaymentAllocationsAsync(testFactory));
        Assert.Empty(await ReadSettlementResidualsAsync(testFactory));
        Assert.Equal(FileObjectStatuses.Active, (await ReadFileObjectAsync(testFactory, fileId)).Status);
        Assert.Null((await ReadBillAttachmentAsync(testFactory, billId, fileId)).RemovedAtUtc);

        testContext.TimeProvider.SetUtcNow(WriteTimestamp.AddMinutes(2));
        using var updateRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            PersonalOcrReviewPath(billId, fileId),
            ownerSession.RawSessionToken,
            ReplacementReviewJson());
        using var updateResponse = await client.SendAsync(updateRequest);
        var updateContent = await updateResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);
        var updatedReviewPayload = ReadReviewPayload(updateContent);
        var updatedReview = await ReadReceiptOcrReviewAsync(testFactory, updatedReviewPayload.Id);

        testContext.TimeProvider.SetUtcNow(WriteTimestamp.AddMinutes(3));
        using var secondApplyRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            PersonalOcrReviewApplyPath(billId, fileId),
            ownerSession.RawSessionToken,
            ApplyRequestJson(updatedReview.UpdatedAtUtc));
        using var secondApplyResponse = await client.SendAsync(secondApplyRequest);
        var secondApplyContent = await secondApplyResponse.Content.ReadAsStringAsync();

        Assert.True(secondApplyResponse.StatusCode == HttpStatusCode.OK, secondApplyContent);
        Assert.Equal(1, ReadApplyPayload(secondApplyContent).AppliedItemCount);
        var billAfterSecondApply = await ReadBillAsync(testFactory, billId);
        Assert.Null(Assert.Single(billAfterSecondApply.Items, item => item.SourceKind is null).DeletedAtUtc);
        var activeOcrItems = billAfterSecondApply.Items
            .Where(item => item.SourceKind == ExpenseBillItemSourceKinds.ReceiptOcrReviewApply && item.DeletedAtUtc is null)
            .ToArray();
        var deletedOcrItems = billAfterSecondApply.Items
            .Where(item => item.SourceKind == ExpenseBillItemSourceKinds.ReceiptOcrReviewApply && item.DeletedAtUtc is not null)
            .ToArray();
        Assert.Equal("Flat white", Assert.Single(activeOcrItems).Name);
        Assert.Equal(2, deletedOcrItems.Length);
        Assert.Equal(19.75m, billAfterSecondApply.TotalAmount);

        var audits = await ReadReceiptOcrReviewAuditEventsAsync(testFactory);
        Assert.Equal(
            [ReviewSavedAction, ReviewAppliedAction, ReviewSavedAction, ReviewAppliedAction],
            audits.Select(audit => audit.Action).ToArray());
        AssertReviewAuditMetadata(audits[1], ReviewAppliedAction, billId, groupId: null, fileId, savedPayload.Id, "ocr_review_applied", expectedLineCount: 2, ReceiptOcrReviewApplyModes.ReplaceDraftOcrItems);
        AssertReviewAuditMetadata(audits[3], ReviewAppliedAction, billId, groupId: null, fileId, savedPayload.Id, "ocr_review_applied", expectedLineCount: 1, ReceiptOcrReviewApplyModes.ReplaceDraftOcrItems);
    }

    [Fact]
    public async Task ReceiptOcrReviewApplyRequiresOwnerFreshReviewedDraftAndSafeBillShape()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Denied Apply OCR Owner");
        var participant = await SeedAccountAsync(testFactory, "Denied Apply OCR Participant", InitialTimestamp.AddMinutes(1));
        var participantSession = await SeedSessionForAccountAsync(testFactory, testContext.TimeProvider, participant);
        var draftBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            ExpenseBillStatuses.Draft,
            archivedAtUtc: null,
            [ownerSession.UserProfileId, participant.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(2));
        var draftFileId = await SeedBillAttachmentAsync(
            testFactory,
            draftBillId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var confirmedBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(3));
        var confirmedFileId = await SeedBillAttachmentAsync(
            testFactory,
            confirmedBillId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var draftPutRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            PersonalOcrReviewPath(draftBillId, draftFileId),
            ownerSession.RawSessionToken,
            ApplyPreviewReadyReviewJson());
        using var draftPutResponse = await client.SendAsync(draftPutRequest);
        var draftReview = await ReadReceiptOcrReviewAsync(testFactory, ReadReviewPayload(await draftPutResponse.Content.ReadAsStringAsync()).Id);

        using var confirmedPutRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            PersonalOcrReviewPath(confirmedBillId, confirmedFileId),
            ownerSession.RawSessionToken,
            ApplyPreviewReadyReviewJson());
        using var confirmedPutResponse = await client.SendAsync(confirmedPutRequest);
        Assert.Equal(HttpStatusCode.Created, confirmedPutResponse.StatusCode);
        var confirmedReview = await ReadReceiptOcrReviewAsync(testFactory, ReadReviewPayload(await confirmedPutResponse.Content.ReadAsStringAsync()).Id);

        using (var unauthenticatedRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            PersonalOcrReviewApplyPath(draftBillId, draftFileId),
            rawSessionToken: null,
            ApplyRequestJson(draftReview.UpdatedAtUtc)))
        using (var unauthenticatedResponse = await client.SendAsync(unauthenticatedRequest))
        {
            await AssertUnauthenticatedProblemAsync(unauthenticatedResponse);
        }

        using (var participantRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            PersonalOcrReviewApplyPath(draftBillId, draftFileId),
            participantSession.RawSessionToken,
            ApplyRequestJson(draftReview.UpdatedAtUtc)))
        using (var participantResponse = await client.SendAsync(participantRequest))
        {
            await AssertBillUnavailableProblemAsync(participantResponse);
        }

        using (var staleRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            PersonalOcrReviewApplyPath(draftBillId, draftFileId),
            ownerSession.RawSessionToken,
            ApplyRequestJson(draftReview.UpdatedAtUtc.AddTicks(-1))))
        using (var staleResponse = await client.SendAsync(staleRequest))
        {
            await AssertReceiptOcrReviewConflictProblemAsync(staleResponse);
        }

        using (var confirmedRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            PersonalOcrReviewApplyPath(confirmedBillId, confirmedFileId),
            ownerSession.RawSessionToken,
            ApplyRequestJson(confirmedReview.UpdatedAtUtc)))
        using (var confirmedResponse = await client.SendAsync(confirmedRequest))
        {
            await AssertReceiptOcrReviewConflictProblemAsync(confirmedResponse);
        }

        using (var unsafeSplitShapeRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            PersonalOcrReviewApplyPath(draftBillId, draftFileId),
            ownerSession.RawSessionToken,
            ApplyRequestJson(draftReview.UpdatedAtUtc)))
        using (var unsafeSplitShapeResponse = await client.SendAsync(unsafeSplitShapeRequest))
        {
            await AssertReceiptOcrReviewConflictProblemAsync(unsafeSplitShapeResponse);
        }

        Assert.Equal(1, await CountBillItemsAsync(testFactory, draftBillId));
        Assert.Equal(1, await CountBillItemsAsync(testFactory, confirmedBillId));
        Assert.DoesNotContain(
            await ReadReceiptOcrReviewAuditEventsAsync(testFactory),
            audit => audit.Action == ReviewAppliedAction);
    }

    [Fact]
    public async Task ReceiptOcrReviewQueueListsCurrentActorVisibleReviewsWithFiltersAndNoReadAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Queue OCR Owner");
        var outsiderSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Queue OCR Outsider");
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Queue OCR Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var personalBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(2));
        var groupBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(3));
        var hiddenBillId = await SeedBillAsync(
            testFactory,
            outsiderSession.UserProfileId,
            groupId: null,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [outsiderSession.UserProfileId],
            [outsiderSession.UserProfileId],
            InitialTimestamp.AddMinutes(4));
        var personalFileId = await SeedBillAttachmentAsync(
            testFactory,
            personalBillId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var groupFileId = await SeedBillAttachmentAsync(
            testFactory,
            groupBillId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var hiddenFileId = await SeedBillAttachmentAsync(
            testFactory,
            hiddenBillId,
            outsiderSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var personalReviewId = await SeedReceiptOcrReviewAsync(
            testFactory,
            personalBillId,
            personalFileId,
            ownerSession.UserProfileId,
            groupId: null,
            ReceiptOcrReviewStatuses.Provisional,
            ReceiptOcrReviewSources.OnDevice,
            "Personal Queue Cafe",
            "USD",
            InitialTimestamp.AddMinutes(10),
            lineCount: 2);
        var groupReviewId = await SeedReceiptOcrReviewAsync(
            testFactory,
            groupBillId,
            groupFileId,
            ownerSession.UserProfileId,
            groupId,
            ReceiptOcrReviewStatuses.Reviewed,
            ReceiptOcrReviewSources.ManualEntry,
            "Group Queue Cafe",
            "USD",
            InitialTimestamp.AddMinutes(20),
            lineCount: 1);
        await SeedReceiptOcrReviewAsync(
            testFactory,
            hiddenBillId,
            hiddenFileId,
            outsiderSession.UserProfileId,
            groupId: null,
            ReceiptOcrReviewStatuses.Provisional,
            ReceiptOcrReviewSources.OnDevice,
            "Hidden Queue Cafe",
            "USD",
            InitialTimestamp.AddMinutes(30),
            lineCount: 1);
        using var client = testFactory.CreateClient();

        using var listRequest = CreateBearerRequest(
            HttpMethod.Get,
            ReceiptOcrReviewQueuePath("limit=10"),
            ownerSession.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);
        var listContent = await listResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        AssertSafeReviewJson(listContent);
        var listPayload = ReadReviewQueuePayload(listContent);
        Assert.Equal([groupReviewId, personalReviewId], listPayload.Reviews.Select(review => review.ReviewId).ToArray());
        Assert.Equal(groupBillId, listPayload.Reviews[0].BillId);
        Assert.Equal(groupId, listPayload.Reviews[0].GroupId);
        Assert.Equal(groupFileId, listPayload.Reviews[0].FileId);
        Assert.Equal(ReceiptOcrReviewStatuses.Reviewed, listPayload.Reviews[0].Status);
        Assert.Equal(ReceiptOcrReviewSources.ManualEntry, listPayload.Reviews[0].Source);
        Assert.Equal("Group Queue Cafe", listPayload.Reviews[0].MerchantText);
        Assert.Equal("USD", listPayload.Reviews[0].Currency);
        Assert.Equal(1, listPayload.Reviews[0].LineCount);

        using var filteredRequest = CreateBearerRequest(
            HttpMethod.Get,
            ReceiptOcrReviewQueuePath("status=provisional&source=on_device&limit=1"),
            ownerSession.RawSessionToken);
        using var filteredResponse = await client.SendAsync(filteredRequest);
        var filteredContent = await filteredResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, filteredResponse.StatusCode);
        Assert.Equal(personalReviewId, Assert.Single(ReadReviewQueuePayload(filteredContent).Reviews).ReviewId);
        Assert.Empty(await ReadReceiptOcrReviewAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task GroupReceiptOcrReviewQueueRequiresActiveGroupAccessAndExcludesUnsafeRows()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Queue OCR Owner");
        var member = await SeedAccountAsync(testFactory, "Group Queue OCR Member", InitialTimestamp.AddMinutes(1));
        var memberSession = await SeedSessionForAccountAsync(testFactory, testContext.TimeProvider, member);
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Group Queue OCR Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(member.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var wrongGroupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Group Queue Wrong Group",
            InitialTimestamp,
            deletedAtUtc: null);
        var activeBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId, member.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(2));
        var activeFileId = await SeedBillAttachmentAsync(
            testFactory,
            activeBillId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var activeReviewId = await SeedReceiptOcrReviewAsync(
            testFactory,
            activeBillId,
            activeFileId,
            ownerSession.UserProfileId,
            groupId,
            ReceiptOcrReviewStatuses.Provisional,
            ReceiptOcrReviewSources.OnDevice,
            "Visible Group Queue Cafe",
            "USD",
            InitialTimestamp.AddMinutes(10),
            lineCount: 1);

        await SeedExcludedQueueReviewAsync(testFactory, ownerSession.UserProfileId, groupId, archivedAtUtc: InitialTimestamp.AddMinutes(5));
        await SeedExcludedQueueReviewAsync(testFactory, ownerSession.UserProfileId, groupId, removedAtUtc: InitialTimestamp.AddMinutes(6));
        await SeedExcludedQueueReviewAsync(testFactory, ownerSession.UserProfileId, groupId, fileStatus: FileObjectStatuses.Deleted);
        await SeedExcludedQueueReviewAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId,
            attachmentPurpose: ExpenseBillAttachmentPurposes.SupportingAttachment,
            filePurpose: FileObjectPurposes.SupportingAttachment);
        using var client = testFactory.CreateClient();

        using (var listRequest = CreateBearerRequest(
            HttpMethod.Get,
            GroupReceiptOcrReviewQueuePath(groupId, "limit=10"),
            ownerSession.RawSessionToken))
        using (var listResponse = await client.SendAsync(listRequest))
        {
            var listContent = await listResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
            Assert.Equal(activeReviewId, Assert.Single(ReadReviewQueuePayload(listContent).Reviews).ReviewId);
        }

        using (var wrongGroupRequest = CreateBearerRequest(
            HttpMethod.Get,
            GroupReceiptOcrReviewQueuePath(wrongGroupId),
            ownerSession.RawSessionToken))
        using (var wrongGroupResponse = await client.SendAsync(wrongGroupRequest))
        {
            await AssertBillUnavailableProblemAsync(wrongGroupResponse);
        }

        await UpdateMembershipStatusAsync(testFactory, groupId, member.UserProfileId, GroupMembershipStatuses.Removed);
        using (var removedMemberRequest = CreateBearerRequest(
            HttpMethod.Get,
            GroupReceiptOcrReviewQueuePath(groupId),
            memberSession.RawSessionToken))
        using (var removedMemberResponse = await client.SendAsync(removedMemberRequest))
        {
            await AssertBillUnavailableProblemAsync(removedMemberResponse);
        }
    }

    [Fact]
    public async Task ReceiptOcrReviewQueueRejectsInvalidFiltersAndUnauthenticatedRequestsWithoutAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Invalid Queue OCR Owner");
        using var client = testFactory.CreateClient();

        foreach (var query in new[]
        {
            "status=accepted",
            "source=unknown",
            "limit=0",
            "limit=101",
            "limit=abc",
            "cursor=abc",
            "status="
        })
        {
            using var request = CreateBearerRequest(
                HttpMethod.Get,
                ReceiptOcrReviewQueuePath(query),
                ownerSession.RawSessionToken);
            using var response = await client.SendAsync(request);
            await AssertInvalidReceiptOcrReviewQueryProblemAsync(response);
        }

        using (var unauthenticatedRequest = new HttpRequestMessage(HttpMethod.Get, ReceiptOcrReviewQueuePath()))
        using (var unauthenticatedResponse = await client.SendAsync(unauthenticatedRequest))
        {
            await AssertUnauthenticatedProblemAsync(unauthenticatedResponse);
        }

        Assert.Empty(await ReadReceiptOcrReviewAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task DeniedActorsWrongRoutesLockedBillsAndNonReceiptAttachmentsFailClosed()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Denied OCR Owner");
        var participant = await SeedAccountAsync(testFactory, "Denied OCR Participant", InitialTimestamp.AddMinutes(1));
        var participantSession = await SeedSessionForAccountAsync(testFactory, testContext.TimeProvider, participant);
        var outsiderSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Denied OCR Outsider");
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Denied OCR Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(participant.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(outsiderSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var wrongGroupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Wrong OCR Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId, participant.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(2));
        var otherBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(3));
        var finalizedBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            ExpenseBillStatuses.Finalized,
            archivedAtUtc: null,
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(4));
        var archivedBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: InitialTimestamp.AddMinutes(5),
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(5));
        var receiptFileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var finalizedFileId = await SeedBillAttachmentAsync(
            testFactory,
            finalizedBillId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var archivedFileId = await SeedBillAttachmentAsync(
            testFactory,
            archivedBillId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var removedFileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: InitialTimestamp.AddMinutes(6));
        var deletedFileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Deleted,
            removedAtUtc: null);
        var supportingFileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.SupportingAttachment,
            FileObjectPurposes.SupportingAttachment,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        using var client = testFactory.CreateClient();

        using (var outsiderRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            GroupOcrReviewPath(groupId, billId, receiptFileId),
            outsiderSession.RawSessionToken,
            ValidReviewJson()))
        using (var outsiderResponse = await client.SendAsync(outsiderRequest))
        {
            await AssertBillUnavailableProblemAsync(outsiderResponse);
        }

        using (var participantMutationRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            GroupOcrReviewPath(groupId, billId, receiptFileId),
            participantSession.RawSessionToken,
            ValidReviewJson()))
        using (var participantMutationResponse = await client.SendAsync(participantMutationRequest))
        {
            await AssertBillUnavailableProblemAsync(participantMutationResponse);
        }

        using (var wrongBillRequest = CreateBearerRequest(HttpMethod.Get, GroupOcrReviewPath(groupId, otherBillId, receiptFileId), ownerSession.RawSessionToken))
        using (var wrongBillResponse = await client.SendAsync(wrongBillRequest))
        {
            await AssertBillUnavailableProblemAsync(wrongBillResponse);
        }

        using (var wrongGroupRequest = CreateBearerRequest(HttpMethod.Get, GroupOcrReviewPath(wrongGroupId, billId, receiptFileId), ownerSession.RawSessionToken))
        using (var wrongGroupResponse = await client.SendAsync(wrongGroupRequest))
        {
            await AssertBillUnavailableProblemAsync(wrongGroupResponse);
        }

        await UpdateMembershipStatusAsync(testFactory, groupId, participant.UserProfileId, GroupMembershipStatuses.Removed);
        using (var removedMemberRequest = CreateBearerRequest(HttpMethod.Get, GroupOcrReviewPath(groupId, billId, receiptFileId), participantSession.RawSessionToken))
        using (var removedMemberResponse = await client.SendAsync(removedMemberRequest))
        {
            await AssertBillUnavailableProblemAsync(removedMemberResponse);
        }

        using (var finalizedRequest = CreateJsonBearerRequest(HttpMethod.Put, PersonalOcrReviewPath(finalizedBillId, finalizedFileId), ownerSession.RawSessionToken, ValidReviewJson()))
        using (var finalizedResponse = await client.SendAsync(finalizedRequest))
        {
            await AssertReceiptOcrReviewConflictProblemAsync(finalizedResponse);
        }

        using (var archivedRequest = CreateJsonBearerRequest(HttpMethod.Put, PersonalOcrReviewPath(archivedBillId, archivedFileId), ownerSession.RawSessionToken, ValidReviewJson()))
        using (var archivedResponse = await client.SendAsync(archivedRequest))
        {
            await AssertBillUnavailableProblemAsync(archivedResponse);
        }

        foreach (var blockedFileId in new[] { removedFileId, deletedFileId, supportingFileId })
        {
            using var blockedRequest = CreateJsonBearerRequest(
                HttpMethod.Put,
                GroupOcrReviewPath(groupId, billId, blockedFileId),
                ownerSession.RawSessionToken,
                ValidReviewJson());
            using var blockedResponse = await client.SendAsync(blockedRequest);
            await AssertBillUnavailableProblemAsync(blockedResponse);
        }

        Assert.Empty(await ReadReceiptOcrReviewsAsync(testFactory));
        Assert.Empty(await ReadReceiptOcrReviewAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task GroupReceiptOcrReviewRejectsBodySmuggledRouteIdsBeforeSaving()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "OCR Route Body Owner");
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "OCR Route Body Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var wrongGroupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "OCR Body Target Group",
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
        var bodyTargetBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            wrongGroupId,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(3));
        var routeFileId = await SeedBillAttachmentAsync(
            testFactory,
            routeBillId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var bodyTargetFileId = await SeedBillAttachmentAsync(
            testFactory,
            bodyTargetBillId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        using var client = testFactory.CreateClient();
        var body = JsonSerializer.Serialize(new
        {
            status = ReceiptOcrReviewStatuses.Reviewed,
            source = ReceiptOcrReviewSources.ManualEntry,
            merchantText = "Route Body Cafe",
            currency = "USD",
            grandTotalAmount = "10.00",
            lines = new[] { new { text = "Toast", lineTotalAmount = "10.00" } },
            groupId = wrongGroupId,
            billId = bodyTargetBillId,
            fileId = bodyTargetFileId,
            userProfileId = Guid.NewGuid()
        });

        using var request = CreateJsonBearerRequest(
            HttpMethod.Put,
            GroupOcrReviewPath(groupId, routeBillId, routeFileId),
            ownerSession.RawSessionToken,
            body);
        using var response = await client.SendAsync(request);

        await AssertInvalidReceiptOcrReviewProblemAsync(response, body);
        Assert.Empty(await ReadReceiptOcrReviewsAsync(testFactory));
        Assert.Empty(await ReadReceiptOcrReviewAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task PersonalReceiptOcrReviewRejectsBodySmuggledRouteIdsBeforeSaving()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Personal OCR Route Body Owner");
        var routeBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(2));
        var bodyTargetBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(3));
        var routeFileId = await SeedBillAttachmentAsync(
            testFactory,
            routeBillId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var bodyTargetFileId = await SeedBillAttachmentAsync(
            testFactory,
            bodyTargetBillId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        using var client = testFactory.CreateClient();
        var body = JsonSerializer.Serialize(new
        {
            status = ReceiptOcrReviewStatuses.Reviewed,
            source = ReceiptOcrReviewSources.ManualEntry,
            merchantText = "Personal Route Body Cafe",
            currency = "USD",
            grandTotalAmount = "10.00",
            lines = new[] { new { text = "Toast", lineTotalAmount = "10.00" } },
            groupId = Guid.NewGuid(),
            billId = bodyTargetBillId,
            fileId = bodyTargetFileId,
            userProfileId = Guid.NewGuid(),
            ownerUserProfileId = ownerSession.UserProfileId
        });

        using var request = CreateJsonBearerRequest(
            HttpMethod.Put,
            PersonalOcrReviewPath(routeBillId, routeFileId),
            ownerSession.RawSessionToken,
            body);
        using var response = await client.SendAsync(request);

        await AssertInvalidReceiptOcrReviewProblemAsync(response, body);
        Assert.Empty(await ReadReceiptOcrReviewsAsync(testFactory));
        Assert.Empty(await ReadReceiptOcrReviewAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task InvalidReceiptOcrReviewPayloadsAreRejectedWithoutPersistingReviewRows()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Invalid OCR Owner");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(2));
        var fileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        using var client = testFactory.CreateClient();

        var tooManyLines = string.Join(
            ',',
            Enumerable.Range(0, ReceiptOcrReviewConstraints.MaxLineCount + 1)
                .Select(index => $$"""{"text":"Line {{index}}"}"""));
        var invalidPayloads = new[]
        {
            "{}",
            $$"""{"status":"provisional","source":"on_device","merchantText":"{{new string('x', 201)}}"}""",
            """{"status":"accepted","source":"on_device","merchantText":"Cafe"}""",
            """{"status":"provisional","source":"unknown","merchantText":"Cafe"}""",
            """{"status":"provisional","source":"on_device","currency":"usd","grandTotalAmount":"10.00"}""",
            """{"status":"provisional","source":"on_device","currency":"USD","grandTotalAmount":"1e2"}""",
            """{"status":"provisional","source":"on_device","currency":"USD","grandTotalAmount":"-1.00"}""",
            """{"status":"provisional","source":"on_device","grandTotalAmount":"10.00"}""",
            """{"status":"provisional","source":"on_device","currency":"USD","lines":[{"text":"Latte","quantity":"0"}]}""",
            $$"""{"status":"provisional","source":"on_device","lines":[{{tooManyLines}}]}"""
        };

        foreach (var payload in invalidPayloads)
        {
            using var request = CreateJsonBearerRequest(
                HttpMethod.Put,
                PersonalOcrReviewPath(billId, fileId),
                ownerSession.RawSessionToken,
                payload);
            using var response = await client.SendAsync(request);
            await AssertInvalidReceiptOcrReviewProblemAsync(response, payload);
        }

        using (var unauthenticatedRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            PersonalOcrReviewPath(billId, fileId),
            rawSessionToken: null,
            ValidReviewJson()))
        using (var unauthenticatedResponse = await client.SendAsync(unauthenticatedRequest))
        {
            await AssertUnauthenticatedProblemAsync(unauthenticatedResponse);
        }

        using (var wrongTokenRequest = CreateBearerRequest(HttpMethod.Get, PersonalOcrReviewPath(billId, fileId), WrongRawToken))
        using (var wrongTokenResponse = await client.SendAsync(wrongTokenRequest))
        {
            await AssertUnauthenticatedProblemAsync(wrongTokenResponse);
        }

        Assert.Empty(await ReadReceiptOcrReviewsAsync(testFactory));
        Assert.Empty(await ReadReceiptOcrReviewLinesAsync(testFactory));
        Assert.Empty(await ReadReceiptOcrReviewAuditEventsAsync(testFactory));
    }

    [Fact]
    public void OpenApiAndGeneratedClientsExposeReceiptOcrReviewIntakeWithoutGenericFilesOrRawText()
    {
        var openApi = File.ReadAllText(FindRepoFile("packages/contracts/openapi/settleora.v1.yaml"));
        var queueBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/receipt-ocr-reviews:");
        var personalBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/bills/{billId}/attachments/{fileId}/ocr-review:");
        var personalApplyPreviewBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/bills/{billId}/attachments/{fileId}/ocr-review/apply-preview:");
        var personalApplyBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/bills/{billId}/attachments/{fileId}/ocr-review/apply:");
        var groupQueueBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/groups/{groupId}/receipt-ocr-reviews:");
        var groupBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review:");
        var groupApplyPreviewBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review/apply-preview:");
        var groupApplyBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review/apply:");
        var requestSchema = ExtractOpenApiSchemaBlock(openApi, "ReceiptOcrReviewUpsertRequest:");
        var lineRequestSchema = ExtractOpenApiSchemaBlock(openApi, "ReceiptOcrReviewLineRequest:");
        var listResponseSchema = ExtractOpenApiSchemaBlock(openApi, "ReceiptOcrReviewListResponse:");
        var summaryResponseSchema = ExtractOpenApiSchemaBlock(openApi, "ReceiptOcrReviewSummaryResponse:");
        var responseSchema = ExtractOpenApiSchemaBlock(openApi, "ReceiptOcrReviewResponse:");
        var applyPreviewIssueSchema = ExtractOpenApiSchemaBlock(openApi, "ReceiptOcrReviewApplyPreviewIssueCode:");
        var applyPreviewLineSchema = ExtractOpenApiSchemaBlock(openApi, "ReceiptOcrReviewApplyPreviewLineCandidateResponse:");
        var applyPreviewSummarySchema = ExtractOpenApiSchemaBlock(openApi, "ReceiptOcrReviewApplyPreviewSummaryResponse:");
        var applyPreviewResponseSchema = ExtractOpenApiSchemaBlock(openApi, "ReceiptOcrReviewApplyPreviewResponse:");
        var applyModeSchema = ExtractOpenApiSchemaBlock(openApi, "ReceiptOcrReviewApplyMode:");
        var applyRequestSchema = ExtractOpenApiSchemaBlock(openApi, "ReceiptOcrReviewApplyRequest:");
        var applyResponseSchema = ExtractOpenApiSchemaBlock(openApi, "ReceiptOcrReviewApplyResponse:");
        const string positiveQuantityPattern = @"^(?=.*[1-9])(?:0|[0-9]+)(?:\.[0-9]{1,4})?$";
        var positiveQuantityContract = new Regex(positiveQuantityPattern, RegexOptions.CultureInvariant);

        Assert.Contains("operationId: listReceiptOcrReviews", queueBlock);
        Assert.Contains("name: status", queueBlock);
        Assert.Contains("name: source", queueBlock);
        Assert.Contains("name: limit", queueBlock);
        Assert.Contains("operationId: upsertPersonalBillAttachmentOcrReview", personalBlock);
        Assert.Contains("operationId: getPersonalBillAttachmentOcrReview", personalBlock);
        Assert.Contains("operationId: removePersonalBillAttachmentOcrReview", personalBlock);
        Assert.Contains("operationId: getPersonalBillAttachmentOcrReviewApplyPreview", personalApplyPreviewBlock);
        Assert.Contains("operationId: applyPersonalBillAttachmentOcrReview", personalApplyBlock);
        Assert.Contains("operationId: listGroupReceiptOcrReviews", groupQueueBlock);
        Assert.Contains("operationId: upsertGroupBillAttachmentOcrReview", groupBlock);
        Assert.Contains("operationId: getGroupBillAttachmentOcrReview", groupBlock);
        Assert.Contains("operationId: removeGroupBillAttachmentOcrReview", groupBlock);
        Assert.Contains("operationId: getGroupBillAttachmentOcrReviewApplyPreview", groupApplyPreviewBlock);
        Assert.Contains("operationId: applyGroupBillAttachmentOcrReview", groupApplyBlock);
        Assert.Contains("provisional", openApi);
        Assert.Contains("reviewed", openApi);
        Assert.Contains("on_device", openApi);
        Assert.Contains("imported_reviewed_data", openApi);
        Assert.Contains("maxItems: 100", requestSchema);
        Assert.Contains("pattern: \"" + positiveQuantityPattern.Replace(@"\", @"\\") + "\"", lineRequestSchema);
        Assert.All(new[] { "1", "1.0", "0.1", "0.0001", "12.3456", "001.50" }, value =>
            Assert.Matches(positiveQuantityContract, value));
        Assert.All(new[] { "0", "0.0", "0.0000", "-1", "", "1.", "1e2", " 1" }, value =>
        Assert.DoesNotMatch(positiveQuantityContract, value));
        Assert.Contains("reviews", listResponseSchema);
        Assert.Contains("lineCount", summaryResponseSchema);
        Assert.Contains("merchantText", summaryResponseSchema);
        Assert.Contains("grandTotalAmount", responseSchema);
        Assert.Contains("lines", responseSchema);
        Assert.Contains("currency_mismatch", applyPreviewIssueSchema);
        Assert.Contains("line_total_mismatch", applyPreviewIssueSchema);
        Assert.Contains("canApply", applyPreviewResponseSchema);
        Assert.Contains("blockedReasons", applyPreviewResponseSchema);
        Assert.Contains("warnings", applyPreviewResponseSchema);
        Assert.Contains("proposedMerchantText", applyPreviewResponseSchema);
        Assert.Contains("proposedLines", applyPreviewResponseSchema);
        Assert.Contains("proposedLineTotalAmount", applyPreviewLineSchema);
        Assert.Contains("expectedHeaderTotalAmount", applyPreviewSummarySchema);
        Assert.Contains("replace_draft_ocr_items", applyModeSchema);
        Assert.Contains("expectedReviewUpdatedAtUtc", applyRequestSchema);
        Assert.Contains("appliedItemCount", applyResponseSchema);
        Assert.Contains("blockedReasons", applyResponseSchema);
        var safeSchemas = requestSchema
            + listResponseSchema
            + summaryResponseSchema
            + responseSchema
            + applyPreviewIssueSchema
            + applyPreviewLineSchema
            + applyPreviewSummarySchema
            + applyPreviewResponseSchema
            + applyModeSchema
            + applyRequestSchema
            + applyResponseSchema;
        Assert.DoesNotContain("rawText", safeSchemas, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("storageObjectKey", safeSchemas, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("providerPath", safeSchemas, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("signedUrl", safeSchemas, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("/api/v1/files", openApi);
        Assert.DoesNotContain("/api/v1/receipts", openApi);

        var webClient = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/client.ts"));
        var dartClient = File.ReadAllText(FindRepoFile("packages/client-dart/lib/generated/client.dart"));
        var webModels = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/models.ts"));
        var dartModels = File.ReadAllText(FindRepoFile("packages/client-dart/lib/generated/models.dart"));

        Assert.Contains("listReceiptOcrReviews", webClient);
        Assert.Contains("upsertPersonalBillAttachmentOcrReview", webClient);
        Assert.Contains("getPersonalBillAttachmentOcrReview", webClient);
        Assert.Contains("getPersonalBillAttachmentOcrReviewApplyPreview", webClient);
        Assert.Contains("applyPersonalBillAttachmentOcrReview", webClient);
        Assert.Contains("removePersonalBillAttachmentOcrReview", webClient);
        Assert.Contains("listGroupReceiptOcrReviews", dartClient);
        Assert.Contains("upsertGroupBillAttachmentOcrReview", dartClient);
        Assert.Contains("getGroupBillAttachmentOcrReview", dartClient);
        Assert.Contains("getGroupBillAttachmentOcrReviewApplyPreview", dartClient);
        Assert.Contains("applyGroupBillAttachmentOcrReview", dartClient);
        Assert.Contains("removeGroupBillAttachmentOcrReview", dartClient);
        Assert.Contains("ReceiptOcrReviewListResponse", webModels);
        Assert.Contains("class ReceiptOcrReviewSummaryResponse", dartModels);
        Assert.Contains("ReceiptOcrReviewResponse", webModels);
        Assert.Contains("ReceiptOcrReviewApplyPreviewResponse", webModels);
        Assert.Contains("ReceiptOcrReviewApplyRequest", webModels);
        Assert.Contains("ReceiptOcrReviewApplyResponse", webModels);
        Assert.Contains("class ReceiptOcrReviewApplyPreviewResponse", dartModels);
        Assert.Contains("class ReceiptOcrReviewApplyRequest", dartModels);
        Assert.Contains("class ReceiptOcrReviewApplyResponse", dartModels);
        Assert.Contains("ReceiptOcrReviewUpsertRequest", webModels);
        Assert.Contains("class ReceiptOcrReviewResponse", dartModels);
        Assert.Contains("class ReceiptOcrReviewUpsertRequest", dartModels);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new ReceiptOcrReviewTestTimeProvider(InitialTimestamp);
        var testFactory = factory.WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
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

    private static string ValidReviewJson(
        string status = ReceiptOcrReviewStatuses.Provisional,
        string source = ReceiptOcrReviewSources.OnDevice)
    {
        return $$"""
            {
              "status": "{{status}}",
              "source": "{{source}}",
              "merchantText": "Cafe Central",
              "receiptIssuedAtUtc": "2026-05-12T08:00:00Z",
              "currency": "USD",
              "subtotalAmount": "10.00",
              "taxAmount": "0.80",
              "serviceChargeAmount": "1.20",
              "discountAmount": "0.50",
              "grandTotalAmount": "11.50",
              "lines": [
                {
                  "text": "Latte",
                  "quantity": "1",
                  "unitPriceAmount": "5.25",
                  "lineTotalAmount": "5.25"
                },
                {
                  "text": "Bagel",
                  "quantity": "2",
                  "unitPriceAmount": "2.50",
                  "lineTotalAmount": "5.00"
                }
              ]
            }
            """;
    }

    private static string ReplacementReviewJson()
    {
        return $$"""
            {
              "status": "{{ReceiptOcrReviewStatuses.Reviewed}}",
              "source": "{{ReceiptOcrReviewSources.ManualEntry}}",
              "merchantText": "Updated Cafe",
              "receiptIssuedAtUtc": "2026-05-12T09:00:00Z",
              "currency": "USD",
              "subtotalAmount": "9.75",
              "grandTotalAmount": "9.75",
              "lines": [
                {
                  "text": "Flat white",
                  "quantity": "1.5",
                  "unitPriceAmount": "6.50",
                  "lineTotalAmount": "9.75"
                }
              ]
            }
            """;
    }

    private static string ApplyPreviewReadyReviewJson()
    {
        return $$"""
            {
              "status": "{{ReceiptOcrReviewStatuses.Reviewed}}",
              "source": "{{ReceiptOcrReviewSources.ManualEntry}}",
              "merchantText": "Preview Cafe",
              "receiptIssuedAtUtc": "2026-05-12T10:00:00Z",
              "currency": "USD",
              "subtotalAmount": "10.25",
              "taxAmount": "0.80",
              "serviceChargeAmount": "1.20",
              "discountAmount": "0.75",
              "grandTotalAmount": "11.50",
              "lines": [
                {
                  "text": "Toast",
                  "quantity": "1",
                  "unitPriceAmount": "5.25",
                  "lineTotalAmount": "5.25"
                },
                {
                  "text": "Tea",
                  "quantity": "2",
                  "unitPriceAmount": "2.50",
                  "lineTotalAmount": "5.00"
                }
              ]
            }
            """;
    }

    private static string ApplyRequestJson(DateTimeOffset expectedReviewUpdatedAtUtc)
    {
        return JsonSerializer.Serialize(new
        {
            applyMode = ReceiptOcrReviewApplyModes.ReplaceDraftOcrItems,
            expectedReviewUpdatedAtUtc
        });
    }

    private static HttpRequestMessage CreateJsonBearerRequest(
        HttpMethod method,
        string path,
        string? rawSessionToken,
        string json)
    {
        var request = new HttpRequestMessage(method, path);
        if (rawSessionToken is not null)
        {
            request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");
        }

        request.Content = new StringContent(json, Encoding.UTF8, "application/json");
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
        ReceiptOcrReviewTestTimeProvider timeProvider,
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
        ReceiptOcrReviewTestTimeProvider timeProvider,
        SeededAccount account)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Receipt OCR review endpoint test",
                UserAgentSummary: "Receipt OCR review endpoint test user agent",
                NetworkAddressHash: "receipt-ocr-review-endpoint-test-network",
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
            MerchantName = "Seeded bill merchant",
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
            Name = "Seeded bill item",
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
        Guid billId,
        Guid fileOwnerUserProfileId,
        string attachmentPurpose,
        string fileObjectPurpose,
        string status,
        DateTimeOffset? removedAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var fileObjectId = Guid.NewGuid();
        dbContext.Set<FileObject>().Add(new FileObject
        {
            Id = fileObjectId,
            OwnerUserProfileId = fileOwnerUserProfileId,
            CreatedByUserProfileId = fileOwnerUserProfileId,
            Purpose = fileObjectPurpose,
            Status = status,
            ContentType = "image/png",
            OriginalFilename = HiddenOriginalFilename,
            SizeBytes = ValidPngBytes.LongLength,
            Sha256Hash = Convert.ToHexString(SHA256.HashData(ValidPngBytes)).ToLowerInvariant(),
            StorageProvider = StorageProviderNames.Local,
            StorageObjectKey = HiddenStorageObjectKey,
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

        await dbContext.SaveChangesAsync();
        return fileObjectId;
    }

    private static async Task<Guid> SeedExcludedQueueReviewAsync(
        WebApplicationFactory<Program> testFactory,
        Guid ownerUserProfileId,
        Guid groupId,
        DateTimeOffset? archivedAtUtc = null,
        DateTimeOffset? removedAtUtc = null,
        string fileStatus = FileObjectStatuses.Active,
        string attachmentPurpose = ExpenseBillAttachmentPurposes.Receipt,
        string filePurpose = FileObjectPurposes.ReceiptImage)
    {
        var billId = await SeedBillAsync(
            testFactory,
            ownerUserProfileId,
            groupId,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc,
            [ownerUserProfileId],
            [ownerUserProfileId],
            InitialTimestamp.AddMinutes(30));
        var fileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerUserProfileId,
            attachmentPurpose,
            filePurpose,
            fileStatus,
            removedAtUtc);

        return await SeedReceiptOcrReviewAsync(
            testFactory,
            billId,
            fileId,
            ownerUserProfileId,
            groupId,
            ReceiptOcrReviewStatuses.Reviewed,
            ReceiptOcrReviewSources.ImportedReviewedData,
            "Excluded Queue Cafe",
            "USD",
            InitialTimestamp.AddMinutes(31),
            lineCount: 1);
    }

    private static async Task<Guid> SeedReceiptOcrReviewAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId,
        Guid fileId,
        Guid createdByUserProfileId,
        Guid? groupId,
        string status,
        string source,
        string? merchantText,
        string? currency,
        DateTimeOffset createdAtUtc,
        int lineCount)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var review = new ReceiptOcrReview
        {
            Id = Guid.NewGuid(),
            ExpenseBillId = billId,
            FileObjectId = fileId,
            CreatedByUserProfileId = createdByUserProfileId,
            GroupId = groupId,
            Status = status,
            Source = source,
            MerchantText = merchantText,
            Currency = currency,
            GrandTotalAmount = currency is null ? null : 12.34m,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc.AddMinutes(1)
        };

        for (var index = 0; index < lineCount; index++)
        {
            review.Lines.Add(new ReceiptOcrReviewLine
            {
                Id = Guid.NewGuid(),
                ReceiptOcrReviewId = review.Id,
                SortOrder = index,
                Text = $"Queue review line {index + 1}",
                Quantity = 1m,
                UnitPriceAmount = 12.34m,
                LineTotalAmount = 12.34m,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        dbContext.Set<ReceiptOcrReview>().Add(review);
        await dbContext.SaveChangesAsync();
        return review.Id;
    }

    private static async Task<Guid> SeedCustomReceiptOcrReviewAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId,
        Guid fileId,
        Guid createdByUserProfileId,
        Guid? groupId,
        string status,
        string source,
        string? merchantText,
        string? currency,
        decimal? subtotalAmount,
        decimal? taxAmount,
        decimal? serviceChargeAmount,
        decimal? discountAmount,
        decimal? grandTotalAmount,
        DateTimeOffset createdAtUtc,
        params ReceiptOcrReviewLineSeed[] lines)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var review = new ReceiptOcrReview
        {
            Id = Guid.NewGuid(),
            ExpenseBillId = billId,
            FileObjectId = fileId,
            CreatedByUserProfileId = createdByUserProfileId,
            GroupId = groupId,
            Status = status,
            Source = source,
            MerchantText = merchantText,
            Currency = currency,
            SubtotalAmount = subtotalAmount,
            TaxAmount = taxAmount,
            ServiceChargeAmount = serviceChargeAmount,
            DiscountAmount = discountAmount,
            GrandTotalAmount = grandTotalAmount,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc.AddMinutes(1)
        };

        for (var index = 0; index < lines.Length; index++)
        {
            var line = lines[index];
            review.Lines.Add(new ReceiptOcrReviewLine
            {
                Id = Guid.NewGuid(),
                ReceiptOcrReviewId = review.Id,
                SortOrder = index,
                Text = line.Text,
                Quantity = line.Quantity,
                UnitPriceAmount = line.UnitPriceAmount,
                LineTotalAmount = line.LineTotalAmount,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        dbContext.Set<ReceiptOcrReview>().Add(review);
        await dbContext.SaveChangesAsync();
        return review.Id;
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

    private static async Task<ReceiptOcrReview> ReadReceiptOcrReviewAsync(
        WebApplicationFactory<Program> testFactory,
        Guid reviewId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ReceiptOcrReview>()
            .AsNoTracking()
            .Include(review => review.Lines)
            .SingleAsync(review => review.Id == reviewId);
    }

    private static async Task<IReadOnlyList<ReceiptOcrReview>> ReadReceiptOcrReviewsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ReceiptOcrReview>()
            .AsNoTracking()
            .OrderBy(review => review.CreatedAtUtc)
            .ToArrayAsync();
    }

    private static async Task<IReadOnlyList<ReceiptOcrReviewLine>> ReadReceiptOcrReviewLinesAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ReceiptOcrReviewLine>()
            .AsNoTracking()
            .OrderBy(line => line.SortOrder)
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

    private static async Task<FileObject> ReadFileObjectAsync(
        WebApplicationFactory<Program> testFactory,
        Guid fileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<FileObject>()
            .AsNoTracking()
            .SingleAsync(fileObject => fileObject.Id == fileId);
    }

    private static async Task<ExpenseBill> ReadBillAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ExpenseBill>()
            .AsNoTracking()
            .Include(bill => bill.Items)
                .ThenInclude(item => item.Splits)
            .Include(bill => bill.Participants)
            .Include(bill => bill.Payers)
            .Include(bill => bill.Adjustments)
            .SingleAsync(bill => bill.Id == billId);
    }

    private static async Task<int> CountBillItemsAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ExpenseBillItem>()
            .AsNoTracking()
            .CountAsync(item => item.ExpenseBillId == billId);
    }

    private static async Task<int> CountBillItemSplitsAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ExpenseBillItemSplit>()
            .AsNoTracking()
            .CountAsync(split => split.ExpenseBillItem.ExpenseBillId == billId);
    }

    private static async Task<int> CountBillParticipantsAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ExpenseBillParticipant>()
            .AsNoTracking()
            .CountAsync(participant => participant.ExpenseBillId == billId);
    }

    private static async Task<int> CountBillPayersAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ExpenseBillPayer>()
            .AsNoTracking()
            .CountAsync(payer => payer.ExpenseBillId == billId);
    }

    private static async Task<int> CountBillAdjustmentsAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ExpenseBillAdjustment>()
            .AsNoTracking()
            .CountAsync(adjustment => adjustment.ExpenseBillId == billId);
    }

    private static async Task<IReadOnlyList<object>> ReadSettlementRequestsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<Settleora.Api.Domain.Settlements.SettlementRequest>()
            .AsNoTracking()
            .Cast<object>()
            .ToArrayAsync();
    }

    private static async Task<IReadOnlyList<object>> ReadSettlementPaymentsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<Settleora.Api.Domain.Settlements.SettlementPayment>()
            .AsNoTracking()
            .Cast<object>()
            .ToArrayAsync();
    }

    private static async Task<IReadOnlyList<object>> ReadSettlementPaymentAllocationsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<Settleora.Api.Domain.Settlements.SettlementPaymentAllocation>()
            .AsNoTracking()
            .Cast<object>()
            .ToArrayAsync();
    }

    private static async Task<IReadOnlyList<object>> ReadSettlementResidualsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<Settleora.Api.Domain.Settlements.SettlementResidual>()
            .AsNoTracking()
            .Cast<object>()
            .ToArrayAsync();
    }

    private static async Task<IReadOnlyList<AuthAuditEvent>> ReadReceiptOcrReviewAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthAuditEvent>()
            .AsNoTracking()
            .Where(auditEvent => auditEvent.Action.StartsWith("bill_attachment.ocr_review"))
            .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
            .ThenBy(auditEvent => auditEvent.Action)
            .ToArrayAsync();
    }

    private static ReceiptOcrReviewPayload ReadReviewPayload(string content)
    {
        using var document = JsonDocument.Parse(content);
        var root = document.RootElement;
        Assert.Equal(
            [
                "billId",
                "createdAtUtc",
                "currency",
                "discountAmount",
                "fileId",
                "grandTotalAmount",
                "groupId",
                "id",
                "lines",
                "merchantText",
                "receiptIssuedAtUtc",
                "serviceChargeAmount",
                "source",
                "status",
                "subtotalAmount",
                "taxAmount",
                "updatedAtUtc"
            ],
            root.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal).ToArray());

        return new ReceiptOcrReviewPayload(
            root.GetProperty("id").GetGuid(),
            root.GetProperty("billId").GetGuid(),
            root.GetProperty("fileId").GetGuid(),
            root.GetProperty("groupId").ValueKind is JsonValueKind.Null
                ? null
                : root.GetProperty("groupId").GetGuid(),
            root.GetProperty("status").GetString()!,
            root.GetProperty("source").GetString()!,
            root.GetProperty("merchantText").GetString(),
            root.GetProperty("currency").GetString(),
            root.GetProperty("grandTotalAmount").GetString(),
            root.GetProperty("lines")
                .EnumerateArray()
                .Select(line => new ReceiptOcrReviewLinePayload(
                    line.GetProperty("id").GetGuid(),
                    line.GetProperty("sortOrder").GetInt32(),
                    line.GetProperty("text").GetString()!))
                .ToArray());
    }

    private static ReceiptOcrReviewQueuePayload ReadReviewQueuePayload(string content)
    {
        using var document = JsonDocument.Parse(content);
        var root = document.RootElement;
        Assert.Equal(["reviews"], root.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal).ToArray());

        return new ReceiptOcrReviewQueuePayload(
            root.GetProperty("reviews")
                .EnumerateArray()
                .Select(ReadReviewQueueSummaryPayload)
                .ToArray());
    }

    private static ReceiptOcrReviewSummaryPayload ReadReviewQueueSummaryPayload(JsonElement root)
    {
        Assert.Equal(
            [
                "billId",
                "createdAtUtc",
                "currency",
                "fileId",
                "groupId",
                "lineCount",
                "merchantText",
                "reviewId",
                "source",
                "status",
                "updatedAtUtc"
            ],
            root.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal).ToArray());

        return new ReceiptOcrReviewSummaryPayload(
            root.GetProperty("reviewId").GetGuid(),
            root.GetProperty("billId").GetGuid(),
            root.GetProperty("groupId").ValueKind is JsonValueKind.Null
                ? null
                : root.GetProperty("groupId").GetGuid(),
            root.GetProperty("fileId").GetGuid(),
            root.GetProperty("status").GetString()!,
            root.GetProperty("source").GetString()!,
            root.GetProperty("merchantText").GetString(),
            root.GetProperty("currency").GetString(),
            root.GetProperty("lineCount").GetInt32(),
            root.GetProperty("createdAtUtc").GetDateTimeOffset(),
            root.GetProperty("updatedAtUtc").GetDateTimeOffset());
    }

    private static ReceiptOcrReviewApplyPreviewPayload ReadApplyPreviewPayload(string content)
    {
        using var document = JsonDocument.Parse(content);
        var root = document.RootElement;
        Assert.Equal(
            [
                "billId",
                "blockedReasons",
                "canApply",
                "createdAtUtc",
                "fileId",
                "groupId",
                "proposedCurrency",
                "proposedDiscountAmount",
                "proposedGrandTotalAmount",
                "proposedLines",
                "proposedMerchantText",
                "proposedReceiptIssuedAtUtc",
                "proposedServiceChargeAmount",
                "proposedSubtotalAmount",
                "proposedTaxAmount",
                "reviewId",
                "source",
                "status",
                "summary",
                "updatedAtUtc",
                "warnings"
            ],
            root.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal).ToArray());

        return new ReceiptOcrReviewApplyPreviewPayload(
            root.GetProperty("reviewId").GetGuid(),
            root.GetProperty("billId").GetGuid(),
            root.GetProperty("groupId").ValueKind is JsonValueKind.Null
                ? null
                : root.GetProperty("groupId").GetGuid(),
            root.GetProperty("fileId").GetGuid(),
            root.GetProperty("canApply").GetBoolean(),
            root.GetProperty("blockedReasons").EnumerateArray().Select(value => value.GetString()!).ToArray(),
            root.GetProperty("warnings").EnumerateArray().Select(value => value.GetString()!).ToArray(),
            root.GetProperty("proposedMerchantText").GetString(),
            root.GetProperty("proposedCurrency").GetString(),
            root.GetProperty("proposedGrandTotalAmount").GetString(),
            root.GetProperty("proposedLines").EnumerateArray().Select(ReadApplyPreviewLinePayload).ToArray(),
            ReadApplyPreviewSummaryPayload(root.GetProperty("summary")));
    }

    private static ReceiptOcrReviewApplyPreviewLinePayload ReadApplyPreviewLinePayload(JsonElement root)
    {
        Assert.Equal(
            [
                "lineTotalAmount",
                "proposedLineTotalAmount",
                "quantity",
                "reviewLineId",
                "sortOrder",
                "text",
                "unitPriceAmount"
            ],
            root.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal).ToArray());

        return new ReceiptOcrReviewApplyPreviewLinePayload(
            root.GetProperty("reviewLineId").GetGuid(),
            root.GetProperty("sortOrder").GetInt32(),
            root.GetProperty("text").GetString()!,
            root.GetProperty("proposedLineTotalAmount").GetString());
    }

    private static ReceiptOcrReviewApplyPreviewSummaryPayload ReadApplyPreviewSummaryPayload(JsonElement root)
    {
        Assert.Equal(
            [
                "expectedHeaderTotalAmount",
                "lineCount",
                "linesMissingProposedTotalCount",
                "linesWithProposedTotalCount",
                "proposedLineTotalSumAmount"
            ],
            root.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal).ToArray());

        return new ReceiptOcrReviewApplyPreviewSummaryPayload(
            root.GetProperty("lineCount").GetInt32(),
            root.GetProperty("linesWithProposedTotalCount").GetInt32(),
            root.GetProperty("linesMissingProposedTotalCount").GetInt32(),
            root.GetProperty("proposedLineTotalSumAmount").GetString(),
            root.GetProperty("expectedHeaderTotalAmount").GetString());
    }

    private static ReceiptOcrReviewApplyPayload ReadApplyPayload(string content)
    {
        using var document = JsonDocument.Parse(content);
        var root = document.RootElement;
        Assert.Equal(
            [
                "appliedAtUtc",
                "appliedItemCount",
                "applyMode",
                "billId",
                "blockedReasons",
                "currency",
                "fileId",
                "grandTotalAmount",
                "groupId",
                "reviewId",
                "subtotalAmount",
                "summary",
                "warnings"
            ],
            root.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal).ToArray());

        return new ReceiptOcrReviewApplyPayload(
            root.GetProperty("reviewId").GetGuid(),
            root.GetProperty("billId").GetGuid(),
            root.GetProperty("groupId").ValueKind is JsonValueKind.Null
                ? null
                : root.GetProperty("groupId").GetGuid(),
            root.GetProperty("fileId").GetGuid(),
            root.GetProperty("applyMode").GetString()!,
            root.GetProperty("appliedItemCount").GetInt32(),
            root.GetProperty("currency").GetString()!,
            root.GetProperty("subtotalAmount").GetString(),
            root.GetProperty("grandTotalAmount").GetString(),
            root.GetProperty("blockedReasons").EnumerateArray().Select(value => value.GetString()!).ToArray(),
            root.GetProperty("warnings").EnumerateArray().Select(value => value.GetString()!).ToArray(),
            root.GetProperty("appliedAtUtc").GetDateTimeOffset());
    }

    private static void AssertReviewAuditMetadata(
        AuthAuditEvent auditEvent,
        string expectedAction,
        Guid expectedBillId,
        Guid? groupId,
        Guid expectedFileId,
        Guid expectedReviewId,
        string expectedActionCategory,
        int expectedLineCount = 2,
        string? expectedApplyMode = null)
    {
        Assert.Equal(expectedAction, auditEvent.Action);
        Assert.Equal(AuthAuditOutcomes.Success, auditEvent.Outcome);
        Assert.NotNull(auditEvent.SafeMetadataJson);
        Assert.True(auditEvent.SafeMetadataJson!.Length <= 4096);

        using var metadata = JsonDocument.Parse(auditEvent.SafeMetadataJson);
        Assert.Equal("receipt_ocr_review_intake", metadata.RootElement.GetProperty("workflowName").GetString());
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

        Assert.Equal(expectedFileId.ToString("D"), metadata.RootElement.GetProperty("fileObjectId").GetString());
        Assert.Equal(expectedReviewId.ToString("D"), metadata.RootElement.GetProperty("receiptOcrReviewId").GetString());
        Assert.Equal(ExpenseBillAttachmentPurposes.Receipt, metadata.RootElement.GetProperty("attachmentPurpose").GetString());
        Assert.Equal(expectedActionCategory, metadata.RootElement.GetProperty("actionCategory").GetString());
        Assert.Equal(expectedLineCount, metadata.RootElement.GetProperty("lineCount").GetInt32());
        if (expectedApplyMode is null)
        {
            Assert.False(metadata.RootElement.TryGetProperty("applyMode", out _));
        }
        else
        {
            Assert.Equal(expectedApplyMode, metadata.RootElement.GetProperty("applyMode").GetString());
        }

        AssertSafeAuditContent(auditEvent);
    }

    private static async Task AssertUnauthenticatedProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Unauthenticated", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(401, payload.RootElement.GetProperty("status").GetInt32());
    }

    private static async Task AssertBillUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Bill unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
    }

    private static async Task AssertReceiptOcrReviewUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Receipt OCR review unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
    }

    private static async Task AssertInvalidReceiptOcrReviewProblemAsync(
        HttpResponseMessage response,
        string submittedPayload)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);
        Assert.DoesNotContain(submittedPayload, content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid receipt OCR review", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.True(payload.RootElement.TryGetProperty("errors", out _));
    }

    private static async Task AssertInvalidReceiptOcrReviewQueryProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid receipt OCR review query", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.True(payload.RootElement.TryGetProperty("errors", out _));
    }

    private static async Task AssertReceiptOcrReviewConflictProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Receipt OCR review conflict", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
    }

    private static void AssertSafeReviewJson(string content)
    {
        var lowerContent = content.ToLowerInvariant();
        Assert.DoesNotContain(HiddenOriginalFilename, content);
        Assert.DoesNotContain(HiddenStorageObjectKey, content);
        Assert.DoesNotContain(HiddenRawOcrText, content);
        Assert.DoesNotContain("auth", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("objectkey", lowerContent);
        Assert.DoesNotContain("object_key", lowerContent);
        Assert.DoesNotContain("signedurl", lowerContent);
        Assert.DoesNotContain("rawtext", lowerContent);
    }

    private static void AssertSafeProblemContent(string content)
    {
        var lowerContent = content.ToLowerInvariant();
        Assert.DoesNotContain(WrongRawToken, content);
        Assert.DoesNotContain(HiddenRawOcrText, content);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("objectkey", lowerContent);
        Assert.DoesNotContain("object_key", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
        Assert.DoesNotContain("vault", lowerContent);
        Assert.DoesNotContain("cafe central", lowerContent);
        Assert.DoesNotContain("latte", lowerContent);
    }

    private static void AssertSafeAuditContent(AuthAuditEvent auditEvent)
    {
        var auditText = string.Join(
            "\n",
            auditEvent.Action,
            auditEvent.Outcome,
            auditEvent.SafeMetadataJson ?? string.Empty);
        var lowerAuditText = auditText.ToLowerInvariant();

        Assert.DoesNotContain(HiddenOriginalFilename, auditText);
        Assert.DoesNotContain(HiddenStorageObjectKey, auditText);
        Assert.DoesNotContain("Cafe Central", auditText);
        Assert.DoesNotContain("Latte", auditText);
        Assert.DoesNotContain(HiddenRawOcrText, auditText);
        Assert.DoesNotContain("requestbody", lowerAuditText);
        Assert.DoesNotContain("request_body", lowerAuditText);
        Assert.DoesNotContain("token", lowerAuditText);
        Assert.DoesNotContain("password", lowerAuditText);
        Assert.DoesNotContain("credential", lowerAuditText);
        Assert.DoesNotContain("verifier", lowerAuditText);
        Assert.DoesNotContain("provider", lowerAuditText);
        Assert.DoesNotContain("storageobjectkey", lowerAuditText);
        Assert.DoesNotContain("storage_object_key", lowerAuditText);
        Assert.DoesNotContain("path", lowerAuditText);
        Assert.DoesNotContain("vault", lowerAuditText);
        Assert.DoesNotContain("filename", lowerAuditText);
    }

    private static string PersonalOcrReviewPath(Guid billId, Guid fileId)
    {
        return $"/api/v1/bills/{billId:D}/attachments/{fileId:D}/ocr-review";
    }

    private static string PersonalOcrReviewApplyPreviewPath(Guid billId, Guid fileId)
    {
        return $"/api/v1/bills/{billId:D}/attachments/{fileId:D}/ocr-review/apply-preview";
    }

    private static string PersonalOcrReviewApplyPath(Guid billId, Guid fileId)
    {
        return $"/api/v1/bills/{billId:D}/attachments/{fileId:D}/ocr-review/apply";
    }

    private static string GroupOcrReviewPath(Guid groupId, Guid billId, Guid fileId)
    {
        return $"/api/v1/groups/{groupId:D}/bills/{billId:D}/attachments/{fileId:D}/ocr-review";
    }

    private static string GroupOcrReviewApplyPreviewPath(Guid groupId, Guid billId, Guid fileId)
    {
        return $"/api/v1/groups/{groupId:D}/bills/{billId:D}/attachments/{fileId:D}/ocr-review/apply-preview";
    }

    private static string GroupOcrReviewApplyPath(Guid groupId, Guid billId, Guid fileId)
    {
        return $"/api/v1/groups/{groupId:D}/bills/{billId:D}/attachments/{fileId:D}/ocr-review/apply";
    }

    private static string ReceiptOcrReviewQueuePath(string? query = null)
    {
        return query is null
            ? "/api/v1/receipt-ocr-reviews"
            : $"/api/v1/receipt-ocr-reviews?{query}";
    }

    private static string GroupReceiptOcrReviewQueuePath(Guid groupId, string? query = null)
    {
        return query is null
            ? $"/api/v1/groups/{groupId:D}/receipt-ocr-reviews"
            : $"/api/v1/groups/{groupId:D}/receipt-ocr-reviews?{query}";
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
        ReceiptOcrReviewTestTimeProvider TimeProvider);

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

    private sealed record ReceiptOcrReviewLineSeed(
        string Text,
        decimal? Quantity,
        decimal? UnitPriceAmount,
        decimal? LineTotalAmount);

    private sealed record ReceiptOcrReviewPayload(
        Guid Id,
        Guid BillId,
        Guid FileId,
        Guid? GroupId,
        string Status,
        string Source,
        string? MerchantText,
        string? Currency,
        string? GrandTotalAmount,
        IReadOnlyList<ReceiptOcrReviewLinePayload> Lines);

    private sealed record ReceiptOcrReviewLinePayload(
        Guid Id,
        int SortOrder,
        string Text);

    private sealed record ReceiptOcrReviewQueuePayload(
        IReadOnlyList<ReceiptOcrReviewSummaryPayload> Reviews);

    private sealed record ReceiptOcrReviewSummaryPayload(
        Guid ReviewId,
        Guid BillId,
        Guid? GroupId,
        Guid FileId,
        string Status,
        string Source,
        string? MerchantText,
        string? Currency,
        int LineCount,
        DateTimeOffset CreatedAtUtc,
        DateTimeOffset UpdatedAtUtc);

    private sealed record ReceiptOcrReviewApplyPreviewPayload(
        Guid ReviewId,
        Guid BillId,
        Guid? GroupId,
        Guid FileId,
        bool CanApply,
        IReadOnlyList<string> BlockedReasons,
        IReadOnlyList<string> Warnings,
        string? ProposedMerchantText,
        string? ProposedCurrency,
        string? ProposedGrandTotalAmount,
        IReadOnlyList<ReceiptOcrReviewApplyPreviewLinePayload> ProposedLines,
        ReceiptOcrReviewApplyPreviewSummaryPayload Summary);

    private sealed record ReceiptOcrReviewApplyPreviewLinePayload(
        Guid ReviewLineId,
        int SortOrder,
        string Text,
        string? ProposedLineTotalAmount);

    private sealed record ReceiptOcrReviewApplyPreviewSummaryPayload(
        int LineCount,
        int LinesWithProposedTotalCount,
        int LinesMissingProposedTotalCount,
        string? ProposedLineTotalSumAmount,
        string? ExpectedHeaderTotalAmount);

    private sealed record ReceiptOcrReviewApplyPayload(
        Guid ReviewId,
        Guid BillId,
        Guid? GroupId,
        Guid FileId,
        string ApplyMode,
        int AppliedItemCount,
        string Currency,
        string? SubtotalAmount,
        string? GrandTotalAmount,
        IReadOnlyList<string> BlockedReasons,
        IReadOnlyList<string> Warnings,
        DateTimeOffset AppliedAtUtc);

    private sealed class ReceiptOcrReviewTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public ReceiptOcrReviewTestTimeProvider(DateTimeOffset utcNow)
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
