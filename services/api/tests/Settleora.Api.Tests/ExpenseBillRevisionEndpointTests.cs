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
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Expenses.BillRevisions;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class ExpenseBillRevisionEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 10, 5, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 10, 5, 10, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 5, 10, 5, 30, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public ExpenseBillRevisionEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task AllowedActorCanCreateListAndGetDraftRevisionForVisibleBill()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Create Creator");
        var participant = await SeedAccountAsync(testFactory, "Revision Create Participant", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 50m),
                new ParticipantSeed(participant.UserProfileId, 50m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();

        using var createRequest = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            creatorSession.RawSessionToken,
            SnapshotJson(
                [(creatorSession.UserProfileId, 40m), (participant.UserProfileId, 60m)],
                [(creatorSession.UserProfileId, 100m)]));
        using var createResponse = await client.SendAsync(createRequest);
        var createContent = await createResponse.Content.ReadAsStringAsync();

        Assert.True(createResponse.StatusCode == HttpStatusCode.Created, createContent);
        using var createPayload = JsonDocument.Parse(createContent);
        var revisionId = createPayload.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(billId, createPayload.RootElement.GetProperty("billId").GetGuid());
        Assert.Equal(creatorSession.UserProfileId, createPayload.RootElement.GetProperty("proposalCreatorUserProfileId").GetGuid());
        Assert.Equal(ExpenseBillRevisionStatuses.DraftRevision, createPayload.RootElement.GetProperty("status").GetString());
        Assert.Equal("100", createPayload.RootElement.GetProperty("totalAmount").GetString());
        Assert.Equal("USD", createPayload.RootElement.GetProperty("totalCurrency").GetString());
        Assert.Equal(64, createPayload.RootElement.GetProperty("calculationHash").GetString()!.Length);
        Assert.Equal(2, createPayload.RootElement.GetProperty("participants").GetArrayLength());
        Assert.Equal(2, createPayload.RootElement.GetProperty("approvals").GetArrayLength());
        AssertViewerActions(
            createPayload.RootElement,
            canSubmit: true,
            canWithdraw: true,
            canRevise: true,
            canApprove: false,
            canReject: false,
            canConfirmPayer: false,
            canApply: false);

        using var listRequest = CreateBearerRequest(HttpMethod.Get, RevisionsPath(billId), creatorSession.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);
        var listContent = await listResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        using var listPayload = JsonDocument.Parse(listContent);
        var listedRevision = Assert.Single(listPayload.RootElement.GetProperty("revisions").EnumerateArray());
        Assert.Equal(revisionId, listedRevision.GetProperty("id").GetGuid());

        using var getRequest = CreateBearerRequest(HttpMethod.Get, RevisionPath(billId, revisionId), participant.RawSessionToken ?? creatorSession.RawSessionToken);
        using var getResponse = await client.SendAsync(getRequest);
        var getContent = await getResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        using var getPayload = JsonDocument.Parse(getContent);
        Assert.Equal(revisionId, getPayload.RootElement.GetProperty("id").GetGuid());
        AssertViewerActions(
            getPayload.RootElement,
            canSubmit: true,
            canWithdraw: true,
            canRevise: true,
            canApprove: false,
            canReject: false,
            canConfirmPayer: false,
            canApply: false);
    }

    [Fact]
    public async Task UnrelatedActorCannotListGetCreateUpdateSubmitWithdrawApproveOrRejectRevisions()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Unrelated Creator");
        var participant = await SeedAccountAsync(testFactory, "Revision Unrelated Participant", InitialTimestamp.AddMinutes(1));
        var unrelatedSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Unrelated Actor");
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 50m),
                new ParticipantSeed(participant.UserProfileId, 50m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateDraftRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            creatorSession.RawSessionToken,
            creatorSession.UserProfileId,
            participant.UserProfileId);
        using var client = testFactory.CreateClient();
        var snapshotBody = SnapshotJson(
            [(creatorSession.UserProfileId, 45m), (participant.UserProfileId, 55m)],
            [(creatorSession.UserProfileId, 100m)]);
        var approvalBody = ApprovalJson("50", "USD", new string('a', 64));
        var requests = new[]
        {
            CreateBearerRequest(HttpMethod.Get, RevisionsPath(billId), unrelatedSession.RawSessionToken),
            CreateBearerRequest(HttpMethod.Get, RevisionPath(billId, revisionId), unrelatedSession.RawSessionToken),
            CreateJsonRequest(HttpMethod.Post, RevisionsPath(billId), unrelatedSession.RawSessionToken, snapshotBody),
            CreateJsonRequest(HttpMethod.Patch, RevisionPath(billId, revisionId), unrelatedSession.RawSessionToken, snapshotBody),
            CreateBearerRequest(HttpMethod.Post, SubmitPath(billId, revisionId), unrelatedSession.RawSessionToken),
            CreateBearerRequest(HttpMethod.Post, WithdrawPath(billId, revisionId), unrelatedSession.RawSessionToken),
            CreateJsonRequest(HttpMethod.Post, ApprovePath(billId, revisionId), unrelatedSession.RawSessionToken, approvalBody),
            CreateBearerRequest(HttpMethod.Post, RejectPath(billId, revisionId), unrelatedSession.RawSessionToken),
            CreateJsonRequest(HttpMethod.Post, PayerConfirmationPath(billId, revisionId), unrelatedSession.RawSessionToken, PayerConfirmationJson(new string('a', 64))),
            CreateBearerRequest(HttpMethod.Post, ApplyPath(billId, revisionId), unrelatedSession.RawSessionToken)
        };

        foreach (var request in requests)
        {
            using (request)
            using (var response = await client.SendAsync(request))
            {
                var deniedContent = await response.Content.ReadAsStringAsync();
                Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
                Assert.DoesNotContain("reviewContext", deniedContent, StringComparison.Ordinal);
            }
        }

        var revision = await ReadRevisionAsync(testFactory, revisionId);
        Assert.Equal(ExpenseBillRevisionStatuses.DraftRevision, revision.Status);
    }

    [Fact]
    public async Task BillRevisionReadoutsRejectUnsupportedQueryAndBodiesWithoutSideEffectsOrEcho()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Envelope Creator");
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Envelope Participant");
        var smuggledBillId = Guid.NewGuid();
        var smuggledRevisionId = Guid.NewGuid();
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 50m),
                new ParticipantSeed(participantSession.UserProfileId, 50m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateDraftRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            creatorSession.RawSessionToken,
            creatorSession.UserProfileId,
            participantSession.UserProfileId);
        var revisionBefore = await ReadRevisionAsync(testFactory, revisionId);
        var notificationCountBefore = (await ReadNotificationsAsync(testFactory)).Count;
        var revisionAuditCountBefore = (await ReadRevisionAuditEventsAsync(testFactory)).Count;
        using var client = testFactory.CreateClient();

        using (var listQueryRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"{RevisionsPath(billId)}?billId={smuggledBillId:D}&revisionId={smuggledRevisionId:D}&merchant=SecretMerchant",
            creatorSession.RawSessionToken))
        using (var listQueryResponse = await client.SendAsync(listQueryRequest))
        {
            var content = await listQueryResponse.Content.ReadAsStringAsync();

            Assert.Equal(HttpStatusCode.BadRequest, listQueryResponse.StatusCode);
            Assert.Contains("Unsupported query fields are not allowed.", content);
            Assert.DoesNotContain(smuggledBillId.ToString("D"), content, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(smuggledRevisionId.ToString("D"), content, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("SecretMerchant", content, StringComparison.Ordinal);
        }

        using (var getQueryRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"{RevisionPath(billId, revisionId)}?userProfileId={participantSession.UserProfileId:D}&revisionSummary=HiddenSnapshot",
            creatorSession.RawSessionToken))
        using (var getQueryResponse = await client.SendAsync(getQueryRequest))
        {
            var content = await getQueryResponse.Content.ReadAsStringAsync();

            Assert.Equal(HttpStatusCode.BadRequest, getQueryResponse.StatusCode);
            Assert.Contains("Unsupported query fields are not allowed.", content);
            Assert.DoesNotContain(participantSession.UserProfileId.ToString("D"), content, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("HiddenSnapshot", content, StringComparison.Ordinal);
        }

        using (var getBodyRequest = CreateJsonRequest(
            HttpMethod.Get,
            RevisionPath(billId, revisionId),
            creatorSession.RawSessionToken,
            $$"""
            {
              "billId": "{{smuggledBillId:D}}",
              "revisionId": "{{smuggledRevisionId:D}}",
              "participantEmail": "hidden@example.test",
              "ocrText": "private ocr text",
              "storageObjectKey": "receipts/private-key"
            }
            """))
        using (var getBodyResponse = await client.SendAsync(getBodyRequest))
        {
            var content = await getBodyResponse.Content.ReadAsStringAsync();

            Assert.Equal(HttpStatusCode.BadRequest, getBodyResponse.StatusCode);
            Assert.Contains("Bill revision read requests do not accept a request body.", content);
            Assert.DoesNotContain(smuggledBillId.ToString("D"), content, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(smuggledRevisionId.ToString("D"), content, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("hidden@example.test", content, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("private ocr text", content, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("receipts/private-key", content, StringComparison.OrdinalIgnoreCase);
        }

        var revisionAfter = await ReadRevisionAsync(testFactory, revisionId);
        Assert.Equal(revisionBefore.Status, revisionAfter.Status);
        Assert.Equal(revisionBefore.UpdatedAtUtc, revisionAfter.UpdatedAtUtc);
        Assert.Equal(revisionBefore.Approvals.Count, revisionAfter.Approvals.Count);
        Assert.Equal(notificationCountBefore, (await ReadNotificationsAsync(testFactory)).Count);
        Assert.Equal(revisionAuditCountBefore, (await ReadRevisionAuditEventsAsync(testFactory)).Count);
    }

    [Fact]
    public async Task RemovedGroupParticipantCannotSeeOrCreateRevisions()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Group Owner");
        var removedSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Removed Member");
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Revision Removed Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(removedSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed));
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(removedSession.UserProfileId, 50m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        using var listRequest = CreateBearerRequest(HttpMethod.Get, RevisionsPath(billId), removedSession.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);
        Assert.Equal(HttpStatusCode.NotFound, listResponse.StatusCode);

        using var createRequest = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            removedSession.RawSessionToken,
            SnapshotJson(
                [(ownerSession.UserProfileId, 40m), (removedSession.UserProfileId, 60m)],
                [(ownerSession.UserProfileId, 100m)]));
        using var createResponse = await client.SendAsync(createRequest);
        Assert.Equal(HttpStatusCode.NotFound, createResponse.StatusCode);
    }

    [Fact]
    public async Task OneActivePendingRevisionPerBillIsEnforcedThroughApi()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Slot Creator");
        var participant = await SeedAccountAsync(testFactory, "Revision Slot Participant", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 50m),
                new ParticipantSeed(participant.UserProfileId, 50m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        using var firstRequest = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            creatorSession.RawSessionToken,
            SnapshotJson(
                [(creatorSession.UserProfileId, 40m), (participant.UserProfileId, 60m)],
                [(creatorSession.UserProfileId, 100m)]));
        using var firstResponse = await client.SendAsync(firstRequest);
        Assert.Equal(HttpStatusCode.Created, firstResponse.StatusCode);

        using var secondRequest = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            creatorSession.RawSessionToken,
            SnapshotJson(
                [(creatorSession.UserProfileId, 45m), (participant.UserProfileId, 55m)],
                [(creatorSession.UserProfileId, 100m)]));
        using var secondResponse = await client.SendAsync(secondRequest);

        await AssertBillRevisionConflictProblemAsync(secondResponse);
    }

    [Fact]
    public async Task ConfirmedBillRevisionCanReferenceSavedReceiptOcrReviewWithoutRewritingActiveBillTruth()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision OCR Creator");
        var participant = await SeedAccountAsync(testFactory, "Revision OCR Participant", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 50m),
                new ParticipantSeed(participant.UserProfileId, 50m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var fileId = await SeedReceiptAttachmentAsync(testFactory, billId, creatorSession.UserProfileId);
        var reviewId = await SeedReceiptOcrReviewAsync(
            testFactory,
            billId,
            fileId,
            creatorSession.UserProfileId,
            groupId: null,
            updatedAtUtc: InitialTimestamp.AddMinutes(7));
        var review = await ReadReceiptOcrReviewAsync(testFactory, reviewId);
        using var client = testFactory.CreateClient();

        using var createRequest = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            creatorSession.RawSessionToken,
            SnapshotJsonWithOcrSource(
                [(creatorSession.UserProfileId, 40m), (participant.UserProfileId, 60m)],
                [(creatorSession.UserProfileId, 100m)],
                fileId,
                reviewId,
                review.UpdatedAtUtc));
        using var createResponse = await client.SendAsync(createRequest);
        var createContent = await createResponse.Content.ReadAsStringAsync();

        Assert.True(createResponse.StatusCode == HttpStatusCode.Created, createContent);
        using var createPayload = JsonDocument.Parse(createContent);
        Assert.Equal(ExpenseBillRevisionStatuses.DraftRevision, createPayload.RootElement.GetProperty("status").GetString());
        var source = createPayload.RootElement.GetProperty("sourceOcrReview");
        Assert.Equal(fileId, source.GetProperty("receiptAttachmentFileId").GetGuid());
        Assert.Equal(reviewId, source.GetProperty("ocrReviewId").GetGuid());
        Assert.Equal("saved_receipt_ocr_review", source.GetProperty("sourceMode").GetString());
        Assert.Equal("referenced", source.GetProperty("status").GetString());
        Assert.DoesNotContain("private ocr text", createContent, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("receipts/private-key", createContent, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("rawOcr", createContent, StringComparison.OrdinalIgnoreCase);

        var bill = await ReadBillAsync(testFactory, billId);
        Assert.Equal(100m, bill.TotalAmount);
        Assert.Null(bill.ActiveAcceptedBillRevisionId);
        Assert.Equal(ExpenseBillStatuses.Confirmed, bill.Status);

        var revisionId = createPayload.RootElement.GetProperty("id").GetGuid();
        var revision = await ReadRevisionAsync(testFactory, revisionId);
        using var proposedSnapshot = JsonDocument.Parse(revision.ProposedSnapshotJson);
        Assert.Equal(fileId, proposedSnapshot.RootElement.GetProperty("attachmentFileIds")[0].GetGuid());
        Assert.Equal(reviewId, proposedSnapshot.RootElement.GetProperty("receiptOcrReviewIds")[0].GetGuid());
        Assert.DoesNotContain("private ocr text", revision.ProposedSnapshotJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("objectKey", revision.ProposedSnapshotJson, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task StaleReceiptOcrReviewSourceFailsClosedWithoutCreatingRevision()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Stale OCR Creator");
        var participant = await SeedAccountAsync(testFactory, "Revision Stale OCR Participant", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 50m),
                new ParticipantSeed(participant.UserProfileId, 50m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var fileId = await SeedReceiptAttachmentAsync(testFactory, billId, creatorSession.UserProfileId);
        var reviewId = await SeedReceiptOcrReviewAsync(
            testFactory,
            billId,
            fileId,
            creatorSession.UserProfileId,
            groupId: null,
            updatedAtUtc: InitialTimestamp.AddMinutes(7));
        using var client = testFactory.CreateClient();

        using var createRequest = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            creatorSession.RawSessionToken,
            SnapshotJsonWithOcrSource(
                [(creatorSession.UserProfileId, 40m), (participant.UserProfileId, 60m)],
                [(creatorSession.UserProfileId, 100m)],
                fileId,
                reviewId,
                InitialTimestamp.AddMinutes(6)));
        using var createResponse = await client.SendAsync(createRequest);
        var createContent = await createResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, createResponse.StatusCode);
        Assert.Contains("OCR source review timestamp is stale.", createContent, StringComparison.Ordinal);
        Assert.DoesNotContain("private ocr text", createContent, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("receipts/private-key", createContent, StringComparison.OrdinalIgnoreCase);

        var revisions = await ReadRevisionsAsync(testFactory);
        Assert.DoesNotContain(revisions, revision => revision.ExpenseBillId == billId);
    }

    [Fact]
    public async Task PersonalBillDetailExposesRevisionCreationCapabilityForEligibleStatesOnly()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Capability Actor");
        var participant = await SeedAccountAsync(testFactory, "Revision Capability Participant", InitialTimestamp.AddMinutes(1));
        using var client = testFactory.CreateClient();

        foreach (var status in new[] { ExpenseBillStatuses.Confirmed, ExpenseBillStatuses.Rejected })
        {
            var billId = await SeedBillAsync(
                testFactory,
                actorSession.UserProfileId,
                ownerProfileId: actorSession.UserProfileId,
                groupId: null,
                [
                    new ParticipantSeed(actorSession.UserProfileId, 50m),
                    new ParticipantSeed(participant.UserProfileId, 50m)
                ],
                [new PayerSeed(actorSession.UserProfileId, 100m)],
                status,
                InitialTimestamp);

            using var request = CreateBearerRequest(HttpMethod.Get, PersonalBillPath(billId), actorSession.RawSessionToken);
            using var response = await client.SendAsync(request);
            var content = await response.Content.ReadAsStringAsync();

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var payload = JsonDocument.Parse(content);
            AssertRevisionCreationCapability(payload.RootElement, canCreateRevision: true);
        }

        foreach (var status in new[]
        {
            ExpenseBillStatuses.Draft,
            ExpenseBillStatuses.PendingConfirmation,
            ExpenseBillStatuses.Finalized,
            ExpenseBillStatuses.Archived,
            "unsupported_bill_state"
        })
        {
            var billId = await SeedBillAsync(
                testFactory,
                actorSession.UserProfileId,
                ownerProfileId: actorSession.UserProfileId,
                groupId: null,
                [
                    new ParticipantSeed(actorSession.UserProfileId, 50m),
                    new ParticipantSeed(participant.UserProfileId, 50m)
                ],
                [new PayerSeed(actorSession.UserProfileId, 100m)],
                status,
                InitialTimestamp);

            using var request = CreateBearerRequest(HttpMethod.Get, PersonalBillPath(billId), actorSession.RawSessionToken);
            using var response = await client.SendAsync(request);
            var content = await response.Content.ReadAsStringAsync();

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var payload = JsonDocument.Parse(content);
            AssertRevisionCreationCapability(payload.RootElement, canCreateRevision: false);
        }

        var activePendingBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            ownerProfileId: actorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(actorSession.UserProfileId, 50m),
                new ParticipantSeed(participant.UserProfileId, 50m)
            ],
            [new PayerSeed(actorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        await CreateDraftRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            activePendingBillId,
            actorSession.RawSessionToken,
            actorSession.UserProfileId,
            participant.UserProfileId);

        using var blockedRequest = CreateBearerRequest(HttpMethod.Get, PersonalBillPath(activePendingBillId), actorSession.RawSessionToken);
        using var blockedResponse = await client.SendAsync(blockedRequest);
        var blockedContent = await blockedResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, blockedResponse.StatusCode);
        using var blockedPayload = JsonDocument.Parse(blockedContent);
        AssertRevisionCreationCapability(blockedPayload.RootElement, canCreateRevision: false);
    }

    [Fact]
    public async Task GroupBillDetailRevisionCreationCapabilityRequiresBillParticipant()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Capability Group Owner");
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Capability Group Participant");
        var observerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Capability Group Observer");
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Revision Capability Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(participantSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(observerSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(participantSession.UserProfileId, 50m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        using var participantRequest = CreateBearerRequest(HttpMethod.Get, GroupBillPath(groupId, billId), participantSession.RawSessionToken);
        using var participantResponse = await client.SendAsync(participantRequest);
        var participantContent = await participantResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, participantResponse.StatusCode);
        using (var participantPayload = JsonDocument.Parse(participantContent))
        {
            AssertRevisionCreationCapability(participantPayload.RootElement, canCreateRevision: true);
        }

        using var observerRequest = CreateBearerRequest(HttpMethod.Get, GroupBillPath(groupId, billId), observerSession.RawSessionToken);
        using var observerResponse = await client.SendAsync(observerRequest);
        var observerContent = await observerResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, observerResponse.StatusCode);
        using var observerPayload = JsonDocument.Parse(observerContent);
        AssertRevisionCreationCapability(observerPayload.RootElement, canCreateRevision: false);
    }

    [Fact]
    public async Task BillDetailRevisionCreationCapabilityFailsClosedForUnauthorizedActors()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Capability Owner");
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Capability Authorized Participant");
        var unrelatedSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Capability Unrelated");
        var personalBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(participantSession.UserProfileId, 50m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Revision Capability Closed Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(participantSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var groupBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(participantSession.UserProfileId, 50m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        using (var personalRequest = CreateBearerRequest(HttpMethod.Get, PersonalBillPath(personalBillId), unrelatedSession.RawSessionToken))
        using (var personalResponse = await client.SendAsync(personalRequest))
        {
            await AssertUnavailableWithoutRevisionCreationCapabilityAsync(personalResponse);
        }

        using var groupRequest = CreateBearerRequest(HttpMethod.Get, GroupBillPath(groupId, groupBillId), unrelatedSession.RawSessionToken);
        using var groupResponse = await client.SendAsync(groupRequest);
        await AssertUnavailableWithoutRevisionCreationCapabilityAsync(groupResponse);
    }

    [Fact]
    public async Task DraftProposalCanSubmitAndWithdrawOnlyByProposerPolicy()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Submit Creator");
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Submit Participant");
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 50m),
                new ParticipantSeed(participantSession.UserProfileId, 50m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateDraftRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            creatorSession.RawSessionToken,
            creatorSession.UserProfileId,
            participantSession.UserProfileId);
        using var client = testFactory.CreateClient();

        using var submitRequest = CreateBearerRequest(HttpMethod.Post, SubmitPath(billId, revisionId), creatorSession.RawSessionToken);
        using var submitResponse = await client.SendAsync(submitRequest);
        var submitContent = await submitResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, submitResponse.StatusCode);
        using (var submitPayload = JsonDocument.Parse(submitContent))
        {
            Assert.Equal(ExpenseBillRevisionStatuses.SubmittedForReview, submitPayload.RootElement.GetProperty("status").GetString());
            AssertViewerActions(
                submitPayload.RootElement,
                canSubmit: false,
                canWithdraw: true,
                canRevise: true,
                canApprove: true,
                canReject: true,
                canConfirmPayer: false,
                canApply: false);
        }

        using var deniedWithdrawRequest = CreateBearerRequest(HttpMethod.Post, WithdrawPath(billId, revisionId), participantSession.RawSessionToken);
        using var deniedWithdrawResponse = await client.SendAsync(deniedWithdrawRequest);
        await AssertBillRevisionConflictProblemAsync(deniedWithdrawResponse);

        using var withdrawRequest = CreateBearerRequest(HttpMethod.Post, WithdrawPath(billId, revisionId), creatorSession.RawSessionToken);
        using var withdrawResponse = await client.SendAsync(withdrawRequest);
        var withdrawContent = await withdrawResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, withdrawResponse.StatusCode);
        using var withdrawPayload = JsonDocument.Parse(withdrawContent);
        Assert.Equal(ExpenseBillRevisionStatuses.WithdrawnByProposer, withdrawPayload.RootElement.GetProperty("status").GetString());
        AssertViewerActions(
            withdrawPayload.RootElement,
            canSubmit: false,
            canWithdraw: false,
            canRevise: false,
            canApprove: false,
            canReject: false,
            canConfirmPayer: false,
            canApply: false);
    }

    [Fact]
    public async Task ProposalCreationWritesNotificationsToPendingReviewersAndPayerConfirmationRecipients()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Proposed Owner");
        var reviewerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Proposed Reviewer");
        var payerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Proposed Payer");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(reviewerSession.UserProfileId, 30m),
                new ParticipantSeed(payerSession.UserProfileId, 20m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        using var createRequest = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            ownerSession.RawSessionToken,
            SnapshotJson(
                [
                    (ownerSession.UserProfileId, 40m),
                    (reviewerSession.UserProfileId, 35m),
                    (payerSession.UserProfileId, 25m)
                ],
                [(payerSession.UserProfileId, 100m)]));
        using var createResponse = await client.SendAsync(createRequest);
        var createContent = await createResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        using var createPayload = JsonDocument.Parse(createContent);
        var revisionId = createPayload.RootElement.GetProperty("id").GetGuid();
        var notifications = await ReadNotificationsAsync(testFactory, InAppNotificationEventTypes.BillRevisionProposed);
        AssertNotificationRecipients(
            notifications,
            reviewerSession.UserProfileId,
            payerSession.UserProfileId);
        Assert.DoesNotContain(notifications, notification => notification.RecipientUserProfileId == ownerSession.UserProfileId);
        Assert.Single(notifications, notification => notification.RecipientUserProfileId == payerSession.UserProfileId);
        Assert.All(notifications, notification =>
        {
            AssertRevisionNotificationEnvelope(
                notification,
                InAppNotificationEventTypes.BillRevisionProposed,
                InAppNotificationPriorities.Attention,
                "Bill revision was proposed.",
                ownerSession.UserProfileId,
                billId,
                revisionId,
                expectedGroupId: null);
        });
    }

    [Fact]
    public async Task RevisionResubmissionWritesNotificationsToPendingReviewersAndPayerConfirmationRecipients()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Resubmit Owner");
        var reviewerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Resubmit Reviewer");
        var payerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Resubmit Payer");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(reviewerSession.UserProfileId, 30m),
                new ParticipantSeed(payerSession.UserProfileId, 20m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var previousRevisionId = await CreateSubmittedRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            ownerSession.RawSessionToken,
            SnapshotJson(
                [
                    (ownerSession.UserProfileId, 40m),
                    (reviewerSession.UserProfileId, 35m),
                    (payerSession.UserProfileId, 25m)
                ],
                [(payerSession.UserProfileId, 100m)]));
        using var client = testFactory.CreateClient();
        testContext.TimeProvider.SetUtcNow(WriteTimestamp.AddMinutes(5));
        using var reviseRequest = CreateJsonRequest(
            HttpMethod.Patch,
            RevisionPath(billId, previousRevisionId),
            ownerSession.RawSessionToken,
            SnapshotJson(
                [
                    (ownerSession.UserProfileId, 41m),
                    (reviewerSession.UserProfileId, 34m),
                    (payerSession.UserProfileId, 25m)
                ],
                [(payerSession.UserProfileId, 100m)]));
        using var reviseResponse = await client.SendAsync(reviseRequest);
        var reviseContent = await reviseResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, reviseResponse.StatusCode);
        using var revisePayload = JsonDocument.Parse(reviseContent);
        var revisionId = revisePayload.RootElement.GetProperty("id").GetGuid();
        var notifications = await ReadNotificationsAsync(testFactory, InAppNotificationEventTypes.BillRevisionResubmitted);
        AssertNotificationRecipients(
            notifications,
            reviewerSession.UserProfileId,
            payerSession.UserProfileId);
        Assert.DoesNotContain(notifications, notification => notification.RecipientUserProfileId == ownerSession.UserProfileId);
        Assert.Single(notifications, notification => notification.RecipientUserProfileId == payerSession.UserProfileId);
        Assert.All(notifications, notification =>
        {
            AssertRevisionNotificationEnvelope(
                notification,
                InAppNotificationEventTypes.BillRevisionResubmitted,
                InAppNotificationPriorities.Attention,
                "Bill revision was resubmitted for review.",
                ownerSession.UserProfileId,
                billId,
                revisionId,
                expectedGroupId: null);
        });
    }

    [Fact]
    public async Task SubmitRevisionWritesNotificationsToPendingReviewersAndPayerConfirmationRecipients()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Submit Owner");
        var reviewerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Submit Reviewer");
        var payerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Submit Payer");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(reviewerSession.UserProfileId, 30m),
                new ParticipantSeed(payerSession.UserProfileId, 20m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        using var createRequest = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            ownerSession.RawSessionToken,
            SnapshotJson(
                [
                    (ownerSession.UserProfileId, 40m),
                    (reviewerSession.UserProfileId, 35m),
                    (payerSession.UserProfileId, 25m)
                ],
                [(payerSession.UserProfileId, 100m)]));
        using var createResponse = await client.SendAsync(createRequest);
        var createContent = await createResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        using var createPayload = JsonDocument.Parse(createContent);
        var revisionId = createPayload.RootElement.GetProperty("id").GetGuid();

        using var submitRequest = CreateBearerRequest(HttpMethod.Post, SubmitPath(billId, revisionId), ownerSession.RawSessionToken);
        using var submitResponse = await client.SendAsync(submitRequest);

        Assert.Equal(HttpStatusCode.OK, submitResponse.StatusCode);
        var notifications = await ReadNotificationsAsync(testFactory, InAppNotificationEventTypes.BillRevisionSubmitted);
        AssertNotificationRecipients(
            notifications,
            reviewerSession.UserProfileId,
            payerSession.UserProfileId);
        Assert.DoesNotContain(notifications, notification => notification.RecipientUserProfileId == ownerSession.UserProfileId);
        Assert.Single(notifications, notification => notification.RecipientUserProfileId == payerSession.UserProfileId);
        Assert.All(notifications, notification =>
        {
            AssertRevisionNotificationEnvelope(
                notification,
                InAppNotificationEventTypes.BillRevisionSubmitted,
                InAppNotificationPriorities.Attention,
                "Bill revision is ready for review.",
                ownerSession.UserProfileId,
                billId,
                revisionId,
                expectedGroupId: null);
        });
    }

    [Fact]
    public async Task WithdrawRevisionWritesNotificationsToPendingRecipientsOnly()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Withdraw Owner");
        var reviewerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Withdraw Reviewer");
        var payerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Withdraw Payer");
        var unrelatedSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Withdraw Unrelated");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(reviewerSession.UserProfileId, 30m),
                new ParticipantSeed(payerSession.UserProfileId, 20m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        var revisionId = await CreateSubmittedRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            ownerSession.RawSessionToken,
            SnapshotJson(
                [
                    (ownerSession.UserProfileId, 40m),
                    (reviewerSession.UserProfileId, 35m),
                    (payerSession.UserProfileId, 25m)
                ],
                [(payerSession.UserProfileId, 100m)]));

        using var withdrawRequest = CreateBearerRequest(HttpMethod.Post, WithdrawPath(billId, revisionId), ownerSession.RawSessionToken);
        using var withdrawResponse = await client.SendAsync(withdrawRequest);

        Assert.Equal(HttpStatusCode.OK, withdrawResponse.StatusCode);
        var notifications = await ReadNotificationsAsync(testFactory, InAppNotificationEventTypes.BillRevisionWithdrawn);
        AssertNotificationRecipients(
            notifications,
            reviewerSession.UserProfileId,
            payerSession.UserProfileId);
        Assert.DoesNotContain(notifications, notification => notification.RecipientUserProfileId == ownerSession.UserProfileId);
        Assert.DoesNotContain(notifications, notification => notification.RecipientUserProfileId == unrelatedSession.UserProfileId);
        Assert.All(notifications, notification =>
        {
            AssertRevisionNotificationEnvelope(
                notification,
                InAppNotificationEventTypes.BillRevisionWithdrawn,
                InAppNotificationPriorities.Normal,
                "Bill revision was withdrawn.",
                ownerSession.UserProfileId,
                billId,
                revisionId,
                expectedGroupId: null);
        });
    }

    [Fact]
    public async Task ApproveAndRejectRevisionNotifyProposalCreatorAndBillOwner()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Review Owner");
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Review Creator");
        var reviewerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Review Reviewer");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(creatorSession.UserProfileId, 25m),
                new ParticipantSeed(reviewerSession.UserProfileId, 25m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        var revisionId = await CreateSubmittedRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            creatorSession.RawSessionToken,
            SnapshotJson(
                [
                    (ownerSession.UserProfileId, 40m),
                    (creatorSession.UserProfileId, 30m),
                    (reviewerSession.UserProfileId, 30m)
                ],
                [(ownerSession.UserProfileId, 100m)]));
        var approval = await ReadApprovalAsync(testFactory, revisionId, reviewerSession.UserProfileId);

        using (var approveRequest = CreateJsonRequest(
            HttpMethod.Post,
            ApprovePath(billId, revisionId),
            reviewerSession.RawSessionToken,
            ApprovalJson(FormatAmount(approval.AcceptedAmount), approval.Currency, approval.CalculationHash)))
        using (var approveResponse = await client.SendAsync(approveRequest))
        {
            Assert.Equal(HttpStatusCode.OK, approveResponse.StatusCode);
        }

        var approvedNotifications = await ReadNotificationsAsync(testFactory, InAppNotificationEventTypes.BillRevisionApproved);
        AssertNotificationRecipients(
            approvedNotifications,
            creatorSession.UserProfileId,
            ownerSession.UserProfileId);
        Assert.DoesNotContain(approvedNotifications, notification => notification.RecipientUserProfileId == reviewerSession.UserProfileId);
        Assert.All(approvedNotifications, notification =>
        {
            AssertRevisionNotificationEnvelope(
                notification,
                InAppNotificationEventTypes.BillRevisionApproved,
                InAppNotificationPriorities.Normal,
                "Bill revision was approved.",
                reviewerSession.UserProfileId,
                billId,
                revisionId,
                expectedGroupId: null);
        });

        using var rejectRequest = CreateBearerRequest(HttpMethod.Post, RejectPath(billId, revisionId), reviewerSession.RawSessionToken);
        using var rejectResponse = await client.SendAsync(rejectRequest);

        Assert.Equal(HttpStatusCode.OK, rejectResponse.StatusCode);
        var rejectedNotifications = await ReadNotificationsAsync(testFactory, InAppNotificationEventTypes.BillRevisionRejected);
        AssertNotificationRecipients(
            rejectedNotifications,
            creatorSession.UserProfileId,
            ownerSession.UserProfileId);
        Assert.DoesNotContain(rejectedNotifications, notification => notification.RecipientUserProfileId == reviewerSession.UserProfileId);
        Assert.All(rejectedNotifications, notification =>
        {
            AssertRevisionNotificationEnvelope(
                notification,
                InAppNotificationEventTypes.BillRevisionRejected,
                InAppNotificationPriorities.Attention,
                "Bill revision was rejected.",
                reviewerSession.UserProfileId,
                billId,
                revisionId,
                expectedGroupId: null);
        });
    }

    [Fact]
    public async Task PayerConfirmationRevisionNotifiesProposalCreatorAndBillOwner()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Payer Owner");
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Payer Creator");
        var payerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Payer Actor");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(creatorSession.UserProfileId, 25m),
                new ParticipantSeed(payerSession.UserProfileId, 25m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        var revisionId = await CreateSubmittedRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            creatorSession.RawSessionToken,
            SnapshotJson(
                [
                    (ownerSession.UserProfileId, 50m),
                    (creatorSession.UserProfileId, 25m),
                    (payerSession.UserProfileId, 25m)
                ],
                [(payerSession.UserProfileId, 100m)]));
        var revision = await ReadRevisionAsync(testFactory, revisionId);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp.AddMinutes(20));

        using var request = CreateJsonRequest(
            HttpMethod.Post,
            PayerConfirmationPath(billId, revisionId),
            payerSession.RawSessionToken,
            PayerConfirmationJson(revision.CalculationHash));
        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var notifications = await ReadNotificationsAsync(testFactory, InAppNotificationEventTypes.BillRevisionPayerConfirmed);
        AssertNotificationRecipients(
            notifications,
            creatorSession.UserProfileId,
            ownerSession.UserProfileId);
        Assert.DoesNotContain(notifications, notification => notification.RecipientUserProfileId == payerSession.UserProfileId);
        Assert.All(notifications, notification =>
        {
            AssertRevisionNotificationEnvelope(
                notification,
                InAppNotificationEventTypes.BillRevisionPayerConfirmed,
                InAppNotificationPriorities.Normal,
                "Bill revision payer confirmation was completed.",
                payerSession.UserProfileId,
                billId,
                revisionId,
                expectedGroupId: null);
        });
    }

    [Fact]
    public async Task ApplyRevisionNotifiesAffectedStakeholdersWithSafeMetadataOnly()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Apply Owner");
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Apply Creator");
        var payerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Apply Payer");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(creatorSession.UserProfileId, 25m),
                new ParticipantSeed(payerSession.UserProfileId, 25m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        var revisionId = await CreateSubmittedRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            creatorSession.RawSessionToken,
            SnapshotJson(
                [
                    (ownerSession.UserProfileId, 40m),
                    (creatorSession.UserProfileId, 30m),
                    (payerSession.UserProfileId, 30m)
                ],
                [(payerSession.UserProfileId, 100m)]));
        await ApproveAllRevisionApprovalsAsync(
            testFactory,
            billId,
            revisionId,
            new Dictionary<Guid, string>
            {
                [ownerSession.UserProfileId] = ownerSession.RawSessionToken,
                [creatorSession.UserProfileId] = creatorSession.RawSessionToken,
                [payerSession.UserProfileId] = payerSession.RawSessionToken
            });
        var revision = await ReadRevisionAsync(testFactory, revisionId);
        using (var payerConfirmationRequest = CreateJsonRequest(
            HttpMethod.Post,
            PayerConfirmationPath(billId, revisionId),
            payerSession.RawSessionToken,
            PayerConfirmationJson(revision.CalculationHash)))
        using (var payerConfirmationResponse = await client.SendAsync(payerConfirmationRequest))
        {
            Assert.Equal(HttpStatusCode.OK, payerConfirmationResponse.StatusCode);
        }

        testContext.TimeProvider.SetUtcNow(WriteTimestamp.AddMinutes(25));
        using var applyRequest = CreateBearerRequest(HttpMethod.Post, ApplyPath(billId, revisionId), ownerSession.RawSessionToken);
        using var applyResponse = await client.SendAsync(applyRequest);

        Assert.Equal(HttpStatusCode.OK, applyResponse.StatusCode);
        var notifications = await ReadNotificationsAsync(testFactory, InAppNotificationEventTypes.BillRevisionApplied);
        AssertNotificationRecipients(
            notifications,
            creatorSession.UserProfileId,
            payerSession.UserProfileId);
        Assert.DoesNotContain(notifications, notification => notification.RecipientUserProfileId == ownerSession.UserProfileId);
        Assert.Single(notifications, notification => notification.RecipientUserProfileId == payerSession.UserProfileId);
        Assert.All(notifications, notification =>
        {
            AssertRevisionNotificationEnvelope(
                notification,
                InAppNotificationEventTypes.BillRevisionApplied,
                InAppNotificationPriorities.Attention,
                "Bill revision was applied.",
                ownerSession.UserProfileId,
                billId,
                revisionId,
                expectedGroupId: null);
        });
        AssertSafeNotificationMetadata(notifications);
    }

    [Fact]
    public async Task GroupRevisionNotificationsCarryGroupIdButDoNotGrantLinkedResourceAuthorization()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Group Owner");
        var reviewerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Group Reviewer");
        var observerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Group Observer");
        var outsiderSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Group Outsider");
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Revision Notify Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(reviewerSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(observerSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(reviewerSession.UserProfileId, 50m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        using var createRequest = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            ownerSession.RawSessionToken,
            SnapshotJson(
                [(ownerSession.UserProfileId, 40m), (reviewerSession.UserProfileId, 60m)],
                [(ownerSession.UserProfileId, 100m)]));
        using var createResponse = await client.SendAsync(createRequest);
        var createContent = await createResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        using var createPayload = JsonDocument.Parse(createContent);
        var revisionId = createPayload.RootElement.GetProperty("id").GetGuid();
        var notification = Assert.Single(await ReadNotificationsAsync(
            testFactory,
            InAppNotificationEventTypes.BillRevisionProposed));
        Assert.Equal(reviewerSession.UserProfileId, notification.RecipientUserProfileId);
        AssertRevisionNotificationEnvelope(
            notification,
            InAppNotificationEventTypes.BillRevisionProposed,
            InAppNotificationPriorities.Attention,
            "Bill revision was proposed.",
            ownerSession.UserProfileId,
            billId,
            revisionId,
            groupId);

        using (var observerGetRequest = CreateBearerRequest(HttpMethod.Get, RevisionPath(billId, revisionId), observerSession.RawSessionToken))
        using (var observerGetResponse = await client.SendAsync(observerGetRequest))
        {
            Assert.Equal(HttpStatusCode.NotFound, observerGetResponse.StatusCode);
        }

        using var outsiderGetRequest = CreateBearerRequest(HttpMethod.Get, RevisionPath(billId, revisionId), outsiderSession.RawSessionToken);
        using var outsiderGetResponse = await client.SendAsync(outsiderGetRequest);

        Assert.Equal(HttpStatusCode.NotFound, outsiderGetResponse.StatusCode);
    }

    [Fact]
    public async Task FailedRevisionMutationsDoNotWriteNotifications()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Failed Creator");
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Failed Participant");
        var unrelatedSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Notify Failed Unrelated");
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 50m),
                new ParticipantSeed(participantSession.UserProfileId, 50m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateDraftRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            creatorSession.RawSessionToken,
            creatorSession.UserProfileId,
            participantSession.UserProfileId);
        var notificationCountBeforeFailures = (await ReadNotificationsAsync(testFactory)).Count;
        using var client = testFactory.CreateClient();

        using (var deniedRequest = CreateBearerRequest(HttpMethod.Post, SubmitPath(billId, revisionId), unrelatedSession.RawSessionToken))
        using (var deniedResponse = await client.SendAsync(deniedRequest))
        {
            Assert.Equal(HttpStatusCode.NotFound, deniedResponse.StatusCode);
        }

        using (var unavailableRequest = CreateBearerRequest(HttpMethod.Post, SubmitPath(billId, Guid.NewGuid()), creatorSession.RawSessionToken))
        using (var unavailableResponse = await client.SendAsync(unavailableRequest))
        {
            Assert.Equal(HttpStatusCode.NotFound, unavailableResponse.StatusCode);
        }

        using (var invalidRequest = CreateJsonRequest(HttpMethod.Post, SubmitPath(billId, revisionId), creatorSession.RawSessionToken, "{}"))
        using (var invalidResponse = await client.SendAsync(invalidRequest))
        {
            Assert.Equal(HttpStatusCode.BadRequest, invalidResponse.StatusCode);
        }

        using (var conflictRequest = CreateBearerRequest(HttpMethod.Post, WithdrawPath(billId, revisionId), participantSession.RawSessionToken))
        using (var conflictResponse = await client.SendAsync(conflictRequest))
        {
            await AssertBillRevisionConflictProblemAsync(conflictResponse);
        }

        var notifications = await ReadNotificationsAsync(testFactory);
        Assert.Equal(notificationCountBeforeFailures, notifications.Count);
        Assert.DoesNotContain(notifications, notification =>
            notification.EventType is InAppNotificationEventTypes.BillRevisionSubmitted
                or InAppNotificationEventTypes.BillRevisionWithdrawn);
    }

    [Fact]
    public void BillRevisionNotificationEventTypesAreSupportedByDomainConstants()
    {
        Assert.All(
            new[]
            {
                InAppNotificationEventTypes.BillRevisionProposed,
                InAppNotificationEventTypes.BillRevisionResubmitted,
                InAppNotificationEventTypes.BillRevisionSubmitted,
                InAppNotificationEventTypes.BillRevisionWithdrawn,
                InAppNotificationEventTypes.BillRevisionApproved,
                InAppNotificationEventTypes.BillRevisionRejected,
                InAppNotificationEventTypes.BillRevisionPayerConfirmed,
                InAppNotificationEventTypes.BillRevisionApplied
            },
            eventType => Assert.True(InAppNotificationEventTypes.IsSupported(eventType), eventType));
    }

    [Fact]
    public async Task AffectedParticipantCanApproveOnlyWithMatchingAmountCurrencyAndCalculationHash()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Approve Creator");
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Approve Participant");
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 50m),
                new ParticipantSeed(participantSession.UserProfileId, 50m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateDraftRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            creatorSession.RawSessionToken,
            creatorSession.UserProfileId,
            participantSession.UserProfileId);
        using var client = testFactory.CreateClient();
        using (var submitRequest = CreateBearerRequest(HttpMethod.Post, SubmitPath(billId, revisionId), creatorSession.RawSessionToken))
        using (var submitResponse = await client.SendAsync(submitRequest))
        {
            Assert.Equal(HttpStatusCode.OK, submitResponse.StatusCode);
        }

        var approval = await ReadApprovalAsync(testFactory, revisionId, participantSession.UserProfileId);
        using (var wrongHashRequest = CreateJsonRequest(
            HttpMethod.Post,
            ApprovePath(billId, revisionId),
            participantSession.RawSessionToken,
            ApprovalJson(approval.AcceptedAmount.ToString("0.####", System.Globalization.CultureInfo.InvariantCulture), approval.Currency, new string('a', 64))))
        using (var wrongHashResponse = await client.SendAsync(wrongHashRequest))
        {
            await AssertBillRevisionConflictProblemAsync(wrongHashResponse);
        }

        using (var wrongAmountRequest = CreateJsonRequest(
            HttpMethod.Post,
            ApprovePath(billId, revisionId),
            participantSession.RawSessionToken,
            ApprovalJson("50", approval.Currency, approval.CalculationHash)))
        using (var wrongAmountResponse = await client.SendAsync(wrongAmountRequest))
        {
            await AssertBillRevisionConflictProblemAsync(wrongAmountResponse);
        }

        using (var wrongCurrencyRequest = CreateJsonRequest(
            HttpMethod.Post,
            ApprovePath(billId, revisionId),
            participantSession.RawSessionToken,
            ApprovalJson(approval.AcceptedAmount.ToString("0.####", System.Globalization.CultureInfo.InvariantCulture), "HKD", approval.CalculationHash)))
        using (var wrongCurrencyResponse = await client.SendAsync(wrongCurrencyRequest))
        {
            await AssertBillRevisionConflictProblemAsync(wrongCurrencyResponse);
        }

        using var correctRequest = CreateJsonRequest(
            HttpMethod.Post,
            ApprovePath(billId, revisionId),
            participantSession.RawSessionToken,
            ApprovalJson(approval.AcceptedAmount.ToString("0.####", System.Globalization.CultureInfo.InvariantCulture), approval.Currency, approval.CalculationHash));
        using var correctResponse = await client.SendAsync(correctRequest);
        var correctContent = await correctResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, correctResponse.StatusCode);
        using var correctPayload = JsonDocument.Parse(correctContent);
        var participantApproval = correctPayload.RootElement.GetProperty("approvals")
            .EnumerateArray()
            .Single(candidate => candidate.GetProperty("participantUserProfileId").GetGuid() == participantSession.UserProfileId);
        Assert.Equal(ExpenseBillRevisionApprovalStatuses.Approved, participantApproval.GetProperty("status").GetString());
    }

    [Fact]
    public async Task UnaffectedActorCannotApproveAsIfAffectedWhenApprovalWasAlreadyPreserved()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Unaffected Creator");
        var affectedParticipant = await SeedAccountAsync(testFactory, "Revision Affected Participant", InitialTimestamp.AddMinutes(1));
        var unaffectedSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Unaffected Participant");
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 30m),
                new ParticipantSeed(affectedParticipant.UserProfileId, 30m),
                new ParticipantSeed(unaffectedSession.UserProfileId, 40m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        using var createRequest = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            creatorSession.RawSessionToken,
            SnapshotJson(
                [
                    (creatorSession.UserProfileId, 20m),
                    (affectedParticipant.UserProfileId, 40m),
                    (unaffectedSession.UserProfileId, 40m)
                ],
                [(creatorSession.UserProfileId, 100m)]));
        using var createResponse = await client.SendAsync(createRequest);
        var createContent = await createResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        using var createPayload = JsonDocument.Parse(createContent);
        var revisionId = createPayload.RootElement.GetProperty("id").GetGuid();

        using (var submitRequest = CreateBearerRequest(HttpMethod.Post, SubmitPath(billId, revisionId), creatorSession.RawSessionToken))
        using (var submitResponse = await client.SendAsync(submitRequest))
        {
            Assert.Equal(HttpStatusCode.OK, submitResponse.StatusCode);
        }

        var preservedApproval = await ReadApprovalAsync(testFactory, revisionId, unaffectedSession.UserProfileId);
        Assert.Equal(ExpenseBillRevisionApprovalStatuses.Approved, preservedApproval.Status);

        using var approveRequest = CreateJsonRequest(
            HttpMethod.Post,
            ApprovePath(billId, revisionId),
            unaffectedSession.RawSessionToken,
            ApprovalJson("40", "USD", preservedApproval.CalculationHash));
        using var approveResponse = await client.SendAsync(approveRequest);

        await AssertBillRevisionConflictProblemAsync(approveResponse);
    }

    [Fact]
    public async Task AffectedParticipantReviewContextIncludesFinancialImpactSummaryAndSafeAggregateChanges()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Context Creator");
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Context Participant");
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 50m),
                new ParticipantSeed(participantSession.UserProfileId, 50m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateSubmittedRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            creatorSession.RawSessionToken,
            SnapshotJson(
                [(creatorSession.UserProfileId, 40m), (participantSession.UserProfileId, 60m)],
                [(creatorSession.UserProfileId, 100m)]));
        using var client = testFactory.CreateClient();

        using var getRequest = CreateBearerRequest(HttpMethod.Get, RevisionPath(billId, revisionId), participantSession.RawSessionToken);
        using var getResponse = await client.SendAsync(getRequest);
        var content = await getResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        AssertSafeReviewContextText(content);
        using var payload = JsonDocument.Parse(content);
        AssertViewerActions(
            payload.RootElement,
            canSubmit: false,
            canWithdraw: false,
            canRevise: false,
            canApprove: true,
            canReject: true,
            canConfirmPayer: false,
            canApply: false);
        var reviewContext = payload.RootElement.GetProperty("reviewContext");
        Assert.Equal(participantSession.UserProfileId, reviewContext.GetProperty("viewerUserProfileId").GetGuid());
        Assert.Equal("changed_only", reviewContext.GetProperty("defaultViewMode").GetString());
        Assert.Equal("baseline_available_full_view_optional", reviewContext.GetProperty("fullViewRecommendedReason").GetString());
        Assert.Equal("active_accepted_bill", reviewContext.GetProperty("baseline").GetProperty("baselineType").GetString());

        var impact = reviewContext.GetProperty("viewerFinancialImpact");
        AssertMoneyValue(impact.GetProperty("previousShare"), "50", "USD");
        AssertMoneyValue(impact.GetProperty("proposedShare"), "60", "USD");
        AssertMoneyValue(impact.GetProperty("deltaShare"), "10", "USD");
        Assert.True(impact.GetProperty("affectedByRevision").GetBoolean());
        Assert.False(impact.GetProperty("isPayer").GetBoolean());
        Assert.Equal(JsonValueKind.Null, impact.GetProperty("payerImpact").ValueKind);

        AssertSummary(reviewContext, "participant_share", "supported", 2, "viewer_affected");
        AssertSummary(reviewContext, "item", "unsupported_in_current_revision_snapshot", 0, "not_available");
        AssertSummary(reviewContext, "item_split", "unsupported_in_current_revision_snapshot", 0, "not_available");
        AssertSummary(reviewContext, "attachment_receipt_ocr_review", "unsupported_in_current_revision_snapshot", 0, "not_available");
        Assert.Contains(
            reviewContext.GetProperty("limitations").EnumerateArray(),
            limitation => limitation.GetString() == "item_split_attachment_note_diff_unsupported_in_current_revision_snapshot");

        var viewerChange = reviewContext.GetProperty("changes")
            .EnumerateArray()
            .Single(change =>
                change.GetProperty("changeScope").GetString() == "participant_share"
                && change.GetProperty("relatedUserProfileId").GetGuid() == participantSession.UserProfileId);
        Assert.Equal("participant_share_changed", viewerChange.GetProperty("changeType").GetString());
        Assert.Equal("direct_viewer_money_impact", viewerChange.GetProperty("viewerImpact").GetString());
        Assert.Contains("Your share changed", viewerChange.GetProperty("accessibleLabel").GetString(), StringComparison.Ordinal);
        AssertMoneyDisplayValue(viewerChange.GetProperty("before"), "50", "USD");
        AssertMoneyDisplayValue(viewerChange.GetProperty("after"), "60", "USD");
    }

    [Fact]
    public async Task UnaffectedParticipantReviewContextPreservesChangedOnlyDefaultWithoutDirectImpact()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Context Unaffected Creator");
        var affectedParticipant = await SeedAccountAsync(testFactory, "Revision Context Affected", InitialTimestamp.AddMinutes(1));
        var unaffectedSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Context Unaffected");
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 30m),
                new ParticipantSeed(affectedParticipant.UserProfileId, 30m),
                new ParticipantSeed(unaffectedSession.UserProfileId, 40m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateSubmittedRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            creatorSession.RawSessionToken,
            SnapshotJson(
                [
                    (creatorSession.UserProfileId, 20m),
                    (affectedParticipant.UserProfileId, 40m),
                    (unaffectedSession.UserProfileId, 40m)
                ],
                [(creatorSession.UserProfileId, 100m)]));
        using var client = testFactory.CreateClient();

        using var getRequest = CreateBearerRequest(HttpMethod.Get, RevisionPath(billId, revisionId), unaffectedSession.RawSessionToken);
        using var getResponse = await client.SendAsync(getRequest);
        var content = await getResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        using var payload = JsonDocument.Parse(content);
        AssertViewerActions(
            payload.RootElement,
            canSubmit: false,
            canWithdraw: false,
            canRevise: false,
            canApprove: false,
            canReject: true,
            canConfirmPayer: false,
            canApply: false);
        var reviewContext = payload.RootElement.GetProperty("reviewContext");
        Assert.Equal("changed_only", reviewContext.GetProperty("defaultViewMode").GetString());
        Assert.Equal("active_accepted_bill", reviewContext.GetProperty("baseline").GetProperty("baselineType").GetString());
        var impact = reviewContext.GetProperty("viewerFinancialImpact");
        AssertMoneyValue(impact.GetProperty("previousShare"), "40", "USD");
        AssertMoneyValue(impact.GetProperty("proposedShare"), "40", "USD");
        AssertMoneyValue(impact.GetProperty("deltaShare"), "0", "USD");
        Assert.False(impact.GetProperty("affectedByRevision").GetBoolean());
        AssertSummary(reviewContext, "participant_share", "supported", 2, "viewer_unaffected");
        Assert.DoesNotContain(
            reviewContext.GetProperty("changes").EnumerateArray(),
            change => change.GetProperty("relatedUserProfileId").ValueKind == JsonValueKind.String
                && change.GetProperty("relatedUserProfileId").GetGuid() == unaffectedSession.UserProfileId);
    }

    [Fact]
    public async Task ViewerWithoutAcceptedBaselineGetsFullBillDefaultAndNoPreviousMoney()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Context First Creator");
        var pendingParticipantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Context First Participant");
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 50m),
                new ParticipantSeed(
                    pendingParticipantSession.UserProfileId,
                    50m,
                    ExpenseBillParticipantStatuses.PendingAcceptance)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateSubmittedRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            creatorSession.RawSessionToken,
            SnapshotJson(
                [(creatorSession.UserProfileId, 40m), (pendingParticipantSession.UserProfileId, 60m)],
                [(creatorSession.UserProfileId, 100m)]));
        using var client = testFactory.CreateClient();

        using var getRequest = CreateBearerRequest(HttpMethod.Get, RevisionPath(billId, revisionId), pendingParticipantSession.RawSessionToken);
        using var getResponse = await client.SendAsync(getRequest);
        var content = await getResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        using var payload = JsonDocument.Parse(content);
        AssertViewerActions(
            payload.RootElement,
            canSubmit: false,
            canWithdraw: false,
            canRevise: false,
            canApprove: true,
            canReject: true,
            canConfirmPayer: false,
            canApply: false);
        var reviewContext = payload.RootElement.GetProperty("reviewContext");
        Assert.Equal("full_bill", reviewContext.GetProperty("defaultViewMode").GetString());
        Assert.Equal("no_prior_baseline_full_bill_recommended", reviewContext.GetProperty("fullViewRecommendedReason").GetString());
        Assert.Equal("no_prior_baseline", reviewContext.GetProperty("baseline").GetProperty("baselineType").GetString());

        var impact = reviewContext.GetProperty("viewerFinancialImpact");
        Assert.Equal(JsonValueKind.Null, impact.GetProperty("previousShare").ValueKind);
        AssertMoneyValue(impact.GetProperty("proposedShare"), "60", "USD");
        Assert.Equal(JsonValueKind.Null, impact.GetProperty("deltaShare").ValueKind);
        Assert.True(impact.GetProperty("affectedByRevision").GetBoolean());

        var viewerChange = reviewContext.GetProperty("changes")
            .EnumerateArray()
            .Single(change =>
                change.GetProperty("changeScope").GetString() == "participant_share"
                && change.GetProperty("relatedUserProfileId").GetGuid() == pendingParticipantSession.UserProfileId);
        Assert.Equal("direct_viewer_money_impact", viewerChange.GetProperty("viewerImpact").GetString());
    }

    [Fact]
    public async Task PreviousRevisionApprovalCanBeReviewBaselineForReplacementRevision()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Context Previous Creator");
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Context Previous Participant");
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 50m),
                new ParticipantSeed(participantSession.UserProfileId, 50m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var firstRevisionId = await CreateSubmittedRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            creatorSession.RawSessionToken,
            SnapshotJson(
                [(creatorSession.UserProfileId, 40m), (participantSession.UserProfileId, 60m)],
                [(creatorSession.UserProfileId, 100m)]));
        await ApproveRevisionApprovalAsync(
            testFactory,
            billId,
            firstRevisionId,
            participantSession.UserProfileId,
            participantSession.RawSessionToken);
        using var client = testFactory.CreateClient();

        using var reviseRequest = CreateJsonRequest(
            HttpMethod.Patch,
            RevisionPath(billId, firstRevisionId),
            creatorSession.RawSessionToken,
            SnapshotJson(
                [(creatorSession.UserProfileId, 30m), (participantSession.UserProfileId, 70m)],
                [(creatorSession.UserProfileId, 100m)]));
        using var reviseResponse = await client.SendAsync(reviseRequest);
        var reviseContent = await reviseResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, reviseResponse.StatusCode);
        using var revisePayload = JsonDocument.Parse(reviseContent);
        var replacementRevisionId = revisePayload.RootElement.GetProperty("id").GetGuid();

        using var getRequest = CreateBearerRequest(HttpMethod.Get, RevisionPath(billId, replacementRevisionId), participantSession.RawSessionToken);
        using var getResponse = await client.SendAsync(getRequest);
        var content = await getResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        using var payload = JsonDocument.Parse(content);
        AssertViewerActions(
            payload.RootElement,
            canSubmit: false,
            canWithdraw: false,
            canRevise: false,
            canApprove: true,
            canReject: true,
            canConfirmPayer: false,
            canApply: false);
        var reviewContext = payload.RootElement.GetProperty("reviewContext");
        var baseline = reviewContext.GetProperty("baseline");
        Assert.Equal("previous_revision_approval", baseline.GetProperty("baselineType").GetString());
        Assert.Equal(firstRevisionId, baseline.GetProperty("baselineBillRevisionId").GetGuid());
        Assert.Equal("superseded_by_resubmission", baseline.GetProperty("baselineRevisionStatus").GetString());
        Assert.Equal("changed_only", reviewContext.GetProperty("defaultViewMode").GetString());

        var impact = reviewContext.GetProperty("viewerFinancialImpact");
        AssertMoneyValue(impact.GetProperty("previousShare"), "60", "USD");
        AssertMoneyValue(impact.GetProperty("proposedShare"), "70", "USD");
        AssertMoneyValue(impact.GetProperty("deltaShare"), "10", "USD");
    }

    [Fact]
    public async Task PayerRoleChangeReviewContextShowsConfirmationRequirementForViewer()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Context Payer Creator");
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Context Payer Participant");
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 50m),
                new ParticipantSeed(participantSession.UserProfileId, 50m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateSubmittedRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            creatorSession.RawSessionToken,
            SnapshotJson(
                [(creatorSession.UserProfileId, 50m), (participantSession.UserProfileId, 50m)],
                [(participantSession.UserProfileId, 100m)]));
        using var client = testFactory.CreateClient();

        using var getRequest = CreateBearerRequest(HttpMethod.Get, RevisionPath(billId, revisionId), participantSession.RawSessionToken);
        using var getResponse = await client.SendAsync(getRequest);
        var content = await getResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        using var payload = JsonDocument.Parse(content);
        AssertViewerActions(
            payload.RootElement,
            canSubmit: false,
            canWithdraw: false,
            canRevise: false,
            canApprove: true,
            canReject: true,
            canConfirmPayer: true,
            canApply: false);
        var reviewContext = payload.RootElement.GetProperty("reviewContext");
        var impact = reviewContext.GetProperty("viewerFinancialImpact");
        Assert.True(impact.GetProperty("affectedByRevision").GetBoolean());
        Assert.True(impact.GetProperty("isPayer").GetBoolean());
        var payerImpact = impact.GetProperty("payerImpact");
        Assert.Equal(JsonValueKind.Null, payerImpact.GetProperty("previousContribution").ValueKind);
        AssertMoneyValue(payerImpact.GetProperty("proposedContribution"), "100", "USD");
        Assert.Equal(JsonValueKind.Null, payerImpact.GetProperty("deltaContribution").ValueKind);
        Assert.True(payerImpact.GetProperty("requiresPayerConfirmation").GetBoolean());
        Assert.Equal(ExpenseBillPayerConfirmationStatuses.PendingConfirmation, payerImpact.GetProperty("payerConfirmationStatus").GetString());
        AssertSummary(reviewContext, "payer_role", "supported", 2, "viewer_affected");
    }

    [Fact]
    public async Task PayerCanConfirmOwnRequiredPendingPayerConfirmationWithoutApplyingRevision()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Confirm Payer Owner");
        var payerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Confirm Payer Actor");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(payerSession.UserProfileId, 50m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateSubmittedRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            ownerSession.RawSessionToken,
            SnapshotJson(
                [(ownerSession.UserProfileId, 50m), (payerSession.UserProfileId, 50m)],
                [(payerSession.UserProfileId, 100m)]));
        await ApproveAllRevisionApprovalsAsync(
            testFactory,
            billId,
            revisionId,
            new Dictionary<Guid, string>
            {
                [ownerSession.UserProfileId] = ownerSession.RawSessionToken,
                [payerSession.UserProfileId] = payerSession.RawSessionToken
            });
        var revisionBefore = await ReadRevisionAsync(testFactory, revisionId);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp.AddMinutes(20));
        using var client = testFactory.CreateClient();

        using var request = CreateJsonRequest(
            HttpMethod.Post,
            PayerConfirmationPath(billId, revisionId),
            payerSession.RawSessionToken,
            PayerConfirmationJson(revisionBefore.CalculationHash));
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using (var payload = JsonDocument.Parse(content))
        {
            Assert.Equal(ExpenseBillRevisionStatuses.SubmittedForReview, payload.RootElement.GetProperty("status").GetString());
            AssertViewerActions(
                payload.RootElement,
                canSubmit: false,
                canWithdraw: false,
                canRevise: false,
                canApprove: false,
                canReject: true,
                canConfirmPayer: false,
                canApply: false);
            var payer = Assert.Single(payload.RootElement.GetProperty("payers").EnumerateArray());
            Assert.Equal(payerSession.UserProfileId, payer.GetProperty("userProfileId").GetGuid());
            Assert.True(payer.GetProperty("requiresPayerConfirmation").GetBoolean());
            Assert.Equal(ExpenseBillPayerConfirmationStatuses.Confirmed, payer.GetProperty("payerConfirmationStatus").GetString());
            var payerImpact = payload.RootElement
                .GetProperty("reviewContext")
                .GetProperty("viewerFinancialImpact")
                .GetProperty("payerImpact");
            Assert.Equal(ExpenseBillPayerConfirmationStatuses.Confirmed, payerImpact.GetProperty("payerConfirmationStatus").GetString());
        }

        var revision = await ReadRevisionAsync(testFactory, revisionId);
        var revisionPayer = Assert.Single(revision.Payers, payer => payer.UserProfileId == payerSession.UserProfileId);
        Assert.Equal(ExpenseBillRevisionStatuses.SubmittedForReview, revision.Status);
        Assert.Null(revision.AppliedAtUtc);
        Assert.Equal(ExpenseBillPayerConfirmationStatuses.Confirmed, revisionPayer.PayerConfirmationStatus);
        Assert.Equal(WriteTimestamp.AddMinutes(20), revisionPayer.UpdatedAtUtc);
        Assert.Null((await ReadBillAsync(testFactory, billId)).ActiveAcceptedBillRevisionId);

        var auditEvent = Assert.Single(await ReadRevisionAuditEventsAsync(testFactory), audit => audit.Action == "bill.revision_payer_confirmed");
        AssertBoundedRevisionAuditMetadata(
            auditEvent,
            billId,
            revisionId,
            previousRevisionStatus: ExpenseBillRevisionStatuses.SubmittedForReview,
            newRevisionStatus: ExpenseBillRevisionStatuses.SubmittedForReview,
            expectedPendingApprovalCount: 0,
            expectedApprovedCount: 2,
            expectedPayerUserProfileId: payerSession.UserProfileId);
    }

    [Fact]
    public async Task PayerConfirmationRejectsNonPayerNotRequiredStaleOrNonSubmittedState()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Confirm Guard Owner");
        var payerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Confirm Guard Payer");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(payerSession.UserProfileId, 50m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateSubmittedRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            ownerSession.RawSessionToken,
            SnapshotJson(
                [(ownerSession.UserProfileId, 50m), (payerSession.UserProfileId, 50m)],
                [(payerSession.UserProfileId, 100m)]));
        var revision = await ReadRevisionAsync(testFactory, revisionId);
        using var client = testFactory.CreateClient();

        using (var unauthenticatedRequest = new HttpRequestMessage(HttpMethod.Post, PayerConfirmationPath(billId, revisionId))
        {
            Content = new StringContent(PayerConfirmationJson(revision.CalculationHash), Encoding.UTF8, "application/json")
        })
        using (var unauthenticatedResponse = await client.SendAsync(unauthenticatedRequest))
        {
            Assert.Equal(HttpStatusCode.Unauthorized, unauthenticatedResponse.StatusCode);
        }

        using (var nonPayerRequest = CreateJsonRequest(
            HttpMethod.Post,
            PayerConfirmationPath(billId, revisionId),
            ownerSession.RawSessionToken,
            PayerConfirmationJson(revision.CalculationHash)))
        using (var nonPayerResponse = await client.SendAsync(nonPayerRequest))
        {
            await AssertBillRevisionConflictProblemAsync(nonPayerResponse);
        }

        using (var staleRequest = CreateJsonRequest(
            HttpMethod.Post,
            PayerConfirmationPath(billId, revisionId),
            payerSession.RawSessionToken,
            PayerConfirmationJson(new string('a', 64))))
        using (var staleResponse = await client.SendAsync(staleRequest))
        {
            await AssertBillRevisionConflictProblemAsync(staleResponse);
        }

        await SetRevisionPayerConfirmationStatusAsync(
            testFactory,
            revisionId,
            payerSession.UserProfileId,
            ExpenseBillPayerConfirmationStatuses.Confirmed);
        using (var alreadyConfirmedRequest = CreateJsonRequest(
            HttpMethod.Post,
            PayerConfirmationPath(billId, revisionId),
            payerSession.RawSessionToken,
            PayerConfirmationJson(revision.CalculationHash)))
        using (var alreadyConfirmedResponse = await client.SendAsync(alreadyConfirmedRequest))
        {
            await AssertBillRevisionConflictProblemAsync(alreadyConfirmedResponse);
        }

        var notRequiredRevisionId = await SeedRevisionWithStatusAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillRevisionStatuses.SubmittedForReview,
            WriteTimestamp.AddMinutes(30));
        var notRequiredRevision = await ReadRevisionAsync(testFactory, notRequiredRevisionId);
        using (var notRequiredRequest = CreateJsonRequest(
            HttpMethod.Post,
            PayerConfirmationPath(billId, notRequiredRevisionId),
            ownerSession.RawSessionToken,
            PayerConfirmationJson(notRequiredRevision.CalculationHash)))
        using (var notRequiredResponse = await client.SendAsync(notRequiredRequest))
        {
            await AssertBillRevisionConflictProblemAsync(notRequiredResponse);
        }

        var draftRevisionId = await SeedRevisionWithStatusAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillRevisionStatuses.DraftRevision,
            WriteTimestamp.AddMinutes(31));
        var draftRevision = await ReadRevisionAsync(testFactory, draftRevisionId);
        using var draftRequest = CreateJsonRequest(
            HttpMethod.Post,
            PayerConfirmationPath(billId, draftRevisionId),
            ownerSession.RawSessionToken,
            PayerConfirmationJson(draftRevision.CalculationHash));
        using var draftResponse = await client.SendAsync(draftRequest);

        await AssertBillRevisionConflictProblemAsync(draftResponse);
    }

    [Fact]
    public async Task RejectionIsBoundedAndRejectedProposalCannotLaterApprove()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Reject Creator");
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Reject Participant");
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 50m),
                new ParticipantSeed(participantSession.UserProfileId, 50m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateDraftRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            creatorSession.RawSessionToken,
            creatorSession.UserProfileId,
            participantSession.UserProfileId);
        using var client = testFactory.CreateClient();
        using (var submitRequest = CreateBearerRequest(HttpMethod.Post, SubmitPath(billId, revisionId), creatorSession.RawSessionToken))
        using (var submitResponse = await client.SendAsync(submitRequest))
        {
            Assert.Equal(HttpStatusCode.OK, submitResponse.StatusCode);
        }

        using var rejectRequest = CreateBearerRequest(HttpMethod.Post, RejectPath(billId, revisionId), participantSession.RawSessionToken);
        using var rejectResponse = await client.SendAsync(rejectRequest);
        var rejectContent = await rejectResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, rejectResponse.StatusCode);
        Assert.DoesNotContain("rejectionReason", rejectContent, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("reasonCode", rejectContent, StringComparison.OrdinalIgnoreCase);
        using (var rejectPayload = JsonDocument.Parse(rejectContent))
        {
            Assert.Equal(ExpenseBillRevisionStatuses.Rejected, rejectPayload.RootElement.GetProperty("status").GetString());
        }

        var approval = await ReadApprovalAsync(testFactory, revisionId, participantSession.UserProfileId);
        using var approveRequest = CreateJsonRequest(
            HttpMethod.Post,
            ApprovePath(billId, revisionId),
            participantSession.RawSessionToken,
            ApprovalJson(approval.AcceptedAmount.ToString("0.####", System.Globalization.CultureInfo.InvariantCulture), approval.Currency, approval.CalculationHash));
        using var approveResponse = await client.SendAsync(approveRequest);

        await AssertBillRevisionConflictProblemAsync(approveResponse);
    }

    [Fact]
    public async Task PendingRejectedSupersededAndWithdrawnRevisionsDoNotChangeSettlementCandidateDerivation()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var payerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Settlement Payer");
        var debtor = await SeedAccountAsync(testFactory, "Revision Settlement Debtor", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            payerSession.UserProfileId,
            ownerProfileId: payerSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(payerSession.UserProfileId, 50m),
                new ParticipantSeed(debtor.UserProfileId, 50m)
            ],
            [new PayerSeed(payerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        await AssertSettlementCandidateAmountAsync(client, billId, payerSession.RawSessionToken, "50");

        using var createRequest = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            payerSession.RawSessionToken,
            SnapshotJson(
                [(payerSession.UserProfileId, 20m), (debtor.UserProfileId, 80m)],
                [(payerSession.UserProfileId, 100m)]));
        using var createResponse = await client.SendAsync(createRequest);
        var createContent = await createResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        using var createPayload = JsonDocument.Parse(createContent);
        var firstRevisionId = createPayload.RootElement.GetProperty("id").GetGuid();

        using (var submitRequest = CreateBearerRequest(HttpMethod.Post, SubmitPath(billId, firstRevisionId), payerSession.RawSessionToken))
        using (var submitResponse = await client.SendAsync(submitRequest))
        {
            Assert.Equal(HttpStatusCode.OK, submitResponse.StatusCode);
        }

        await AssertSettlementCandidateAmountAsync(client, billId, payerSession.RawSessionToken, "50");

        using var reviseRequest = CreateJsonRequest(
            HttpMethod.Patch,
            RevisionPath(billId, firstRevisionId),
            payerSession.RawSessionToken,
            SnapshotJson(
                [(payerSession.UserProfileId, 10m), (debtor.UserProfileId, 90m)],
                [(payerSession.UserProfileId, 100m)]));
        using var reviseResponse = await client.SendAsync(reviseRequest);
        var reviseContent = await reviseResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, reviseResponse.StatusCode);
        using var revisePayload = JsonDocument.Parse(reviseContent);
        var secondRevisionId = revisePayload.RootElement.GetProperty("id").GetGuid();

        await AssertSettlementCandidateAmountAsync(client, billId, payerSession.RawSessionToken, "50");

        using (var rejectRequest = CreateBearerRequest(HttpMethod.Post, RejectPath(billId, secondRevisionId), debtor.RawSessionToken ?? payerSession.RawSessionToken))
        using (var rejectResponse = await client.SendAsync(rejectRequest))
        {
            Assert.Equal(HttpStatusCode.OK, rejectResponse.StatusCode);
        }

        await AssertSettlementCandidateAmountAsync(client, billId, payerSession.RawSessionToken, "50");

        using var thirdCreateRequest = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            payerSession.RawSessionToken,
            SnapshotJson(
                [(payerSession.UserProfileId, 30m), (debtor.UserProfileId, 70m)],
                [(payerSession.UserProfileId, 100m)]));
        using var thirdCreateResponse = await client.SendAsync(thirdCreateRequest);
        var thirdCreateContent = await thirdCreateResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.Created, thirdCreateResponse.StatusCode);
        using var thirdCreatePayload = JsonDocument.Parse(thirdCreateContent);
        var thirdRevisionId = thirdCreatePayload.RootElement.GetProperty("id").GetGuid();

        using (var withdrawRequest = CreateBearerRequest(HttpMethod.Post, WithdrawPath(billId, thirdRevisionId), payerSession.RawSessionToken))
        using (var withdrawResponse = await client.SendAsync(withdrawRequest))
        {
            Assert.Equal(HttpStatusCode.OK, withdrawResponse.StatusCode);
        }

        await AssertSettlementCandidateAmountAsync(client, billId, payerSession.RawSessionToken, "50");
    }

    [Fact]
    public async Task OwnerCanApplyApprovedRevisionAndSettlementCandidatesUseAppliedState()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Apply Owner");
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Apply Debtor");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(debtorSession.UserProfileId, 50m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        await AssertSettlementCandidateAmountAsync(client, billId, ownerSession.RawSessionToken, "50");
        var revisionId = await CreateSubmittedRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            ownerSession.RawSessionToken,
            SnapshotJson(
                [(ownerSession.UserProfileId, 40m), (debtorSession.UserProfileId, 60m)],
                [(ownerSession.UserProfileId, 100m)]));
        await ApproveAllRevisionApprovalsAsync(
            testFactory,
            billId,
            revisionId,
            new Dictionary<Guid, string>
            {
                [ownerSession.UserProfileId] = ownerSession.RawSessionToken,
                [debtorSession.UserProfileId] = debtorSession.RawSessionToken
            });
        using (var getReadyRequest = CreateBearerRequest(HttpMethod.Get, RevisionPath(billId, revisionId), ownerSession.RawSessionToken))
        using (var getReadyResponse = await client.SendAsync(getReadyRequest))
        {
            var getReadyContent = await getReadyResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, getReadyResponse.StatusCode);
            using var getReadyPayload = JsonDocument.Parse(getReadyContent);
            AssertViewerActions(
                getReadyPayload.RootElement,
                canSubmit: false,
                canWithdraw: true,
                canRevise: true,
                canApprove: false,
                canReject: true,
                canConfirmPayer: false,
                canApply: true);
        }

        testContext.TimeProvider.SetUtcNow(WriteTimestamp.AddMinutes(10));
        using var applyRequest = CreateBearerRequest(HttpMethod.Post, ApplyPath(billId, revisionId), ownerSession.RawSessionToken);
        using var applyResponse = await client.SendAsync(applyRequest);
        var applyContent = await applyResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, applyResponse.StatusCode);
        using (var applyPayload = JsonDocument.Parse(applyContent))
        {
            Assert.Equal(ExpenseBillRevisionStatuses.AcceptedApplied, applyPayload.RootElement.GetProperty("status").GetString());
            Assert.Equal(WriteTimestamp.AddMinutes(10), applyPayload.RootElement.GetProperty("appliedAtUtc").GetDateTimeOffset());
            AssertViewerActions(
                applyPayload.RootElement,
                canSubmit: false,
                canWithdraw: false,
                canRevise: false,
                canApprove: false,
                canReject: false,
                canConfirmPayer: false,
                canApply: false);
        }

        var bill = await ReadBillAsync(testFactory, billId);
        Assert.Equal(revisionId, bill.ActiveAcceptedBillRevisionId);
        Assert.Equal(ExpenseBillStatuses.Confirmed, bill.Status);
        Assert.Equal(40m, bill.Participants.Single(participant => participant.UserProfileId == ownerSession.UserProfileId).ResolvedShareAmount);
        Assert.Equal(60m, bill.Participants.Single(participant => participant.UserProfileId == debtorSession.UserProfileId).ResolvedShareAmount);
        Assert.Equal(100m, Assert.Single(bill.Payers).Amount);
        await AssertSettlementCandidateAmountAsync(client, billId, ownerSession.RawSessionToken, "60");

        var auditEvent = Assert.Single(await ReadRevisionAuditEventsAsync(testFactory), audit => audit.Action == "bill.revision_applied");
        AssertBoundedRevisionAuditMetadata(
            auditEvent,
            billId,
            revisionId,
            previousRevisionStatus: ExpenseBillRevisionStatuses.SubmittedForReview,
            newRevisionStatus: ExpenseBillRevisionStatuses.AcceptedApplied,
            expectedPendingApprovalCount: 0,
            expectedApprovedCount: 2);
    }

    [Fact]
    public async Task VisibleNonOwnerParticipantCannotApplyApprovedRevision()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Apply Non Owner");
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Apply Participant");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(participantSession.UserProfileId, 50m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateSubmittedRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            ownerSession.RawSessionToken,
            SnapshotJson(
                [(ownerSession.UserProfileId, 45m), (participantSession.UserProfileId, 55m)],
                [(ownerSession.UserProfileId, 100m)]));
        await ApproveAllRevisionApprovalsAsync(
            testFactory,
            billId,
            revisionId,
            new Dictionary<Guid, string>
            {
                [ownerSession.UserProfileId] = ownerSession.RawSessionToken,
                [participantSession.UserProfileId] = participantSession.RawSessionToken
            });
        using var client = testFactory.CreateClient();

        using var applyRequest = CreateBearerRequest(HttpMethod.Post, ApplyPath(billId, revisionId), participantSession.RawSessionToken);
        using var applyResponse = await client.SendAsync(applyRequest);

        await AssertBillRevisionConflictProblemAsync(applyResponse);
        var revision = await ReadRevisionAsync(testFactory, revisionId);
        Assert.Equal(ExpenseBillRevisionStatuses.SubmittedForReview, revision.Status);
        await AssertSettlementCandidateAmountAsync(client, billId, ownerSession.RawSessionToken, "50");
    }

    [Fact]
    public async Task RemovedAndNonMemberGroupActorsCannotApplyRevision()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Apply Group Owner");
        var removedSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Apply Removed");
        var nonMemberSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Apply Non Member");
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Revision Apply Hidden Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(removedSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed));
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(removedSession.UserProfileId, 50m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        foreach (var rawSessionToken in new[] { removedSession.RawSessionToken, nonMemberSession.RawSessionToken })
        {
            using var applyRequest = CreateBearerRequest(HttpMethod.Post, ApplyPath(billId, Guid.NewGuid()), rawSessionToken);
            using var applyResponse = await client.SendAsync(applyRequest);
            Assert.Equal(HttpStatusCode.NotFound, applyResponse.StatusCode);
        }
    }

    [Fact]
    public async Task NonSubmittedRevisionStatusesCannotApply()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Apply Status Owner");
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Apply Status Participant");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(participantSession.UserProfileId, 50m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionIds = new[]
        {
            await SeedRevisionWithStatusAsync(testFactory, billId, ownerSession.UserProfileId, ExpenseBillRevisionStatuses.DraftRevision, WriteTimestamp.AddMinutes(1)),
            await SeedRevisionWithStatusAsync(testFactory, billId, ownerSession.UserProfileId, ExpenseBillRevisionStatuses.WithdrawnByProposer, WriteTimestamp.AddMinutes(2)),
            await SeedRevisionWithStatusAsync(testFactory, billId, ownerSession.UserProfileId, ExpenseBillRevisionStatuses.SupersededByResubmission, WriteTimestamp.AddMinutes(3)),
            await SeedRevisionWithStatusAsync(testFactory, billId, ownerSession.UserProfileId, ExpenseBillRevisionStatuses.Rejected, WriteTimestamp.AddMinutes(4)),
            await SeedRevisionWithStatusAsync(testFactory, billId, ownerSession.UserProfileId, ExpenseBillRevisionStatuses.AcceptedApplied, WriteTimestamp.AddMinutes(5)),
            await SeedRevisionWithStatusAsync(testFactory, billId, ownerSession.UserProfileId, ExpenseBillRevisionStatuses.CancelledByAuthorizedEditor, WriteTimestamp.AddMinutes(6))
        };
        using var client = testFactory.CreateClient();

        foreach (var revisionId in revisionIds)
        {
            using var applyRequest = CreateBearerRequest(HttpMethod.Post, ApplyPath(billId, revisionId), ownerSession.RawSessionToken);
            using var applyResponse = await client.SendAsync(applyRequest);
            await AssertBillRevisionConflictProblemAsync(applyResponse);
        }

        await AssertSettlementCandidateAmountAsync(client, billId, ownerSession.RawSessionToken, "50");
    }

    [Fact]
    public async Task MissingOrMismatchedApprovalBlocksApply()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Apply Approval Owner");
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Apply Approval Participant");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(participantSession.UserProfileId, 50m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateSubmittedRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            ownerSession.RawSessionToken,
            SnapshotJson(
                [(ownerSession.UserProfileId, 40m), (participantSession.UserProfileId, 60m)],
                [(ownerSession.UserProfileId, 100m)]));
        await ApproveRevisionApprovalAsync(testFactory, billId, revisionId, ownerSession.UserProfileId, ownerSession.RawSessionToken);
        using var client = testFactory.CreateClient();

        using (var missingApprovalRequest = CreateBearerRequest(HttpMethod.Post, ApplyPath(billId, revisionId), ownerSession.RawSessionToken))
        using (var missingApprovalResponse = await client.SendAsync(missingApprovalRequest))
        {
            await AssertBillRevisionConflictProblemAsync(missingApprovalResponse);
        }

        await ForceApprovalStatusAsync(
            testFactory,
            revisionId,
            participantSession.UserProfileId,
            ExpenseBillRevisionApprovalStatuses.Approved,
            new string('c', 64));
        using var mismatchedApprovalRequest = CreateBearerRequest(HttpMethod.Post, ApplyPath(billId, revisionId), ownerSession.RawSessionToken);
        using var mismatchedApprovalResponse = await client.SendAsync(mismatchedApprovalRequest);

        await AssertBillRevisionConflictProblemAsync(mismatchedApprovalResponse);
        await AssertSettlementCandidateAmountAsync(client, billId, ownerSession.RawSessionToken, "50");
    }

    [Fact]
    public async Task PendingOrRejectedRequiredPayerConfirmationBlocksApply()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Apply Payer Owner");
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Apply Payer Participant");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(participantSession.UserProfileId, 50m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateSubmittedRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            ownerSession.RawSessionToken,
            SnapshotJson(
                [(ownerSession.UserProfileId, 50m), (participantSession.UserProfileId, 50m)],
                [(participantSession.UserProfileId, 100m)]));
        await ApproveAllRevisionApprovalsAsync(
            testFactory,
            billId,
            revisionId,
            new Dictionary<Guid, string>
            {
                [ownerSession.UserProfileId] = ownerSession.RawSessionToken,
                [participantSession.UserProfileId] = participantSession.RawSessionToken
            });
        using var client = testFactory.CreateClient();

        using (var pendingConfirmationRequest = CreateBearerRequest(HttpMethod.Post, ApplyPath(billId, revisionId), ownerSession.RawSessionToken))
        using (var pendingConfirmationResponse = await client.SendAsync(pendingConfirmationRequest))
        {
            await AssertBillRevisionConflictProblemAsync(pendingConfirmationResponse);
        }

        await SetRevisionPayerConfirmationStatusAsync(
            testFactory,
            revisionId,
            participantSession.UserProfileId,
            ExpenseBillPayerConfirmationStatuses.Rejected);
        using var rejectedConfirmationRequest = CreateBearerRequest(HttpMethod.Post, ApplyPath(billId, revisionId), ownerSession.RawSessionToken);
        using var rejectedConfirmationResponse = await client.SendAsync(rejectedConfirmationRequest);

        await AssertBillRevisionConflictProblemAsync(rejectedConfirmationResponse);
        await AssertSettlementCandidateAmountAsync(client, billId, ownerSession.RawSessionToken, "50");
    }

    [Fact]
    public async Task ExistingSettlementStateBlocksApplyWithoutMutatingSettlementTruth()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Apply Settlement Owner");
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Apply Settlement Debtor");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(debtorSession.UserProfileId, 50m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateSubmittedRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            ownerSession.RawSessionToken,
            SnapshotJson(
                [(ownerSession.UserProfileId, 40m), (debtorSession.UserProfileId, 60m)],
                [(ownerSession.UserProfileId, 100m)]));
        await ApproveAllRevisionApprovalsAsync(
            testFactory,
            billId,
            revisionId,
            new Dictionary<Guid, string>
            {
                [ownerSession.UserProfileId] = ownerSession.RawSessionToken,
                [debtorSession.UserProfileId] = debtorSession.RawSessionToken
            });
        await SeedSettlementStateAsync(testFactory, billId, revisionId, debtorSession.UserProfileId, ownerSession.UserProfileId);
        var beforeCounts = await ReadSettlementMutationCountsAsync(testFactory);
        using var client = testFactory.CreateClient();
        await AssertSettlementCandidateAmountAsync(client, billId, ownerSession.RawSessionToken, "50");

        using (var getBlockedRequest = CreateBearerRequest(HttpMethod.Get, RevisionPath(billId, revisionId), ownerSession.RawSessionToken))
        using (var getBlockedResponse = await client.SendAsync(getBlockedRequest))
        {
            var getBlockedContent = await getBlockedResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, getBlockedResponse.StatusCode);
            using var getBlockedPayload = JsonDocument.Parse(getBlockedContent);
            AssertViewerActions(
                getBlockedPayload.RootElement,
                canSubmit: false,
                canWithdraw: true,
                canRevise: true,
                canApprove: false,
                canReject: true,
                canConfirmPayer: false,
                canApply: false);
        }

        using var applyRequest = CreateBearerRequest(HttpMethod.Post, ApplyPath(billId, revisionId), ownerSession.RawSessionToken);
        using var applyResponse = await client.SendAsync(applyRequest);
        var applyContent = await applyResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, applyResponse.StatusCode);
        Assert.Equal("application/problem+json", applyResponse.Content.Headers.ContentType?.MediaType);
        using (var payload = JsonDocument.Parse(applyContent))
        {
            Assert.Equal("Bill revision settlement conflict", payload.RootElement.GetProperty("title").GetString());
            Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
            Assert.Equal(
                ExpenseBillRevisionSettlementApplyPolicy.ProgressedSettlementConflictDetail,
                payload.RootElement.GetProperty("detail").GetString());
        }

        var afterCounts = await ReadSettlementMutationCountsAsync(testFactory);
        Assert.Equal(beforeCounts, afterCounts);
        var bill = await ReadBillAsync(testFactory, billId);
        Assert.Null(bill.ActiveAcceptedBillRevisionId);
        Assert.Equal(50m, bill.Participants.Single(participant => participant.UserProfileId == debtorSession.UserProfileId).ResolvedShareAmount);
        Assert.Equal(ExpenseBillRevisionStatuses.SubmittedForReview, (await ReadRevisionAsync(testFactory, revisionId)).Status);
        await AssertSettlementCandidateAmountAsync(client, billId, ownerSession.RawSessionToken, "50");
    }

    [Fact]
    public async Task PendingRequestedOnlySettlementStateBlocksApplyWithoutMutatingSettlementTruth()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Apply Pending Settlement Owner");
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Apply Pending Settlement Debtor");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(debtorSession.UserProfileId, 50m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateSubmittedRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            ownerSession.RawSessionToken,
            SnapshotJson(
                [(ownerSession.UserProfileId, 40m), (debtorSession.UserProfileId, 60m)],
                [(ownerSession.UserProfileId, 100m)]));
        await ApproveAllRevisionApprovalsAsync(
            testFactory,
            billId,
            revisionId,
            new Dictionary<Guid, string>
            {
                [ownerSession.UserProfileId] = ownerSession.RawSessionToken,
                [debtorSession.UserProfileId] = debtorSession.RawSessionToken
            });
        await SeedPendingSettlementRequestOnlyStateAsync(
            testFactory,
            billId,
            revisionId,
            debtorSession.UserProfileId,
            ownerSession.UserProfileId);
        var beforeCounts = await ReadSettlementMutationCountsAsync(testFactory);
        using var client = testFactory.CreateClient();

        using var applyRequest = CreateBearerRequest(HttpMethod.Post, ApplyPath(billId, revisionId), ownerSession.RawSessionToken);
        using var applyResponse = await client.SendAsync(applyRequest);
        var applyContent = await applyResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, applyResponse.StatusCode);
        Assert.Equal("application/problem+json", applyResponse.Content.Headers.ContentType?.MediaType);
        using (var payload = JsonDocument.Parse(applyContent))
        {
            Assert.Equal("Bill revision settlement conflict", payload.RootElement.GetProperty("title").GetString());
            Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
            Assert.Equal(
                ExpenseBillRevisionSettlementApplyPolicy.PendingRequestedOnlyConflictDetail,
                payload.RootElement.GetProperty("detail").GetString());
        }

        var afterCounts = await ReadSettlementMutationCountsAsync(testFactory);
        Assert.Equal(beforeCounts, afterCounts);
        var bill = await ReadBillAsync(testFactory, billId);
        Assert.Null(bill.ActiveAcceptedBillRevisionId);
        Assert.Equal(50m, bill.Participants.Single(participant => participant.UserProfileId == debtorSession.UserProfileId).ResolvedShareAmount);
        Assert.Equal(ExpenseBillRevisionStatuses.SubmittedForReview, (await ReadRevisionAsync(testFactory, revisionId)).Status);
        await AssertSettlementCandidateAmountAsync(client, billId, ownerSession.RawSessionToken, "50");
    }

    [Fact]
    public void OpenApiAndGeneratedClientsExposeBillRevisionReviewContext()
    {
        var openApi = File.ReadAllText(FindRepoFile("packages/contracts/openapi/settleora.v1.yaml"));
        var personalBillSchema = ExtractOpenApiSchemaBlock(openApi, "PersonalBillResponse:");
        var groupBillSchema = ExtractOpenApiSchemaBlock(openApi, "GroupBillResponse:");
        var responseSchema = ExtractOpenApiSchemaBlock(openApi, "BillRevisionResponse:");
        var creationActionsSchema = ExtractOpenApiSchemaBlock(openApi, "BillRevisionCreationActionsResponse:");
        var viewerActionsSchema = ExtractOpenApiSchemaBlock(openApi, "BillRevisionViewerActionsResponse:");
        var reviewContextSchema = ExtractOpenApiSchemaBlock(openApi, "BillRevisionReviewContextResponse:");
        var baselineTypeSchema = ExtractOpenApiSchemaBlock(openApi, "BillRevisionReviewBaselineType:");
        var financialImpactSchema = ExtractOpenApiSchemaBlock(openApi, "BillRevisionViewerFinancialImpactResponse:");
        var changeSchema = ExtractOpenApiSchemaBlock(openApi, "BillRevisionChangeResponse:");
        var payerConfirmationRequestSchema = ExtractOpenApiSchemaBlock(openApi, "ConfirmBillRevisionPayerRequest:");

        Assert.Contains("revisionCreationActions", personalBillSchema, StringComparison.Ordinal);
        Assert.Contains("revisionCreationActions", groupBillSchema, StringComparison.Ordinal);
        Assert.Contains("canCreateRevision", creationActionsSchema, StringComparison.Ordinal);
        Assert.Contains("clients must not infer", creationActionsSchema, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("reviewContext", responseSchema, StringComparison.Ordinal);
        Assert.Contains("viewerActions", responseSchema, StringComparison.Ordinal);
        Assert.Contains("canConfirmPayer", viewerActionsSchema, StringComparison.Ordinal);
        Assert.Contains("not an authorization boundary", viewerActionsSchema, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("server-authoritative", reviewContextSchema, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("defaultViewMode", reviewContextSchema, StringComparison.Ordinal);
        Assert.Contains("fullViewRecommendedReason", reviewContextSchema, StringComparison.Ordinal);
        Assert.Contains("no_prior_baseline", baselineTypeSchema, StringComparison.Ordinal);
        Assert.Contains("previous_revision_approval", baselineTypeSchema, StringComparison.Ordinal);
        Assert.Contains("previousShare", financialImpactSchema, StringComparison.Ordinal);
        Assert.Contains("payerImpact", financialImpactSchema, StringComparison.Ordinal);
        Assert.Contains("accessibleLabel", changeSchema, StringComparison.Ordinal);
        Assert.Contains("unsupported_in_current_revision_snapshot", openApi, StringComparison.Ordinal);
        Assert.Contains("/api/v1/bills/{billId}/revisions/{revisionId}/payer-confirmation:", openApi, StringComparison.Ordinal);
        Assert.Contains("operationId: confirmBillRevisionPayer", openApi, StringComparison.Ordinal);
        Assert.Contains("calculationHash", payerConfirmationRequestSchema, StringComparison.Ordinal);

        var webModels = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/models.ts"));
        var webClient = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/client.ts"));
        var dartModels = File.ReadAllText(FindRepoFile("packages/client-dart/lib/generated/models.dart"));
        var dartClient = File.ReadAllText(FindRepoFile("packages/client-dart/lib/generated/client.dart"));
        Assert.Contains("revisionCreationActions: BillRevisionCreationActionsResponse", webModels, StringComparison.Ordinal);
        Assert.Contains("export interface BillRevisionCreationActionsResponse", webModels, StringComparison.Ordinal);
        Assert.Contains("reviewContext: BillRevisionReviewContextResponse", webModels, StringComparison.Ordinal);
        Assert.Contains("viewerActions: BillRevisionViewerActionsResponse", webModels, StringComparison.Ordinal);
        Assert.Contains("export interface BillRevisionViewerActionsResponse", webModels, StringComparison.Ordinal);
        Assert.Contains("export interface BillRevisionReviewContextResponse", webModels, StringComparison.Ordinal);
        Assert.Contains("ConfirmBillRevisionPayerRequest", webModels, StringComparison.Ordinal);
        Assert.Contains("confirmBillRevisionPayer", webClient, StringComparison.Ordinal);
        Assert.Contains("final BillRevisionCreationActionsResponse revisionCreationActions", dartModels, StringComparison.Ordinal);
        Assert.Contains("class BillRevisionCreationActionsResponse", dartModels, StringComparison.Ordinal);
        Assert.Contains("final BillRevisionReviewContextResponse reviewContext", dartModels, StringComparison.Ordinal);
        Assert.Contains("final BillRevisionViewerActionsResponse viewerActions", dartModels, StringComparison.Ordinal);
        Assert.Contains("class BillRevisionViewerActionsResponse", dartModels, StringComparison.Ordinal);
        Assert.Contains("class BillRevisionReviewContextResponse", dartModels, StringComparison.Ordinal);
        Assert.Contains("class ConfirmBillRevisionPayerRequest", dartModels, StringComparison.Ordinal);
        Assert.Contains("confirmBillRevisionPayer", dartClient, StringComparison.Ordinal);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new ExpenseBillRevisionTestTimeProvider(InitialTimestamp);
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
        ExpenseBillRevisionTestTimeProvider timeProvider,
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
        return new SeededAccount(authAccountId, userProfileId, null);
    }

    private static async Task<SeededSession> SeedSessionForAccountAsync(
        WebApplicationFactory<Program> testFactory,
        ExpenseBillRevisionTestTimeProvider timeProvider,
        SeededAccount account)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Bill revision endpoint test",
                UserAgentSummary: "Bill revision endpoint test user agent",
                NetworkAddressHash: "bill-revision-endpoint-test-network",
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
        Guid ownerProfileId,
        Guid? groupId,
        IReadOnlyList<ParticipantSeed> participants,
        IReadOnlyList<PayerSeed> payers,
        string status,
        DateTimeOffset createdAtUtc,
        DateTimeOffset? archivedAtUtc = null)
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
            BillOwnerUserProfileId = ownerProfileId,
            GroupId = groupId,
            MerchantName = "Hidden Revision Merchant",
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
            Name = "Hidden Revision Item",
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
                Status = participant.Status,
                ResolvedShareAmount = participant.ResolvedShareAmount,
                ResolvedShareCurrency = "USD",
                AcceptedAtUtc = participant.AcceptedAtUtc
                    ?? (participant.Status == ExpenseBillParticipantStatuses.Accepted ? createdAtUtc : null),
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
                PayerFactsCreatedByUserProfileId = creatorProfileId,
                Amount = payer.Amount,
                Currency = "USD",
                PayerConfirmationStatus = ExpenseBillPayerConfirmationStatuses.Confirmed,
                PayerConfirmedAtUtc = createdAtUtc,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        dbContext.Set<ExpenseBill>().Add(bill);
        await dbContext.SaveChangesAsync();
        return billId;
    }

    private static async Task<Guid> CreateDraftRevisionAsync(
        WebApplicationFactory<Program> testFactory,
        ExpenseBillRevisionTestTimeProvider timeProvider,
        Guid billId,
        string rawSessionToken,
        Guid creatorProfileId,
        Guid participantProfileId)
    {
        timeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            rawSessionToken,
            SnapshotJson(
                [(creatorProfileId, 40m), (participantProfileId, 60m)],
                [(creatorProfileId, 100m)]));
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.Created, content);
        using var payload = JsonDocument.Parse(content);
        return payload.RootElement.GetProperty("id").GetGuid();
    }

    private static async Task<Guid> CreateSubmittedRevisionAsync(
        WebApplicationFactory<Program> testFactory,
        ExpenseBillRevisionTestTimeProvider timeProvider,
        Guid billId,
        string rawSessionToken,
        string snapshotJson)
    {
        timeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var createRequest = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            rawSessionToken,
            snapshotJson);
        using var createResponse = await client.SendAsync(createRequest);
        var createContent = await createResponse.Content.ReadAsStringAsync();
        Assert.True(createResponse.StatusCode == HttpStatusCode.Created, createContent);
        using var createPayload = JsonDocument.Parse(createContent);
        var revisionId = createPayload.RootElement.GetProperty("id").GetGuid();

        using var submitRequest = CreateBearerRequest(HttpMethod.Post, SubmitPath(billId, revisionId), rawSessionToken);
        using var submitResponse = await client.SendAsync(submitRequest);
        var submitContent = await submitResponse.Content.ReadAsStringAsync();
        Assert.True(submitResponse.StatusCode == HttpStatusCode.OK, submitContent);

        return revisionId;
    }

    private static async Task<Guid> SeedReceiptAttachmentAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId,
        Guid ownerUserProfileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var fileId = Guid.NewGuid();
        dbContext.Set<FileObject>().Add(new FileObject
        {
            Id = fileId,
            OwnerUserProfileId = ownerUserProfileId,
            CreatedByUserProfileId = ownerUserProfileId,
            Purpose = FileObjectPurposes.ReceiptImage,
            Status = FileObjectStatuses.Active,
            ContentType = "image/png",
            OriginalFilename = "hidden-revision-receipt.png",
            SizeBytes = 128,
            Sha256Hash = new string('a', 64),
            StorageProvider = "local",
            StorageObjectKey = "receipts/private-key",
            EncryptionMode = FileObjectEncryptionModes.ServerManaged,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<ExpenseBillAttachment>().Add(new ExpenseBillAttachment
        {
            ExpenseBillId = billId,
            FileObjectId = fileId,
            Purpose = ExpenseBillAttachmentPurposes.Receipt,
            CreatedByUserProfileId = ownerUserProfileId,
            CreatedAtUtc = InitialTimestamp
        });

        await dbContext.SaveChangesAsync();
        return fileId;
    }

    private static async Task<Guid> SeedReceiptOcrReviewAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId,
        Guid fileId,
        Guid createdByUserProfileId,
        Guid? groupId,
        DateTimeOffset updatedAtUtc)
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
            Status = ReceiptOcrReviewStatuses.Reviewed,
            Source = ReceiptOcrReviewSources.OnDevice,
            MerchantText = "private ocr text",
            Currency = "USD",
            GrandTotalAmount = 100m,
            CreatedAtUtc = updatedAtUtc.AddMinutes(-1),
            UpdatedAtUtc = updatedAtUtc
        };
        review.Lines.Add(new ReceiptOcrReviewLine
        {
            Id = Guid.NewGuid(),
            ReceiptOcrReviewId = review.Id,
            SortOrder = 0,
            Text = "private ocr text line",
            Quantity = 1m,
            UnitPriceAmount = 100m,
            LineTotalAmount = 100m,
            CreatedAtUtc = updatedAtUtc.AddMinutes(-1),
            UpdatedAtUtc = updatedAtUtc
        });

        dbContext.Set<ReceiptOcrReview>().Add(review);
        await dbContext.SaveChangesAsync();
        return review.Id;
    }

    private static async Task ApproveAllRevisionApprovalsAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId,
        Guid revisionId,
        IReadOnlyDictionary<Guid, string> rawSessionTokensByProfileId)
    {
        foreach (var userProfileId in rawSessionTokensByProfileId.Keys.OrderBy(id => id))
        {
            await ApproveRevisionApprovalAsync(
                testFactory,
                billId,
                revisionId,
                userProfileId,
                rawSessionTokensByProfileId[userProfileId]);
        }
    }

    private static async Task ApproveRevisionApprovalAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId,
        Guid revisionId,
        Guid participantUserProfileId,
        string rawSessionToken)
    {
        var approval = await ReadApprovalAsync(testFactory, revisionId, participantUserProfileId);
        using var client = testFactory.CreateClient();
        using var approveRequest = CreateJsonRequest(
            HttpMethod.Post,
            ApprovePath(billId, revisionId),
            rawSessionToken,
            ApprovalJson(FormatAmount(approval.AcceptedAmount), approval.Currency, approval.CalculationHash));
        using var approveResponse = await client.SendAsync(approveRequest);
        var approveContent = await approveResponse.Content.ReadAsStringAsync();
        Assert.True(approveResponse.StatusCode == HttpStatusCode.OK, approveContent);
    }

    private static async Task<Guid> SeedRevisionWithStatusAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId,
        Guid ownerUserProfileId,
        string status,
        DateTimeOffset createdAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var bill = await dbContext.Set<ExpenseBill>()
            .Include(candidate => candidate.Participants)
            .Include(candidate => candidate.Payers)
            .SingleAsync(candidate => candidate.Id == billId);
        var revisionId = Guid.NewGuid();
        var calculationHash = new string('b', 64);
        var revision = new ExpenseBillRevision
        {
            Id = revisionId,
            ExpenseBillId = billId,
            ProposalCreatorUserProfileId = ownerUserProfileId,
            Status = status,
            TotalAmount = bill.TotalAmount,
            TotalCurrency = bill.TotalCurrency,
            CalculationHash = calculationHash,
            SubmittedAtUtc = status == ExpenseBillRevisionStatuses.SubmittedForReview ? createdAtUtc : null,
            WithdrawnAtUtc = status == ExpenseBillRevisionStatuses.WithdrawnByProposer ? createdAtUtc : null,
            SupersededAtUtc = status == ExpenseBillRevisionStatuses.SupersededByResubmission ? createdAtUtc : null,
            RejectedAtUtc = status == ExpenseBillRevisionStatuses.Rejected ? createdAtUtc : null,
            AppliedAtUtc = status == ExpenseBillRevisionStatuses.AcceptedApplied ? createdAtUtc : null,
            CancelledAtUtc = status == ExpenseBillRevisionStatuses.CancelledByAuthorizedEditor ? createdAtUtc : null,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        };

        foreach (var participant in bill.Participants)
        {
            revision.Participants.Add(new ExpenseBillRevisionParticipant
            {
                ExpenseBillRevisionId = revisionId,
                UserProfileId = participant.UserProfileId,
                ResolvedShareAmount = participant.ResolvedShareAmount,
                ResolvedShareCurrency = participant.ResolvedShareCurrency,
                AffectedByRevision = true,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
            revision.Approvals.Add(new ExpenseBillRevisionApproval
            {
                Id = Guid.NewGuid(),
                ExpenseBillRevisionId = revisionId,
                ParticipantUserProfileId = participant.UserProfileId,
                AcceptedAmount = participant.ResolvedShareAmount,
                Currency = participant.ResolvedShareCurrency,
                CalculationHash = calculationHash,
                Status = ExpenseBillRevisionApprovalStatuses.Approved,
                ApprovedAtUtc = createdAtUtc,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        foreach (var payer in bill.Payers)
        {
            revision.Payers.Add(new ExpenseBillRevisionPayer
            {
                ExpenseBillRevisionId = revisionId,
                UserProfileId = payer.UserProfileId,
                Amount = payer.Amount,
                Currency = payer.Currency,
                RequiresPayerConfirmation = false,
                PayerConfirmationStatus = ExpenseBillPayerConfirmationStatuses.Confirmed,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        dbContext.Set<ExpenseBillRevision>().Add(revision);
        await dbContext.SaveChangesAsync();
        return revisionId;
    }

    private static async Task ForceApprovalStatusAsync(
        WebApplicationFactory<Program> testFactory,
        Guid revisionId,
        Guid participantUserProfileId,
        string status,
        string calculationHash)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var approval = await dbContext.Set<ExpenseBillRevisionApproval>()
            .SingleAsync(candidate => candidate.ExpenseBillRevisionId == revisionId
                && candidate.ParticipantUserProfileId == participantUserProfileId);
        approval.Status = status;
        approval.CalculationHash = calculationHash;
        approval.ApprovedAtUtc = WriteTimestamp.AddMinutes(1);
        approval.RejectedAtUtc = null;
        approval.InvalidatedAtUtc = null;
        approval.UpdatedAtUtc = WriteTimestamp.AddMinutes(1);
        await dbContext.SaveChangesAsync();
    }

    private static async Task SetRevisionPayerConfirmationStatusAsync(
        WebApplicationFactory<Program> testFactory,
        Guid revisionId,
        Guid payerUserProfileId,
        string status)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var payer = await dbContext.Set<ExpenseBillRevisionPayer>()
            .SingleAsync(candidate => candidate.ExpenseBillRevisionId == revisionId
                && candidate.UserProfileId == payerUserProfileId);
        payer.PayerConfirmationStatus = status;
        payer.UpdatedAtUtc = WriteTimestamp.AddMinutes(1);
        await dbContext.SaveChangesAsync();
    }

    private static async Task SeedSettlementStateAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId,
        Guid revisionId,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var requestId = Guid.NewGuid();
        var lineId = Guid.NewGuid();
        var paymentId = Guid.NewGuid();
        var fileObjectId = Guid.NewGuid();
        dbContext.Set<SettlementRequest>().Add(new SettlementRequest
        {
            Id = requestId,
            SourceExpenseBillId = billId,
            DebtorUserProfileId = debtorUserProfileId,
            CreditorUserProfileId = creditorUserProfileId,
            Amount = 50m,
            Currency = "USD",
            Status = SettlementRequestStatuses.PartiallyPaid,
            RequestedByUserProfileId = debtorUserProfileId,
            RequestedAtUtc = InitialTimestamp,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<SettlementRequestLine>().Add(new SettlementRequestLine
        {
            Id = lineId,
            SettlementRequestId = requestId,
            SourceExpenseBillId = billId,
            SourceBillRevisionId = revisionId,
            SourceCandidateKey = "seeded-apply-blocking-line",
            ExactAmount = 50m,
            Currency = "USD",
            AllocationOrder = 0,
            Status = SettlementRequestLineStatuses.Open,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<SettlementPayment>().Add(new SettlementPayment
        {
            Id = paymentId,
            SettlementRequestId = requestId,
            PaidByUserProfileId = debtorUserProfileId,
            ReceivedByUserProfileId = creditorUserProfileId,
            Amount = 25m,
            Currency = "USD",
            Status = SettlementPaymentStatuses.MarkedPaid,
            PaymentDate = DateOnly.FromDateTime(InitialTimestamp.UtcDateTime),
            CreatedByUserProfileId = debtorUserProfileId,
            ClaimedAtUtc = InitialTimestamp,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<SettlementPaymentAllocation>().Add(new SettlementPaymentAllocation
        {
            Id = Guid.NewGuid(),
            SettlementPaymentId = paymentId,
            SettlementRequestLineId = lineId,
            ClearedAmount = 25m,
            Currency = "USD",
            AllocationOrder = 0,
            CreatedAtUtc = InitialTimestamp
        });
        dbContext.Set<SettlementResidual>().Add(new SettlementResidual
        {
            Id = Guid.NewGuid(),
            SettlementPaymentId = paymentId,
            SettlementRequestId = requestId,
            DebtorUserProfileId = debtorUserProfileId,
            CreditorUserProfileId = creditorUserProfileId,
            Direction = SettlementResidualDirections.Underpayment,
            Amount = 25m,
            Currency = "USD",
            Policy = SettlementResidualPolicies.RemainingBalance,
            Status = SettlementResidualStatuses.PendingReceiverConfirmation,
            CreatedAtUtc = InitialTimestamp
        });
        dbContext.Set<FileObject>().Add(new FileObject
        {
            Id = fileObjectId,
            OwnerUserProfileId = debtorUserProfileId,
            CreatedByUserProfileId = debtorUserProfileId,
            Purpose = FileObjectPurposes.SettlementProof,
            Status = FileObjectStatuses.Active,
            ContentType = "image/png",
            SizeBytes = 128,
            StorageProvider = "local",
            StorageObjectKey = $"settlement-proof/{fileObjectId:D}",
            EncryptionMode = FileObjectEncryptionModes.ServerManaged,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<SettlementProofAttachment>().Add(new SettlementProofAttachment
        {
            SettlementPaymentId = paymentId,
            FileObjectId = fileObjectId,
            CreatedByUserProfileId = debtorUserProfileId,
            CreatedAtUtc = InitialTimestamp
        });

        await dbContext.SaveChangesAsync();
    }

    private static async Task SeedPendingSettlementRequestOnlyStateAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId,
        Guid revisionId,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var requestId = Guid.NewGuid();
        dbContext.Set<SettlementRequest>().Add(new SettlementRequest
        {
            Id = requestId,
            SourceExpenseBillId = billId,
            DebtorUserProfileId = debtorUserProfileId,
            CreditorUserProfileId = creditorUserProfileId,
            Amount = 50m,
            Currency = "USD",
            Status = SettlementRequestStatuses.Requested,
            RequestedByUserProfileId = debtorUserProfileId,
            RequestedAtUtc = InitialTimestamp,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<SettlementRequestLine>().Add(new SettlementRequestLine
        {
            Id = Guid.NewGuid(),
            SettlementRequestId = requestId,
            SourceExpenseBillId = billId,
            SourceBillRevisionId = revisionId,
            SourceCandidateKey = "seeded-pending-requested-line",
            ExactAmount = 50m,
            Currency = "USD",
            AllocationOrder = 0,
            Status = SettlementRequestLineStatuses.Open,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });

        await dbContext.SaveChangesAsync();
    }

    private static async Task<ExpenseBillRevision> ReadRevisionAsync(
        WebApplicationFactory<Program> testFactory,
        Guid revisionId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ExpenseBillRevision>()
            .Include(revision => revision.Participants)
            .Include(revision => revision.Payers)
            .Include(revision => revision.Approvals)
            .SingleAsync(revision => revision.Id == revisionId);
    }

    private static async Task<IReadOnlyList<ExpenseBillRevision>> ReadRevisionsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ExpenseBillRevision>()
            .AsNoTracking()
            .OrderBy(revision => revision.CreatedAtUtc)
            .ThenBy(revision => revision.Id)
            .ToArrayAsync();
    }

    private static async Task<ReceiptOcrReview> ReadReceiptOcrReviewAsync(
        WebApplicationFactory<Program> testFactory,
        Guid reviewId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ReceiptOcrReview>()
            .Include(review => review.Lines)
            .SingleAsync(review => review.Id == reviewId);
    }

    private static async Task<ExpenseBillRevisionApproval> ReadApprovalAsync(
        WebApplicationFactory<Program> testFactory,
        Guid revisionId,
        Guid participantUserProfileId)
    {
        var revision = await ReadRevisionAsync(testFactory, revisionId);
        return revision.Approvals.Single(approval => approval.ParticipantUserProfileId == participantUserProfileId);
    }

    private static async Task<ExpenseBill> ReadBillAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ExpenseBill>()
            .Include(bill => bill.Participants)
            .Include(bill => bill.Payers)
            .SingleAsync(bill => bill.Id == billId);
    }

    private static async Task<IReadOnlyList<InAppNotification>> ReadNotificationsAsync(
        WebApplicationFactory<Program> testFactory,
        string? eventType = null)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var query = dbContext.Set<InAppNotification>()
            .AsNoTracking();
        if (eventType is not null)
        {
            query = query.Where(notification => notification.EventType == eventType);
        }

        return await query
            .OrderBy(notification => notification.CreatedAtUtc)
            .ThenBy(notification => notification.Id)
            .ToArrayAsync();
    }

    private static async Task<IReadOnlyList<AuthAuditEvent>> ReadRevisionAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthAuditEvent>()
            .AsNoTracking()
            .Where(auditEvent => auditEvent.Action.StartsWith("bill.revision_"))
            .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
            .ThenBy(auditEvent => auditEvent.Action)
            .ThenBy(auditEvent => auditEvent.Id)
            .ToArrayAsync();
    }

    private static void AssertBoundedRevisionAuditMetadata(
        AuthAuditEvent auditEvent,
        Guid expectedBillId,
        Guid expectedRevisionId,
        string previousRevisionStatus,
        string newRevisionStatus,
        int expectedPendingApprovalCount,
        int expectedApprovedCount,
        Guid? expectedPayerUserProfileId = null)
    {
        Assert.Equal("success", auditEvent.Outcome);
        Assert.NotNull(auditEvent.SafeMetadataJson);
        Assert.True(auditEvent.SafeMetadataJson!.Length <= 4096);

        using var metadata = JsonDocument.Parse(auditEvent.SafeMetadataJson);
        Assert.Equal("bill_revision_proposal", metadata.RootElement.GetProperty("workflowName").GetString());
        Assert.Equal(expectedBillId.ToString("D"), metadata.RootElement.GetProperty("billId").GetString());
        Assert.Equal(expectedRevisionId.ToString("D"), metadata.RootElement.GetProperty("revisionId").GetString());
        Assert.Equal(previousRevisionStatus, metadata.RootElement.GetProperty("previousRevisionStatus").GetString());
        Assert.Equal(newRevisionStatus, metadata.RootElement.GetProperty("newRevisionStatus").GetString());
        Assert.Equal(expectedPendingApprovalCount, metadata.RootElement.GetProperty("pendingApprovalCount").GetInt32());
        Assert.Equal(expectedApprovedCount, metadata.RootElement.GetProperty("approvedCount").GetInt32());
        if (expectedPayerUserProfileId.HasValue)
        {
            Assert.Equal(
                expectedPayerUserProfileId.Value.ToString("D"),
                metadata.RootElement.GetProperty("payerUserProfileId").GetString());
        }
        else
        {
            Assert.False(metadata.RootElement.TryGetProperty("payerUserProfileId", out _));
        }

        var auditText = string.Join(
            "\n",
            auditEvent.Action,
            auditEvent.Outcome,
            auditEvent.SafeMetadataJson);
        var lowerAuditText = auditText.ToLowerInvariant();
        Assert.DoesNotContain("body", lowerAuditText);
        Assert.DoesNotContain("token", lowerAuditText);
        Assert.DoesNotContain("session", lowerAuditText);
        Assert.DoesNotContain("credential", lowerAuditText);
        Assert.DoesNotContain("password", lowerAuditText);
        Assert.DoesNotContain("calculationhash", lowerAuditText);
        Assert.DoesNotContain("storage", lowerAuditText);
        Assert.DoesNotContain("proof", lowerAuditText);
        Assert.DoesNotContain("objectkey", lowerAuditText);
        Assert.DoesNotContain("ocr", lowerAuditText);
    }

    private static void AssertNotificationRecipients(
        IReadOnlyList<InAppNotification> notifications,
        params Guid[] expectedRecipientIds)
    {
        Assert.Equal(
            expectedRecipientIds.Order().ToArray(),
            notifications
                .Select(notification => notification.RecipientUserProfileId)
                .Order()
                .ToArray());
    }

    private static void AssertRevisionNotificationEnvelope(
        InAppNotification notification,
        string expectedEventType,
        string expectedPriority,
        string expectedSafeSummary,
        Guid expectedActorUserProfileId,
        Guid expectedBillId,
        Guid expectedRevisionId,
        Guid? expectedGroupId)
    {
        Assert.NotEqual(Guid.Empty, notification.Id);
        Assert.NotEqual(Guid.Empty, notification.RecipientUserProfileId);
        Assert.NotEqual(notification.RecipientUserProfileId, notification.ActorUserProfileId);
        Assert.Equal(expectedActorUserProfileId, notification.ActorUserProfileId);
        Assert.Equal(expectedEventType, notification.EventType);
        Assert.Equal(InAppNotificationStatuses.Unread, notification.Status);
        Assert.Null(notification.ReadAtUtc);
        Assert.Null(notification.ArchivedAtUtc);
        Assert.Equal(expectedPriority, notification.Priority);
        Assert.Equal(InAppNotificationSubjectTypes.ExpenseBill, notification.SubjectType);
        Assert.Equal($"notifications.{expectedEventType}.title", notification.TitleKey);
        Assert.Equal($"notifications.{expectedEventType}.message", notification.MessageKey);
        Assert.Equal(expectedSafeSummary, notification.SafeSummary);
        Assert.Equal($"/api/v1/bills/{expectedBillId:D}/revisions/{expectedRevisionId:D}", notification.ActionUrl);
        Assert.Equal(expectedGroupId, notification.GroupId);
        Assert.Equal(expectedBillId, notification.ExpenseBillId);
        Assert.Equal(expectedRevisionId, notification.ExpenseBillRevisionId);
        Assert.Null(notification.SettlementRequestId);
        Assert.Null(notification.SettlementPaymentId);
        Assert.Null(notification.RecurringBillTemplateId);
        Assert.Null(notification.RecurringBillOccurrenceId);
        Assert.True(notification.CreatedAtUtc >= InitialTimestamp);
    }

    private static void AssertSafeNotificationMetadata(IReadOnlyList<InAppNotification> notifications)
    {
        var notificationText = string.Join(
            "\n",
            notifications.Select(notification => string.Join(
                "\n",
                notification.EventType,
                notification.SubjectType,
                notification.TitleKey,
                notification.MessageKey,
                notification.SafeSummary,
                notification.ActionUrl,
                notification.GroupId?.ToString("D"),
                notification.ExpenseBillId?.ToString("D"),
                notification.ExpenseBillRevisionId?.ToString("D"))));
        var lowerNotificationText = notificationText.ToLowerInvariant();

        Assert.DoesNotContain("Hidden Revision Merchant", notificationText, StringComparison.Ordinal);
        Assert.DoesNotContain("Hidden Revision Item", notificationText, StringComparison.Ordinal);
        Assert.DoesNotContain("private", lowerNotificationText);
        Assert.DoesNotContain("token", lowerNotificationText);
        Assert.DoesNotContain("session", lowerNotificationText);
        Assert.DoesNotContain("credential", lowerNotificationText);
        Assert.DoesNotContain("password", lowerNotificationText);
        Assert.DoesNotContain("proof", lowerNotificationText);
        Assert.DoesNotContain("objectkey", lowerNotificationText);
        Assert.DoesNotContain("storage", lowerNotificationText);
        Assert.DoesNotContain("ocr", lowerNotificationText);
        Assert.DoesNotContain("receipt", lowerNotificationText);
    }

    private static async Task<SettlementMutationCounts> ReadSettlementMutationCountsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return new SettlementMutationCounts(
            await dbContext.Set<SettlementRequest>().CountAsync(),
            await dbContext.Set<SettlementRequestLine>().CountAsync(),
            await dbContext.Set<SettlementPayment>().CountAsync(),
            await dbContext.Set<SettlementPaymentAllocation>().CountAsync(),
            await dbContext.Set<SettlementResidual>().CountAsync(),
            await dbContext.Set<SettlementProofAttachment>().CountAsync());
    }

    private static async Task AssertSettlementCandidateAmountAsync(
        HttpClient client,
        Guid billId,
        string rawSessionToken,
        string expectedAmount)
    {
        using var request = CreateBearerRequest(HttpMethod.Get, SettlementCandidatesPath(billId), rawSessionToken);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var payload = JsonDocument.Parse(content);
        var candidate = Assert.Single(payload.RootElement.GetProperty("candidates").EnumerateArray());
        Assert.Equal(expectedAmount, candidate.GetProperty("amount").GetString());
    }

    private static void AssertMoneyValue(JsonElement value, string expectedAmount, string expectedCurrency)
    {
        Assert.Equal(expectedAmount, value.GetProperty("amount").GetString());
        Assert.Equal(expectedCurrency, value.GetProperty("currency").GetString());
    }

    private static void AssertMoneyDisplayValue(JsonElement value, string expectedAmount, string expectedCurrency)
    {
        Assert.Equal($"{expectedCurrency} {expectedAmount}", value.GetProperty("displayValue").GetString());
        Assert.Equal(expectedAmount, value.GetProperty("amount").GetString());
        Assert.Equal(expectedCurrency, value.GetProperty("currency").GetString());
    }

    private static void AssertSummary(
        JsonElement reviewContext,
        string category,
        string expectedSupportStatus,
        int expectedChangeCount,
        string expectedViewerImpact)
    {
        var summary = reviewContext.GetProperty("changeSummary")
            .EnumerateArray()
            .Single(candidate => candidate.GetProperty("category").GetString() == category);

        Assert.Equal(expectedSupportStatus, summary.GetProperty("supportStatus").GetString());
        Assert.Equal(expectedChangeCount, summary.GetProperty("changeCount").GetInt32());
        Assert.Equal(expectedViewerImpact, summary.GetProperty("viewerImpact").GetString());
    }

    private static void AssertViewerActions(
        JsonElement revision,
        bool canSubmit,
        bool canWithdraw,
        bool canRevise,
        bool canApprove,
        bool canReject,
        bool canConfirmPayer,
        bool canApply)
    {
        var viewerActions = revision.GetProperty("viewerActions");
        Assert.Equal(canSubmit, viewerActions.GetProperty("canSubmit").GetBoolean());
        Assert.Equal(canWithdraw, viewerActions.GetProperty("canWithdraw").GetBoolean());
        Assert.Equal(canRevise, viewerActions.GetProperty("canRevise").GetBoolean());
        Assert.Equal(canApprove, viewerActions.GetProperty("canApprove").GetBoolean());
        Assert.Equal(canReject, viewerActions.GetProperty("canReject").GetBoolean());
        Assert.Equal(canConfirmPayer, viewerActions.GetProperty("canConfirmPayer").GetBoolean());
        Assert.Equal(canApply, viewerActions.GetProperty("canApply").GetBoolean());
    }

    private static void AssertSafeReviewContextText(string responseContent)
    {
        Assert.DoesNotContain("StorageObjectKey", responseContent, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("objectkey", responseContent, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("settlement-proof", responseContent, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("session", responseContent, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("credential", responseContent, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("password", responseContent, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Hidden Revision Merchant", responseContent, StringComparison.Ordinal);
        Assert.DoesNotContain("Hidden Revision Item", responseContent, StringComparison.Ordinal);
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
        string rawSessionToken,
        string json)
    {
        var request = CreateBearerRequest(method, path, rawSessionToken);
        request.Content = new StringContent(json, Encoding.UTF8, "application/json");

        return request;
    }

    private static string SnapshotJson(
        IReadOnlyList<(Guid UserProfileId, decimal Amount)> participants,
        IReadOnlyList<(Guid UserProfileId, decimal Amount)> payers)
    {
        var total = participants.Sum(participant => participant.Amount);
        var participantJson = string.Join(
            ",",
            participants.Select(participant =>
                $$"""{"userProfileId":"{{participant.UserProfileId:D}}","resolvedShareAmount":"{{FormatAmount(participant.Amount)}}","resolvedShareCurrency":"USD"}"""));
        var payerJson = string.Join(
            ",",
            payers.Select(payer =>
                $$"""{"userProfileId":"{{payer.UserProfileId:D}}","amount":"{{FormatAmount(payer.Amount)}}","currency":"USD"}"""));

        return $$"""{"totalAmount":"{{FormatAmount(total)}}","totalCurrency":"USD","participants":[{{participantJson}}],"payers":[{{payerJson}}]}""";
    }

    private static string SnapshotJsonWithOcrSource(
        IReadOnlyList<(Guid UserProfileId, decimal Amount)> participants,
        IReadOnlyList<(Guid UserProfileId, decimal Amount)> payers,
        Guid receiptAttachmentFileId,
        Guid ocrReviewId,
        DateTimeOffset expectedOcrReviewUpdatedAtUtc)
    {
        var snapshot = SnapshotJson(participants, payers);
        var source = $$""","ocrSource":{"receiptAttachmentFileId":"{{receiptAttachmentFileId:D}}","ocrReviewId":"{{ocrReviewId:D}}","expectedOcrReviewVersion":"{{expectedOcrReviewUpdatedAtUtc.ToUniversalTime().ToString("O", System.Globalization.CultureInfo.InvariantCulture)}}","expectedOcrReviewUpdatedAtUtc":"{{expectedOcrReviewUpdatedAtUtc.ToUniversalTime().ToString("O", System.Globalization.CultureInfo.InvariantCulture)}}","sourceMode":"saved_receipt_ocr_review"}""";
        return snapshot[..^1] + source + "}";
    }

    private static string ApprovalJson(
        string acceptedAmount,
        string currency,
        string calculationHash)
    {
        return $$"""{"acceptedAmount":"{{acceptedAmount}}","currency":"{{currency}}","calculationHash":"{{calculationHash}}"}""";
    }

    private static string PayerConfirmationJson(string calculationHash)
    {
        return $$"""{"calculationHash":"{{calculationHash}}"}""";
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", System.Globalization.CultureInfo.InvariantCulture);
    }

    private static string RevisionsPath(Guid billId)
    {
        return $"/api/v1/bills/{billId:D}/revisions";
    }

    private static string PersonalBillPath(Guid billId)
    {
        return $"/api/v1/bills/{billId:D}";
    }

    private static string GroupBillPath(Guid groupId, Guid billId)
    {
        return $"/api/v1/groups/{groupId:D}/bills/{billId:D}";
    }

    private static string RevisionPath(Guid billId, Guid revisionId)
    {
        return $"/api/v1/bills/{billId:D}/revisions/{revisionId:D}";
    }

    private static string SubmitPath(Guid billId, Guid revisionId)
    {
        return $"/api/v1/bills/{billId:D}/revisions/{revisionId:D}/submit";
    }

    private static string WithdrawPath(Guid billId, Guid revisionId)
    {
        return $"/api/v1/bills/{billId:D}/revisions/{revisionId:D}/withdraw";
    }

    private static string ApprovePath(Guid billId, Guid revisionId)
    {
        return $"/api/v1/bills/{billId:D}/revisions/{revisionId:D}/approve";
    }

    private static string RejectPath(Guid billId, Guid revisionId)
    {
        return $"/api/v1/bills/{billId:D}/revisions/{revisionId:D}/reject";
    }

    private static string PayerConfirmationPath(Guid billId, Guid revisionId)
    {
        return $"/api/v1/bills/{billId:D}/revisions/{revisionId:D}/payer-confirmation";
    }

    private static string ApplyPath(Guid billId, Guid revisionId)
    {
        return $"/api/v1/bills/{billId:D}/revisions/{revisionId:D}/apply";
    }

    private static string SettlementCandidatesPath(Guid billId)
    {
        return $"/api/v1/bills/{billId:D}/settlement-candidates";
    }

    private static async Task AssertBillRevisionConflictProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Bill revision conflict", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested bill revision transition is not allowed.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static void AssertRevisionCreationCapability(
        JsonElement root,
        bool canCreateRevision)
    {
        var actions = root.GetProperty("revisionCreationActions");
        Assert.Equal(canCreateRevision, actions.GetProperty("canCreateRevision").GetBoolean());
    }

    private static async Task AssertUnavailableWithoutRevisionCreationCapabilityAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.DoesNotContain("revisionCreationActions", content, StringComparison.Ordinal);
        Assert.DoesNotContain("canCreateRevision", content, StringComparison.Ordinal);
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        ExpenseBillRevisionTestTimeProvider TimeProvider);

    private sealed record SeededAccount(
        Guid AuthAccountId,
        Guid UserProfileId,
        string? RawSessionToken);

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
        decimal ResolvedShareAmount,
        string Status = ExpenseBillParticipantStatuses.Accepted,
        DateTimeOffset? AcceptedAtUtc = null);

    private sealed record PayerSeed(
        Guid UserProfileId,
        decimal Amount);

    private sealed record SettlementMutationCounts(
        int SettlementRequestCount,
        int SettlementRequestLineCount,
        int SettlementPaymentCount,
        int SettlementPaymentAllocationCount,
        int SettlementResidualCount,
        int SettlementProofAttachmentCount);

    private sealed class ExpenseBillRevisionTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public ExpenseBillRevisionTestTimeProvider(DateTimeOffset utcNow)
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
