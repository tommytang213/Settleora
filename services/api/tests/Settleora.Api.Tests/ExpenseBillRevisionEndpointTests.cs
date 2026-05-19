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

        testContext.TimeProvider.SetUtcNow(WriteTimestamp.AddMinutes(10));
        using var applyRequest = CreateBearerRequest(HttpMethod.Post, ApplyPath(billId, revisionId), ownerSession.RawSessionToken);
        using var applyResponse = await client.SendAsync(applyRequest);
        var applyContent = await applyResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, applyResponse.StatusCode);
        using (var applyPayload = JsonDocument.Parse(applyContent))
        {
            Assert.Equal(ExpenseBillRevisionStatuses.AcceptedApplied, applyPayload.RootElement.GetProperty("status").GetString());
            Assert.Equal(WriteTimestamp.AddMinutes(10), applyPayload.RootElement.GetProperty("appliedAtUtc").GetDateTimeOffset());
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
                "The bill revision cannot be applied because settlement adjustment or reopen policy is not implemented for existing settlement state.",
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
        var responseSchema = ExtractOpenApiSchemaBlock(openApi, "BillRevisionResponse:");
        var reviewContextSchema = ExtractOpenApiSchemaBlock(openApi, "BillRevisionReviewContextResponse:");
        var baselineTypeSchema = ExtractOpenApiSchemaBlock(openApi, "BillRevisionReviewBaselineType:");
        var financialImpactSchema = ExtractOpenApiSchemaBlock(openApi, "BillRevisionViewerFinancialImpactResponse:");
        var changeSchema = ExtractOpenApiSchemaBlock(openApi, "BillRevisionChangeResponse:");
        var payerConfirmationRequestSchema = ExtractOpenApiSchemaBlock(openApi, "ConfirmBillRevisionPayerRequest:");

        Assert.Contains("reviewContext", responseSchema, StringComparison.Ordinal);
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
        Assert.Contains("reviewContext: BillRevisionReviewContextResponse", webModels, StringComparison.Ordinal);
        Assert.Contains("export interface BillRevisionReviewContextResponse", webModels, StringComparison.Ordinal);
        Assert.Contains("ConfirmBillRevisionPayerRequest", webModels, StringComparison.Ordinal);
        Assert.Contains("confirmBillRevisionPayer", webClient, StringComparison.Ordinal);
        Assert.Contains("final BillRevisionReviewContextResponse reviewContext", dartModels, StringComparison.Ordinal);
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
