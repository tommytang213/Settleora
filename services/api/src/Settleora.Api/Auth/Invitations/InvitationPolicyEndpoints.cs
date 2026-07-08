using System.Text.Json;
using Settleora.Api.Auth.Authorization;

namespace Settleora.Api.Auth.Invitations;

internal static class InvitationPolicyEndpoints
{
    private const string InvalidPolicyRequestTitle = "Invalid invitation policy request";
    private const string InvalidPolicyRequestDetail = "The submitted invitation policy request is invalid.";

    public static WebApplication MapInvitationPolicyEndpoints(this WebApplication app)
    {
        app.MapGet(
                "/api/v1/auth/invitations/capability",
                GetCapabilityAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        var adminPolicy = app.MapGroup("/api/v1/admin/auth/invitation-policy")
            .RequireAuthorization(SettleoraAuthorizationPolicies.SystemRoleOwnerOrAdmin);

        adminPolicy.MapGet("", GetAdminPolicyAsync);
        adminPolicy.MapPatch("", UpdateAdminPolicyAsync);

        return app;
    }

    private static async Task<IResult> GetCapabilityAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IInvitationPolicyService invitationPolicyService,
        CancellationToken cancellationToken)
    {
        if (request.Query.Count > 0 || RequestHasBody(request))
        {
            return InvalidPolicyRequest();
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Results.Unauthorized();
        }

        return Results.Ok(await invitationPolicyService.GetCapabilityReadoutAsync(actor, cancellationToken));
    }

    private static async Task<IResult> GetAdminPolicyAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IInvitationPolicyService invitationPolicyService,
        CancellationToken cancellationToken)
    {
        if (request.Query.Count > 0 || RequestHasBody(request))
        {
            return InvalidPolicyRequest();
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Results.Unauthorized();
        }

        return Results.Ok(await invitationPolicyService.GetAdminPolicyReadoutAsync(actor, cancellationToken));
    }

    private static async Task<IResult> UpdateAdminPolicyAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IInvitationPolicyService invitationPolicyService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Results.Unauthorized();
        }

        var readResult = await ReadUpdateRequestAsync(request, cancellationToken);
        if (readResult.Request is null)
        {
            return InvalidPolicyRequest(readResult.Errors);
        }

        try
        {
            var updateResult = await invitationPolicyService.UpdatePolicyAsync(
                actor,
                readResult.Request,
                cancellationToken);
            return Results.Ok(updateResult.Readout);
        }
        catch (InvalidInvitationPolicyRequestException)
        {
            return InvalidPolicyRequest();
        }
    }

    private static async Task<PolicyUpdateRequestReadResult> ReadUpdateRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        if (!request.HasJsonContentType())
        {
            errors["body"] = ["A JSON object body is required."];
            return new PolicyUpdateRequestReadResult(null, errors);
        }

        JsonDocument document;
        try
        {
            document = await JsonDocument.ParseAsync(request.Body, cancellationToken: cancellationToken);
        }
        catch (JsonException)
        {
            errors["body"] = ["A JSON object body is required."];
            return new PolicyUpdateRequestReadResult(null, errors);
        }
        catch (BadHttpRequestException)
        {
            errors["body"] = ["A JSON object body is required."];
            return new PolicyUpdateRequestReadResult(null, errors);
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                errors["body"] = ["A JSON object body is required."];
                return new PolicyUpdateRequestReadResult(null, errors);
            }

            string? capabilityState = null;
            bool? pendingGrace = null;
            var seen = 0;

            foreach (var property in document.RootElement.EnumerateObject())
            {
                seen++;
                switch (property.Name)
                {
                    case "capabilityState":
                        capabilityState = ReadCapabilityState(property.Value, errors);
                        break;
                    case "pendingInviteGraceWhenDisabled":
                        pendingGrace = ReadNullableBoolean(property.Value, errors);
                        break;
                    default:
                        errors["body"] = ["Unsupported fields are not allowed."];
                        break;
                }
            }

            if (seen == 0)
            {
                errors["body"] = ["At least one supported policy field is required."];
            }

            return errors.Count == 0
                ? new PolicyUpdateRequestReadResult(
                    new AdminInvitationPolicyUpdateRequest(capabilityState, pendingGrace),
                    errors)
                : new PolicyUpdateRequestReadResult(null, errors);
        }
    }

    private static string? ReadCapabilityState(JsonElement value, Dictionary<string, string[]> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            errors["capabilityState"] = ["Capability state must be a string."];
            return null;
        }

        var capabilityState = value.GetString();
        if (capabilityState is not "disabled" and not "enabled")
        {
            errors["capabilityState"] = ["Capability state must be disabled or enabled."];
            return null;
        }

        return capabilityState;
    }

    private static bool? ReadNullableBoolean(JsonElement value, Dictionary<string, string[]> errors)
    {
        if (value.ValueKind is JsonValueKind.True)
        {
            return true;
        }

        if (value.ValueKind is JsonValueKind.False)
        {
            return false;
        }

        errors["pendingInviteGraceWhenDisabled"] = ["Pending invitation grace must be a boolean."];
        return null;
    }

    private static IResult InvalidPolicyRequest(
        Dictionary<string, string[]>? errors = null)
    {
        return Results.ValidationProblem(
            errors ?? new Dictionary<string, string[]>(StringComparer.Ordinal)
            {
                ["body"] = ["The submitted invitation policy request is invalid."]
            },
            title: InvalidPolicyRequestTitle,
            detail: InvalidPolicyRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static bool RequestHasBody(HttpRequest request)
    {
        return (request.ContentLength ?? 0) > 0
            || request.Headers.ContainsKey("Transfer-Encoding");
    }

    private sealed record PolicyUpdateRequestReadResult(
        AdminInvitationPolicyUpdateRequest? Request,
        Dictionary<string, string[]> Errors);
}
