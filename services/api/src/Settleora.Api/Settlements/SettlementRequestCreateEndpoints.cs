using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Settlements;

internal static class SettlementRequestCreateEndpoints
{
    private const int CandidateKeyMaxLength = 240;
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string BillUnavailableTitle = "Bill unavailable";
    private const string BillUnavailableDetail = "The requested bill is unavailable.";
    private const string GroupBillUnavailableTitle = "Group bill unavailable";
    private const string GroupBillUnavailableDetail = "The requested group bill is unavailable.";
    private const string InvalidSettlementRequestTitle = "Invalid settlement request";
    private const string InvalidSettlementRequestDetail = "The submitted settlement request is invalid.";
    private const string SettlementRequestConflictTitle = "Settlement request conflict";
    private const string SettlementRequestConflictDetail = "The settlement request cannot be created for the current bill and candidate state.";
    private const string SettlementRequestWriteFailedTitle = "Settlement request write failed";
    private const string SettlementRequestWriteFailedDetail = "Unable to complete settlement request write.";
    private const string SettlementRequestCreatedAction = "settlement.request_created";
    private const string PersonalGroupMode = "personal";
    private const string GroupMode = "group";

    private static readonly string[] DuplicateBlockingStatuses =
    [
        SettlementRequestStatuses.Requested,
        SettlementRequestStatuses.PartiallyPaid,
        SettlementRequestStatuses.MarkedPaid,
        SettlementRequestStatuses.Confirmed,
        SettlementRequestStatuses.Disputed
    ];

    public static WebApplication MapSettlementRequestCreateEndpoints(this WebApplication app)
    {
        var personalBills = app.MapGroup("/api/v1/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        personalBills.MapPost("/{billId:guid}/settlement-requests", CreatePersonalBillSettlementRequestAsync);

        var groupBills = app.MapGroup("/api/v1/groups/{groupId:guid}/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        groupBills.MapPost("/{billId:guid}/settlement-requests", CreateGroupBillSettlementRequestAsync);

        return app;
    }

    private static async Task<IResult> CreatePersonalBillSettlementRequestAsync(
        Guid billId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettlementCandidateDerivationService candidateDerivationService,
        ISettlementRequestAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var readResult = await ReadCreateRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.Request is null)
        {
            return InvalidSettlementRequest(readResult.Errors);
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapPersonalAuthorizationFailure(authorizationResult);
        }

        var bill = await SettlementRequestPersonalBillQuery(dbContext, actor.UserProfileId)
            .SingleOrDefaultAsync(
                candidate => candidate.Id == billId,
                cancellationToken);
        if (bill is null)
        {
            return BillUnavailable();
        }

        return await CreateSettlementRequestAsync(
            bill,
            readResult.Request.CandidateKey,
            actor,
            candidateDerivationService,
            auditWriter,
            dbContext,
            timeProvider,
            PersonalGroupMode,
            BillUnavailable,
            cancellationToken);
    }

    private static async Task<IResult> CreateGroupBillSettlementRequestAsync(
        Guid groupId,
        Guid billId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettlementCandidateDerivationService candidateDerivationService,
        ISettlementRequestAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var readResult = await ReadCreateRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.Request is null)
        {
            return InvalidSettlementRequest(readResult.Errors);
        }

        var authorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
            groupId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapGroupAuthorizationFailure(authorizationResult);
        }

        var bill = await SettlementRequestGroupBillQuery(dbContext, groupId, actor.UserProfileId)
            .SingleOrDefaultAsync(
                candidate => candidate.Id == billId,
                cancellationToken);
        if (bill is null)
        {
            return GroupBillUnavailable();
        }

