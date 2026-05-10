using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Money;
using Settleora.Api.Persistence;

namespace Settleora.Api.Settlements;

internal static class SettlementBasketCreateEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string InvalidSettlementBasketTitle = "Invalid settlement basket";
    private const string InvalidSettlementBasketDetail = "The submitted settlement basket request is invalid.";
    private const string SettlementBasketUnavailableTitle = "Settlement basket unavailable";
    private const string SettlementBasketUnavailableDetail = "The requested settlement basket is unavailable.";
    private const string SettlementBasketConflictTitle = "Settlement basket conflict";
    private const string SettlementBasketConflictDetail = "The settlement basket cannot be created for the current counterparty state.";
    private const string SettlementBasketWriteFailedTitle = "Settlement basket write failed";
    private const string SettlementBasketWriteFailedDetail = "Unable to complete settlement basket write.";
    private const string SettlementBasketCreatedAction = "settlement.basket_created";
    private const string SettlementBasketCreateWorkflowName = "settlement_basket_create";

    private static readonly SupportedCurrencyPolicy SupportedCurrencies = SupportedCurrencyPolicy.Default;

    public static WebApplication MapSettlementBasketCreateEndpoints(this WebApplication app)
    {
        app.MapPost("/api/v1/settlements/baskets", CreateSettlementBasketAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        return app;
    }

    private static async Task<IResult> CreateSettlementBasketAsync(
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
            return InvalidSettlementBasket(readResult.Errors);
        }

        if (readResult.Request.CounterpartyUserProfileId == actor.UserProfileId)
        {
            return InvalidSettlementBasket(ToErrorDictionary(
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

        var expansionResult = await SettlementBasketExpansionService.ExpandPayAllOutstandingForCounterpartyAsync(
            dbContext,
            candidateDerivationService,
            actor.UserProfileId,
            readResult.Request.CounterpartyUserProfileId,
            readResult.Request.Direction,
            readResult.Request.Currency,
            readResult.Request.GroupId,
            cancellationToken);
        if (!expansionResult.IsAvailable)
        {
            return SettlementBasketUnavailable();
        }

        if (expansionResult.Lines.Count == 0)
        {
            return SettlementBasketConflict();
        }

        var selectedTotal = expansionResult.Lines.Sum(line => line.ExactAmount);
        if (!SettlementRuntimePolicy.IsValidSettlementAmount(selectedTotal))
        {
            return SettlementBasketConflict();
        }

        var now = timeProvider.GetUtcNow();
        var settlementRequest = new SettlementRequest
        {
            Id = Guid.NewGuid(),
            SourceExpenseBillId = expansionResult.Lines[0].SourceExpenseBillId,
            GroupId = readResult.Request.GroupId,
            DebtorUserProfileId = expansionResult.DebtorUserProfileId,
            CreditorUserProfileId = expansionResult.CreditorUserProfileId,
            Amount = selectedTotal,
            Currency = readResult.Request.Currency,
            Status = SettlementRequestStatuses.Requested,
            RequestedByUserProfileId = actor.UserProfileId,
            RequestedAtUtc = now,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        for (var index = 0; index < expansionResult.Lines.Count; index++)
        {
            var selectedLine = expansionResult.Lines[index];
            settlementRequest.Lines.Add(new SettlementRequestLine
            {
                Id = Guid.NewGuid(),
                SettlementRequestId = settlementRequest.Id,
                SourceExpenseBillId = selectedLine.SourceExpenseBillId,
                SourceBillRevisionId = selectedLine.SourceBillRevisionId,
                SourceCandidateKey = selectedLine.SourceCandidateKey,
                ExactAmount = selectedLine.ExactAmount,
                Currency = selectedLine.Currency,
                AllocationOrder = index,
                Status = SettlementRequestLineStatuses.Open,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        dbContext.Set<SettlementRequest>().Add(settlementRequest);
        await auditWriter.WriteAsync(
            new SettlementRequestAuditEvent(
                SettlementBasketCreatedAction,
                actor.AuthAccountId,
                actor.AuthAccountId,
                settlementRequest.Id,
                settlementRequest.SourceExpenseBillId.Value,
                settlementRequest.GroupId,
                settlementRequest.GroupId.HasValue
                    ? SettlementRuntimePolicy.GroupMode
                    : SettlementRuntimePolicy.PersonalGroupMode,
                settlementRequest.DebtorUserProfileId,
                settlementRequest.CreditorUserProfileId,
                settlementRequest.Status,
                settlementRequest.Amount,
                settlementRequest.Currency,
                SettlementBasketSelectionModes.PayAllOutstandingForCounterparty,
                now)
            {
                WorkflowName = SettlementBasketCreateWorkflowName
            },
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return SettlementBasketWriteFailed();
        }

        return Results.Created(
            $"/api/v1/settlements/{settlementRequest.Id:D}",
            SettlementRequestResponse.From(settlementRequest));
    }

    private static async Task<SettlementBasketCreateReadResult> ReadCreateRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        if (!request.HasJsonContentType())
        {
            AddError(errors, "body", "A JSON object body is required.");
            return SettlementBasketCreateReadResult.Invalid(ToErrorDictionary(errors));
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
            return SettlementBasketCreateReadResult.Invalid(ToErrorDictionary(errors));
        }
        catch (BadHttpRequestException)
        {
            AddError(errors, "body", "A JSON object body is required.");
            return SettlementBasketCreateReadResult.Invalid(ToErrorDictionary(errors));
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                AddError(errors, "body", "A JSON object body is required.");
                return SettlementBasketCreateReadResult.Invalid(ToErrorDictionary(errors));
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
                    ? SettlementBasketCreateReadResult.Valid(new SettlementBasketCreateRequest(
                        parsedCounterpartyUserProfileId,
                        direction,
                        currency,
                        groupId,
                        selectionMode))
                    : SettlementBasketCreateReadResult.Invalid(ToErrorDictionary(errors));
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
            : SettlementBasketUnavailable();
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult InvalidSettlementBasket(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidSettlementBasketTitle,
            detail: InvalidSettlementBasketDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult SettlementBasketUnavailable()
    {
        return Results.Problem(
            title: SettlementBasketUnavailableTitle,
            detail: SettlementBasketUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult SettlementBasketConflict()
    {
        return Results.Problem(
            title: SettlementBasketConflictTitle,
            detail: SettlementBasketConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult SettlementBasketWriteFailed()
    {
        return Results.Problem(
            title: SettlementBasketWriteFailedTitle,
            detail: SettlementBasketWriteFailedDetail,
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

    private sealed record SettlementBasketCreateRequest(
        Guid CounterpartyUserProfileId,
        string Direction,
        string Currency,
        Guid? GroupId,
        string SelectionMode);

    private sealed class SettlementBasketCreateReadResult
    {
        private SettlementBasketCreateReadResult(
            SettlementBasketCreateRequest? request,
            IDictionary<string, string[]> errors)
        {
            Request = request;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public SettlementBasketCreateRequest? Request { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static SettlementBasketCreateReadResult Valid(SettlementBasketCreateRequest request)
        {
            return new SettlementBasketCreateReadResult(
                request,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static SettlementBasketCreateReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new SettlementBasketCreateReadResult(null, errors);
        }
    }
}
