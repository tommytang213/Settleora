using Settleora.Api.Auth;

namespace Settleora.Api.Auth.Sessions;

internal static class RefreshSessionEndpoints
{
    private const string RefreshFailedTitle = "Refresh failed";
    private const string RefreshFailedDetail = "Unable to refresh with the submitted information.";
    private const string InvalidAuthRequestTitle = "Invalid auth request";
    private const string UnsupportedFieldsDetail = "Unsupported fields are not allowed.";
    private const string RefreshUnavailableTitle = "Refresh unavailable";
    private const string RefreshUnavailableDetail = "Unable to complete refresh.";
    private const int DeviceLabelMaxLength = 120;
    private static readonly HashSet<string> AllowedRefreshProperties = new(StringComparer.OrdinalIgnoreCase)
    {
        "refreshCredential",
        "deviceLabel"
    };

    public static WebApplication MapRefreshSessionEndpoints(this WebApplication app)
    {
        app.MapPost("/api/v1/auth/refresh", RefreshAsync)
            .AllowAnonymous();

        return app;
    }

    private static async Task<IResult> RefreshAsync(
        HttpRequest request,
        IAuthRefreshSessionRuntimeService refreshSessionRuntimeService,
        CancellationToken cancellationToken)
    {
        if (!request.HasJsonContentType())
        {
            return RefreshFailed();
        }

        var readResult = await AuthEndpointRequestValidation.ReadLimitedJsonObjectAsync<RefreshSessionEndpointRequest>(
            request,
            AllowedRefreshProperties,
            cancellationToken);
        if (readResult.Status == AuthJsonRequestStatus.UnsupportedFields)
        {
            return UnsupportedFields();
        }

        if (readResult.Status != AuthJsonRequestStatus.Valid
            || readResult.Request is null)
        {
            return RefreshFailed();
        }

        var rotationResult = await refreshSessionRuntimeService.RotateRefreshCredentialAsync(
            new AuthRefreshSessionRotationRequest(
                readResult.Request.RefreshCredential,
                DeviceLabel: BoundOptionalField(readResult.Request.DeviceLabel, DeviceLabelMaxLength),
                UserAgentSummary: null,
                NetworkAddressHash: null),
            cancellationToken);

        return rotationResult.Status switch
        {
            AuthRefreshSessionRotationStatus.Rotated when TryMapSuccess(rotationResult, out var response) => Results.Ok(response),
            AuthRefreshSessionRotationStatus.Rotated => RefreshUnavailable(),
            AuthRefreshSessionRotationStatus.PersistenceFailed => RefreshUnavailable(),
            _ => RefreshFailed()
        };
    }

    private static bool TryMapSuccess(
        AuthRefreshSessionRotationResult result,
        out RefreshSessionResponse response)
    {
        response = default!;
        if (result.AuthSessionId is not { } authSessionId
            || result.RawAccessSessionToken is null
            || result.RawRefreshCredential is null
            || result.AccessSessionExpiresAtUtc is not { } accessSessionExpiresAtUtc
            || result.RefreshCredentialIdleExpiresAtUtc is not { } refreshCredentialIdleExpiresAtUtc
            || result.RefreshCredentialAbsoluteExpiresAtUtc is not { } refreshCredentialAbsoluteExpiresAtUtc)
        {
            return false;
        }

        response = new RefreshSessionResponse(
            new RefreshSessionAccessSessionResponse(
                authSessionId,
                result.RawAccessSessionToken,
                accessSessionExpiresAtUtc),
            new RefreshSessionCredentialResponse(
                result.RawRefreshCredential,
                refreshCredentialIdleExpiresAtUtc,
                refreshCredentialAbsoluteExpiresAtUtc));
        return true;
    }

    private static string? BoundOptionalField(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        return trimmed.Length <= maxLength
            ? trimmed
            : trimmed[..maxLength];
    }

    private static IResult RefreshFailed()
    {
        return Results.Problem(
            title: RefreshFailedTitle,
            detail: RefreshFailedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult RefreshUnavailable()
    {
        return Results.Problem(
            title: RefreshUnavailableTitle,
            detail: RefreshUnavailableDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static IResult UnsupportedFields()
    {
        return Results.Problem(
            title: InvalidAuthRequestTitle,
            detail: UnsupportedFieldsDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }
}
