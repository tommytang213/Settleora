using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.Reconciliation;

internal static class ExpenseBillReconciliationEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string BillReconciliationUnavailableTitle = "Bill reconciliation unavailable";
    private const string BillReconciliationUnavailableDetail = "The requested bill reconciliation is unavailable.";
    private const string InvalidReconciliationRequestTitle = "Invalid reconciliation request";
    private const string InvalidReconciliationRequestDetail = "The submitted reconciliation request is invalid.";
    private const string ReconciliationWriteFailedTitle = "Reconciliation write failed";
    private const string ReconciliationWriteFailedDetail = "Unable to complete reconciliation write.";
    private const string ReconciliationUpdatedAction = "bill.reconciliation_updated";
    private const string PersonalGroupMode = "personal";
    private const string GroupMode = "group";

    public static WebApplication MapExpenseBillReconciliationEndpoints(this WebApplication app)
    {
        app.MapPatch("/api/v1/bills/{billId:guid}/reconciliation", UpdatePersonalBillReconciliationAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapPatch("/api/v1/groups/{groupId:guid}/bills/{billId:guid}/reconciliation", UpdateGroupBillReconciliationAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        return app;
    }

    private static async Task<IResult> UpdatePersonalBillReconciliationAsync(
        Guid billId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IExpenseBillReconciliationAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var readResult = await ReadUpdateRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.Request is null)
        {
            return InvalidReconciliationRequest(readResult.Errors);
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var bill = await dbContext.Set<ExpenseBill>()
            .Include(candidate => candidate.CreatedByUserProfile)
            .SingleOrDefaultAsync(
                candidate => candidate.Id == billId
                    && candidate.GroupId == null
                    && candidate.ArchivedAtUtc == null
                    && candidate.CreatedByUserProfile.DeletedAtUtc == null
                    && (candidate.BillOwnerUserProfileId == actor.UserProfileId
                        || candidate.CreatedByUserProfileId == actor.UserProfileId),
                cancellationToken);
        if (bill is null)
        {
            return BillReconciliationUnavailable();
        }

        return await ApplyReconciliationUpdateAsync(
            bill,
            readResult.Request,
            actor,
            PersonalGroupMode,
            auditWriter,
            dbContext,
            timeProvider,
            cancellationToken);
    }

    private static async Task<IResult> UpdateGroupBillReconciliationAsync(
        Guid groupId,
        Guid billId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IExpenseBillReconciliationAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var readResult = await ReadUpdateRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.Request is null)
        {
            return InvalidReconciliationRequest(readResult.Errors);
        }

        var authorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
            groupId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var bill = await dbContext.Set<ExpenseBill>()
            .Include(candidate => candidate.Group)
            .Include(candidate => candidate.CreatedByUserProfile)
            .SingleOrDefaultAsync(
                candidate => candidate.Id == billId
                    && candidate.GroupId == groupId
                    && candidate.ArchivedAtUtc == null
                    && candidate.Group != null
                    && candidate.Group.DeletedAtUtc == null
                    && candidate.CreatedByUserProfile.DeletedAtUtc == null,
                cancellationToken);
        if (bill is null)
        {
            return BillReconciliationUnavailable();
        }

        return await ApplyReconciliationUpdateAsync(
            bill,
            readResult.Request,
            actor,
            GroupMode,
            auditWriter,
            dbContext,
            timeProvider,
            cancellationToken);
    }

    private static async Task<IResult> ApplyReconciliationUpdateAsync(
        ExpenseBill bill,
        ReconciliationUpdateRequest updateRequest,
        AuthenticatedActor actor,
        string groupMode,
        IExpenseBillReconciliationAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var previousStatus = bill.ReconciliationStatus;
        var now = timeProvider.GetUtcNow();

        bill.ReconciliationStatus = updateRequest.Status;
        bill.ReconciliationUpdatedAtUtc = now;
        bill.ReconciliationUpdatedByUserProfileId = actor.UserProfileId;
        bill.ReconciledAtUtc = updateRequest.Status is ExpenseBillReconciliationStatuses.Reconciled
            ? now
            : null;
        if (updateRequest.NoteWasSupplied)
        {
            bill.ReconciliationNote = updateRequest.Note;
        }

        await auditWriter.WriteAsync(
            new ExpenseBillReconciliationAuditEvent(
                ReconciliationUpdatedAction,
                actor.AuthAccountId,
                actor.AuthAccountId,
                bill.Id,
                bill.GroupId,
                groupMode,
                bill.Status,
                previousStatus,
                bill.ReconciliationStatus,
                bill.TotalCurrency,
                bill.TotalAmount,
                now),
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return ReconciliationWriteFailed();
        }

        return Results.Ok(MapReconciliationResponse(bill));
    }

    private static async Task<ReconciliationUpdateReadResult> ReadUpdateRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        if (!request.HasJsonContentType())
        {
            AddError(errors, "body", "A JSON object body is required.");
            return ReconciliationUpdateReadResult.Invalid(ToErrorDictionary(errors));
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
            return ReconciliationUpdateReadResult.Invalid(ToErrorDictionary(errors));
        }
        catch (BadHttpRequestException)
        {
            AddError(errors, "body", "A JSON object body is required.");
            return ReconciliationUpdateReadResult.Invalid(ToErrorDictionary(errors));
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                AddError(errors, "body", "A JSON object body is required.");
                return ReconciliationUpdateReadResult.Invalid(ToErrorDictionary(errors));
            }

            string? status = null;
            var hasStatus = false;
            var noteWasSupplied = false;
            string? note = null;

            foreach (var property in document.RootElement.EnumerateObject())
            {
                switch (property.Name)
                {
                    case "status":
                        hasStatus = true;
                        status = ReadStatus(property.Value, errors);
                        break;
                    case "note":
                        noteWasSupplied = true;
                        note = ReadNullableText(
                            property.Value,
                            "note",
                            "Reconciliation note",
                            ExpenseBillConstraints.BillReconciliationNoteMaxLength,
                            errors);
                        break;
                    default:
                        AddUnsupportedFieldError(errors);
                        break;
                }
            }

            if (!hasStatus)
            {
                AddError(errors, "status", "Reconciliation status is required.");
            }

            return errors.Count == 0 && status is not null
                ? ReconciliationUpdateReadResult.Valid(new ReconciliationUpdateRequest(
                    status,
                    noteWasSupplied,
                    note))
                : ReconciliationUpdateReadResult.Invalid(ToErrorDictionary(errors));
        }
    }

    private static string? ReadStatus(
        JsonElement value,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, "status", "Reconciliation status is not supported.");
            return null;
        }

        var status = value.GetString();
        if (!ExpenseBillReconciliationStatuses.IsSupported(status))
        {
            AddError(errors, "status", "Reconciliation status is not supported.");
            return null;
        }

        return status;
    }

    private static string? ReadNullableText(
        JsonElement value,
        string errorKey,
        string displayName,
        int maxLength,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is JsonValueKind.Null)
        {
            return null;
        }

        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, errorKey, $"{displayName} must be a string or null.");
            return null;
        }

        var text = value.GetString()!.Trim();
        if (text.Length == 0)
        {
            return null;
        }

        if (text.Length > maxLength)
        {
            AddError(errors, errorKey, $"{displayName} must be {maxLength} characters or fewer.");
            return null;
        }

        return text;
    }

    internal static ExpenseBillReconciliationResponse MapReconciliationResponse(ExpenseBill bill)
    {
        return new ExpenseBillReconciliationResponse(
            bill.ReconciliationStatus,
            bill.ReconciliationUpdatedAtUtc,
            bill.ReconciliationUpdatedByUserProfileId,
            bill.ReconciledAtUtc,
            bill.ReconciliationNote);
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : BillReconciliationUnavailable();
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult BillReconciliationUnavailable()
    {
        return Results.Problem(
            title: BillReconciliationUnavailableTitle,
            detail: BillReconciliationUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult InvalidReconciliationRequest(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidReconciliationRequestTitle,
            detail: InvalidReconciliationRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult ReconciliationWriteFailed()
    {
        return Results.Problem(
            title: ReconciliationWriteFailedTitle,
            detail: ReconciliationWriteFailedDetail,
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

    private sealed record ReconciliationUpdateRequest(
        string Status,
        bool NoteWasSupplied,
        string? Note);

    private sealed class ReconciliationUpdateReadResult
    {
        private ReconciliationUpdateReadResult(
            ReconciliationUpdateRequest? request,
            IDictionary<string, string[]> errors)
        {
            Request = request;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public ReconciliationUpdateRequest? Request { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static ReconciliationUpdateReadResult Valid(ReconciliationUpdateRequest request)
        {
            return new ReconciliationUpdateReadResult(
                request,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static ReconciliationUpdateReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new ReconciliationUpdateReadResult(null, errors);
        }
    }
}
