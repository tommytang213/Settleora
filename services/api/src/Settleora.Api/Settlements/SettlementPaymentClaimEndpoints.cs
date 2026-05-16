using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Money;
using Settleora.Api.Notifications;
using Settleora.Api.Persistence;

namespace Settleora.Api.Settlements;

internal static class SettlementPaymentClaimEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string SettlementUnavailableTitle = "Settlement unavailable";
    private const string SettlementUnavailableDetail = "The requested settlement is unavailable.";
    private const string InvalidSettlementPaymentTitle = "Invalid settlement payment";
    private const string InvalidSettlementPaymentDetail = "The submitted settlement payment is invalid.";
    private const string SettlementPaymentConflictTitle = "Settlement payment conflict";
    private const string SettlementPaymentConflictDetail = "The settlement payment cannot be claimed for the current settlement state.";
    private const string SettlementPaymentWriteFailedTitle = "Settlement payment write failed";
    private const string SettlementPaymentWriteFailedDetail = "Unable to complete settlement payment write.";
    private const string SettlementPaymentClaimWorkflowName = "settlement_payment_claim";
    private const string SettlementPaymentMarkedPaidAction = "settlement.payment_marked_paid";
    private const string SettlementPaymentPartiallyPaidAction = "settlement.payment_partially_paid";

    public static WebApplication MapSettlementPaymentClaimEndpoints(this WebApplication app)
    {
        var settlements = app.MapGroup("/api/v1/settlements")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        settlements.MapPost("/{settlementId:guid}/payments", CreateSettlementPaymentAsync);

        return app;
    }

    private static async Task<IResult> CreateSettlementPaymentAsync(
        Guid settlementId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        ISettlementPaymentAuditWriter auditWriter,
        IInAppNotificationWriter notificationWriter,
        SettlementResidualPolicyService residualPolicyService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var readResult = await ReadPaymentClaimRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.Request is null)
        {
            return InvalidSettlementPayment(readResult.Errors);
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var settlementRequest = await SettlementPaymentClaimQuery(dbContext, actor.UserProfileId)
            .SingleOrDefaultAsync(
                candidate => candidate.Id == settlementId,
                cancellationToken);
        if (settlementRequest is null)
        {
            return SettlementUnavailable();
        }

        if (settlementRequest.GroupId.HasValue)
        {
            var groupAuthorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
                settlementRequest.GroupId.Value,
                cancellationToken);
            if (!groupAuthorizationResult.Allowed)
            {
                return MapAuthorizationFailure(groupAuthorizationResult);
            }
        }

        if (!CanClaimPayment(settlementRequest.Status))
        {
            return SettlementPaymentConflict();
        }

        if (!string.Equals(settlementRequest.Currency, readResult.Request.Currency, StringComparison.Ordinal))
        {
            return SettlementPaymentConflict();
        }

        if (!SettlementPaymentAllocationRuntime.TryGetOutstandingSelectedAmount(
                settlementRequest,
                out var selectedOutstandingTotal))
        {
            return SettlementPaymentConflict();
        }

        var amountToAllocate = readResult.Request.Amount;
        SettlementResidualDecision? residualDecision = null;
        if (readResult.Request.ProposedResidualPolicy is not null
            || readResult.Request.Amount > selectedOutstandingTotal)
        {
            var policyResult = residualPolicyService.Decide(
                selectedOutstandingTotal,
                settlementRequest.Currency,
                readResult.Request.Amount,
                readResult.Request.Currency,
                readResult.Request.ProposedResidualPolicy);
            if (!policyResult.Succeeded || policyResult.Decision is null)
            {
                return policyResult.Failure?.Reason is SettlementResidualPolicyFailureReason.MissingResidualPolicy
                    && readResult.Request.Amount > selectedOutstandingTotal
                    ? SettlementPaymentConflict()
                    : InvalidSettlementPayment(ToErrorDictionary(policyResult.Failure));
            }

            residualDecision = policyResult.Decision.Residual;
            if (policyResult.Decision.Classification == SettlementResidualPaymentClassification.Overpayment)
            {
                amountToAllocate = selectedOutstandingTotal;
            }
        }

        var previousRequestStatus = settlementRequest.Status;
        var now = timeProvider.GetUtcNow();
        var payment = new SettlementPayment
        {
            Id = Guid.NewGuid(),
            SettlementRequestId = settlementRequest.Id,
            PaidByUserProfileId = actor.UserProfileId,
            ReceivedByUserProfileId = settlementRequest.CreditorUserProfileId,
            Amount = readResult.Request.Amount,
            Currency = readResult.Request.Currency,
            Status = SettlementPaymentStatuses.MarkedPaid,
            PaymentDate = readResult.Request.PaymentDate,
            CreatedByUserProfileId = actor.UserProfileId,
            ClaimedAtUtc = now,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        SettlementResidual? residual = null;
        if (residualDecision is not null)
        {
            residual = new SettlementResidual
            {
                Id = Guid.NewGuid(),
                SettlementPaymentId = payment.Id,
                SettlementPayment = payment,
                SettlementRequestId = settlementRequest.Id,
                SettlementRequest = settlementRequest,
                DebtorUserProfileId = settlementRequest.DebtorUserProfileId,
                CreditorUserProfileId = settlementRequest.CreditorUserProfileId,
                Direction = residualDecision.Direction,
                Amount = residualDecision.Amount,
                Currency = residualDecision.Currency,
                Policy = residualDecision.Policy,
                Status = residualDecision.InitialStatus,
                CreatedAtUtc = now
            };
            payment.Residuals.Add(residual);
            settlementRequest.Residuals.Add(residual);
        }

        if (!SettlementPaymentAllocationRuntime.TryCreatePaymentAllocations(
                settlementRequest,
                payment,
                amountToAllocate,
                now,
                out var allocationResult))
        {
            return SettlementPaymentConflict();
        }

        var newRequestStatus = allocationResult.ActivePaymentCoverage == settlementRequest.Amount
            ? SettlementRequestStatuses.MarkedPaid
            : SettlementRequestStatuses.PartiallyPaid;

        settlementRequest.Status = newRequestStatus;
        settlementRequest.UpdatedAtUtc = now;
        dbContext.Set<SettlementPayment>().Add(payment);
        if (residual is not null)
        {
            dbContext.Set<SettlementResidual>().Add(residual);
        }

        var notificationEventType = newRequestStatus is SettlementRequestStatuses.MarkedPaid
            ? SettlementPaymentMarkedPaidAction
            : SettlementPaymentPartiallyPaidAction;
        await auditWriter.WriteAsync(
            new SettlementPaymentAuditEvent(
                SettlementPaymentClaimWorkflowName,
                notificationEventType,
                actor.AuthAccountId,
                actor.AuthAccountId,
                settlementRequest.Id,
                payment.Id,
                settlementRequest.SourceExpenseBillId!.Value,
                settlementRequest.GroupId,
                settlementRequest.GroupId.HasValue
                    ? SettlementRuntimePolicy.GroupMode
                    : SettlementRuntimePolicy.PersonalGroupMode,
                settlementRequest.DebtorUserProfileId,
                settlementRequest.CreditorUserProfileId,
                previousRequestStatus,
                newRequestStatus,
                payment.Status,
                payment.Amount,
                allocationResult.ActivePaymentCoverage,
                settlementRequest.Amount,
                payment.Currency,
                payment.PaymentDate,
                now),
            cancellationToken);
        await InAppNotificationEvents.WriteSettlementPaymentNotificationAsync(
            notificationWriter,
            settlementRequest,
            payment,
            actor.UserProfileId,
            notificationEventType,
            InAppNotificationPriorities.Attention,
            now,
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return SettlementPaymentWriteFailed();
        }

        return Results.Created(
            $"/api/v1/settlements/{settlementRequest.Id:D}/payments/{payment.Id:D}",
            SettlementPaymentResponse.From(payment, settlementRequest.Status));
    }

    private static IQueryable<SettlementRequest> SettlementPaymentClaimQuery(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId)
    {
        return dbContext.Set<SettlementRequest>()
            .Include(settlementRequest => settlementRequest.Payments)
                .ThenInclude(payment => payment.Allocations)
            .Include(settlementRequest => settlementRequest.Payments)
                .ThenInclude(payment => payment.Residuals)
            .Include(settlementRequest => settlementRequest.Lines)
            .Where(settlementRequest => settlementRequest.ArchivedAtUtc == null
                && settlementRequest.SourceExpenseBillId != null
                && settlementRequest.DebtorUserProfileId == actorUserProfileId
                && settlementRequest.DebtorUserProfile.DeletedAtUtc == null
                && settlementRequest.CreditorUserProfile.DeletedAtUtc == null
                && settlementRequest.RequestedByUserProfile.DeletedAtUtc == null
                && (settlementRequest.GroupId == null
                    || (settlementRequest.GroupId != null
                        && settlementRequest.Group != null
                        && settlementRequest.Group.DeletedAtUtc == null
                        && settlementRequest.DebtorUserProfile.GroupMemberships.Any(membership =>
                            membership.GroupId == settlementRequest.GroupId.Value
                            && membership.Status == GroupMembershipStatuses.Active)
                        && settlementRequest.CreditorUserProfile.GroupMemberships.Any(membership =>
                            membership.GroupId == settlementRequest.GroupId.Value
                            && membership.Status == GroupMembershipStatuses.Active)
                        && settlementRequest.RequestedByUserProfile.GroupMemberships.Any(membership =>
                            membership.GroupId == settlementRequest.GroupId.Value
                            && membership.Status == GroupMembershipStatuses.Active)
                        && dbContext.Set<GroupMembership>().Any(membership =>
                            membership.GroupId == settlementRequest.GroupId.Value
                            && membership.UserProfileId == actorUserProfileId
                            && membership.Status == GroupMembershipStatuses.Active))));
    }

    private static async Task<SettlementPaymentClaimReadResult> ReadPaymentClaimRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        if (!request.HasJsonContentType())
        {
            AddError(errors, "body", "A JSON object body is required.");
            return SettlementPaymentClaimReadResult.Invalid(ToErrorDictionary(errors));
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
            return SettlementPaymentClaimReadResult.Invalid(ToErrorDictionary(errors));
        }
        catch (BadHttpRequestException)
        {
            AddError(errors, "body", "A JSON object body is required.");
            return SettlementPaymentClaimReadResult.Invalid(ToErrorDictionary(errors));
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                AddError(errors, "body", "A JSON object body is required.");
                return SettlementPaymentClaimReadResult.Invalid(ToErrorDictionary(errors));
            }

            JsonElement amountElement = default;
            JsonElement currencyElement = default;
            JsonElement paymentDateElement = default;
            JsonElement proposedResidualPolicyElement = default;
            var hasAmount = false;
            var hasCurrency = false;
            var hasPaymentDate = false;
            var hasProposedResidualPolicy = false;

            foreach (var property in document.RootElement.EnumerateObject())
            {
                switch (property.Name)
                {
                    case "amount":
                        hasAmount = true;
                        amountElement = property.Value;
                        break;
                    case "currency":
                        hasCurrency = true;
                        currencyElement = property.Value;
                        break;
                    case "paymentDate":
                        hasPaymentDate = true;
                        paymentDateElement = property.Value;
                        break;
                    case "proposedResidualPolicy":
                        hasProposedResidualPolicy = true;
                        proposedResidualPolicyElement = property.Value;
                        break;
                    default:
                        AddUnsupportedFieldError(errors);
                        break;
                }
            }

            if (!hasAmount)
            {
                AddError(errors, "amount", "Amount is required.");
            }

            if (!hasCurrency)
            {
                AddError(errors, "currency", "Currency is required.");
            }

            if (!hasPaymentDate)
            {
                AddError(errors, "paymentDate", "Payment date is required.");
            }

            var currencyCode = hasCurrency ? ReadCurrency(currencyElement, errors) : null;
            var amount = hasAmount ? ReadMoneyAmount(amountElement, currencyCode, errors) : null;
            var paymentDate = hasPaymentDate ? ReadPaymentDate(paymentDateElement, errors) : null;
            var proposedResidualPolicy = hasProposedResidualPolicy
                ? ReadProposedResidualPolicy(proposedResidualPolicyElement, errors)
                : null;

            return errors.Count == 0 && amount.HasValue && currencyCode is not null && paymentDate.HasValue
                ? SettlementPaymentClaimReadResult.Valid(new SettlementPaymentClaimRequest(
                    amount.Value,
                    currencyCode.Value,
                    paymentDate.Value,
                    proposedResidualPolicy))
                : SettlementPaymentClaimReadResult.Invalid(ToErrorDictionary(errors));
        }
    }

    private static CurrencyCode? ReadCurrency(
        JsonElement value,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, "currency", "Currency must be an uppercase three-letter code.");
            return null;
        }

        var currency = value.GetString();
        if (!CurrencyCode.TryCreate(currency, out var currencyCode))
        {
            AddError(errors, "currency", "Currency must be an uppercase three-letter code.");
            return null;
        }

        var supportedResult = SupportedCurrencyPolicy.Default.ValidateSupported(currencyCode);
        if (!supportedResult.Succeeded)
        {
            AddError(errors, supportedResult.Field, supportedResult.Message);
            return null;
        }

        return currencyCode;
    }

    private static decimal? ReadMoneyAmount(
        JsonElement value,
        CurrencyCode? currencyCode,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, "amount", "Amount must be a plain base-10 decimal string.");
            return null;
        }

        if (currencyCode is null)
        {
            return null;
        }

        if (!SupportedCurrencyPolicy.Default.TryGetMinorUnitDigits(currencyCode, out var minorUnitDigits))
        {
            return null;
        }

        var validationResult = MoneyAmount.TryParse(
            value.GetString(),
            currencyCode,
            MoneyValidationOptions.Default with
            {
                AllowZero = false,
                AmountField = "amount",
                CurrencyField = "currency",
                MaxFractionalDigits = minorUnitDigits
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

    private static DateOnly? ReadPaymentDate(
        JsonElement value,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String
            || !DateOnly.TryParseExact(
                value.GetString(),
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var paymentDate))
        {
            AddError(errors, "paymentDate", "Payment date must be a yyyy-MM-dd date string.");
            return null;
        }

        return paymentDate;
    }

    private static string? ReadProposedResidualPolicy(
        JsonElement value,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, "proposedResidualPolicy", "Proposed residual policy must be a string.");
            return null;
        }

        var proposedResidualPolicy = value.GetString() ?? string.Empty;
        if (proposedResidualPolicy.Length > SettlementConstraints.ResidualPolicyMaxLength)
        {
            AddError(errors, "proposedResidualPolicy", "Proposed residual policy is too long.");
            return null;
        }

        return proposedResidualPolicy;
    }

    private static bool CanClaimPayment(string status)
    {
        return status is SettlementRequestStatuses.Requested
            or SettlementRequestStatuses.PartiallyPaid;
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : SettlementUnavailable();
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult SettlementUnavailable()
    {
        return Results.Problem(
            title: SettlementUnavailableTitle,
            detail: SettlementUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult InvalidSettlementPayment(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidSettlementPaymentTitle,
            detail: InvalidSettlementPaymentDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult SettlementPaymentConflict()
    {
        return Results.Problem(
            title: SettlementPaymentConflictTitle,
            detail: SettlementPaymentConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult SettlementPaymentWriteFailed()
    {
        return Results.Problem(
            title: SettlementPaymentWriteFailedTitle,
            detail: SettlementPaymentWriteFailedDetail,
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

    private static IDictionary<string, string[]> ToErrorDictionary(
        SettlementResidualPolicyFailure? failure)
    {
        if (failure is null)
        {
            return new Dictionary<string, string[]>(StringComparer.Ordinal)
            {
                ["proposedResidualPolicy"] = ["Residual policy is invalid."]
            };
        }

        return new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            [failure.Field] = [failure.Message]
        };
    }

    private sealed record SettlementPaymentClaimRequest(
        decimal Amount,
        string Currency,
        DateOnly PaymentDate,
        string? ProposedResidualPolicy);

    private sealed class SettlementPaymentClaimReadResult
    {
        private SettlementPaymentClaimReadResult(
            SettlementPaymentClaimRequest? request,
            IDictionary<string, string[]> errors)
        {
            Request = request;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public SettlementPaymentClaimRequest? Request { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static SettlementPaymentClaimReadResult Valid(SettlementPaymentClaimRequest request)
        {
            return new SettlementPaymentClaimReadResult(
                request,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static SettlementPaymentClaimReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new SettlementPaymentClaimReadResult(null, errors);
        }
    }
}
