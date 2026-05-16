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
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class BillWorkflowEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string BillSubmittedAction = "bill.submitted";
    private const string BillParticipantAcceptedAction = "bill.participant_accepted";
    private const string BillParticipantRejectedAction = "bill.participant_rejected";
    private const string BillConfirmedAction = "bill.confirmed";
    private const string WrongRawToken = "visible-wrong-bill-workflow-session-token";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 7, 13, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 7, 13, 15, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 5, 7, 13, 30, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public BillWorkflowEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task PersonalDraftBillSubmitByCreatorResetsDraftParticipantsToPendingAcceptanceAndWritesSafeAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Personal Submit Creator");
        var participant = await SeedAccountAsync(testFactory, "Personal Submit Participant", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(
                    creatorSession.UserProfileId,
                    ExpenseBillParticipantStatuses.Accepted,
                    AcceptedAtUtc: InitialTimestamp.AddMinutes(2)),
                new ParticipantSeed(
                    participant.UserProfileId,
                    ExpenseBillParticipantStatuses.Rejected,
                    RejectedAtUtc: InitialTimestamp.AddMinutes(3),
                    RejectionReasonCode: ExpenseBillParticipantRejectionReasonCodes.WrongAmount)
            ],
            ExpenseBillStatuses.Draft,
            "Draft Submit Reset Merchant",
            InitialTimestamp);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Post,
            PersonalSubmitPath(billId),
            creatorSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(0, response.Content.Headers.ContentLength ?? 0);

        var bill = await ReadBillAsync(testFactory, billId);
        Assert.Equal(ExpenseBillStatuses.PendingConfirmation, bill.Status);
        Assert.Equal(WriteTimestamp, bill.UpdatedAtUtc);
        Assert.All(
            bill.Participants,
            participantRow =>
            {
                Assert.Equal(ExpenseBillParticipantStatuses.PendingAcceptance, participantRow.Status);
                Assert.Null(participantRow.AcceptedAtUtc);
                Assert.Null(participantRow.RejectedAtUtc);
                Assert.Null(participantRow.RejectionReasonCode);
                Assert.Equal(WriteTimestamp, participantRow.UpdatedAtUtc);
            });

        var auditEvent = Assert.Single(await ReadWorkflowAuditEventsAsync(testFactory));
        Assert.Equal(BillSubmittedAction, auditEvent.Action);
        AssertWorkflowAuditMetadata(
            auditEvent,
            billId,
            groupId: null,
            groupMode: "personal",
            previousBillStatus: ExpenseBillStatuses.Draft,
            newBillStatus: ExpenseBillStatuses.PendingConfirmation,
            previousParticipantStatus: null,
            newParticipantStatus: null,
            participantUserProfileId: null,
            participantCount: 2,
            acceptedCount: 0,
            rejectedCount: 0,
            rejectionReasonCode: null);
        AssertSafeWorkflowAuditContent(
            auditEvent,
            creatorSession.RawSessionToken,
            "Draft Submit Reset Merchant",
            "Seeded Item",
            ExpenseBillParticipantRejectionReasonCodes.WrongAmount);

        var notification = Assert.Single(await ReadNotificationsAsync(testFactory));
        Assert.Equal(participant.UserProfileId, notification.RecipientUserProfileId);
        Assert.Equal(creatorSession.UserProfileId, notification.ActorUserProfileId);
        Assert.Equal(InAppNotificationEventTypes.BillSubmitted, notification.EventType);
        Assert.Equal(InAppNotificationStatuses.Unread, notification.Status);
        Assert.Equal(InAppNotificationPriorities.Attention, notification.Priority);
        Assert.Equal(InAppNotificationSubjectTypes.ExpenseBill, notification.SubjectType);
        Assert.Equal(billId, notification.ExpenseBillId);
        Assert.Equal($"/api/v1/bills/{billId:D}", notification.ActionUrl);
        Assert.Equal(WriteTimestamp, notification.CreatedAtUtc);
    }

    [Fact]
    public async Task PersonalRejectedBillSubmitCannotResetAllParticipantsSilently()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Rejected Submit Creator");
        var participant = await SeedAccountAsync(testFactory, "Rejected Submit Participant", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(
                    creatorSession.UserProfileId,
                    ExpenseBillParticipantStatuses.Accepted,
                    AcceptedAtUtc: InitialTimestamp.AddMinutes(2)),
                new ParticipantSeed(
                    participant.UserProfileId,
                    ExpenseBillParticipantStatuses.Rejected,
                    RejectedAtUtc: InitialTimestamp.AddMinutes(3),
                    RejectionReasonCode: ExpenseBillParticipantRejectionReasonCodes.WrongAmount)
            ],
            ExpenseBillStatuses.Rejected,
            "Rejected Submit Guard Merchant",
            InitialTimestamp);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Post,
            PersonalSubmitPath(billId),
            creatorSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertBillWorkflowConflictProblemAsync(response, creatorSession.RawSessionToken);
        var bill = await ReadBillAsync(testFactory, billId);
        Assert.Equal(ExpenseBillStatuses.Rejected, bill.Status);
        Assert.Contains(
            bill.Participants,
            participantRow => participantRow.UserProfileId == creatorSession.UserProfileId
                && participantRow.Status == ExpenseBillParticipantStatuses.Accepted
                && participantRow.AcceptedAtUtc == InitialTimestamp.AddMinutes(2));
        Assert.Contains(
            bill.Participants,
            participantRow => participantRow.UserProfileId == participant.UserProfileId
                && participantRow.Status == ExpenseBillParticipantStatuses.Rejected
                && participantRow.RejectionReasonCode == ExpenseBillParticipantRejectionReasonCodes.WrongAmount
                && participantRow.RejectedAtUtc == InitialTimestamp.AddMinutes(3));
        Assert.Empty(await ReadWorkflowAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task GroupBillSubmitByCreatorRequiresActiveMembershipAndNonCreatorSubmitFailsClosed()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Submit Creator");
        var memberSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Submit Member");
        var groupId = await SeedGroupAsync(
            testFactory,
            creatorSession.UserProfileId,
            "Group Submit Group",
            InitialTimestamp,
            null,
            new MembershipSeed(creatorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(memberSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            groupId,
            [
                new ParticipantSeed(creatorSession.UserProfileId),
                new ParticipantSeed(memberSession.UserProfileId)
            ],
            ExpenseBillStatuses.Draft,
            "Group Submit Merchant",
            InitialTimestamp);
        var personalBillId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(creatorSession.UserProfileId)],
            ExpenseBillStatuses.Draft,
            "Personal Non Creator Merchant",
            InitialTimestamp);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();

        using var groupSubmitRequest = CreateBearerRequest(
            HttpMethod.Post,
            GroupSubmitPath(groupId, billId),
            creatorSession.RawSessionToken);
        using var groupSubmitResponse = await client.SendAsync(groupSubmitRequest);

        Assert.Equal(HttpStatusCode.NoContent, groupSubmitResponse.StatusCode);
        Assert.Equal(ExpenseBillStatuses.PendingConfirmation, (await ReadBillAsync(testFactory, billId)).Status);

        using var nonCreatorGroupRequest = CreateBearerRequest(
            HttpMethod.Post,
            GroupSubmitPath(groupId, billId),
            memberSession.RawSessionToken);
        using var nonCreatorGroupResponse = await client.SendAsync(nonCreatorGroupRequest);
        await AssertGroupBillUnavailableProblemAsync(nonCreatorGroupResponse);

        using var nonCreatorPersonalRequest = CreateBearerRequest(
            HttpMethod.Post,
            PersonalSubmitPath(personalBillId),
            memberSession.RawSessionToken);
        using var nonCreatorPersonalResponse = await client.SendAsync(nonCreatorPersonalRequest);
        await AssertBillUnavailableProblemAsync(nonCreatorPersonalResponse);

        Assert.Single(await ReadWorkflowAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task AcceptByCurrentParticipantConfirmsBillWhenFinalParticipantAcceptsAndWritesAuditEvents()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Final Accept Participant");
        var creator = await SeedAccountAsync(testFactory, "Final Accept Creator", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creator.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(
                    creator.UserProfileId,
                    ExpenseBillParticipantStatuses.Accepted,
                    AcceptedAtUtc: InitialTimestamp.AddMinutes(2)),
                new ParticipantSeed(participantSession.UserProfileId)
            ],
            ExpenseBillStatuses.PendingConfirmation,
            "Final Accept Merchant",
            InitialTimestamp);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Post,
            PersonalAcceptPath(billId, participantSession.UserProfileId),
            participantSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        var bill = await ReadBillAsync(testFactory, billId);
        Assert.Equal(ExpenseBillStatuses.Confirmed, bill.Status);
        var participant = Assert.Single(
            bill.Participants,
            candidate => candidate.UserProfileId == participantSession.UserProfileId);
        Assert.Equal(ExpenseBillParticipantStatuses.Accepted, participant.Status);
        Assert.Equal(WriteTimestamp, participant.AcceptedAtUtc);
        Assert.Null(participant.RejectedAtUtc);
        Assert.Null(participant.RejectionReasonCode);

        var auditEvents = await ReadWorkflowAuditEventsAsync(testFactory);
        Assert.Equal([BillParticipantAcceptedAction, BillConfirmedAction], auditEvents.Select(auditEvent => auditEvent.Action).ToArray());
        AssertWorkflowAuditMetadata(
            auditEvents[0],
            billId,
            groupId: null,
            groupMode: "personal",
            previousBillStatus: ExpenseBillStatuses.PendingConfirmation,
            newBillStatus: ExpenseBillStatuses.Confirmed,
            previousParticipantStatus: ExpenseBillParticipantStatuses.PendingAcceptance,
            newParticipantStatus: ExpenseBillParticipantStatuses.Accepted,
            participantSession.UserProfileId,
            participantCount: 2,
            acceptedCount: 2,
            rejectedCount: 0,
            rejectionReasonCode: null);
        AssertWorkflowAuditMetadata(
            auditEvents[1],
            billId,
            groupId: null,
            groupMode: "personal",
            previousBillStatus: ExpenseBillStatuses.PendingConfirmation,
            newBillStatus: ExpenseBillStatuses.Confirmed,
            previousParticipantStatus: ExpenseBillParticipantStatuses.PendingAcceptance,
            newParticipantStatus: ExpenseBillParticipantStatuses.Accepted,
            participantSession.UserProfileId,
            participantCount: 2,
            acceptedCount: 2,
            rejectedCount: 0,
            rejectionReasonCode: null);
    }

    [Fact]
    public async Task WrongRouteParticipantCannotAcceptOrRejectAnotherParticipantBillWithoutAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Route Guard Participant");
        var other = await SeedAccountAsync(testFactory, "Route Guard Other", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            participantSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(participantSession.UserProfileId)],
            ExpenseBillStatuses.PendingConfirmation,
            "Route Guard Merchant",
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        using var acceptRequest = CreateBearerRequest(
            HttpMethod.Post,
            PersonalAcceptPath(billId, other.UserProfileId),
            participantSession.RawSessionToken);
        using var acceptResponse = await client.SendAsync(acceptRequest);
        await AssertBillUnavailableProblemAsync(acceptResponse);

        using var rejectRequest = CreateJsonRequest(
            HttpMethod.Post,
            PersonalRejectPath(billId, other.UserProfileId),
            participantSession.RawSessionToken,
            """{"reasonCode":"wrong_amount"}""");
        using var rejectResponse = await client.SendAsync(rejectRequest);
        await AssertBillUnavailableProblemAsync(rejectResponse);

        Assert.Empty(await ReadWorkflowAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task GroupAcceptRequiresActiveGroupAccessAndCorrectRouteGroupId()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Accept Participant");
        var otherMember = await SeedAccountAsync(testFactory, "Group Accept Other", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            participantSession.UserProfileId,
            "Group Accept Group",
            InitialTimestamp,
            null,
            new MembershipSeed(participantSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(otherMember.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var wrongGroupId = await SeedGroupAsync(
            testFactory,
            participantSession.UserProfileId,
            "Wrong Route Group",
            InitialTimestamp,
            null,
            new MembershipSeed(participantSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var removedGroupId = await SeedGroupAsync(
            testFactory,
            participantSession.UserProfileId,
            "Removed Member Group",
            InitialTimestamp,
            null,
            new MembershipSeed(participantSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed));
        var billId = await SeedBillAsync(
            testFactory,
            otherMember.UserProfileId,
            groupId,
            [new ParticipantSeed(participantSession.UserProfileId), new ParticipantSeed(otherMember.UserProfileId)],
            ExpenseBillStatuses.PendingConfirmation,
            "Group Accept Merchant",
            InitialTimestamp);
        var removedGroupBillId = await SeedBillAsync(
            testFactory,
            participantSession.UserProfileId,
            removedGroupId,
            [new ParticipantSeed(participantSession.UserProfileId)],
            ExpenseBillStatuses.PendingConfirmation,
            "Removed Group Merchant",
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        using var acceptRequest = CreateBearerRequest(
            HttpMethod.Post,
            GroupAcceptPath(groupId, billId, participantSession.UserProfileId),
            participantSession.RawSessionToken);
        using var acceptResponse = await client.SendAsync(acceptRequest);
        Assert.Equal(HttpStatusCode.NoContent, acceptResponse.StatusCode);

        using var wrongRouteRequest = CreateBearerRequest(
            HttpMethod.Post,
            GroupAcceptPath(wrongGroupId, billId, participantSession.UserProfileId),
            participantSession.RawSessionToken);
        using var wrongRouteResponse = await client.SendAsync(wrongRouteRequest);
        await AssertGroupBillUnavailableProblemAsync(wrongRouteResponse);

        using var removedMemberRequest = CreateBearerRequest(
            HttpMethod.Post,
            GroupAcceptPath(removedGroupId, removedGroupBillId, participantSession.UserProfileId),
            participantSession.RawSessionToken);
        using var removedMemberResponse = await client.SendAsync(removedMemberRequest);
        await AssertGroupBillUnavailableProblemAsync(removedMemberResponse);

        Assert.Single(await ReadWorkflowAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task RejectRequiresSupportedReasonPersistsReasonAndWritesSafeAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Reject Participant");
        var creator = await SeedAccountAsync(testFactory, "Reject Creator", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creator.UserProfileId,
            groupId: null,
            [new ParticipantSeed(participantSession.UserProfileId), new ParticipantSeed(creator.UserProfileId)],
            ExpenseBillStatuses.PendingConfirmation,
            "Reject Merchant",
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        using var invalidRequest = CreateJsonRequest(
            HttpMethod.Post,
            PersonalRejectPath(billId, participantSession.UserProfileId),
            participantSession.RawSessionToken,
            """{"reasonCode":"raw-note","note":"Visible note"}""");
        using var invalidResponse = await client.SendAsync(invalidRequest);
        var invalidContent = await invalidResponse.Content.ReadAsStringAsync();
        await AssertInvalidBillWorkflowRequestProblemAsync(invalidResponse, invalidContent);
        Assert.Contains("Rejection reason code is not supported.", invalidContent);
        Assert.Contains("Unsupported fields are not allowed.", invalidContent);
        Assert.DoesNotContain("raw-note", invalidContent);
        Assert.DoesNotContain("Visible note", invalidContent);
        Assert.Empty(await ReadWorkflowAuditEventsAsync(testFactory));

        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var validRequest = CreateJsonRequest(
            HttpMethod.Post,
            PersonalRejectPath(billId, participantSession.UserProfileId),
            participantSession.RawSessionToken,
            """{"reasonCode":"wrong_split"}""");
        using var validResponse = await client.SendAsync(validRequest);

        Assert.Equal(HttpStatusCode.NoContent, validResponse.StatusCode);
        var bill = await ReadBillAsync(testFactory, billId);
        Assert.Equal(ExpenseBillStatuses.Rejected, bill.Status);
        var participant = Assert.Single(
            bill.Participants,
            candidate => candidate.UserProfileId == participantSession.UserProfileId);
        Assert.Equal(ExpenseBillParticipantStatuses.Rejected, participant.Status);
        Assert.Equal(WriteTimestamp, participant.RejectedAtUtc);
        Assert.Null(participant.AcceptedAtUtc);
        Assert.Equal(ExpenseBillParticipantRejectionReasonCodes.WrongSplit, participant.RejectionReasonCode);

        var auditEvent = Assert.Single(await ReadWorkflowAuditEventsAsync(testFactory));
        Assert.Equal(BillParticipantRejectedAction, auditEvent.Action);
        AssertWorkflowAuditMetadata(
            auditEvent,
            billId,
            groupId: null,
            groupMode: "personal",
            previousBillStatus: ExpenseBillStatuses.PendingConfirmation,
            newBillStatus: ExpenseBillStatuses.Rejected,
            previousParticipantStatus: ExpenseBillParticipantStatuses.PendingAcceptance,
            newParticipantStatus: ExpenseBillParticipantStatuses.Rejected,
            participantSession.UserProfileId,
            participantCount: 2,
            acceptedCount: 0,
            rejectedCount: 1,
            rejectionReasonCode: ExpenseBillParticipantRejectionReasonCodes.WrongSplit);
        AssertSafeWorkflowAuditContent(
            auditEvent,
            participantSession.RawSessionToken,
            "Reject Merchant",
            "Seeded Item");
    }

    [Fact]
    public async Task InvalidStateTransitionsReturnBoundedConflictWithoutSuccessAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Conflict Actor");
        var confirmedBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, ExpenseBillParticipantStatuses.Accepted, AcceptedAtUtc: InitialTimestamp)],
            ExpenseBillStatuses.Confirmed,
            "Confirmed Merchant",
            InitialTimestamp);
        var draftBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId)],
            ExpenseBillStatuses.Draft,
            "Draft Merchant",
            InitialTimestamp);
        var rejectedBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(
                    actorSession.UserProfileId,
                    ExpenseBillParticipantStatuses.Rejected,
                    RejectedAtUtc: InitialTimestamp)
            ],
            ExpenseBillStatuses.Rejected,
            "Rejected Merchant",
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        using var submitConfirmedRequest = CreateBearerRequest(
            HttpMethod.Post,
            PersonalSubmitPath(confirmedBillId),
            actorSession.RawSessionToken);
        using var submitConfirmedResponse = await client.SendAsync(submitConfirmedRequest);
        await AssertBillWorkflowConflictProblemAsync(submitConfirmedResponse, actorSession.RawSessionToken);

        using var acceptDraftRequest = CreateBearerRequest(
            HttpMethod.Post,
            PersonalAcceptPath(draftBillId, actorSession.UserProfileId),
            actorSession.RawSessionToken);
        using var acceptDraftResponse = await client.SendAsync(acceptDraftRequest);
        await AssertBillWorkflowConflictProblemAsync(acceptDraftResponse, actorSession.RawSessionToken);

        using var rejectRejectedRequest = CreateJsonRequest(
            HttpMethod.Post,
            PersonalRejectPath(rejectedBillId, actorSession.UserProfileId),
            actorSession.RawSessionToken,
            """{"reasonCode":"other"}""");
        using var rejectRejectedResponse = await client.SendAsync(rejectRejectedRequest);
        await AssertBillWorkflowConflictProblemAsync(rejectRejectedResponse, actorSession.RawSessionToken);

        Assert.Empty(await ReadWorkflowAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task MissingUnrelatedArchivedDeletedAndWrongRouteBillsFailClosedWithoutSuccessAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Fail Closed Actor");
        var other = await SeedAccountAsync(testFactory, "Fail Closed Other", InitialTimestamp.AddMinutes(1));
        var deletedCreator = await SeedAccountAsync(
            testFactory,
            "Deleted Bill Creator",
            InitialTimestamp.AddMinutes(2),
            deletedAtUtc: InitialTimestamp.AddMinutes(3));
        var archivedBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId)],
            ExpenseBillStatuses.Draft,
            "Archived Merchant",
            InitialTimestamp,
            archivedAtUtc: InitialTimestamp.AddMinutes(4));
        var unrelatedBillId = await SeedBillAsync(
            testFactory,
            other.UserProfileId,
            groupId: null,
            [new ParticipantSeed(other.UserProfileId)],
            ExpenseBillStatuses.PendingConfirmation,
            "Unrelated Merchant",
            InitialTimestamp);
        var deletedCreatorBillId = await SeedBillAsync(
            testFactory,
            deletedCreator.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId), new ParticipantSeed(deletedCreator.UserProfileId)],
            ExpenseBillStatuses.PendingConfirmation,
            "Deleted Creator Merchant",
            InitialTimestamp);
        var groupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Fail Closed Group",
            InitialTimestamp,
            null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var wrongGroupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Fail Closed Wrong Group",
            InitialTimestamp,
            null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var groupBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId,
            [new ParticipantSeed(actorSession.UserProfileId)],
            ExpenseBillStatuses.PendingConfirmation,
            "Wrong Route Group Merchant",
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        foreach (var path in new[]
        {
            PersonalSubmitPath(Guid.NewGuid()),
            PersonalSubmitPath(archivedBillId),
            PersonalAcceptPath(unrelatedBillId, actorSession.UserProfileId),
            PersonalAcceptPath(deletedCreatorBillId, actorSession.UserProfileId),
            PersonalSubmitPath(groupBillId)
        })
        {
            using var request = CreateBearerRequest(HttpMethod.Post, path, actorSession.RawSessionToken);
            using var response = await client.SendAsync(request);

            await AssertBillUnavailableProblemAsync(response);
        }

        using var wrongGroupRequest = CreateBearerRequest(
            HttpMethod.Post,
            GroupAcceptPath(wrongGroupId, groupBillId, actorSession.UserProfileId),
            actorSession.RawSessionToken);
        using var wrongGroupResponse = await client.SendAsync(wrongGroupRequest);
        await AssertGroupBillUnavailableProblemAsync(wrongGroupResponse);

        Assert.Empty(await ReadWorkflowAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task MissingOrInvalidSessionReturnsUniformUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Unauthenticated Actor");
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId)],
            ExpenseBillStatuses.Draft,
            "Unauthenticated Merchant",
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        using var missingResponse = await client.PostAsync(PersonalSubmitPath(billId), content: null);
        await AssertUnauthenticatedProblemAsync(missingResponse);

        using var invalidRequest = CreateBearerRequest(HttpMethod.Post, PersonalSubmitPath(billId), WrongRawToken);
        using var invalidResponse = await client.SendAsync(invalidRequest);
        await AssertUnauthenticatedProblemAsync(invalidResponse, WrongRawToken);

        Assert.Empty(await ReadWorkflowAuditEventsAsync(testFactory));
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new BillWorkflowTestTimeProvider(InitialTimestamp);
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
        BillWorkflowTestTimeProvider timeProvider,
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
        BillWorkflowTestTimeProvider timeProvider,
        SeededAccount account)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Bill workflow endpoint test",
                UserAgentSummary: "Bill workflow endpoint test user agent",
                NetworkAddressHash: "bill-workflow-endpoint-test-network",
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
        string status,
        string merchantName,
        DateTimeOffset createdAtUtc,
        DateTimeOffset? archivedAtUtc = null)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var billId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var participantShare = decimal.Round(10m / participants.Count, 4);

        var bill = new ExpenseBill
        {
            Id = billId,
            CreatedByUserProfileId = creatorProfileId,
            GroupId = groupId,
            MerchantName = merchantName,
            BillDate = DateOnly.FromDateTime(createdAtUtc.UtcDateTime),
            Status = status,
            TotalAmount = 10m,
            TotalCurrency = "USD",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc,
            ArchivedAtUtc = archivedAtUtc
        };

        var item = new ExpenseBillItem
        {
            Id = itemId,
            ExpenseBillId = billId,
            Name = "Seeded Item",
            Amount = 10m,
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
                ResolvedShareAmount = participantShare,
                ResolvedShareCurrency = "USD",
                AcceptedAtUtc = participant.AcceptedAtUtc,
                RejectedAtUtc = participant.RejectedAtUtc,
                RejectionReasonCode = participant.RejectionReasonCode,
                SettledAtUtc = participant.SettledAtUtc,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
            item.Splits.Add(new ExpenseBillItemSplit
            {
                Id = Guid.NewGuid(),
                ExpenseBillItemId = itemId,
                UserProfileId = participant.UserProfileId,
                SplitMethod = ExpenseBillItemSplitMethods.Equal,
                ResolvedAmount = participantShare,
                ResolvedCurrency = "USD",
                AllocationOrder = index,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        bill.Items.Add(item);
        bill.Payers.Add(new ExpenseBillPayer
        {
            Id = Guid.NewGuid(),
            ExpenseBillId = billId,
            UserProfileId = creatorProfileId,
            Amount = 10m,
            Currency = "USD",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });

        dbContext.Set<ExpenseBill>().Add(bill);
        await dbContext.SaveChangesAsync();
        return billId;
    }

    private static async Task<ExpenseBill> ReadBillAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ExpenseBill>()
            .Include(bill => bill.Participants)
            .Include(bill => bill.Items)
                .ThenInclude(item => item.Splits)
            .SingleAsync(bill => bill.Id == billId);
    }

    private static async Task<IReadOnlyList<AuthAuditEvent>> ReadWorkflowAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        var events = await dbContext.Set<AuthAuditEvent>()
            .AsNoTracking()
            .Where(auditEvent => auditEvent.Action == BillSubmittedAction
                || auditEvent.Action == BillParticipantAcceptedAction
                || auditEvent.Action == BillParticipantRejectedAction
                || auditEvent.Action == BillConfirmedAction)
            .ToArrayAsync();

        return events
            .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
            .ThenBy(auditEvent => GetWorkflowAuditActionOrder(auditEvent.Action))
            .ThenBy(auditEvent => auditEvent.Id)
            .ToArray();
    }

    private static async Task<IReadOnlyList<InAppNotification>> ReadNotificationsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>()
            .Set<InAppNotification>()
            .AsNoTracking()
            .OrderBy(notification => notification.CreatedAtUtc)
            .ThenBy(notification => notification.Id)
            .ToListAsync();
    }

    private static int GetWorkflowAuditActionOrder(string action)
    {
        return action switch
        {
            BillSubmittedAction => 0,
            BillParticipantAcceptedAction => 1,
            BillParticipantRejectedAction => 1,
            BillConfirmedAction => 2,
            _ => 10
        };
    }

    private static void AssertWorkflowAuditMetadata(
        AuthAuditEvent auditEvent,
        Guid expectedBillId,
        Guid? groupId,
        string groupMode,
        string previousBillStatus,
        string newBillStatus,
        string? previousParticipantStatus,
        string? newParticipantStatus,
        Guid? participantUserProfileId,
        int participantCount,
        int acceptedCount,
        int rejectedCount,
        string? rejectionReasonCode)
    {
        Assert.NotNull(auditEvent.SafeMetadataJson);
        Assert.True(auditEvent.SafeMetadataJson!.Length <= 4096);

        using var metadata = JsonDocument.Parse(auditEvent.SafeMetadataJson);
        Assert.Equal("bill_submit_acknowledgement", metadata.RootElement.GetProperty("workflowName").GetString());
        Assert.Equal(expectedBillId.ToString("D"), metadata.RootElement.GetProperty("billId").GetString());
        Assert.Equal(groupMode, metadata.RootElement.GetProperty("groupMode").GetString());
        Assert.Equal(previousBillStatus, metadata.RootElement.GetProperty("previousBillStatus").GetString());
        Assert.Equal(newBillStatus, metadata.RootElement.GetProperty("newBillStatus").GetString());
        Assert.Equal(participantCount, metadata.RootElement.GetProperty("participantCount").GetInt32());
        Assert.Equal(acceptedCount, metadata.RootElement.GetProperty("acceptedCount").GetInt32());
        Assert.Equal(rejectedCount, metadata.RootElement.GetProperty("rejectedCount").GetInt32());
        Assert.Equal("USD", metadata.RootElement.GetProperty("currency").GetString());
        Assert.Equal("10", metadata.RootElement.GetProperty("totalAmount").GetString());

        AssertOptionalString(metadata.RootElement, "groupId", groupId?.ToString("D"));
        AssertOptionalString(metadata.RootElement, "previousParticipantStatus", previousParticipantStatus);
        AssertOptionalString(metadata.RootElement, "newParticipantStatus", newParticipantStatus);
        AssertOptionalString(metadata.RootElement, "participantUserProfileId", participantUserProfileId?.ToString("D"));
        AssertOptionalString(metadata.RootElement, "rejectionReasonCode", rejectionReasonCode);
    }

    private static void AssertOptionalString(
        JsonElement element,
        string propertyName,
        string? expectedValue)
    {
        if (expectedValue is null)
        {
            Assert.False(element.TryGetProperty(propertyName, out _));
            return;
        }

        Assert.Equal(expectedValue, element.GetProperty(propertyName).GetString());
    }

    private static void AssertSafeWorkflowAuditContent(
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

        Assert.DoesNotContain("merchant", lowerAuditText);
        Assert.DoesNotContain("itemname", lowerAuditText);
        Assert.DoesNotContain("note", lowerAuditText);
        Assert.DoesNotContain("payment", lowerAuditText);
        Assert.DoesNotContain("method", lowerAuditText);
        Assert.DoesNotContain("label", lowerAuditText);
        Assert.DoesNotContain("request", lowerAuditText);
        Assert.DoesNotContain("body", lowerAuditText);
        Assert.DoesNotContain("auth", lowerAuditText);
        Assert.DoesNotContain("session", lowerAuditText);
        Assert.DoesNotContain("credential", lowerAuditText);
        Assert.DoesNotContain("token", lowerAuditText);
        Assert.DoesNotContain("hash", lowerAuditText);
        Assert.DoesNotContain("password", lowerAuditText);
        Assert.DoesNotContain("provider", lowerAuditText);
        Assert.DoesNotContain("payload", lowerAuditText);
        Assert.DoesNotContain("storage", lowerAuditText);
        Assert.DoesNotContain("path", lowerAuditText);
        Assert.DoesNotContain("filename", lowerAuditText);
        Assert.DoesNotContain("fileobject", lowerAuditText);
        Assert.DoesNotContain("objectkey", lowerAuditText);
        Assert.DoesNotContain("vault", lowerAuditText);
        Assert.DoesNotContain("ocr", lowerAuditText);
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

    private static string PersonalSubmitPath(Guid billId)
    {
        return $"/api/v1/bills/{billId:D}/submit";
    }

    private static string PersonalAcceptPath(Guid billId, Guid userProfileId)
    {
        return $"/api/v1/bills/{billId:D}/participants/{userProfileId:D}/accept";
    }

    private static string PersonalRejectPath(Guid billId, Guid userProfileId)
    {
        return $"/api/v1/bills/{billId:D}/participants/{userProfileId:D}/reject";
    }

    private static string GroupSubmitPath(Guid groupId, Guid billId)
    {
        return $"/api/v1/groups/{groupId:D}/bills/{billId:D}/submit";
    }

    private static string GroupAcceptPath(Guid groupId, Guid billId, Guid userProfileId)
    {
        return $"/api/v1/groups/{groupId:D}/bills/{billId:D}/participants/{userProfileId:D}/accept";
    }

    private static async Task AssertInvalidBillWorkflowRequestProblemAsync(
        HttpResponseMessage response,
        string? content = null)
    {
        content ??= await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid bill workflow request", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The submitted bill workflow request is invalid.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertBillWorkflowConflictProblemAsync(
        HttpResponseMessage response,
        string unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();
        var lowerContent = content.ToLowerInvariant();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain(unexpectedResponseText, content);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("vault", lowerContent);
        Assert.DoesNotContain("ocr", lowerContent);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Bill workflow conflict", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested bill workflow transition is not allowed.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertBillUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Bill unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested bill is unavailable.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertGroupBillUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Group bill unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested group bill is unavailable.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertUnauthenticatedProblemAsync(
        HttpResponseMessage response,
        string? unexpectedResponseText = null)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain(WrongRawToken, content);
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

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        BillWorkflowTestTimeProvider TimeProvider);

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
        string Status = ExpenseBillParticipantStatuses.PendingAcceptance,
        DateTimeOffset? AcceptedAtUtc = null,
        DateTimeOffset? RejectedAtUtc = null,
        string? RejectionReasonCode = null,
        DateTimeOffset? SettledAtUtc = null);

    private sealed class BillWorkflowTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public BillWorkflowTestTimeProvider(DateTimeOffset utcNow)
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
