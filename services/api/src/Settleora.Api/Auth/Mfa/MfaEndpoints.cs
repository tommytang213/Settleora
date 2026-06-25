using Settleora.Api.Auth.Authorization;

namespace Settleora.Api.Auth.Mfa;

internal static class MfaEndpoints
{
    private const string InvalidAuthRequestTitle = "Invalid auth request";
    private const string InvalidAuthRequestDetail = "The MFA request is invalid.";
    private const string UnsupportedFieldsDetail = "Unsupported fields are not allowed.";
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string DeniedTitle = "MFA operation denied";
    private const string NotFoundTitle = "MFA resource not found";
    private const string ConflictTitle = "MFA challenge conflict";
    private const string VerificationFailedTitle = "MFA verification failed";

    private static readonly HashSet<string> TotpEnrollmentStartProperties = new(StringComparer.OrdinalIgnoreCase) { "displayLabel" };
    private static readonly HashSet<string> TotpVerifyProperties = new(StringComparer.OrdinalIgnoreCase) { "code" };
    private static readonly HashSet<string> FactorUpdateProperties = new(StringComparer.OrdinalIgnoreCase) { "displayLabel" };
    private static readonly HashSet<string> ChallengeCreateProperties = new(StringComparer.OrdinalIgnoreCase) { "purpose", "preferredFactorType", "pendingAuthFlowId", "operationCategory" };
    private static readonly HashSet<string> RecoveryVerifyProperties = new(StringComparer.OrdinalIgnoreCase) { "recoveryCode" };
    private static readonly HashSet<string> RecoveryGenerateProperties = new(StringComparer.OrdinalIgnoreCase) { "reasonCategory", "replaceExisting" };