        return await CreateSettlementRequestAsync(
            bill,
            readResult.Request.CandidateKey,
            actor,
            candidateDerivationService,
            auditWriter,
            dbContext,
            timeProvider,
            GroupMode,
            GroupBillUnavailable,
            cancellationToken);
    }

    private static async Task<IResult> CreateSettlementRequestAsync(
        ExpenseBill bill,
        string submittedCandidateKey,
        AuthenticatedActor actor,
        SettlementCandidateDerivationService candidateDerivationService,
        ISettlementRequestAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        string groupMode,
        Func<IResult> unavailable,
        CancellationToken cancellationToken)
    {
        var derivationResult = candidateDerivationService.DeriveCandidates(bill);
        if (!derivationResult.Succeeded)
        {
            return derivationResult.Failure!.Reason is SettlementCandidateDerivationFailureReason.BillArchived
                ? unavailable()
                : SettlementRequestConflict();
        }

        var matchedCandidate = derivationResult.Candidates.SingleOrDefault(candidate =>
            string.Equals(candidate.CandidateKey, submittedCandidateKey, StringComparison.Ordinal));
        if (matchedCandidate is null
            || (matchedCandidate.DebtorUserProfileId != actor.UserProfileId
                && matchedCandidate.CreditorUserProfileId != actor.UserProfileId))
        {
            return SettlementRequestConflict();
        }

        if (await HasDuplicateActiveSettlementRequestAsync(
            dbContext,
            matchedCandidate,
            cancellationToken))
        {
            return SettlementRequestConflict();
        }

        var now = timeProvider.GetUtcNow();
        var settlementRequest = new SettlementRequest
        {
            Id = Guid.NewGuid(),
            SourceExpenseBillId = bill.Id,
            GroupId = bill.GroupId,
            DebtorUserProfileId = matchedCandidate.DebtorUserProfileId,
            CreditorUserProfileId = matchedCandidate.CreditorUserProfileId,
            Amount = matchedCandidate.Amount,
            Currency = matchedCandidate.Currency,
            Status = SettlementRequestStatuses.Requested,
            RequestedByUserProfileId = actor.UserProfileId,
            RequestedAtUtc = now,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        dbContext.Set<SettlementRequest>().Add(settlementRequest);
        await auditWriter.WriteAsync(
            new SettlementRequestAuditEvent(
                SettlementRequestCreatedAction,
                actor.AuthAccountId,
                actor.AuthAccountId,
                settlementRequest.Id,
                settlementRequest.SourceExpenseBillId!.Value,
                settlementRequest.GroupId,
                groupMode,
                settlementRequest.DebtorUserProfileId,
                settlementRequest.CreditorUserProfileId,
                settlementRequest.Status,
                settlementRequest.Amount,
                settlementRequest.Currency,
                matchedCandidate.Basis,
                now),
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return SettlementRequestWriteFailed();
        }

        return Results.Created(
            $"/api/v1/settlement-requests/{settlementRequest.Id:D}",
            MapResponse(settlementRequest));
    }

    private static IQueryable<ExpenseBill> SettlementRequestPersonalBillQuery(
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
                && bill.Participants.All(participant => participant.UserProfile.DeletedAtUtc == null)
                && bill.Payers.All(payer => payer.UserProfile.DeletedAtUtc == null)
                && (bill.CreatedByUserProfileId == actorUserProfileId
                    || bill.Participants.Any(participant => participant.UserProfileId == actorUserProfileId)
                    || bill.Payers.Any(payer => payer.UserProfileId == actorUserProfileId)));
    }

    private static IQueryable<ExpenseBill> SettlementRequestGroupBillQuery(
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
                && bill.CreatedByUserProfile.GroupMemberships.Any(membership =>
                    membership.GroupId == groupId
                    && membership.Status == GroupMembershipStatuses.Active)
                && bill.Participants.All(participant =>
                    participant.UserProfile.DeletedAtUtc == null
                    && participant.UserProfile.GroupMemberships.Any(membership =>
                        membership.GroupId == groupId
                        && membership.Status == GroupMembershipStatuses.Active))
                && bill.Payers.All(payer =>
                    payer.UserProfile.DeletedAtUtc == null
                    && payer.UserProfile.GroupMemberships.Any(membership =>
                        membership.GroupId == groupId
                        && membership.Status == GroupMembershipStatuses.Active))
                && (bill.CreatedByUserProfileId == actorUserProfileId
                    || bill.Participants.Any(participant => participant.UserProfileId == actorUserProfileId)
                    || bill.Payers.Any(payer => payer.UserProfileId == actorUserProfileId)));
    }

    private static Task<bool> HasDuplicateActiveSettlementRequestAsync(
        SettleoraDbContext dbContext,
        SettlementCandidate candidate,
        CancellationToken cancellationToken)
    {
        return dbContext.Set<SettlementRequest>()
            .AsNoTracking()
            .AnyAsync(
                settlementRequest => settlementRequest.ArchivedAtUtc == null
                    && settlementRequest.SourceExpenseBillId == candidate.SourceExpenseBillId
                    && settlementRequest.GroupId == candidate.GroupId
                    && settlementRequest.DebtorUserProfileId == candidate.DebtorUserProfileId
                    && settlementRequest.CreditorUserProfileId == candidate.CreditorUserProfileId
                    && settlementRequest.Amount == candidate.Amount
                    && settlementRequest.Currency == candidate.Currency
                    && DuplicateBlockingStatuses.Contains(settlementRequest.Status),
                cancellationToken);
    }

    private static async Task<SettlementRequestCreateReadResult> ReadCreateRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        if (!request.HasJsonContentType())
        {
            AddError(errors, "body", "A JSON object body is required.");
            return SettlementRequestCreateReadResult.Invalid(ToErrorDictionary(errors));
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
            return SettlementRequestCreateReadResult.Invalid(ToErrorDictionary(errors));
        }
        catch (BadHttpRequestException)
        {
            AddError(errors, "body", "A JSON object body is required.");
            return SettlementRequestCreateReadResult.Invalid(ToErrorDictionary(errors));
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                AddError(errors, "body", "A JSON object body is required.");
                return SettlementRequestCreateReadResult.Invalid(ToErrorDictionary(errors));
            }

            string? candidateKey = null;
            var hasCandidateKey = false;
            foreach (var property in document.RootElement.EnumerateObject())
            {
                switch (property.Name)
                {
                    case "candidateKey":
                        hasCandidateKey = true;
                        candidateKey = ReadCandidateKey(property.Value, errors);
                        break;
                    default:
                        AddUnsupportedFieldError(errors);
                        break;
                }
            }

            if (!hasCandidateKey)
            {
                AddError(errors, "candidateKey", "Candidate key is required.");
            }

            return errors.Count == 0 && candidateKey is not null
                ? SettlementRequestCreateReadResult.Valid(new SettlementRequestCreateRequest(candidateKey))
                : SettlementRequestCreateReadResult.Invalid(ToErrorDictionary(errors));
        }
    }

    private static string? ReadCandidateKey(
        JsonElement value,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, "candidateKey", "Candidate key is required.");
            return null;
        }

        var candidateKey = value.GetString()!.Trim();
        if (candidateKey.Length is 0 or > CandidateKeyMaxLength)
        {
            AddError(errors, "candidateKey", $"Candidate key must be between 1 and {CandidateKeyMaxLength} characters.");
            return null;
        }

        return candidateKey;
    }

    private static SettlementRequestResponse MapResponse(SettlementRequest settlementRequest)
    {
        return new SettlementRequestResponse(
            settlementRequest.Id,
            settlementRequest.SourceExpenseBillId!.Value,
            settlementRequest.GroupId,
            settlementRequest.DebtorUserProfileId,
            settlementRequest.CreditorUserProfileId,
            FormatAmount(settlementRequest.Amount),
            settlementRequest.Currency,
            settlementRequest.Status,
            settlementRequest.RequestedByUserProfileId,
            settlementRequest.RequestedAtUtc,
            settlementRequest.CreatedAtUtc,
            settlementRequest.UpdatedAtUtc);
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

    private static IResult InvalidSettlementRequest(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidSettlementRequestTitle,
            detail: InvalidSettlementRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult SettlementRequestConflict()
    {
        return Results.Problem(
            title: SettlementRequestConflictTitle,
            detail: SettlementRequestConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult SettlementRequestWriteFailed()
    {
        return Results.Problem(
            title: SettlementRequestWriteFailedTitle,
            detail: SettlementRequestWriteFailedDetail,
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

    private sealed record SettlementRequestCreateRequest(string CandidateKey);

    private sealed class SettlementRequestCreateReadResult
    {
        private SettlementRequestCreateReadResult(
            SettlementRequestCreateRequest? request,
            IDictionary<string, string[]> errors)
        {
            Request = request;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public SettlementRequestCreateRequest? Request { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static SettlementRequestCreateReadResult Valid(SettlementRequestCreateRequest request)
        {
            return new SettlementRequestCreateReadResult(
                request,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static SettlementRequestCreateReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new SettlementRequestCreateReadResult(null, errors);
        }
    }
}
