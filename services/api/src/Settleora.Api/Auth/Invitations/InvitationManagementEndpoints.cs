using System.Text.Json;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Auth;

namespace Settleora.Api.Auth.Invitations;

internal static class InvitationManagementEndpoints
{
    private const string InvalidInvitationRequestTitle = "Invalid invitation request";
    private const string InvalidInvitationRequestDetail = "The submitted invitation request is invalid.";
    private const string InvitationConflictTitle = "Invitation conflict";
    private const string InvitationConflictDetail = "The requested invitation operation conflicts with current invitation policy or lifecycle state.";
    private const string InvitationUnavailableTitle = "Invitation unavailable";
    private const string InvitationUnavailableDetail = "The requested invitation is unavailable.";
    private const string InvitationCapabilityDisabledTitle = "Invitation capability disabled";
    private const string InvitationCapabilityDisabledDetail = "Invitation creation or resend is disabled by current policy.";
    private const string TooManyInvitationAttemptsTitle = "Too many invitation attempts";
    private const string TooManyInvitationAttemptsDetail = "Too many invitation attempts. Try again later.";
    private const int DefaultListLimit = 50;
    private const int MaxListLimit = 200;

    public static WebApplication MapInvitationManagementEndpoints(this WebApplication app)
    {
        var adminInvitations = app.MapGroup("/api/v1/admin/auth/invitations")
            .RequireAuthorization(SettleoraAuthorizationPolicies.SystemRoleOwnerOrAdmin);

        adminInvitations.MapGet("", ListInvitationsAsync);
        adminInvitations.MapPost("", CreateInvitationAsync);
        adminInvitations.MapGet("/{invitationId:guid}", GetInvitationAsync);
        adminInvitations.MapPost("/{invitationId:guid}/revoke", RevokeInvitationAsync);
        adminInvitations.MapPost("/{invitationId:guid}/resend", ResendInvitationAsync);

        return app;
    }

    private static async Task<IResult> ListInvitationsAsync(
        HttpRequest request,
        IInvitationManagementService invitationManagementService,
        CancellationToken cancellationToken)
    {
        if (RequestHasBody(request))
        {
            return InvalidInvitationRequest();
        }

        var filters = ReadListFilters(request);
        if (filters.Filters is null)
        {
            return InvalidInvitationRequest(filters.Errors);
        }

        return Results.Ok(await invitationManagementService.ListInvitationsAsync(
            filters.Filters,
            cancellationToken));
    }

