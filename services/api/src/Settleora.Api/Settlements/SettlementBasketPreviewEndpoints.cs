using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Money;
using Settleora.Api.Persistence;

namespace Settleora.Api.Settlements;

internal static class SettlementBasketPreviewEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string InvalidBasketPreviewTitle = "Invalid settlement basket preview";
    private const string InvalidBasketPreviewDetail = "The submitted settlement basket preview request is invalid.";
    private const string BasketPreviewUnavailableTitle = "Settlement basket preview unavailable";
    private const string BasketPreviewUnavailableDetail = "The requested settlement basket preview is unavailable.";

    private static readonly SupportedCurrencyPolicy SupportedCurrencies = SupportedCurrencyPolicy.Default;

    private static readonly string[] DuplicateBlockingStatuses =
    [
        SettlementRequestStatuses.Requested,
        SettlementRequestStatuses.PartiallyPaid,
        SettlementRequestStatuses.MarkedPaid,
        SettlementRequestStatuses.Confirmed,
        SettlementRequestStatuses.Disputed
    ];

    public static WebApplication MapSettlementBasketPreviewEndpoints(this WebApplication app)
    {
        app.MapPost("/api/v1/settlements/baskets/preview", PreviewSettlementBasketAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        return app;
    }

    private static async Task<IResult> PreviewSettlementBasketAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettlementCandidateDerivationService candidateDerivationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var readResult = await ReadPreviewRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.Request is null)
        {
            return InvalidBasketPreview(readResult.Errors);
        }

        if (readResult.Request.CounterpartyUserProfileId == actor.UserProfileId)
        {
            return InvalidBasketPreview(ToErrorDictionary(
                "counterpartyUserProfileId",
                "Counterparty user profile ID must identify another profile."));
        }

        var profileAuthorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!profileAuthorizationResult.Allowed)
        {
            return MapAuthorizationFailure(profileAuthorizationResult);
        }

        if (readResult.Request.GroupId is { } groupId)
        {
            var groupAuthorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
                groupId,
                cancellationToken);
            if (!groupAuthorizationResult.Allowed)
            {
                return MapAuthorizationFailure(groupAuthorizationResult);
            }
        }

        if (!await CounterpartyIsVisibleAsync(
                dbContext,
                actor.UserProfileId,
                readResult.Request.CounterpartyUserProfileId,
                readResult.Request.GroupId,
                cancellationToken))
        {
            return BasketPreviewUnavailable();
        }

        var debtorUserProfileId = readResult.Request.Direction is SettlementBalanceDirections.Outgoing
            ? actor.UserProfileId
            : readResult.Request.CounterpartyUserProfileId;
        var creditorUserProfileId = readResult.Request.Direction is SettlementBalanceDirections.Outgoing
            ? readResult.Request.CounterpartyUserProfileId
            : actor.UserProfileId;

        var duplicateKeys = await ReadDuplicateBlockingKeysAsync(
            dbContext,
            readResult.Request.GroupId,
            debtorUserProfileId,
            creditorUserProfileId,
            readResult.Request.Currency,
            cancellationToken);

        var bills = await VisibleBasketBillQuery(
                dbContext,
                actor.UserProfileId,
                readResult.Request.CounterpartyUserProfileId,
                readResult.Request.GroupId)
            .OrderBy(bill => bill.CreatedAtUtc)
            .ThenBy(bill => bill.Id)
            .ToListAsync(cancellationToken);

        var lines = new List<SettlementBasketPreviewLineProjection>();
        foreach (var bill in bills)
        {
            var derivationResult = candidateDerivationService.DeriveCandidates(bill);
            if (!derivationResult.Succeeded)
            {
                continue;
            }

            foreach (var candidate in derivationResult.Candidates)
            {
                if (candidate.DebtorUserProfileId != debtorUserProfileId
                    || candidate.CreditorUserProfileId != creditorUserProfileId
                    || !string.Equals(candidate.Currency, readResult.Request.Currency, StringComparison.Ordinal)
                    || !SettlementRuntimePolicy.IsValidSettlementAmount(candidate.Amount)
                    || duplicateKeys.Contains(DuplicateSettlementRequestKey.From(candidate)))
                {
                    continue;
                }

                lines.Add(new SettlementBasketPreviewLineProjection(
                    candidate.SourceExpenseBillId,
                    bill.ActiveAcceptedBillRevisionId,
                    candidate.CandidateKey,
                    candidate.Amount,
                    candidate.Currency,
                    candidate.Basis,
                    bill.CreatedAtUtc));
            }
        }

        var orderedLines = lines
            .OrderBy(line => line.CreatedAtUtc)
            .ThenBy(line => line.SourceExpenseBillId)
            .ThenBy(line => line.SourceCandidateKey, StringComparer.Ordinal)
            .ToArray();

        return Results.Ok(SettlementBasketPreviewResponse.From(
            timeProvider.GetUtcNow(),
            readResult.Request.Direction,
            debtorUserProfileId,
            creditorUserProfileId,
            readResult.Request.CounterpartyUserProfileId,
            readResult.Request.GroupId,
            readResult.Request.Currency,
            orderedLines));
    }

    private static IQueryable<ExpenseBill> VisibleBasketBillQuery(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId,
        Guid counterpartyUserProfileId,
        Guid? groupId)
    {
        var query = dbContext.Set<ExpenseBill>()
            .AsNoTracking()
            .Include(bill => bill.Participants)
            .Include(bill => bill.Payers)
            .Where(bill => bill.Status == ExpenseBillStatuses.Confirmed
                && bill.ArchivedAtUtc == null
                && bill.CreatedByUserProfile.DeletedAtUtc == null
                && bill.Participants.All(participant => participant.UserProfile.DeletedAtUtc == null)
                && bill.Payers.All(payer => payer.UserProfile.DeletedAtUtc == null)
                && (bill.CreatedByUserProfileId == actorUserProfileId
                    || bill.Participants.Any(participant => participant.UserProfileId == actorUserProfileId)
                    || bill.Payers.Any(payer => payer.UserProfileId == actorUserProfileId))
                && (bill.CreatedByUserProfileId == counterpartyUserProfileId
                    || bill.Participants.Any(participant => participant.UserProfileId == counterpartyUserProfileId)
                    || bill.Payers.Any(payer => payer.UserProfileId == counterpartyUserProfileId)));

        if (groupId is null)
        {
            return query.Where(bill => bill.GroupId == null);
        }

        var requiredGroupId = groupId.Value;
        return query.Where(bill => bill.GroupId == requiredGroupId
            && bill.Group != null
            && bill.Group.DeletedAtUtc == null
            && bill.CreatedByUserProfile.GroupMemberships.Any(membership =>
                membership.GroupId == requiredGroupId
                && membership.Status == GroupMembershipStatuses.Active)
            && bill.Participants.All(participant =>
                participant.UserProfile.GroupMemberships.Any(membership =>
                    membership.GroupId == requiredGroupId
                    && membership.Status == GroupMembershipStatuses.Active))
            && bill.Payers.All(payer =>
                payer.UserProfile.GroupMemberships.Any(membership =>
                    membership.GroupId == requiredGroupId
                    && membership.Status == GroupMembershipStatuses.Active))
            && dbContext.Set<GroupMembership>().Any(membership =>
                membership.GroupId == requiredGroupId
                && membership.UserProfileId == actorUserProfileId
                && membership.Status == GroupMembershipStatuses.Active)
            && dbContext.Set<GroupMembership>().Any(membership =>
                membership.GroupId == requiredGroupId
                && membership.UserProfileId == counterpartyUserProfileId
                && membership.Status == GroupMembershipStatuses.Active));
    }

    private static async Task<bool> CounterpartyIsVisibleAsync(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId,
        Guid counterpartyUserProfileId,
        Guid? groupId,
        CancellationToken cancellationToken)
    {
        var counterpartyExists = await dbContext.Set<UserProfile>()
            .AsNoTracking()
            .AnyAsync(
                profile => profile.Id == counterpartyUserProfileId
                    && profile.DeletedAtUtc == null,
                cancellationToken);
        if (!counterpartyExists)
        {
            return false;
        }

        if (groupId is not { } requiredGroupId)
        {
            return true;
        }

        return await dbContext.Set<UserGroup>()
                .AsNoTracking()
                .AnyAsync(
                    group => group.Id == requiredGroupId
                        && group.DeletedAtUtc == null,
                    cancellationToken)
            && await dbContext.Set<GroupMembership>()
                .AsNoTracking()
                .AnyAsync(
                    membership => membership.GroupId == requiredGroupId
                        && membership.UserProfileId == actorUserProfileId
                        && membership.Status == GroupMembershipStatuses.Active,
                    cancellationToken)
            && await dbContext.Set<GroupMembership>()
                .AsNoTracking()
                .AnyAsync(
                    membership => membership.GroupId == requiredGroupId
                        && membership.UserProfileId == counterpartyUserProfileId
                        && membership.Status == GroupMembershipStatuses.Active,
                    cancellationToken);
    }

    private static async Task<HashSet<DuplicateSettlementRequestKey>> ReadDuplicateBlockingKeysAsync(
        SettleoraDbContext dbContext,
        Guid? groupId,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        string currency,
        CancellationToken cancellationToken)
    {
        var query = dbContext.Set<SettlementRequest>()
            .AsNoTracking()
            .Where(settlementRequest => settlementRequest.ArchivedAtUtc == null
                && settlementRequest.SourceExpenseBillId != null
                && settlementRequest.DebtorUserProfileId == debtorUserProfileId
                && settlementRequest.CreditorUserProfileId == creditorUserProfileId
                && settlementRequest.Currency == currency
                && DuplicateBlockingStatuses.Contains(settlementRequest.Status));

        query = groupId is null
            ? query.Where(settlementRequest => settlementRequest.GroupId == null)
            : query.Where(settlementRequest => settlementRequest.GroupId == groupId.Value);

        var duplicates = await query
            .Select(settlementRequest => new
            {
                SourceExpenseBillId = settlementRequest.SourceExpenseBillId!.Value,
                settlementRequest.GroupId,
                settlementRequest.DebtorUserProfileId,
                settlementRequest.CreditorUserProfileId,
                settlementRequest.Amount,
                settlementRequest.Currency
            })
            .ToListAsync(cancellationToken);

        return duplicates
            .Select(duplicate => new DuplicateSettlementRequestKey(
                duplicate.SourceExpenseBillId,
                duplicate.GroupId,
                duplicate.DebtorUserProfileId,
                duplicate.CreditorUserProfileId,
                duplicate.Amount,
                duplicate.Currency))
            .ToHashSet();
    }

    private static async Task<SettlementBasketPreviewReadResult> ReadPreviewRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        if (!request.HasJsonContentType())
        {
            AddError(errors, "body", "A JSON object body is required.");
            return SettlementBasketPreviewReadResult.Invalid(ToErrorDictionary(errors));
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
            return SettlementBasketPreviewReadResult.Invalid(ToErrorDictionary(errors));
        }
        catch (BadHttpRequestException)
        {
            AddError(errors, "body", "A JSON object body is required.");
            return SettlementBasketPreviewReadResult.Invalid(ToErrorDictionary(errors));
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                AddError(errors, "body", "A JSON object body is required.");
                return SettlementBasketPreviewReadResult.Invalid(ToErrorDictionary(errors));
            }

            Guid? counterpartyUserProfileId = null;
            string? direction = null;
            string? currency = null;
            Guid? groupId = null;
            string? selectionMode = null;
            var hasCounterpartyUserProfileId = false;
            var hasDirection = false;
            var hasCurrency = false;
            var hasSelectionMode = false;

            foreach (var property in document.RootElement.EnumerateObject())
            {
                switch (property.Name)
                {
                    case "counterpartyUserProfileId":
                        hasCounterpartyUserProfileId = true;
                        counterpartyUserProfileId = ReadGuid(
                            property.Value,
                            "counterpartyUserProfileId",
                            "Counterparty user profile ID must be a UUID.",
                            errors);
                        break;
                    case "direction":
                        hasDirection = true;
                        direction = ReadDirection(property.Value, errors);
                        break;
                    case "currency":
                        hasCurrency = true;
                        currency = ReadCurrency(property.Value, errors);
                        break;
                    case "groupId":
                        groupId = ReadOptionalGuid(
                            property.Value,
                            "groupId",
                            "Group ID must be a UUID or null.",
                            errors);
                        break;
                    case "selectionMode":
                        hasSelectionMode = true;
                        selectionMode = ReadSelectionMode(property.Value, errors);
                        break;
                    default:
                        AddUnsupportedFieldError(errors);
                        break;
                }
            }

            if (!hasCounterpartyUserProfileId)
            {
                AddError(errors, "counterpartyUserProfileId", "Counterparty user profile ID is required.");
            }

            if (!hasDirection)
            {
                AddError(errors, "direction", "Direction is required.");
            }

            if (!hasCurrency)
            {
                AddError(errors, "currency", "Currency is required.");
            }

            if (!hasSelectionMode)
            {
                AddError(errors, "selectionMode", "Selection mode is required.");
            }

            return errors.Count == 0
                && counterpartyUserProfileId is { } parsedCounterpartyUserProfileId
                && direction is not null
                && currency is not null
                && selectionMode is not null
                    ? SettlementBasketPreviewReadResult.Valid(new SettlementBasketPreviewRequest(
                        parsedCounterpartyUserProfileId,
                        direction,
                        currency,
                        groupId,
                        selectionMode))
                    : SettlementBasketPreviewReadResult.Invalid(ToErrorDictionary(errors));
        }
    }

    private static Guid? ReadGuid(
        JsonElement value,
        string field,
        string message,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String
            || !Guid.TryParse(value.GetString(), out var parsedValue)
            || parsedValue == Guid.Empty)
        {
            AddError(errors, field, message);
            return null;
        }

        return parsedValue;
    }

    private static Guid? ReadOptionalGuid(
        JsonElement value,
        string field,
        string message,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is JsonValueKind.Null)
        {
            return null;
        }

        return ReadGuid(value, field, message, errors);
    }

    private static string? ReadDirection(
        JsonElement value,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, "direction", "Direction must be outgoing or incoming.");
            return null;
        }

        var direction = value.GetString();
        if (!SettlementBalanceDirections.IsSupported(direction))
        {
            AddError(errors, "direction", "Direction must be outgoing or incoming.");
            return null;
        }

        return direction;
    }

    private static string? ReadCurrency(
        JsonElement value,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String
            || !CurrencyCode.TryCreate(value.GetString(), out var currency)
            || !SupportedCurrencies.IsSupported(currency))
        {
            AddError(errors, "currency", "Currency must be an uppercase supported three-letter code.");
            return null;
        }

        return currency.Value;
    }

    private static string? ReadSelectionMode(
        JsonElement value,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, "selectionMode", "Selection mode must be pay_all_outstanding_for_counterparty.");
            return null;
        }

        var selectionMode = value.GetString();
        if (!SettlementBasketSelectionModes.IsSupported(selectionMode))
        {
            AddError(errors, "selectionMode", "Selection mode must be pay_all_outstanding_for_counterparty.");
            return null;
        }

        return selectionMode;
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : BasketPreviewUnavailable();
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult InvalidBasketPreview(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidBasketPreviewTitle,
            detail: InvalidBasketPreviewDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult BasketPreviewUnavailable()
    {
        return Results.Problem(
            title: BasketPreviewUnavailableTitle,
            detail: BasketPreviewUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
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
        string key,
        string message)
    {
        return new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            [key] = [message]
        };
    }

    private static IDictionary<string, string[]> ToErrorDictionary(
        Dictionary<string, List<string>> errors)
    {
        return errors.ToDictionary(
            pair => pair.Key,
            pair => pair.Value.ToArray(),
            StringComparer.Ordinal);
    }

    private sealed record SettlementBasketPreviewRequest(
        Guid CounterpartyUserProfileId,
        string Direction,
        string Currency,
        Guid? GroupId,
        string SelectionMode);

    private sealed class SettlementBasketPreviewReadResult
    {
        private SettlementBasketPreviewReadResult(
            SettlementBasketPreviewRequest? request,
            IDictionary<string, string[]> errors)
        {
            Request = request;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public SettlementBasketPreviewRequest? Request { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static SettlementBasketPreviewReadResult Valid(SettlementBasketPreviewRequest request)
        {
            return new SettlementBasketPreviewReadResult(
                request,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static SettlementBasketPreviewReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new SettlementBasketPreviewReadResult(null, errors);
        }
    }

    private sealed record DuplicateSettlementRequestKey(
        Guid SourceExpenseBillId,
        Guid? GroupId,
        Guid DebtorUserProfileId,
        Guid CreditorUserProfileId,
        decimal Amount,
        string Currency)
    {
        public static DuplicateSettlementRequestKey From(SettlementCandidate candidate)
        {
            return new DuplicateSettlementRequestKey(
                candidate.SourceExpenseBillId,
                candidate.GroupId,
                candidate.DebtorUserProfileId,
                candidate.CreditorUserProfileId,
                candidate.Amount,
                candidate.Currency);
        }
    }
}