    public static WebApplication MapMfaEndpoints(this WebApplication app)
    {
        app.MapPost("/api/v1/auth/totp/enrollment", StartTotpEnrollmentAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapPost("/api/v1/auth/totp/enrollment/{totpEnrollmentId:guid}/verify", VerifyTotpEnrollmentAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapDelete("/api/v1/auth/totp/enrollment/{totpEnrollmentId:guid}", CancelTotpEnrollmentAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapGet("/api/v1/auth/mfa/factors", ListFactorsAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapPatch("/api/v1/auth/mfa/factors/{mfaFactorId:guid}", UpdateFactorAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapDelete("/api/v1/auth/mfa/factors/{mfaFactorId:guid}", RevokeFactorAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapPost("/api/v1/auth/mfa/challenges", CreateChallengeAsync)
            .AllowAnonymous();
        app.MapPost("/api/v1/auth/mfa/challenges/{mfaChallengeId:guid}/totp/verify", VerifyTotpChallengeAsync)
            .AllowAnonymous();
        app.MapPost("/api/v1/auth/mfa/challenges/{mfaChallengeId:guid}/recovery-code/verify", VerifyRecoveryCodeChallengeAsync)
            .AllowAnonymous();
        app.MapPost("/api/v1/auth/recovery-codes", GenerateRecoveryCodesAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapGet("/api/v1/auth/recovery-codes", ListRecoveryCodeBatchesAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapDelete("/api/v1/auth/recovery-codes/{recoveryCodeBatchId:guid}", RevokeRecoveryCodeBatchAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        return app;
    }

    private static async Task<IResult> StartTotpEnrollmentAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IMfaRuntimeService mfaRuntimeService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var endpointRequest = await ReadJsonAsync<TotpEnrollmentStartRequest>(request, TotpEnrollmentStartProperties, cancellationToken);
        if (endpointRequest.Result is not null)
        {
            return endpointRequest.Result;
        }

        var result = await mfaRuntimeService.StartTotpEnrollmentAsync(
            actor,
            endpointRequest.Request ?? new TotpEnrollmentStartRequest(null),
            cancellationToken);
        return MapResult(result.Status, result.Response);
    }

    private static async Task<IResult> VerifyTotpEnrollmentAsync(
        Guid totpEnrollmentId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IMfaRuntimeService mfaRuntimeService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var endpointRequest = await ReadJsonAsync<TotpEnrollmentVerifyRequest>(request, TotpVerifyProperties, cancellationToken);
        if (endpointRequest.Result is not null)
        {
            return endpointRequest.Result;
        }

        if (totpEnrollmentId == Guid.Empty || string.IsNullOrWhiteSpace(endpointRequest.Request!.Code))
        {
            return InvalidRequest();
        }

        var result = await mfaRuntimeService.VerifyTotpEnrollmentAsync(actor, totpEnrollmentId, endpointRequest.Request, cancellationToken);
        return MapResult(result.Status, result.Response);
    }

    private static async Task<IResult> CancelTotpEnrollmentAsync(
        Guid totpEnrollmentId,
        ICurrentActorAccessor currentActorAccessor,
        IMfaRuntimeService mfaRuntimeService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var result = await mfaRuntimeService.CancelTotpEnrollmentAsync(actor, totpEnrollmentId, cancellationToken);
        return MapMutationResult(result.Status);
    }

    private static async Task<IResult> ListFactorsAsync(
        ICurrentActorAccessor currentActorAccessor,
        IMfaRuntimeService mfaRuntimeService,
        CancellationToken cancellationToken)
    {
        return currentActorAccessor.TryGetCurrentActor(out var actor)
            ? Results.Ok(await mfaRuntimeService.ListFactorsAsync(actor, cancellationToken))
            : Unauthenticated();
    }

    private static async Task<IResult> UpdateFactorAsync(
        Guid mfaFactorId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IMfaRuntimeService mfaRuntimeService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var endpointRequest = await ReadJsonAsync<MfaFactorUpdateRequest>(request, FactorUpdateProperties, cancellationToken);
        if (endpointRequest.Result is not null)
        {
            return endpointRequest.Result;
        }

        var result = await mfaRuntimeService.UpdateFactorAsync(actor, mfaFactorId, endpointRequest.Request!, cancellationToken);
        return MapResult(result.Status, result.Response);
    }

    private static async Task<IResult> RevokeFactorAsync(
        Guid mfaFactorId,
        ICurrentActorAccessor currentActorAccessor,
        IMfaRuntimeService mfaRuntimeService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var result = await mfaRuntimeService.RevokeFactorAsync(actor, mfaFactorId, cancellationToken);
        return MapMutationResult(result.Status);
    }

    private static async Task<IResult> CreateChallengeAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IMfaRuntimeService mfaRuntimeService,
        CancellationToken cancellationToken)
    {
        var endpointRequest = await ReadJsonAsync<MfaChallengeCreateRequest>(request, ChallengeCreateProperties, cancellationToken);
        if (endpointRequest.Result is not null)
        {
            return endpointRequest.Result;
        }

        currentActorAccessor.TryGetCurrentActor(out var actor);
        var result = await mfaRuntimeService.CreateChallengeAsync(actor, endpointRequest.Request!, cancellationToken);
        return MapResult(result.Status, result.Response);
    }

    private static async Task<IResult> VerifyTotpChallengeAsync(
        Guid mfaChallengeId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IMfaRuntimeService mfaRuntimeService,
        CancellationToken cancellationToken)
    {
        var endpointRequest = await ReadJsonAsync<MfaTotpVerifyRequest>(request, TotpVerifyProperties, cancellationToken);
        if (endpointRequest.Result is not null)
        {
            return endpointRequest.Result;
        }

        currentActorAccessor.TryGetCurrentActor(out var actor);
        var result = await mfaRuntimeService.VerifyTotpChallengeAsync(actor, mfaChallengeId, endpointRequest.Request!, cancellationToken);
        return MapResult(result.Status, result.Response);
    }

    private static async Task<IResult> VerifyRecoveryCodeChallengeAsync(
        Guid mfaChallengeId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IMfaRuntimeService mfaRuntimeService,
        CancellationToken cancellationToken)
    {
        var endpointRequest = await ReadJsonAsync<MfaRecoveryCodeVerifyRequest>(request, RecoveryVerifyProperties, cancellationToken);
        if (endpointRequest.Result is not null)
        {
            return endpointRequest.Result;
        }

        currentActorAccessor.TryGetCurrentActor(out var actor);
        var result = await mfaRuntimeService.VerifyRecoveryCodeChallengeAsync(actor, mfaChallengeId, endpointRequest.Request!, cancellationToken);
        return MapResult(result.Status, result.Response);
    }

    private static async Task<IResult> GenerateRecoveryCodesAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IMfaRuntimeService mfaRuntimeService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var endpointRequest = await ReadJsonAsync<RecoveryCodeBatchGenerateRequest>(request, RecoveryGenerateProperties, cancellationToken);
        if (endpointRequest.Result is not null)
        {
            return endpointRequest.Result;
        }

        var result = await mfaRuntimeService.GenerateRecoveryCodesAsync(
            actor,
            endpointRequest.Request ?? new RecoveryCodeBatchGenerateRequest(null, null),
            cancellationToken);
        return MapResult(result.Status, result.Response);
    }

    private static async Task<IResult> ListRecoveryCodeBatchesAsync(
        ICurrentActorAccessor currentActorAccessor,
        IMfaRuntimeService mfaRuntimeService,
        CancellationToken cancellationToken)
    {
        return currentActorAccessor.TryGetCurrentActor(out var actor)
            ? Results.Ok(await mfaRuntimeService.ListRecoveryCodeBatchesAsync(actor, cancellationToken))
            : Unauthenticated();
    }

    private static async Task<IResult> RevokeRecoveryCodeBatchAsync(
        Guid recoveryCodeBatchId,
        ICurrentActorAccessor currentActorAccessor,
        IMfaRuntimeService mfaRuntimeService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var result = await mfaRuntimeService.RevokeRecoveryCodeBatchAsync(actor, recoveryCodeBatchId, cancellationToken);
        return MapMutationResult(result.Status);
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
            AuthJsonRequestStatus.Valid when readResult.Request is not null => new EndpointReadResult<TRequest>(readResult.Request, null),
            AuthJsonRequestStatus.UnsupportedFields => new EndpointReadResult<TRequest>(null, Problem(InvalidAuthRequestTitle, UnsupportedFieldsDetail, StatusCodes.Status400BadRequest)),
            _ => new EndpointReadResult<TRequest>(null, InvalidRequest())
        };
    }

    private static IResult MapMutationResult(MfaServiceStatus status)
    {
        return status switch
        {
            MfaServiceStatus.Succeeded => Results.NoContent(),
            MfaServiceStatus.NotFound => Problem(NotFoundTitle, "The MFA resource was not found.", StatusCodes.Status404NotFound),
            _ => MapResult(status, response: null)
        };
    }

    private static IResult MapResult(MfaServiceStatus status, object? response)
    {
        return status switch
        {
            MfaServiceStatus.Succeeded when response is not null => Results.Ok(response),
            MfaServiceStatus.InvalidRequest => InvalidRequest(),
            MfaServiceStatus.NotFound => Problem(NotFoundTitle, "The MFA resource was not found.", StatusCodes.Status404NotFound),
            MfaServiceStatus.Denied => Problem(DeniedTitle, "The MFA operation was denied.", StatusCodes.Status403Forbidden),
            MfaServiceStatus.Conflict => Problem(ConflictTitle, "The MFA challenge or resource is unavailable.", StatusCodes.Status409Conflict),
            MfaServiceStatus.VerificationFailed => Problem(VerificationFailedTitle, "Unable to verify the submitted MFA value.", StatusCodes.Status400BadRequest),
            _ => Problem("MFA operation failed", "The MFA operation could not be completed.", StatusCodes.Status500InternalServerError)
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