    private static async Task<IResult> CreateInvitationAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IInvitationManagementService invitationManagementService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Results.Unauthorized();
        }

        var readResult = await ReadCreateRequestAsync(request, cancellationToken);
        if (readResult.Request is null)
        {
            return InvalidInvitationRequest(readResult.Errors);
        }

        var result = await invitationManagementService.CreateInvitationAsync(
            actor,
            readResult.Request,
            cancellationToken);

        return result.Status switch
        {
            InvitationManagementResultStatus.Succeeded when result.Invitation is not null => Results.Created(
                $"/api/v1/admin/auth/invitations/{result.Invitation.Id:D}",
                new AdminInvitationResponse(result.Invitation)),
            InvitationManagementResultStatus.CapabilityDisabled => CapabilityDisabled(),
            InvitationManagementResultStatus.InvalidRequest => InvalidInvitationRequest(),
            InvitationManagementResultStatus.UnsupportedContactIdentifierKind => InvitationConflict(),
            InvitationManagementResultStatus.UnsupportedTargetSystemRole => InvitationConflict(),
            InvitationManagementResultStatus.DuplicatePendingInvitation => InvitationConflict(),
            InvitationManagementResultStatus.Throttled => TooManyInvitationAttempts(),
            _ => InvitationConflict()
        };
    }

    private static async Task<IResult> GetInvitationAsync(
        Guid invitationId,
        IInvitationManagementService invitationManagementService,
        CancellationToken cancellationToken)
    {
        var result = await invitationManagementService.GetInvitationAsync(invitationId, cancellationToken);
        return result.Status == InvitationManagementResultStatus.Succeeded && result.Invitation is not null
            ? Results.Ok(new AdminInvitationResponse(result.Invitation))
            : InvitationUnavailable();
    }

    private static async Task<IResult> RevokeInvitationAsync(
        HttpRequest request,
        Guid invitationId,
        ICurrentActorAccessor currentActorAccessor,
        IInvitationManagementService invitationManagementService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Results.Unauthorized();
        }

        var readResult = await ReadRevokeRequestAsync(request, cancellationToken);
        if (readResult.Request is null)
        {
            return InvalidInvitationRequest(readResult.Errors);
        }

        var result = await invitationManagementService.RevokeInvitationAsync(
            actor,
            invitationId,
            readResult.Request,
            cancellationToken);

        return result.Status switch
        {
            InvitationManagementResultStatus.Succeeded when result.Invitation is not null => Results.Ok(
                new AdminInvitationResponse(result.Invitation)),
            InvitationManagementResultStatus.NotFound => InvitationUnavailable(),
            InvitationManagementResultStatus.TerminalState => InvitationConflict(),
            _ => InvitationConflict()
        };
    }

    private static async Task<IResult> ResendInvitationAsync(
        HttpRequest request,
        Guid invitationId,
        ICurrentActorAccessor currentActorAccessor,
        IInvitationManagementService invitationManagementService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Results.Unauthorized();
        }

        var readResult = await ReadResendRequestAsync(request, cancellationToken);
        if (readResult.Request is null)
        {
            return InvalidInvitationRequest(readResult.Errors);
        }

        var result = await invitationManagementService.ResendInvitationAsync(
            actor,
            invitationId,
            readResult.Request,
            cancellationToken);

        return result.Status switch
        {
            InvitationManagementResultStatus.Succeeded when result.Invitation is not null => Results.Accepted(
                $"/api/v1/admin/auth/invitations/{result.Invitation.Id:D}",
                new AdminInvitationResponse(result.Invitation)),
            InvitationManagementResultStatus.CapabilityDisabled => CapabilityDisabled(),
            InvitationManagementResultStatus.NotFound => InvitationUnavailable(),
            InvitationManagementResultStatus.TerminalState => InvitationConflict(),
            InvitationManagementResultStatus.Throttled => TooManyInvitationAttempts(),
            _ => InvitationConflict()
        };
    }

    private static ListFilterReadResult ReadListFilters(HttpRequest request)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        var query = request.Query;

        var status = ReadOptionalString(query["status"].ToString(), "status", errors, 32);
        if (status is not null && status is not AuthInvitationStatuses.Pending
            and not AuthInvitationStatuses.Accepted
            and not AuthInvitationStatuses.Revoked
            and not AuthInvitationStatuses.Expired)
        {
            errors["status"] = ["Status filter is unsupported."];
        }

        var contactIdentifierKind = ReadOptionalString(
            query["contactIdentifierKind"].ToString(),
            "contactIdentifierKind",
            errors,
            32);
        if (contactIdentifierKind is not null && contactIdentifierKind != AuthInvitationContactIdentifierKinds.Email)
        {
            errors["contactIdentifierKind"] = ["Contact identifier kind filter is unsupported."];
        }

        var contactSearch = ReadOptionalString(query["contactSearch"].ToString(), "contactSearch", errors, 120);
        var createdFromUtc = ReadOptionalDateTime(query["createdFromUtc"].ToString(), "createdFromUtc", errors);
        var createdToUtc = ReadOptionalDateTime(query["createdToUtc"].ToString(), "createdToUtc", errors);
        var expiresBeforeUtc = ReadOptionalDateTime(query["expiresBeforeUtc"].ToString(), "expiresBeforeUtc", errors);
        var limit = DefaultListLimit;
        var limitValue = query["limit"].ToString();
        if (!string.IsNullOrEmpty(limitValue)
            && (!int.TryParse(limitValue, out limit) || limit is < 1 or > MaxListLimit))
        {
            errors["limit"] = ["Limit must be between 1 and 200."];
        }

        if (createdFromUtc is not null && createdToUtc is not null && createdFromUtc > createdToUtc)
        {
            errors["createdFromUtc"] = ["Created-from timestamp must be before created-to timestamp."];
        }

        return errors.Count == 0
            ? new ListFilterReadResult(
                new InvitationListFilters(
                    status,
                    contactIdentifierKind,
                    contactSearch,
                    createdFromUtc,
                    createdToUtc,
                    expiresBeforeUtc,
                    limit),
                errors)
            : new ListFilterReadResult(null, errors);
    }

    private static async Task<CreateRequestReadResult> ReadCreateRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        var document = await ReadJsonObjectAsync(request, errors, allowMissingBody: false, cancellationToken);
        if (document is null)
        {
            return new CreateRequestReadResult(null, errors);
        }

        using (document)
        {
            string? contactIdentifierKind = null;
            string? contactIdentifier = null;
            string? targetSystemRole = null;
            string? idempotencyKey = null;
            var deliveryRequested = true;
            var hasContactIdentifierKind = false;
            var hasContactIdentifier = false;
            var hasTargetSystemRole = false;

            foreach (var property in document.RootElement.EnumerateObject())
            {
                switch (property.Name)
                {
                    case "contactIdentifierKind":
                        hasContactIdentifierKind = true;
                        contactIdentifierKind = ReadString(property.Value, "contactIdentifierKind", errors, 32);
                        break;
                    case "contactIdentifier":
                        hasContactIdentifier = true;
                        contactIdentifier = ReadString(property.Value, "contactIdentifier", errors, 320);
                        break;
                    case "targetSystemRole":
                        hasTargetSystemRole = true;
                        targetSystemRole = ReadString(property.Value, "targetSystemRole", errors, 16);
                        break;
                    case "idempotencyKey":
                        idempotencyKey = ReadNullableString(property.Value, "idempotencyKey", errors, 120);
                        break;
                    case "deliveryRequested":
                        deliveryRequested = ReadBoolean(property.Value, "deliveryRequested", errors) ?? true;
                        break;
                    default:
                        errors["body"] = ["Unsupported fields are not allowed."];
                        break;
                }
            }

            AddMissingRequiredError(errors, hasContactIdentifierKind, "contactIdentifierKind");
            AddMissingRequiredError(errors, hasContactIdentifier, "contactIdentifier");
            AddMissingRequiredError(errors, hasTargetSystemRole, "targetSystemRole");

            return errors.Count == 0
                ? new CreateRequestReadResult(
                    new AdminInvitationCreateRequest(
                        contactIdentifierKind!,
                        contactIdentifier!,
                        targetSystemRole!,
                        idempotencyKey,
                        deliveryRequested),
                    errors)
                : new CreateRequestReadResult(null, errors);
        }
    }

    private static async Task<RevokeRequestReadResult> ReadRevokeRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        var document = await ReadJsonObjectAsync(request, errors, allowMissingBody: true, cancellationToken);
        if (document is null)
        {
            return errors.Count == 0
                ? new RevokeRequestReadResult(new AdminInvitationRevokeRequest(null), errors)
                : new RevokeRequestReadResult(null, errors);
        }

        using (document)
        {
            string? reason = null;
            foreach (var property in document.RootElement.EnumerateObject())
            {
                if (property.Name == "reason")
                {
                    reason = ReadNullableString(property.Value, "reason", errors, 160);
                }
                else
                {
                    errors["body"] = ["Unsupported fields are not allowed."];
                }
            }

            return errors.Count == 0
                ? new RevokeRequestReadResult(new AdminInvitationRevokeRequest(reason), errors)
                : new RevokeRequestReadResult(null, errors);
        }
    }

    private static async Task<ResendRequestReadResult> ReadResendRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        var document = await ReadJsonObjectAsync(request, errors, allowMissingBody: true, cancellationToken);
        if (document is null)
        {
            return errors.Count == 0
                ? new ResendRequestReadResult(new AdminInvitationResendRequest(DeliveryRequested: true), errors)
                : new ResendRequestReadResult(null, errors);
        }

        using (document)
        {
            var deliveryRequested = true;
            foreach (var property in document.RootElement.EnumerateObject())
            {
                if (property.Name == "deliveryRequested")
                {
                    deliveryRequested = ReadBoolean(property.Value, "deliveryRequested", errors) ?? true;
                }
                else
                {
                    errors["body"] = ["Unsupported fields are not allowed."];
                }
            }

            return errors.Count == 0
                ? new ResendRequestReadResult(new AdminInvitationResendRequest(deliveryRequested), errors)
                : new ResendRequestReadResult(null, errors);
        }
    }

    private static async Task<JsonDocument?> ReadJsonObjectAsync(
        HttpRequest request,
        Dictionary<string, string[]> errors,
        bool allowMissingBody,
        CancellationToken cancellationToken)
    {
        if (allowMissingBody && !RequestHasBody(request))
        {
            return null;
        }

        if (!request.HasJsonContentType())
        {
            errors["body"] = ["A JSON object body is required."];
            return null;
        }

        try
        {
            var document = await JsonDocument.ParseAsync(request.Body, cancellationToken: cancellationToken);
            if (document.RootElement.ValueKind is JsonValueKind.Object)
            {
                return document;
            }

            document.Dispose();
        }
        catch (JsonException)
        {
        }
        catch (BadHttpRequestException)
        {
        }

        errors["body"] = ["A JSON object body is required."];
        return null;
    }

    private static string? ReadString(
        JsonElement value,
        string fieldName,
        Dictionary<string, string[]> errors,
        int maxLength)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            errors[fieldName] = ["Value must be a string."];
            return null;
        }

        var text = value.GetString()!.Trim();
        if (text.Length is 0 || text.Length > maxLength)
        {
            errors[fieldName] = [$"Value must be between 1 and {maxLength} characters."];
            return null;
        }

        return text;
    }

    private static string? ReadNullableString(
        JsonElement value,
        string fieldName,
        Dictionary<string, string[]> errors,
        int maxLength)
    {
        if (value.ValueKind is JsonValueKind.Null)
        {
            return null;
        }

        return ReadString(value, fieldName, errors, maxLength);
    }

    private static bool? ReadBoolean(
        JsonElement value,
        string fieldName,
        Dictionary<string, string[]> errors)
    {
        if (value.ValueKind is JsonValueKind.True)
        {
            return true;
        }

        if (value.ValueKind is JsonValueKind.False)
        {
            return false;
        }

        errors[fieldName] = ["Value must be a boolean."];
        return null;
    }

    private static string? ReadOptionalString(
        string value,
        string fieldName,
        Dictionary<string, string[]> errors,
        int maxLength)
    {
        if (string.IsNullOrEmpty(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        if (trimmed.Length is 0 || trimmed.Length > maxLength)
        {
            errors[fieldName] = [$"Value must be between 1 and {maxLength} characters."];
            return null;
        }

        return trimmed;
    }

    private static DateTimeOffset? ReadOptionalDateTime(
        string value,
        string fieldName,
        Dictionary<string, string[]> errors)
    {
        if (string.IsNullOrEmpty(value))
        {
            return null;
        }

        if (DateTimeOffset.TryParse(value, out var timestamp))
        {
            return timestamp;
        }

        errors[fieldName] = ["Value must be a date-time."];
        return null;
    }

    private static void AddMissingRequiredError(
        Dictionary<string, string[]> errors,
        bool present,
        string fieldName)
    {
        if (!present)
        {
            errors[fieldName] = ["Value is required."];
        }
    }

    private static IResult InvalidInvitationRequest(Dictionary<string, string[]>? errors = null)
    {
        return Results.ValidationProblem(
            errors ?? new Dictionary<string, string[]>(StringComparer.Ordinal)
            {
                ["body"] = ["The submitted invitation request is invalid."]
            },
            title: InvalidInvitationRequestTitle,
            detail: InvalidInvitationRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult InvitationConflict()
    {
        return Results.Problem(
            title: InvitationConflictTitle,
            detail: InvitationConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult InvitationUnavailable()
    {
        return Results.Problem(
            title: InvitationUnavailableTitle,
            detail: InvitationUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult CapabilityDisabled()
    {
        return Results.Problem(
            title: InvitationCapabilityDisabledTitle,
            detail: InvitationCapabilityDisabledDetail,
            statusCode: StatusCodes.Status403Forbidden);
    }

    private static IResult TooManyInvitationAttempts()
    {
        return Results.Problem(
            title: TooManyInvitationAttemptsTitle,
            detail: TooManyInvitationAttemptsDetail,
            statusCode: StatusCodes.Status429TooManyRequests);
    }

    private static bool RequestHasBody(HttpRequest request)
    {
        return (request.ContentLength ?? 0) > 0
            || request.Headers.ContainsKey("Transfer-Encoding");
    }

    private sealed record ListFilterReadResult(
        InvitationListFilters? Filters,
        Dictionary<string, string[]> Errors);

    private sealed record CreateRequestReadResult(
        AdminInvitationCreateRequest? Request,
        Dictionary<string, string[]> Errors);

    private sealed record RevokeRequestReadResult(
        AdminInvitationRevokeRequest? Request,
        Dictionary<string, string[]> Errors);

    private sealed record ResendRequestReadResult(
        AdminInvitationResendRequest? Request,
        Dictionary<string, string[]> Errors);
}
