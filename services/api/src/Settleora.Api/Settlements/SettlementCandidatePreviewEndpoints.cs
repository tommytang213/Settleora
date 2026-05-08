using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Persistence;

namespace Settleora.Api.Settlements;

internal static class SettlementCandidatePreviewEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string BillUnavailableTitle = "Bill unavailable";
    private const string BillUnavailableDetail = "The requested bill is unavailable.";
    private const string GroupBillUnavailableTitle = "Group bill unavailable";
    private const string GroupBillUnavailableDetail = "The requested group bill is unavailable.";
    private const string SettlementCandidateConflictTitle = "Settlement candidate preview conflict";
    private const string SettlementCandidateConflictDetail = "Settlement candidates cannot be previewed for the current bill state.";

    public static WebApplication MapSettlementCandidatePreviewEndpoints(this WebApplication app)
    {
        var personalBills = app.MapGroup("/api/v1/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        personalBills.MapGet("/{billId:guid}/settlement-candidates", ListPersonalBillSettlementCandidatesAsync);

        var groupBills = app.MapGroup("/api/v1/groups/{groupId:guid}/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        groupBills.MapGet("/{billId:guid}/settlement-candidates", ListGroupBillSettlementCandidatesAsync);

        return app;
    }

    private static async Task<IResult> ListPersonalBillSettlementCandidatesAsync(
        Guid billId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettlementCandidateDerivationService candidateDerivationService,
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
            return MapPersonalAuthorizationFailure(authorizationResult);
        }

        var bill = await SettlementCandidatePersonalBillQuery(dbContext, actor.UserProfileId)
            .SingleOrDefaultAsync(
                candidate => candidate.Id == billId,
                cancellationToken);
        if (bill is null)
        {
            return BillUnavailable();
        }

        return MapDerivationResult(
            candidateDerivationService.DeriveCandidates(bill),
            actor.UserProfileId,
            BillUnavailable);
    }

    private static async Task<IResult> ListGroupBillSettlementCandidatesAsync(
        Guid groupId,
        Guid billId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettlementCandidateDerivationService candidateDerivationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
            groupId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapGroupAuthorizationFailure(authorizationResult);
        }

        var bill = await SettlementCandidateGroupBillQuery(dbContext, groupId, actor.UserProfileId)
            .SingleOrDefaultAsync(
                candidate => candidate.Id == billId,
                cancellationToken);
        if (bill is null)
        {
            return GroupBillUnavailable();
        }

        return MapDerivationResult(
            candidateDerivationService.DeriveCandidates(bill),
            actor.UserProfileId,
            GroupBillUnavailable);
    }

    private static IQueryable<ExpenseBill> SettlementCandidatePersonalBillQuery(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId)
    {
        return dbContext.Set<ExpenseBill>()
            .AsNoTracking()
            .Include(bill => bill.Participants)
            .Include(bill => bill.Payers)
            .Where(bill => bill.GroupId == null
                && bill.ArchivedAtUtc == null
                && bill.Status != ExpenseBillStatuses.Archived
                && bill.CreatedByUserProfile.DeletedAtUtc == null
                && (bill.CreatedByUserProfileId == actorUserProfileId
                    || bill.Participants.Any(participant => participant.UserProfileId == actorUserProfileId)
                    || bill.Payers.Any(payer => payer.UserProfileId == actorUserProfileId)));
    }

    private static IQueryable<ExpenseBill> SettlementCandidateGroupBillQuery(
        SettleoraDbContext dbContext,
        Guid groupId,
        Guid actorUserProfileId)
    {
        return dbContext.Set<ExpenseBill>()
            .AsNoTracking()
            .Include(bill => bill.Participants)
            .Include(bill => bill.Payers)
            .Where(bill => bill.GroupId == groupId
                && bill.ArchivedAtUtc == null
                && bill.Status != ExpenseBillStatuses.Archived
                && bill.Group != null
                && bill.Group.DeletedAtUtc == null
                && bill.CreatedByUserProfile.DeletedAtUtc == null
                && (bill.CreatedByUserProfileId == actorUserProfileId
                    || bill.Participants.Any(participant => participant.UserProfileId == actorUserProfileId)
                    || bill.Payers.Any(payer => payer.UserProfileId == actorUserProfileId)));
    }

    private static IResult MapDerivationResult(
        SettlementCandidateDerivationResult result,
        Guid actorUserProfileId,
        Func<IResult> unavailable)
    {
        if (!result.Succeeded)
        {
            return result.Failure!.Reason switch
            {
                SettlementCandidateDerivationFailureReason.NoCandidates => EmptyCandidateList(),
                SettlementCandidateDerivationFailureReason.BillArchived => unavailable(),
                _ => SettlementCandidateConflict()
            };
        }

        var candidates = result.Candidates
            .Where(candidate => candidate.DebtorUserProfileId == actorUserProfileId
                || candidate.CreditorUserProfileId == actorUserProfileId)
            .OrderBy(candidate => candidate.AllocationOrder)
            .Select(MapCandidate)
            .ToArray();

        return Results.Ok(new SettlementCandidateListResponse(candidates));
    }

    private static SettlementCandidateResponse MapCandidate(SettlementCandidate candidate)
    {
        return new SettlementCandidateResponse(
            candidate.CandidateKey,
            candidate.SourceExpenseBillId,
            candidate.GroupId,
            candidate.DebtorUserProfileId,
            candidate.CreditorUserProfileId,
            FormatAmount(candidate.Amount),
            candidate.Currency,
            candidate.Basis,
            candidate.AllocationOrder);
    }

    private static IResult EmptyCandidateList()
    {
        return Results.Ok(new SettlementCandidateListResponse([]));
    }

    private static IResult MapPersonalAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : BillUnavailable();
    }

    private static IResult MapGroupAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : GroupBillUnavailable();
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

    private static IResult GroupBillUnavailable()
    {
        return Results.Problem(
            title: GroupBillUnavailableTitle,
            detail: GroupBillUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult SettlementCandidateConflict()
    {
        return Results.Problem(
            title: SettlementCandidateConflictTitle,
            detail: SettlementCandidateConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", CultureInfo.InvariantCulture);
    }
}
