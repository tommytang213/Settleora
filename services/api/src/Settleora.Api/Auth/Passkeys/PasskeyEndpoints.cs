using Settleora.Api.Auth.Authorization;

namespace Settleora.Api.Auth.Passkeys;

internal static class PasskeyEndpoints
{
    private const string InvalidAuthRequestTitle = "Invalid auth request";
    private const string InvalidAuthRequestDetail = "The passkey request is invalid.";
    private const string UnsupportedFieldsDetail = "Unsupported fields are not allowed.";
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string DeniedTitle = "Passkey operation denied";
    private const string NotFoundTitle = "Passkey credential not found";
    private const string ConflictTitle = "Passkey challenge conflict";
    private const string VerificationFailedTitle = "Passkey verification failed";

    private static readonly HashSet<string> EnrollmentOptionsProperties = new(StringComparer.OrdinalIgnoreCase)
    {
        "displayLabel",
        "attestationPreference"
    };

    private static readonly HashSet<string> EnrollmentCompleteProperties = new(StringComparer.OrdinalIgnoreCase)
    {
        "passkeyChallengeId",
        "credential",
        "displayLabel"
    };

    private static readonly HashSet<string> CredentialUpdateProperties = new(StringComparer.OrdinalIgnoreCase)
    {
        "displayLabel"
    };

    private static readonly HashSet<string> SignInOptionsProperties = new(StringComparer.OrdinalIgnoreCase)
    {
        "identifierHint",
        "userVerification"
    };

    private static readonly HashSet<string> SignInCompleteProperties = new(StringComparer.OrdinalIgnoreCase)
    {
        "passkeyChallengeId",
        "credential",
        "deviceLabel"
    };

    private static readonly HashSet<string> StepUpOptionsProperties = new(StringComparer.OrdinalIgnoreCase)
    {
        "operationCategory"
    };

    private static readonly HashSet<string> StepUpCompleteProperties = new(StringComparer.OrdinalIgnoreCase)
    {
        "passkeyChallengeId",
        "credential"
    };

