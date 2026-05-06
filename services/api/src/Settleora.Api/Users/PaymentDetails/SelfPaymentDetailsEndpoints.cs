using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Users.PaymentDetails;

internal static partial class SelfPaymentDetailsEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string PaymentDetailsUnavailableTitle = "Payment details unavailable";
    private const string PaymentDetailsUnavailableDetail = "The requested payment details are unavailable.";
    private const string InvalidPaymentDetailsUpdateTitle = "Invalid payment details update";
    private const string InvalidPaymentDetailsUpdateDetail = "The submitted payment details update is invalid.";
    private const string PaymentDetailsUpdateFailedTitle = "Payment details update failed";
    private const string PaymentDetailsUpdateFailedDetail = "Unable to complete payment details update.";

    private const string PaymentDetailsCreatedAction = "payment_details.created";
    private const string PaymentDetailsUpdatedAction = "payment_details.updated";
    private const string PaymentDetailsVisibilityChangedAction = "payment_details.visibility_changed";

    public static WebApplication MapSelfPaymentDetailsEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/users/me/payment-details", GetSelfPaymentDetailsAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        app.MapPatch("/api/v1/users/me/payment-details", UpdateSelfPaymentDetailsAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        MapSelfPaymentDetailsQrEndpoints(app);

        return app;
    }

    private static async Task<IResult> GetSelfPaymentDetailsAsync(
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

        var paymentProfile = await LoadActivePaymentProfileAsync(
            dbContext,
            actor.UserProfileId,
            trackChanges: false,
            cancellationToken);

        return Results.Ok(MapResponse(paymentProfile));
    }

    private static async Task<IResult> UpdateSelfPaymentDetailsAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IPaymentDetailsAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var patchResult = await ReadPatchAsync(request, cancellationToken);
        if (!patchResult.Succeeded || patchResult.Patch is null)
        {
            return InvalidPaymentDetailsUpdate(patchResult.Errors);
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var now = timeProvider.GetUtcNow();
        var patch = patchResult.Patch;
        var paymentProfile = await LoadActivePaymentProfileAsync(
            dbContext,
            actor.UserProfileId,
            trackChanges: true,
            cancellationToken);
        var isCreated = paymentProfile is null;

        if (paymentProfile is null)
        {
            paymentProfile = new UserPaymentProfile
            {
                Id = Guid.NewGuid(),
                UserProfileId = actor.UserProfileId,
                Visibility = patch.HasVisibility
                    ? patch.Visibility!
                    : UserPaymentProfileVisibilities.Default,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };
            dbContext.Set<UserPaymentProfile>().Add(paymentProfile);
        }

        var previousVisibility = paymentProfile.Visibility;
        var changedFields = new SortedSet<string>(StringComparer.Ordinal);

        if (patch.HasPreferredMethodLabel)
        {
            paymentProfile.PreferredMethodLabel = patch.PreferredMethodLabel;
            changedFields.Add("preferred_method_label");
        }

        if (patch.HasPaymentHandle)
        {
            paymentProfile.PaymentHandle = patch.PaymentHandle;
            changedFields.Add("payment_handle");
        }

        if (patch.HasPaymentNote)
        {
            paymentProfile.PaymentNote = patch.PaymentNote;
            changedFields.Add("payment_note");
        }

        if (patch.HasVisibility)
        {
            paymentProfile.Visibility = patch.Visibility!;
            changedFields.Add("visibility");
        }

        paymentProfile.UpdatedAtUtc = now;

        if (isCreated)
        {
            await auditWriter.WriteAsync(
                new PaymentDetailsAuditEvent(
                    PaymentDetailsCreatedAction,
                    actor.AuthAccountId,
                    actor.AuthAccountId,
                    paymentProfile.Id,
                    RowCreated: true,
                    changedFields.ToArray(),
                    PreviousVisibility: null,
                    NewVisibility: paymentProfile.Visibility,
                    now),
                cancellationToken);
        }
        else
        {
            await auditWriter.WriteAsync(
                new PaymentDetailsAuditEvent(
                    PaymentDetailsUpdatedAction,
                    actor.AuthAccountId,
                    actor.AuthAccountId,
                    paymentProfile.Id,
                    RowCreated: false,
                    changedFields.ToArray(),
                    PreviousVisibility: null,
                    NewVisibility: null,
                    now),
                cancellationToken);
        }

        if (!StringComparer.Ordinal.Equals(previousVisibility, paymentProfile.Visibility))
        {
            await auditWriter.WriteAsync(
                new PaymentDetailsAuditEvent(
                    PaymentDetailsVisibilityChangedAction,
                    actor.AuthAccountId,
                    actor.AuthAccountId,
                    paymentProfile.Id,
                    RowCreated: isCreated,
                    ["visibility"],
                    previousVisibility,
                    paymentProfile.Visibility,
                    now),
                cancellationToken);
        }

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return PaymentDetailsUpdateFailed();
        }

        return Results.Ok(MapResponse(paymentProfile));
    }

    private static async Task<UserPaymentProfile?> LoadActivePaymentProfileAsync(
        SettleoraDbContext dbContext,
        Guid userProfileId,
        bool trackChanges,
        CancellationToken cancellationToken)
    {
        var paymentProfiles = dbContext.Set<UserPaymentProfile>()
            .Include(paymentProfile => paymentProfile.QrFileObject)
            .Where(paymentProfile => paymentProfile.UserProfileId == userProfileId
                && paymentProfile.DeletedAtUtc == null
                && paymentProfile.UserProfile.DeletedAtUtc == null);

        if (!trackChanges)
        {
            paymentProfiles = paymentProfiles.AsNoTracking();
        }

        return await paymentProfiles.SingleOrDefaultAsync(cancellationToken);
    }

    private static async Task<PaymentDetailsPatchReadResult> ReadPatchAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        if (!request.HasJsonContentType())
        {
            errors["body"] = ["A JSON object body is required."];
            return PaymentDetailsPatchReadResult.Invalid(errors);
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
            errors["body"] = ["A JSON object body is required."];
            return PaymentDetailsPatchReadResult.Invalid(errors);
        }
        catch (BadHttpRequestException)
        {
            errors["body"] = ["A JSON object body is required."];
            return PaymentDetailsPatchReadResult.Invalid(errors);
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                errors["body"] = ["A JSON object body is required."];
                return PaymentDetailsPatchReadResult.Invalid(errors);
            }

            var patch = new PaymentDetailsPatch();
            var recognizedFieldCount = 0;

            foreach (var property in document.RootElement.EnumerateObject())
            {
                switch (property.Name)
                {
                    case "preferredMethodLabel":
                        recognizedFieldCount++;
                        ReadPreferredMethodLabel(property.Value, patch, errors);
                        break;
                    case "paymentHandle":
                        recognizedFieldCount++;
                        ReadPaymentHandle(property.Value, patch, errors);
                        break;
                    case "paymentNote":
                        recognizedFieldCount++;
                        ReadPaymentNote(property.Value, patch, errors);
                        break;
                    case "visibility":
                        recognizedFieldCount++;
                        ReadVisibility(property.Value, patch, errors);
                        break;
                    default:
                        AddUnsupportedFieldError(errors);
                        break;
                }
            }

            if (recognizedFieldCount == 0 && !errors.ContainsKey("body"))
            {
                errors["body"] = ["At least one supported payment details field is required."];
            }

            return errors.Count == 0
                ? PaymentDetailsPatchReadResult.Valid(patch)
                : PaymentDetailsPatchReadResult.Invalid(errors);
        }
    }

    private static void AddUnsupportedFieldError(Dictionary<string, string[]> errors)
    {
        errors["body"] = ["Unsupported fields are not allowed."];
    }

    private static void ReadPreferredMethodLabel(
        JsonElement value,
        PaymentDetailsPatch patch,
        Dictionary<string, string[]> errors)
    {
        var result = ReadNullableText(
            value,
            "preferredMethodLabel",
            "Preferred method label",
            UserPaymentProfileConstraints.PreferredMethodLabelMaxLength,
            errors);
        if (result.Succeeded)
        {
            patch.HasPreferredMethodLabel = true;
            patch.PreferredMethodLabel = result.Value;
        }
    }

    private static void ReadPaymentHandle(
        JsonElement value,
        PaymentDetailsPatch patch,
        Dictionary<string, string[]> errors)
    {
        var result = ReadNullableText(
            value,
            "paymentHandle",
            "Payment handle",
            UserPaymentProfileConstraints.PaymentHandleMaxLength,
            errors);
        if (result.Succeeded)
        {
            patch.HasPaymentHandle = true;
            patch.PaymentHandle = result.Value;
        }
    }

    private static void ReadPaymentNote(
        JsonElement value,
        PaymentDetailsPatch patch,
        Dictionary<string, string[]> errors)
    {
        var result = ReadNullableText(
            value,
            "paymentNote",
            "Payment note",
            UserPaymentProfileConstraints.PaymentNoteMaxLength,
            errors);
        if (result.Succeeded)
        {
            patch.HasPaymentNote = true;
            patch.PaymentNote = result.Value;
        }
    }

    private static NullableTextReadResult ReadNullableText(
        JsonElement value,
        string errorKey,
        string displayName,
        int maxLength,
        Dictionary<string, string[]> errors)
    {
        if (value.ValueKind is JsonValueKind.Null)
        {
            return NullableTextReadResult.Valid(null);
        }

        if (value.ValueKind is not JsonValueKind.String)
        {
            errors[errorKey] = [$"{displayName} must be a string or null."];
            return NullableTextReadResult.Invalid();
        }

        var text = value.GetString()!.Trim();
        if (text.Length == 0)
        {
            return NullableTextReadResult.Valid(null);
        }

        if (text.Length > maxLength)
        {
            errors[errorKey] = [$"{displayName} must be {maxLength} characters or fewer."];
            return NullableTextReadResult.Invalid();
        }

        return NullableTextReadResult.Valid(text);
    }

    private static void ReadVisibility(
        JsonElement value,
        PaymentDetailsPatch patch,
        Dictionary<string, string[]> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            errors["visibility"] = ["Payment details visibility must be a supported string."];
            return;
        }

        var visibility = value.GetString();
        if (visibility is null || !UserPaymentProfileVisibilities.IsSupported(visibility))
        {
            errors["visibility"] = ["Payment details visibility is not supported."];
            return;
        }

        patch.HasVisibility = true;
        patch.Visibility = visibility;
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : PaymentDetailsUnavailable();
    }

    private static SelfPaymentDetailsResponse MapResponse(UserPaymentProfile? paymentProfile)
    {
        return paymentProfile is null
            ? new SelfPaymentDetailsResponse(
                IsConfigured: false,
                Id: null,
                PreferredMethodLabel: null,
                PaymentHandle: null,
                PaymentNote: null,
                Visibility: UserPaymentProfileVisibilities.Default,
                QrFile: null,
                CreatedAtUtc: null,
                UpdatedAtUtc: null)
            : new SelfPaymentDetailsResponse(
                IsConfigured: true,
                paymentProfile.Id,
                paymentProfile.PreferredMethodLabel,
                paymentProfile.PaymentHandle,
                paymentProfile.PaymentNote,
                paymentProfile.Visibility,
                MapQrFileResponse(paymentProfile.QrFileObject, paymentProfile.UserProfileId),
                paymentProfile.CreatedAtUtc,
                paymentProfile.UpdatedAtUtc);
    }

    private static SelfPaymentDetailsQrFileResponse? MapQrFileResponse(
        FileObject? fileObject,
        Guid ownerUserProfileId)
    {
        if (fileObject is null
            || fileObject.DeletedAtUtc is not null
            || fileObject.OwnerUserProfileId != ownerUserProfileId
            || fileObject.CreatedByUserProfileId != ownerUserProfileId
            || !StringComparer.Ordinal.Equals(fileObject.Purpose, FileObjectPurposes.PaymentQr)
            || !StringComparer.Ordinal.Equals(fileObject.Status, FileObjectStatuses.Active))
        {
            return null;
        }

        return new SelfPaymentDetailsQrFileResponse(
            fileObject.Id,
            fileObject.ContentType,
            fileObject.SizeBytes,
            fileObject.UpdatedAtUtc);
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult PaymentDetailsUnavailable()
    {
        return Results.Problem(
            title: PaymentDetailsUnavailableTitle,
            detail: PaymentDetailsUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult InvalidPaymentDetailsUpdate(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidPaymentDetailsUpdateTitle,
            detail: InvalidPaymentDetailsUpdateDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult PaymentDetailsUpdateFailed()
    {
        return Results.Problem(
            title: PaymentDetailsUpdateFailedTitle,
            detail: PaymentDetailsUpdateFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private sealed class PaymentDetailsPatch
    {
        public bool HasPreferredMethodLabel { get; set; }

        public string? PreferredMethodLabel { get; set; }

        public bool HasPaymentHandle { get; set; }

        public string? PaymentHandle { get; set; }

        public bool HasPaymentNote { get; set; }

        public string? PaymentNote { get; set; }

        public bool HasVisibility { get; set; }

        public string? Visibility { get; set; }
    }

    private sealed class PaymentDetailsPatchReadResult
    {
        private PaymentDetailsPatchReadResult(
            PaymentDetailsPatch? patch,
            IDictionary<string, string[]> errors)
        {
            Patch = patch;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public PaymentDetailsPatch? Patch { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static PaymentDetailsPatchReadResult Valid(PaymentDetailsPatch patch)
        {
            return new PaymentDetailsPatchReadResult(
                patch,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static PaymentDetailsPatchReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new PaymentDetailsPatchReadResult(null, errors);
        }
    }

    private readonly record struct NullableTextReadResult(bool Succeeded, string? Value)
    {
        public static NullableTextReadResult Valid(string? value)
        {
            return new NullableTextReadResult(true, value);
        }

        public static NullableTextReadResult Invalid()
        {
            return new NullableTextReadResult(false, null);
        }
    }
}
