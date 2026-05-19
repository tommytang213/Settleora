using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Money;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.BillRevisions;

internal static class ExpenseBillRevisionEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string BillUnavailableTitle = "Bill unavailable";
    private const string BillUnavailableDetail = "The requested bill is unavailable.";
    private const string BillRevisionUnavailableTitle = "Bill revision unavailable";
    private const string BillRevisionUnavailableDetail = "The requested bill revision is unavailable.";
    private const string InvalidBillRevisionRequestTitle = "Invalid bill revision request";
    private const string InvalidBillRevisionRequestDetail = "The submitted bill revision request is invalid.";
    private const string InvalidBillRevisionNoBodyTitle = "Invalid bill revision request";
    private const string InvalidBillRevisionNoBodyDetail = "This bill revision action does not accept a request body.";
    private const string BillRevisionConflictTitle = "Bill revision conflict";
    private const string BillRevisionConflictDetail = "The requested bill revision transition is not allowed.";
    private const string BillRevisionSettlementConflictTitle = "Bill revision settlement conflict";
    private const string BillRevisionSettlementConflictDetail = "The bill revision cannot be applied because settlement adjustment or reopen policy is not implemented for existing settlement state.";
    private const string BillRevisionWriteFailedTitle = "Bill revision write failed";
    private const string BillRevisionWriteFailedDetail = "Unable to complete bill revision write.";
    private const string PersonalGroupMode = "personal";
    private const string GroupMode = "group";
    private const string RevisionCreatedAction = "bill.revision_proposed";
    private const string RevisionResubmittedAction = "bill.revision_resubmitted";
    private const string RevisionSubmittedAction = "bill.revision_submitted";
    private const string RevisionWithdrawnAction = "bill.revision_withdrawn";
    private const string RevisionApprovedAction = "bill.revision_approved";
    private const string RevisionRejectedAction = "bill.revision_rejected";
    private const string RevisionAppliedAction = "bill.revision_applied";

    public static WebApplication MapExpenseBillRevisionEndpoints(this WebApplication app)
    {
        var bills = app.MapGroup("/api/v1/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        bills.MapGet("/{billId:guid}/revisions", ListBillRevisionsAsync);
        bills.MapGet("/{billId:guid}/revisions/{revisionId:guid}", GetBillRevisionAsync);
        bills.MapPost("/{billId:guid}/revisions", CreateBillRevisionAsync);
        bills.MapPatch("/{billId:guid}/revisions/{revisionId:guid}", ReviseBillRevisionAsync);
        bills.MapPost("/{billId:guid}/revisions/{revisionId:guid}/submit", SubmitBillRevisionAsync);
        bills.MapPost("/{billId:guid}/revisions/{revisionId:guid}/withdraw", WithdrawBillRevisionAsync);
        bills.MapPost("/{billId:guid}/revisions/{revisionId:guid}/approve", ApproveBillRevisionAsync);
        bills.MapPost("/{billId:guid}/revisions/{revisionId:guid}/reject", RejectBillRevisionAsync);
        bills.MapPost("/{billId:guid}/revisions/{revisionId:guid}/apply", ApplyBillRevisionAsync);

        return app;
    }

    private static async Task<IResult> ListBillRevisionsAsync(
        Guid billId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var bill = await LoadVisibleBillAsync(dbContext, billId, actor.UserProfileId, cancellationToken);
        if (bill is null)
        {
            return BillUnavailable();
        }

        var revisions = bill.Revisions
            .OrderBy(revision => revision.CreatedAtUtc)
            .ThenBy(revision => revision.Id)
            .Select(revision => MapRevision(bill, revision, actor.UserProfileId))
            .ToArray();

        return Results.Ok(new ExpenseBillRevisionListResponse(revisions));
    }

    private static async Task<IResult> GetBillRevisionAsync(
        Guid billId,
        Guid revisionId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var bill = await LoadVisibleBillAsync(dbContext, billId, actor.UserProfileId, cancellationToken);
        var revision = bill?.Revisions.SingleOrDefault(candidate => candidate.Id == revisionId);
        if (bill is null || revision is null)
        {
            return BillRevisionUnavailable();
        }

        return Results.Ok(MapRevision(bill, revision, actor.UserProfileId));
    }

    private static async Task<IResult> CreateBillRevisionAsync(
        Guid billId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        ExpenseBillRevisionProposalService revisionProposalService,
        IExpenseBillRevisionAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var bill = await LoadVisibleBillAsync(dbContext, billId, actor.UserProfileId, cancellationToken);
        if (bill is null)
        {
            return BillUnavailable();
        }

        var readResult = await ReadRevisionSnapshotRequestAsync(request, bill, cancellationToken);
        if (!readResult.Succeeded || readResult.Snapshot is null)
        {
            return InvalidBillRevisionRequest(readResult.Errors);
        }

        if (!CanCreateRevisionForBillState(bill))
        {
            return BillRevisionConflict();
        }

        var now = timeProvider.GetUtcNow();
        var result = revisionProposalService.CreateDraftProposal(
            bill,
            actor.UserProfileId,
            BillRevisionProposalSnapshot.FromBill(bill),
            readResult.Snapshot,
            now);
        if (!result.Succeeded || result.Revision is null)
        {
            return MapOperationFailure(result);
        }

        dbContext.Set<ExpenseBillRevision>().Add(result.Revision);
        await auditWriter.WriteAsync(
            CreateAuditEvent(
                RevisionCreatedAction,
                actor,
                bill,
                result.Revision,
                previousRevisionStatus: null,
                participantUserProfileId: null,
                now),
            cancellationToken);

        return await SaveAndRespondAsync(
            dbContext,
            Results.Created(
                $"/api/v1/bills/{bill.Id:D}/revisions/{result.Revision.Id:D}",
                MapRevision(bill, result.Revision, actor.UserProfileId)),
            cancellationToken);
    }

    private static async Task<IResult> ReviseBillRevisionAsync(
        Guid billId,
        Guid revisionId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        ExpenseBillRevisionProposalService revisionProposalService,
        IExpenseBillRevisionAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var bill = await LoadVisibleBillAsync(dbContext, billId, actor.UserProfileId, cancellationToken);
        var previousRevision = bill?.Revisions.SingleOrDefault(candidate => candidate.Id == revisionId);
        if (bill is null || previousRevision is null)
        {
            return BillRevisionUnavailable();
        }

        var readResult = await ReadRevisionSnapshotRequestAsync(request, bill, cancellationToken);
        if (!readResult.Succeeded || readResult.Snapshot is null)
        {
            return InvalidBillRevisionRequest(readResult.Errors);
        }

        if (!CanCreateRevisionForBillState(bill))
        {
            return BillRevisionConflict();
        }

        var now = timeProvider.GetUtcNow();
        var previousStatus = previousRevision.Status;
        var result = revisionProposalService.ReviseAndResubmit(
            bill,
            previousRevision,
            actor.UserProfileId,
            BillRevisionProposalSnapshot.FromBill(bill),
            readResult.Snapshot,
            now);
        if (!result.Succeeded || result.Revision is null)
        {
            return MapOperationFailure(result);
        }

        dbContext.Set<ExpenseBillRevision>().Add(result.Revision);
        await auditWriter.WriteAsync(
            CreateAuditEvent(
                RevisionResubmittedAction,
                actor,
                bill,
                result.Revision,
                previousStatus,
                participantUserProfileId: null,
                now),
            cancellationToken);

        return await SaveAndRespondAsync(
            dbContext,
            Results.Ok(MapRevision(bill, result.Revision, actor.UserProfileId)),
            cancellationToken);
    }

    private static async Task<IResult> SubmitBillRevisionAsync(
        Guid billId,
        Guid revisionId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        ExpenseBillRevisionProposalService revisionProposalService,
        IExpenseBillRevisionAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        if (RequestHasBody(request))
        {
            return InvalidBillRevisionNoBody();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var bill = await LoadVisibleBillAsync(dbContext, billId, actor.UserProfileId, cancellationToken);
        var revision = bill?.Revisions.SingleOrDefault(candidate => candidate.Id == revisionId);
        if (bill is null || revision is null)
        {
            return BillRevisionUnavailable();
        }

        var now = timeProvider.GetUtcNow();
        var previousStatus = revision.Status;
        var result = revisionProposalService.SubmitProposal(
            revision,
            actor.UserProfileId,
            now);
        if (!result.Succeeded || result.Revision is null)
        {
            return MapOperationFailure(result);
        }

        await auditWriter.WriteAsync(
            CreateAuditEvent(
                RevisionSubmittedAction,
                actor,
                bill,
                revision,
                previousStatus,
                participantUserProfileId: null,
                now),
            cancellationToken);

        return await SaveAndRespondAsync(
            dbContext,
            Results.Ok(MapRevision(bill, revision, actor.UserProfileId)),
            cancellationToken);
    }

    private static async Task<IResult> WithdrawBillRevisionAsync(
        Guid billId,
        Guid revisionId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        ExpenseBillRevisionProposalService revisionProposalService,
        IExpenseBillRevisionAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        if (RequestHasBody(request))
        {
            return InvalidBillRevisionNoBody();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var bill = await LoadVisibleBillAsync(dbContext, billId, actor.UserProfileId, cancellationToken);
        var revision = bill?.Revisions.SingleOrDefault(candidate => candidate.Id == revisionId);
        if (bill is null || revision is null)
        {
            return BillRevisionUnavailable();
        }

        var now = timeProvider.GetUtcNow();
        var previousStatus = revision.Status;
        var result = revisionProposalService.WithdrawProposal(
            revision,
            actor.UserProfileId,
            now);
        if (!result.Succeeded || result.Revision is null)
        {
            return MapOperationFailure(result);
        }

        await auditWriter.WriteAsync(
            CreateAuditEvent(
                RevisionWithdrawnAction,
                actor,
                bill,
                revision,
                previousStatus,
                participantUserProfileId: null,
                now),
            cancellationToken);

        return await SaveAndRespondAsync(
            dbContext,
            Results.Ok(MapRevision(bill, revision, actor.UserProfileId)),
            cancellationToken);
    }

    private static async Task<IResult> ApproveBillRevisionAsync(
        Guid billId,
        Guid revisionId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        ExpenseBillRevisionProposalService revisionProposalService,
        IExpenseBillRevisionAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var bill = await LoadVisibleBillAsync(dbContext, billId, actor.UserProfileId, cancellationToken);
        var revision = bill?.Revisions.SingleOrDefault(candidate => candidate.Id == revisionId);
        if (bill is null || revision is null)
        {
            return BillRevisionUnavailable();
        }

        var readResult = await ReadRevisionApprovalRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.Request is null)
        {
            return InvalidBillRevisionRequest(readResult.Errors);
        }

        var now = timeProvider.GetUtcNow();
        var previousStatus = revision.Status;
        var result = revisionProposalService.RecordApproval(
            revision,
            actor.UserProfileId,
            readResult.Request.AcceptedAmount,
            readResult.Request.Currency,
            readResult.Request.CalculationHash,
            now);
        if (!result.Succeeded || result.Revision is null)
        {
            return MapOperationFailure(result);
        }

        await auditWriter.WriteAsync(
            CreateAuditEvent(
                RevisionApprovedAction,
                actor,
                bill,
                revision,
                previousStatus,
                actor.UserProfileId,
                now),
            cancellationToken);

        return await SaveAndRespondAsync(
            dbContext,
            Results.Ok(MapRevision(bill, revision, actor.UserProfileId)),
            cancellationToken);
    }

    private static async Task<IResult> RejectBillRevisionAsync(
        Guid billId,
        Guid revisionId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        ExpenseBillRevisionProposalService revisionProposalService,
        IExpenseBillRevisionAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        if (RequestHasBody(request))
        {
            return InvalidBillRevisionNoBody();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var bill = await LoadVisibleBillAsync(dbContext, billId, actor.UserProfileId, cancellationToken);
        var revision = bill?.Revisions.SingleOrDefault(candidate => candidate.Id == revisionId);
        if (bill is null || revision is null)
        {
            return BillRevisionUnavailable();
        }

        var now = timeProvider.GetUtcNow();
        var previousStatus = revision.Status;
        var result = revisionProposalService.RejectProposal(
            revision,
            actor.UserProfileId,
            now);
        if (!result.Succeeded || result.Revision is null)
        {
            return MapOperationFailure(result);
        }

        await auditWriter.WriteAsync(
            CreateAuditEvent(
                RevisionRejectedAction,
                actor,
                bill,
                revision,
                previousStatus,
                actor.UserProfileId,
                now),
            cancellationToken);

        return await SaveAndRespondAsync(
            dbContext,
            Results.Ok(MapRevision(bill, revision, actor.UserProfileId)),
            cancellationToken);
    }

    private static async Task<IResult> ApplyBillRevisionAsync(
        Guid billId,
        Guid revisionId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        ExpenseBillRevisionProposalService revisionProposalService,
        IExpenseBillRevisionAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        if (RequestHasBody(request))
        {
            return InvalidBillRevisionNoBody();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var bill = await LoadVisibleBillAsync(dbContext, billId, actor.UserProfileId, cancellationToken);
        var revision = bill?.Revisions.SingleOrDefault(candidate => candidate.Id == revisionId);
        if (bill is null || revision is null)
        {
            return BillRevisionUnavailable();
        }

        if (await HasSettlementStateAsync(dbContext, bill, revision, cancellationToken))
        {
            return BillRevisionSettlementConflict();
        }

        var now = timeProvider.GetUtcNow();
        var previousStatus = revision.Status;
        var result = revisionProposalService.ApplyProposal(
            bill,
            revision,
            actor.UserProfileId,
            now);
        if (!result.Succeeded || result.Revision is null)
        {
            return MapOperationFailure(result);
        }

        SynchronizeAppliedPayers(dbContext, bill, revision, now);

        await auditWriter.WriteAsync(
            CreateAuditEvent(
                RevisionAppliedAction,
                actor,
                bill,
                revision,
                previousStatus,
                participantUserProfileId: null,
                now),
            cancellationToken);

        return await SaveAndRespondAsync(
            dbContext,
            Results.Ok(MapRevision(bill, revision, actor.UserProfileId)),
            cancellationToken);
    }

    private static async Task<ExpenseBill?> LoadVisibleBillAsync(
        SettleoraDbContext dbContext,
        Guid billId,
        Guid actorUserProfileId,
        CancellationToken cancellationToken)
    {
        return await dbContext.Set<ExpenseBill>()
            .Include(bill => bill.CreatedByUserProfile)
            .Include(bill => bill.BillOwnerUserProfile)
            .Include(bill => bill.Participants)
                .ThenInclude(participant => participant.UserProfile)
            .Include(bill => bill.Payers)
                .ThenInclude(payer => payer.UserProfile)
            .Include(bill => bill.Revisions)
                .ThenInclude(revision => revision.Participants)
            .Include(bill => bill.Revisions)
                .ThenInclude(revision => revision.Payers)
            .Include(bill => bill.Revisions)
                .ThenInclude(revision => revision.Approvals)
            .SingleOrDefaultAsync(
                bill => bill.Id == billId
                    && bill.ArchivedAtUtc == null
                    && bill.Status != ExpenseBillStatuses.Archived
                    && bill.CreatedByUserProfile.DeletedAtUtc == null
                    && (bill.BillOwnerUserProfileId == Guid.Empty || bill.BillOwnerUserProfile.DeletedAtUtc == null)
                    && bill.Participants.All(participant => participant.UserProfile.DeletedAtUtc == null)
                    && bill.Payers.All(payer => payer.UserProfile.DeletedAtUtc == null)
                    && (bill.CreatedByUserProfileId == actorUserProfileId
                        || bill.BillOwnerUserProfileId == actorUserProfileId
                        || bill.Participants.Any(participant => participant.UserProfileId == actorUserProfileId)
                        || bill.Payers.Any(payer => payer.UserProfileId == actorUserProfileId))
                    && (bill.GroupId == null
                        || bill.Group != null
                        && bill.Group.DeletedAtUtc == null
                        && dbContext.Set<GroupMembership>().Any(membership =>
                            membership.GroupId == bill.GroupId.Value
                            && membership.UserProfileId == actorUserProfileId
                            && membership.Status == GroupMembershipStatuses.Active)
                        && bill.CreatedByUserProfile.GroupMemberships.Any(membership =>
                            membership.GroupId == bill.GroupId.Value
                            && membership.Status == GroupMembershipStatuses.Active)
                        && (bill.BillOwnerUserProfileId == Guid.Empty
                            || bill.BillOwnerUserProfile.GroupMemberships.Any(membership =>
                                membership.GroupId == bill.GroupId.Value
                                && membership.Status == GroupMembershipStatuses.Active))
                        && bill.Participants.All(participant =>
                            participant.UserProfile.GroupMemberships.Any(membership =>
                                membership.GroupId == bill.GroupId.Value
                                && membership.Status == GroupMembershipStatuses.Active))
                        && bill.Payers.All(payer =>
                            payer.UserProfile.GroupMemberships.Any(membership =>
                                membership.GroupId == bill.GroupId.Value
                                && membership.Status == GroupMembershipStatuses.Active))),
                cancellationToken);
    }

    private static async Task<bool> HasSettlementStateAsync(
        SettleoraDbContext dbContext,
        ExpenseBill bill,
        ExpenseBillRevision revision,
        CancellationToken cancellationToken)
    {
        if (bill.Participants.Any(participant => participant.SettledAtUtc is not null))
        {
            return true;
        }

        var billId = bill.Id;
        var revisionId = revision.Id;
        if (await dbContext.Set<SettlementRequest>()
            .AsNoTracking()
            .AnyAsync(
                settlementRequest => settlementRequest.SourceExpenseBillId == billId,
                cancellationToken))
        {
            return true;
        }

        if (await dbContext.Set<SettlementRequestLine>()
            .AsNoTracking()
            .AnyAsync(
                line => line.SourceExpenseBillId == billId
                    || line.SourceBillRevisionId == revisionId,
                cancellationToken))
        {
            return true;
        }

        if (await dbContext.Set<SettlementPayment>()
            .AsNoTracking()
            .AnyAsync(
                payment => payment.SettlementRequest.SourceExpenseBillId == billId
                    || payment.SettlementRequest.Lines.Any(line =>
                        line.SourceExpenseBillId == billId
                        || line.SourceBillRevisionId == revisionId),
                cancellationToken))
        {
            return true;
        }

        if (await dbContext.Set<SettlementPaymentAllocation>()
            .AsNoTracking()
            .AnyAsync(
                allocation => allocation.SettlementRequestLine.SourceExpenseBillId == billId
                    || allocation.SettlementRequestLine.SourceBillRevisionId == revisionId
                    || allocation.SettlementPayment.SettlementRequest.SourceExpenseBillId == billId,
                cancellationToken))
        {
            return true;
        }

        if (await dbContext.Set<SettlementResidual>()
            .AsNoTracking()
            .AnyAsync(
                residual => residual.SettlementRequest != null
                    && residual.SettlementRequest.SourceExpenseBillId == billId
                    || residual.SettlementPayment != null
                    && residual.SettlementPayment.SettlementRequest.SourceExpenseBillId == billId,
                cancellationToken))
        {
            return true;
        }

        return await dbContext.Set<SettlementProofAttachment>()
            .AsNoTracking()
            .AnyAsync(
                attachment => attachment.SettlementPayment.SettlementRequest.SourceExpenseBillId == billId
                    || attachment.SettlementPayment.SettlementRequest.Lines.Any(line =>
                        line.SourceExpenseBillId == billId
                        || line.SourceBillRevisionId == revisionId),
                cancellationToken);
    }

    private static void SynchronizeAppliedPayers(
        SettleoraDbContext dbContext,
        ExpenseBill bill,
        ExpenseBillRevision revision,
        DateTimeOffset now)
    {
        var revisionPayers = revision.Payers
            .OrderBy(payer => payer.UserProfileId)
            .ToArray();
        var revisionPayerIds = revisionPayers
            .Select(payer => payer.UserProfileId)
            .ToHashSet();
        var activePayersByProfile = bill.Payers
            .GroupBy(payer => payer.UserProfileId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .OrderBy(payer => payer.CreatedAtUtc)
                    .ThenBy(payer => payer.Id)
                    .ToList());

        foreach (var activePayer in activePayersByProfile
            .Where(pair => !revisionPayerIds.Contains(pair.Key))
            .SelectMany(pair => pair.Value))
        {
            dbContext.Set<ExpenseBillPayer>().Remove(activePayer);
        }

        foreach (var revisionPayer in revisionPayers)
        {
            ExpenseBillPayer activePayer;
            if (activePayersByProfile.TryGetValue(revisionPayer.UserProfileId, out var existingPayers)
                && existingPayers.Count > 0)
            {
                activePayer = existingPayers[0];
                foreach (var duplicatePayer in existingPayers.Skip(1))
                {
                    dbContext.Set<ExpenseBillPayer>().Remove(duplicatePayer);
                }
            }
            else
            {
                activePayer = new ExpenseBillPayer
                {
                    Id = Guid.NewGuid(),
                    ExpenseBillId = bill.Id,
                    UserProfileId = revisionPayer.UserProfileId,
                    CreatedAtUtc = now
                };
                dbContext.Set<ExpenseBillPayer>().Add(activePayer);
            }

            activePayer.PayerFactsCreatedByUserProfileId = revision.ProposalCreatorUserProfileId;
            activePayer.Amount = revisionPayer.Amount;
            activePayer.Currency = revisionPayer.Currency;
            activePayer.PayerConfirmationStatus = revisionPayer.PayerConfirmationStatus;
            activePayer.PayerConfirmedAtUtc = revisionPayer.PayerConfirmationStatus == ExpenseBillPayerConfirmationStatuses.Confirmed
                ? now
                : null;
            activePayer.PayerRejectedAtUtc = revisionPayer.PayerConfirmationStatus == ExpenseBillPayerConfirmationStatuses.Rejected
                ? now
                : null;
            activePayer.UpdatedAtUtc = now;
        }
    }

    private static async Task<RevisionSnapshotReadResult> ReadRevisionSnapshotRequestAsync(
        HttpRequest request,
        ExpenseBill bill,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        if (!request.HasJsonContentType())
        {
            AddError(errors, "body", "A JSON object body is required.");
            return RevisionSnapshotReadResult.Invalid(ToErrorDictionary(errors));
        }

        JsonDocument document;
        try
        {
            document = await JsonDocument.ParseAsync(
                request.Body,
                cancellationToken: cancellationToken);
        }
        catch (JsonException)
        {
            AddError(errors, "body", "A JSON object body is required.");
            return RevisionSnapshotReadResult.Invalid(ToErrorDictionary(errors));
        }
        catch (BadHttpRequestException)
        {
            AddError(errors, "body", "A JSON object body is required.");
            return RevisionSnapshotReadResult.Invalid(ToErrorDictionary(errors));
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                AddError(errors, "body", "A JSON object body is required.");
                return RevisionSnapshotReadResult.Invalid(ToErrorDictionary(errors));
            }

            decimal? totalAmount = null;
            string? totalCurrency = document.RootElement.TryGetProperty("totalCurrency", out var totalCurrencyElement)
                ? ReadCurrency(totalCurrencyElement, "totalCurrency", errors)
                : null;
            List<RevisionParticipantRequest>? participants = null;
            List<RevisionPayerRequest>? payers = null;

            foreach (var property in document.RootElement.EnumerateObject())
            {
                switch (property.Name)
                {
                    case "totalAmount":
                        totalAmount = ReadMoneyAmount(
                            property.Value,
                            totalCurrency,
                            "totalAmount",
                            "totalCurrency",
                            errors,
                            allowZero: false);
                        break;
                    case "totalCurrency":
                        break;
                    case "participants":
                        participants = ReadParticipantRequests(property.Value, totalCurrency, errors);
                        break;
                    case "payers":
                        payers = ReadPayerRequests(property.Value, totalCurrency, errors);
                        break;
                    default:
                        AddUnsupportedFieldError(errors);
                        break;
                }
            }

            if (totalCurrency is null)
            {
                AddError(errors, "totalCurrency", "Total currency is required.");
            }
            else if (!string.Equals(totalCurrency, bill.TotalCurrency, StringComparison.Ordinal))
            {
                AddError(errors, "totalCurrency", "Bill revision currency must match the current bill currency.");
            }

            if (totalAmount is null)
            {
                AddError(errors, "totalAmount", "Total amount is required.");
            }

            if (participants is null || participants.Count == 0)
            {
                AddError(errors, "participants", "At least one revision participant is required.");
            }

            if (payers is null || payers.Count == 0)
            {
                AddError(errors, "payers", "At least one revision payer is required.");
            }

            if (participants is not null)
            {
                ValidateParticipantSet(bill, participants, errors);
            }

            if (payers is not null)
            {
                ValidatePayerSet(bill, payers, errors);
            }

            if (totalAmount is not null && participants is not null)
            {
                var participantTotal = participants.Sum(participant => participant.ResolvedShareAmount);
                if (participantTotal != totalAmount.Value)
                {
                    AddError(errors, "participants", "Participant shares must sum to the submitted total amount.");
                }
            }

            if (totalAmount is not null && payers is not null)
            {
                var payerTotal = payers.Sum(payer => payer.Amount);
                if (payerTotal != totalAmount.Value)
                {
                    AddError(errors, "payers", "Payer contributions must sum to the submitted total amount.");
                }
            }

            if (errors.Count > 0
                || totalAmount is null
                || totalCurrency is null
                || participants is null
                || payers is null)
            {
                return RevisionSnapshotReadResult.Invalid(ToErrorDictionary(errors));
            }

            return RevisionSnapshotReadResult.Valid(new BillRevisionProposalSnapshot(
                totalAmount.Value,
                totalCurrency,
                participants
                    .Select(participant => new BillRevisionParticipantBasis(
                        participant.UserProfileId,
                        participant.ResolvedShareAmount,
                        participant.ResolvedShareCurrency))
                    .ToArray(),
                payers
                    .Select(payer => new BillRevisionPayerBasis(
                        payer.UserProfileId,
                        payer.Amount,
                        payer.Currency))
                    .ToArray()));
        }
    }

    private static async Task<RevisionApprovalReadResult> ReadRevisionApprovalRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        if (!request.HasJsonContentType())
        {
            AddError(errors, "body", "A JSON object body is required.");
            return RevisionApprovalReadResult.Invalid(ToErrorDictionary(errors));
        }

        JsonDocument document;
        try
        {
            document = await JsonDocument.ParseAsync(
                request.Body,
                cancellationToken: cancellationToken);
        }
        catch (JsonException)
        {
            AddError(errors, "body", "A JSON object body is required.");
            return RevisionApprovalReadResult.Invalid(ToErrorDictionary(errors));
        }
        catch (BadHttpRequestException)
        {
            AddError(errors, "body", "A JSON object body is required.");
            return RevisionApprovalReadResult.Invalid(ToErrorDictionary(errors));
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                AddError(errors, "body", "A JSON object body is required.");
                return RevisionApprovalReadResult.Invalid(ToErrorDictionary(errors));
            }

            decimal? acceptedAmount = null;
            string? currency = document.RootElement.TryGetProperty("currency", out var currencyElement)
                ? ReadCurrency(currencyElement, "currency", errors)
                : null;
            string? calculationHash = null;

            foreach (var property in document.RootElement.EnumerateObject())
            {
                switch (property.Name)
                {
                    case "acceptedAmount":
                        acceptedAmount = ReadMoneyAmount(
                            property.Value,
                            currency,
                            "acceptedAmount",
                            "currency",
                            errors,
                            allowZero: true);
                        break;
                    case "currency":
                        break;
                    case "calculationHash":
                        calculationHash = ReadCalculationHash(property.Value, errors);
                        break;
                    default:
                        AddUnsupportedFieldError(errors);
                        break;
                }
            }

            if (acceptedAmount is null)
            {
                AddError(errors, "acceptedAmount", "Accepted amount is required.");
            }

            if (currency is null)
            {
                AddError(errors, "currency", "Currency is required.");
            }

            if (calculationHash is null)
            {
                AddError(errors, "calculationHash", "Calculation hash is required.");
            }

            return errors.Count == 0
                ? RevisionApprovalReadResult.Valid(new RevisionApprovalRequest(
                    acceptedAmount!.Value,
                    currency!,
                    calculationHash!))
                : RevisionApprovalReadResult.Invalid(ToErrorDictionary(errors));
        }
    }

    private static List<RevisionParticipantRequest> ReadParticipantRequests(
        JsonElement value,
        string? totalCurrency,
        Dictionary<string, List<string>> errors)
    {
        var participants = new List<RevisionParticipantRequest>();
        if (value.ValueKind is not JsonValueKind.Array)
        {
            AddError(errors, "participants", "Participants must be an array.");
            return participants;
        }

        var seenUserProfileIds = new HashSet<Guid>();
        var index = 0;
        foreach (var participantElement in value.EnumerateArray())
        {
            var participant = ReadParticipantRequest(participantElement, totalCurrency, index, errors);
            if (participant is not null)
            {
                if (!seenUserProfileIds.Add(participant.UserProfileId))
                {
                    AddError(errors, $"participants[{index}].userProfileId", "Duplicate participant profile IDs are not supported.");
                }

                participants.Add(participant);
            }

            index++;
        }

        return participants;
    }

    private static RevisionParticipantRequest? ReadParticipantRequest(
        JsonElement value,
        string? totalCurrency,
        int index,
        Dictionary<string, List<string>> errors)
    {
        var fieldPrefix = $"participants[{index}]";
        if (value.ValueKind is not JsonValueKind.Object)
        {
            AddError(errors, "participants", "Each participant must be an object.");
            return null;
        }

        Guid? userProfileId = null;
        decimal? resolvedShareAmount = null;
        string? resolvedShareCurrency = null;

        foreach (var property in value.EnumerateObject())
        {
            switch (property.Name)
            {
                case "userProfileId":
                    userProfileId = ReadGuid(property.Value, $"{fieldPrefix}.userProfileId", errors);
                    break;
                case "resolvedShareAmount":
                    resolvedShareAmount = ReadMoneyAmount(
                        property.Value,
                        resolvedShareCurrency ?? totalCurrency,
                        $"{fieldPrefix}.resolvedShareAmount",
                        $"{fieldPrefix}.resolvedShareCurrency",
                        errors,
                        allowZero: true);
                    break;
                case "resolvedShareCurrency":
                    resolvedShareCurrency = ReadCurrency(property.Value, $"{fieldPrefix}.resolvedShareCurrency", errors);
                    break;
                default:
                    AddUnsupportedFieldError(errors);
                    break;
            }
        }

        if (userProfileId is null)
        {
            AddError(errors, $"{fieldPrefix}.userProfileId", "Participant profile ID is required.");
        }

        if (resolvedShareAmount is null)
        {
            AddError(errors, $"{fieldPrefix}.resolvedShareAmount", "Participant resolved share amount is required.");
        }

        resolvedShareCurrency ??= totalCurrency;
        if (resolvedShareCurrency is null)
        {
            AddError(errors, $"{fieldPrefix}.resolvedShareCurrency", "Participant resolved share currency is required.");
        }

        return userProfileId is not null && resolvedShareAmount is not null && resolvedShareCurrency is not null
            ? new RevisionParticipantRequest(userProfileId.Value, resolvedShareAmount.Value, resolvedShareCurrency)
            : null;
    }

    private static List<RevisionPayerRequest> ReadPayerRequests(
        JsonElement value,
        string? totalCurrency,
        Dictionary<string, List<string>> errors)
    {
        var payers = new List<RevisionPayerRequest>();
        if (value.ValueKind is not JsonValueKind.Array)
        {
            AddError(errors, "payers", "Payers must be an array.");
            return payers;
        }

        var seenUserProfileIds = new HashSet<Guid>();
        var index = 0;
        foreach (var payerElement in value.EnumerateArray())
        {
            var payer = ReadPayerRequest(payerElement, totalCurrency, index, errors);
            if (payer is not null)
            {
                if (!seenUserProfileIds.Add(payer.UserProfileId))
                {
                    AddError(errors, $"payers[{index}].userProfileId", "Duplicate payer profile IDs are not supported.");
                }

                payers.Add(payer);
            }

            index++;
        }

        return payers;
    }

    private static RevisionPayerRequest? ReadPayerRequest(
        JsonElement value,
        string? totalCurrency,
        int index,
        Dictionary<string, List<string>> errors)
    {
        var fieldPrefix = $"payers[{index}]";
        if (value.ValueKind is not JsonValueKind.Object)
        {
            AddError(errors, "payers", "Each payer must be an object.");
            return null;
        }

        Guid? userProfileId = null;
        decimal? amount = null;
        string? currency = null;

        foreach (var property in value.EnumerateObject())
        {
            switch (property.Name)
            {
                case "userProfileId":
                    userProfileId = ReadGuid(property.Value, $"{fieldPrefix}.userProfileId", errors);
                    break;
                case "amount":
                    amount = ReadMoneyAmount(
                        property.Value,
                        currency ?? totalCurrency,
                        $"{fieldPrefix}.amount",
                        $"{fieldPrefix}.currency",
                        errors,
                        allowZero: false);
                    break;
                case "currency":
                    currency = ReadCurrency(property.Value, $"{fieldPrefix}.currency", errors);
                    break;
                default:
                    AddUnsupportedFieldError(errors);
                    break;
            }
        }

        if (userProfileId is null)
        {
            AddError(errors, $"{fieldPrefix}.userProfileId", "Payer profile ID is required.");
        }

        if (amount is null)
        {
            AddError(errors, $"{fieldPrefix}.amount", "Payer amount is required.");
        }

        currency ??= totalCurrency;
        if (currency is null)
        {
            AddError(errors, $"{fieldPrefix}.currency", "Payer currency is required.");
        }

        return userProfileId is not null && amount is not null && currency is not null
            ? new RevisionPayerRequest(userProfileId.Value, amount.Value, currency)
            : null;
    }

    private static void ValidateParticipantSet(
        ExpenseBill bill,
        IReadOnlyCollection<RevisionParticipantRequest> participants,
        Dictionary<string, List<string>> errors)
    {
        var currentParticipantIds = bill.Participants
            .Select(participant => participant.UserProfileId)
            .OrderBy(id => id)
            .ToArray();
        var submittedParticipantIds = participants
            .Select(participant => participant.UserProfileId)
            .OrderBy(id => id)
            .ToArray();

        if (!currentParticipantIds.SequenceEqual(submittedParticipantIds))
        {
            AddError(errors, "participants", "Participant set changes are not supported by this endpoint.");
        }

        foreach (var participant in participants)
        {
            if (!string.Equals(participant.ResolvedShareCurrency, bill.TotalCurrency, StringComparison.Ordinal))
            {
                AddError(errors, "participants", "Participant currencies must match the current bill currency.");
                break;
            }
        }
    }

    private static void ValidatePayerSet(
        ExpenseBill bill,
        IReadOnlyCollection<RevisionPayerRequest> payers,
        Dictionary<string, List<string>> errors)
    {
        var allowedPayerIds = bill.Participants
            .Select(participant => participant.UserProfileId)
            .Concat(bill.Payers.Select(payer => payer.UserProfileId))
            .Append(bill.CreatedByUserProfileId)
            .Append(bill.BillOwnerUserProfileId)
            .Where(id => id != Guid.Empty)
            .ToHashSet();

        foreach (var payer in payers)
        {
            if (!allowedPayerIds.Contains(payer.UserProfileId))
            {
                AddError(errors, "payers", "Payer profile IDs must already be related to the bill.");
                break;
            }

            if (!string.Equals(payer.Currency, bill.TotalCurrency, StringComparison.Ordinal))
            {
                AddError(errors, "payers", "Payer currencies must match the current bill currency.");
                break;
            }
        }
    }

    private static Guid? ReadGuid(
        JsonElement value,
        string errorKey,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String
            || !Guid.TryParseExact(value.GetString(), "D", out var id)
            || id == Guid.Empty)
        {
            AddError(errors, errorKey, "ID must be a non-empty UUID string.");
            return null;
        }

        return id;
    }

    private static string? ReadCurrency(
        JsonElement value,
        string errorKey,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, errorKey, "Currency must be an uppercase three-letter code.");
            return null;
        }

        var currency = value.GetString();
        if (!CurrencyCode.TryCreate(currency, out var currencyCode))
        {
            AddError(errors, errorKey, "Currency must be an uppercase three-letter code.");
            return null;
        }

        var supportedResult = SupportedCurrencyPolicy.Default.ValidateSupported(currencyCode, errorKey);
        if (!supportedResult.Succeeded)
        {
            AddError(errors, errorKey, supportedResult.Message);
            return null;
        }

        return currency;
    }

    private static decimal? ReadMoneyAmount(
        JsonElement value,
        string? currency,
        string amountField,
        string currencyField,
        Dictionary<string, List<string>> errors,
        bool allowZero)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, amountField, "Amount must be a plain base-10 decimal string.");
            return null;
        }

        if (!CurrencyCode.TryCreate(currency, out var currencyCode))
        {
            return null;
        }

        var validationResult = MoneyAmount.TryParse(
            value.GetString(),
            currencyCode,
            MoneyValidationOptions.Default with
            {
                AllowZero = allowZero,
                AmountField = amountField,
                CurrencyField = currencyField
            },
            SupportedCurrencyPolicy.Default,
            out var moneyAmount);
        if (!validationResult.Succeeded)
        {
            AddError(errors, validationResult.Field, validationResult.Message);
            return null;
        }

        return moneyAmount.Amount;
    }

    private static string? ReadCalculationHash(
        JsonElement value,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, "calculationHash", "Calculation hash is required.");
            return null;
        }

        var calculationHash = value.GetString();
        if (calculationHash is null
            || calculationHash.Length != 64
            || calculationHash.Any(character => character is not (>= '0' and <= '9' or >= 'a' and <= 'f')))
        {
            AddError(errors, "calculationHash", "Calculation hash is not supported.");
            return null;
        }

        return calculationHash;
    }

    private static bool CanCreateRevisionForBillState(ExpenseBill bill)
    {
        return bill.Status is ExpenseBillStatuses.Confirmed or ExpenseBillStatuses.Rejected;
    }

    private static ExpenseBillRevisionResponse MapRevision(
        ExpenseBill bill,
        ExpenseBillRevision revision,
        Guid viewerUserProfileId)
    {
        return new ExpenseBillRevisionResponse(
            revision.Id,
            bill.Id,
            bill.GroupId,
            revision.ProposalCreatorUserProfileId,
            revision.SupersedesExpenseBillRevisionId,
            revision.SupersededByExpenseBillRevisionId,
            revision.Status,
            FormatAmount(revision.TotalAmount),
            revision.TotalCurrency,
            revision.CalculationHash,
            revision.SubmittedAtUtc,
            revision.WithdrawnAtUtc,
            revision.SupersededAtUtc,
            revision.RejectedAtUtc,
            revision.AppliedAtUtc,
            revision.CancelledAtUtc,
            revision.CreatedAtUtc,
            revision.UpdatedAtUtc,
            revision.Participants
                .OrderBy(participant => participant.UserProfileId)
                .Select(participant => new ExpenseBillRevisionParticipantResponse(
                    participant.UserProfileId,
                    FormatAmount(participant.ResolvedShareAmount),
                    participant.ResolvedShareCurrency,
                    participant.AffectedByRevision))
                .ToArray(),
            revision.Payers
                .OrderBy(payer => payer.UserProfileId)
                .Select(payer => new ExpenseBillRevisionPayerResponse(
                    payer.UserProfileId,
                    FormatAmount(payer.Amount),
                    payer.Currency,
                    payer.RequiresPayerConfirmation,
                    payer.PayerConfirmationStatus))
                .ToArray(),
            revision.Approvals
                .OrderBy(approval => approval.ParticipantUserProfileId)
                .Select(approval => new ExpenseBillRevisionApprovalResponse(
                    approval.ParticipantUserProfileId,
                    FormatAmount(approval.AcceptedAmount),
                    approval.Currency,
                    approval.Status,
                    approval.ApprovedAtUtc,
                    approval.RejectedAtUtc,
                    approval.InvalidatedAtUtc))
                .ToArray(),
            ExpenseBillRevisionReviewContextBuilder.Build(bill, revision, viewerUserProfileId));
    }

    private static ExpenseBillRevisionAuditEvent CreateAuditEvent(
        string action,
        AuthenticatedActor actor,
        ExpenseBill bill,
        ExpenseBillRevision revision,
        string? previousRevisionStatus,
        Guid? participantUserProfileId,
        DateTimeOffset now)
    {
        var counts = CountApprovals(revision);
        return new ExpenseBillRevisionAuditEvent(
            action,
            actor.AuthAccountId,
            actor.AuthAccountId,
            bill.Id,
            revision.Id,
            bill.GroupId,
            bill.GroupId.HasValue ? GroupMode : PersonalGroupMode,
            previousRevisionStatus,
            revision.Status,
            participantUserProfileId,
            revision.Participants.Count,
            counts.PendingCount,
            counts.ApprovedCount,
            counts.RejectedCount,
            revision.TotalCurrency,
            revision.TotalAmount,
            now);
    }

    private static ApprovalCounts CountApprovals(ExpenseBillRevision revision)
    {
        return new ApprovalCounts(
            revision.Approvals.Count(approval => approval.Status == ExpenseBillRevisionApprovalStatuses.PendingReview),
            revision.Approvals.Count(approval => approval.Status == ExpenseBillRevisionApprovalStatuses.Approved),
            revision.Approvals.Count(approval => approval.Status == ExpenseBillRevisionApprovalStatuses.Rejected));
    }

    private static async Task<IResult> SaveAndRespondAsync(
        SettleoraDbContext dbContext,
        IResult response,
        CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return BillRevisionWriteFailed();
        }

        return response;
    }

    private static IResult MapOperationFailure(ExpenseBillRevisionOperationResult result)
    {
        return result.FailureCode switch
        {
            "proposer_not_bill_participant" => BillUnavailable(),
            _ => BillRevisionConflict()
        };
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : BillUnavailable();
    }

    private static bool RequestHasBody(HttpRequest request)
    {
        return request.ContentLength.GetValueOrDefault() > 0
            || request.Headers.TryGetValue("Transfer-Encoding", out var transferEncoding)
            && transferEncoding.Count > 0;
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult BillUnavailable()
    {
        return Results.Problem(
            title: BillUnavailableTitle,
            detail: BillUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult BillRevisionUnavailable()
    {
        return Results.Problem(
            title: BillRevisionUnavailableTitle,
            detail: BillRevisionUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult InvalidBillRevisionRequest(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidBillRevisionRequestTitle,
            detail: InvalidBillRevisionRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult InvalidBillRevisionNoBody()
    {
        return Results.Problem(
            title: InvalidBillRevisionNoBodyTitle,
            detail: InvalidBillRevisionNoBodyDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult BillRevisionConflict()
    {
        return Results.Problem(
            title: BillRevisionConflictTitle,
            detail: BillRevisionConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult BillRevisionSettlementConflict()
    {
        return Results.Problem(
            title: BillRevisionSettlementConflictTitle,
            detail: BillRevisionSettlementConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult BillRevisionWriteFailed()
    {
        return Results.Problem(
            title: BillRevisionWriteFailedTitle,
            detail: BillRevisionWriteFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static void AddUnsupportedFieldError(Dictionary<string, List<string>> errors)
    {
        AddError(errors, "body", "Unsupported fields are not allowed.");
    }

    private static void AddError(
        Dictionary<string, List<string>> errors,
        string key,
        string message)
    {
        if (!errors.TryGetValue(key, out var values))
        {
            values = [];
            errors[key] = values;
        }

        if (!values.Contains(message, StringComparer.Ordinal))
        {
            values.Add(message);
        }
    }

    private static IDictionary<string, string[]> ToErrorDictionary(
        Dictionary<string, List<string>> errors)
    {
        return errors.ToDictionary(
            pair => pair.Key,
            pair => pair.Value.ToArray(),
            StringComparer.Ordinal);
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", CultureInfo.InvariantCulture);
    }

    private sealed record RevisionParticipantRequest(
        Guid UserProfileId,
        decimal ResolvedShareAmount,
        string ResolvedShareCurrency);

    private sealed record RevisionPayerRequest(
        Guid UserProfileId,
        decimal Amount,
        string Currency);

    private sealed record RevisionApprovalRequest(
        decimal AcceptedAmount,
        string Currency,
        string CalculationHash);

    private sealed record ApprovalCounts(
        int PendingCount,
        int ApprovedCount,
        int RejectedCount);

    private sealed class RevisionSnapshotReadResult
    {
        private RevisionSnapshotReadResult(
            BillRevisionProposalSnapshot? snapshot,
            IDictionary<string, string[]> errors)
        {
            Snapshot = snapshot;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public BillRevisionProposalSnapshot? Snapshot { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static RevisionSnapshotReadResult Valid(BillRevisionProposalSnapshot snapshot)
        {
            return new RevisionSnapshotReadResult(
                snapshot,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static RevisionSnapshotReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new RevisionSnapshotReadResult(null, errors);
        }
    }

    private sealed class RevisionApprovalReadResult
    {
        private RevisionApprovalReadResult(
            RevisionApprovalRequest? request,
            IDictionary<string, string[]> errors)
        {
            Request = request;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public RevisionApprovalRequest? Request { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static RevisionApprovalReadResult Valid(RevisionApprovalRequest request)
        {
            return new RevisionApprovalReadResult(
                request,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static RevisionApprovalReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new RevisionApprovalReadResult(null, errors);
        }
    }
}