    public static WebApplication MapPasskeyEndpoints(this WebApplication app)
    {
        app.MapPost("/api/v1/auth/passkeys/enrollment/options", CreateEnrollmentOptionsAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapPost("/api/v1/auth/passkeys/enrollment/complete", CompleteEnrollmentAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapGet("/api/v1/auth/passkeys", ListCredentialsAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapPatch("/api/v1/auth/passkeys/{passkeyCredentialId:guid}", UpdateCredentialAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapDelete("/api/v1/auth/passkeys/{passkeyCredentialId:guid}", RevokeCredentialAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapPost("/api/v1/auth/passkeys/sign-in/options", CreateSignInOptionsAsync)
            .AllowAnonymous();
        app.MapPost("/api/v1/auth/passkeys/sign-in/complete", CompleteSignInAsync)
            .AllowAnonymous();
        app.MapPost("/api/v1/auth/step-up/passkeys/options", CreateStepUpOptionsAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapPost("/api/v1/auth/step-up/passkeys/complete", CompleteStepUpAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        return app;
    }

    private static async Task<IResult> CreateEnrollmentOptionsAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IPasskeyRuntimeService passkeyRuntimeService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var endpointRequest = await ReadJsonAsync<PasskeyEnrollmentOptionsRequest>(
            request,
            EnrollmentOptionsProperties,
            cancellationToken);
        if (endpointRequest.Result is not null)
        {
            return endpointRequest.Result;
        }

        var result = await passkeyRuntimeService.CreateEnrollmentOptionsAsync(
            actor,
            endpointRequest.Request ?? new PasskeyEnrollmentOptionsRequest(null, null),
            cancellationToken);
        return MapResult(result.Status, result.Response);
    }

    private static async Task<IResult> CompleteEnrollmentAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IPasskeyRuntimeService passkeyRuntimeService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var endpointRequest = await ReadJsonAsync<PasskeyEnrollmentCompleteRequest>(
            request,
            EnrollmentCompleteProperties,
            cancellationToken);
        if (endpointRequest.Result is not null)
        {
            return endpointRequest.Result;
        }

        if (endpointRequest.Request!.PasskeyChallengeId == Guid.Empty)
        {
            return InvalidRequest();
        }

        var result = await passkeyRuntimeService.CompleteEnrollmentAsync(
            actor,
            endpointRequest.Request,
            cancellationToken);
        return MapResult(result.Status, result.Response);
    }

    private static async Task<IResult> ListCredentialsAsync(
        ICurrentActorAccessor currentActorAccessor,
        IPasskeyRuntimeService passkeyRuntimeService,
        CancellationToken cancellationToken)
    {
        return currentActorAccessor.TryGetCurrentActor(out var actor)
            ? Results.Ok(await passkeyRuntimeService.ListCredentialsAsync(actor, cancellationToken))
            : Unauthenticated();
    }

    private static async Task<IResult> UpdateCredentialAsync(
        Guid passkeyCredentialId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IPasskeyRuntimeService passkeyRuntimeService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var endpointRequest = await ReadJsonAsync<PasskeyCredentialUpdateRequest>(
            request,
            CredentialUpdateProperties,
            cancellationToken);
        if (endpointRequest.Result is not null)
        {
            return endpointRequest.Result;
        }

        var result = await passkeyRuntimeService.UpdateCredentialAsync(
            actor,
            passkeyCredentialId,
            endpointRequest.Request!,
            cancellationToken);
        return MapResult(result.Status, result.Response);
    }

    private static async Task<IResult> RevokeCredentialAsync(
        Guid passkeyCredentialId,
        ICurrentActorAccessor currentActorAccessor,
        IPasskeyRuntimeService passkeyRuntimeService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var result = await passkeyRuntimeService.RevokeCredentialAsync(
            actor,
            passkeyCredentialId,
            cancellationToken);
        return result.Status switch
        {
            PasskeyServiceStatus.Succeeded => Results.NoContent(),
            PasskeyServiceStatus.NotFound => Problem(NotFoundTitle, "The passkey credential was not found.", StatusCodes.Status404NotFound),
            _ => MapResult(result.Status, response: null)
        };
    }

    private static async Task<IResult> CreateSignInOptionsAsync(
        HttpRequest request,
        IPasskeyRuntimeService passkeyRuntimeService,
        CancellationToken cancellationToken)
    {
        var endpointRequest = await ReadJsonAsync<PasskeySignInOptionsRequest>(
            request,
            SignInOptionsProperties,
            cancellationToken);
        if (endpointRequest.Result is not null)
        {
            return endpointRequest.Result;
        }

        var result = await passkeyRuntimeService.CreateSignInOptionsAsync(
            endpointRequest.Request ?? new PasskeySignInOptionsRequest(null, null),
            cancellationToken);
        return MapResult(result.Status, result.Response);
    }

    private static async Task<IResult> CompleteSignInAsync(
        HttpRequest request,
        IPasskeyRuntimeService passkeyRuntimeService,
        CancellationToken cancellationToken)
    {
        var endpointRequest = await ReadJsonAsync<PasskeySignInCompleteRequest>(
            request,
            SignInCompleteProperties,
            cancellationToken);
        if (endpointRequest.Result is not null)
        {
            return endpointRequest.Result;
        }

        if (endpointRequest.Request!.PasskeyChallengeId == Guid.Empty)
        {
            return InvalidRequest();
        }

        var result = await passkeyRuntimeService.CompleteSignInAsync(
            endpointRequest.Request,
            cancellationToken);
        return MapResult(result.Status, result.Response);
    }

    private static async Task<IResult> CreateStepUpOptionsAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IPasskeyRuntimeService passkeyRuntimeService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var endpointRequest = await ReadJsonAsync<PasskeyStepUpOptionsRequest>(
            request,
            StepUpOptionsProperties,
            cancellationToken);
        if (endpointRequest.Result is not null)
        {
            return endpointRequest.Result;
        }

        if (string.IsNullOrWhiteSpace(endpointRequest.Request!.OperationCategory))
        {
            return InvalidRequest();
        }

        var result = await passkeyRuntimeService.CreateStepUpOptionsAsync(
            actor,
            endpointRequest.Request,
            cancellationToken);
        return MapResult(result.Status, result.Response);
    }

    private static async Task<IResult> CompleteStepUpAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IPasskeyRuntimeService passkeyRuntimeService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var endpointRequest = await ReadJsonAsync<PasskeyStepUpCompleteRequest>(
            request,
            StepUpCompleteProperties,
            cancellationToken);
        if (endpointRequest.Result is not null)
        {
            return endpointRequest.Result;
        }

        if (endpointRequest.Request!.PasskeyChallengeId == Guid.Empty)
        {
            return InvalidRequest();
        }

        var result = await passkeyRuntimeService.CompleteStepUpAsync(
            actor,
            endpointRequest.Request,
            cancellationToken);
        return MapResult(result.Status, result.Response);
    }

    private static async Task<EndpointReadResult<TRequest>> ReadJsonAsync<TRequest>(
        HttpRequest request,
        ISet<string> allowedProperties,
        CancellationToken cancellationToken)
        where TRequest : class
    {
        if (!request.HasJsonContentType())
        {
            return new EndpointReadResult<TRequest>(null, InvalidRequest());
        }

        var readResult = await AuthEndpointRequestValidation.ReadLimitedJsonObjectAsync<TRequest>(
            request,
            allowedProperties,
            cancellationToken);
        return readResult.Status switch
        {
            AuthJsonRequestStatus.Valid when readResult.Request is not null =>
                new EndpointReadResult<TRequest>(readResult.Request, null),
            AuthJsonRequestStatus.UnsupportedFields =>
                new EndpointReadResult<TRequest>(null, Problem(InvalidAuthRequestTitle, UnsupportedFieldsDetail, StatusCodes.Status400BadRequest)),
            _ => new EndpointReadResult<TRequest>(null, InvalidRequest())
        };
    }

    private static IResult MapResult(PasskeyServiceStatus status, object? response)
    {
        return status switch
        {
            PasskeyServiceStatus.Succeeded when response is not null => Results.Ok(response),
            PasskeyServiceStatus.InvalidRequest => InvalidRequest(),
            PasskeyServiceStatus.NotFound => Problem(NotFoundTitle, "The passkey resource was not found.", StatusCodes.Status404NotFound),
            PasskeyServiceStatus.Denied => Problem(DeniedTitle, "The passkey operation was denied.", StatusCodes.Status403Forbidden),
            PasskeyServiceStatus.Conflict => Problem(ConflictTitle, "The passkey challenge is unavailable.", StatusCodes.Status409Conflict),
            PasskeyServiceStatus.VerificationFailed => Problem(VerificationFailedTitle, "Unable to verify the submitted passkey response.", StatusCodes.Status400BadRequest),
            _ => Problem("Passkey operation failed", "The passkey operation could not be completed.", StatusCodes.Status500InternalServerError)
        };
    }

    private static IResult InvalidRequest()
    {
        return Problem(InvalidAuthRequestTitle, InvalidAuthRequestDetail, StatusCodes.Status400BadRequest);
    }

    private static IResult Unauthenticated()
    {
        return Problem(UnauthenticatedTitle, UnauthenticatedDetail, StatusCodes.Status401Unauthorized);
    }

    private static IResult Problem(string title, string detail, int statusCode)
    {
        return Results.Problem(title: title, detail: detail, statusCode: statusCode);
    }

    private sealed record EndpointReadResult<TRequest>(TRequest? Request, IResult? Result)
        where TRequest : class;
}
