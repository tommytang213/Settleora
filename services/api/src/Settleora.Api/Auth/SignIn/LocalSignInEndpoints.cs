using System.Text.Json;

namespace Settleora.Api.Auth.SignIn;

internal static class LocalSignInEndpoints
{
    private const string SignInFailedTitle = "Sign-in failed";
    private const string SignInFailedDetail = "Unable to sign in with the submitted information.";
    private const string TooManyAttemptsTitle = "Too many sign-in attempts";
    private const string TooManyAttemptsDetail = "Too many sign-in attempts. Try again later.";
    private const string LocalSingleNodeSourceKey = "src:local-single-node";
    private const int DeviceLabelMaxLength = 120;
    private const int MaxRequestedSessionLifetimeMinutes = 43_200;

    public static WebApplication MapLocalSignInEndpoints(this WebApplication app)
    {
        app.MapPost("/api/v1/auth/sign-in", SignInAsync);

        return app;
    }

    private static async Task<IResult> SignInAsync(
        HttpRequest request,
        ILocalSignInService localSignInService,
        CancellationToken cancellationToken)
    {
        if (!request.HasJsonContentType())
        {
            return SignInFailed();
        }

        var endpointRequest = await TryReadRequestAsync(request, cancellationToken);
        if (endpointRequest is null
            || !TryMapRequest(endpointRequest, out var signInRequest))
        {
            return SignInFailed();
        }

        var result = await localSignInService.SignInAsync(signInRequest, cancellationToken);
        return result.Status switch
        {
            LocalSignInStatus.SignedIn when TryMapSuccess(result, out var response) => Results.Ok(response),
            LocalSignInStatus.Throttled => TooManyAttempts(),
            _ => SignInFailed()
        };
    }

    private static async Task<LocalSignInEndpointRequest?> TryReadRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            return await request.ReadFromJsonAsync<LocalSignInEndpointRequest>(cancellationToken);
        }
        catch (JsonException)
        {
            return null;
        }
        catch (BadHttpRequestException)
        {
            return null;
        }
    }

    private static bool TryMapRequest(
        LocalSignInEndpointRequest endpointRequest,
        out LocalSignInRequest signInRequest)
    {
        signInRequest = default!;

        if (!TryMapRequestedSessionLifetime(
                endpointRequest.RequestedSessionLifetimeMinutes,
                out var requestedSessionLifetime))
        {
            return false;
        }

        signInRequest = new LocalSignInRequest(
            endpointRequest.Identifier,
            endpointRequest.Password,
            DeriveSafeSourceKey(),
            DeviceLabel: BoundOptionalField(endpointRequest.DeviceLabel, DeviceLabelMaxLength),
            UserAgentSummary: null,
            NetworkAddressHash: null,
            RequestedSessionLifetime: requestedSessionLifetime);
        return true;
    }

    private static bool TryMapRequestedSessionLifetime(
        int? requestedSessionLifetimeMinutes,
        out TimeSpan? requestedSessionLifetime)
    {
        requestedSessionLifetime = null;
        if (requestedSessionLifetimeMinutes is null)
        {
            return true;
        }

        var minutes = requestedSessionLifetimeMinutes.Value;
        if (minutes is < 1 or > MaxRequestedSessionLifetimeMinutes)
        {
            return false;
        }

        requestedSessionLifetime = TimeSpan.FromMinutes(minutes);
        return true;
    }

    private static bool TryMapSuccess(
        LocalSignInResult result,
        out LocalSignInResponse response)
    {
        response = default!;
        if (result.AuthAccountId is not { } authAccountId
            || result.UserProfileId is not { } userProfileId
            || result.AuthSessionId is not { } authSessionId
            || result.RawSessionToken is null
            || result.SessionExpiresAtUtc is not { } sessionExpiresAtUtc)
        {
            return false;
        }

        response = new LocalSignInResponse(
            authAccountId,
            userProfileId,
            new LocalSignInSessionResponse(
                authSessionId,
                result.RawSessionToken,
                sessionExpiresAtUtc));
        return true;
    }

    private static string DeriveSafeSourceKey()
    {
        // Keep a conservative single-node bucket until trusted proxy/IP coarsening policy exists.
        return LocalSingleNodeSourceKey;
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

    private static IResult SignInFailed()
    {
        return Results.Problem(
            title: SignInFailedTitle,
            detail: SignInFailedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult TooManyAttempts()
    {
        return Results.Problem(
            title: TooManyAttemptsTitle,
            detail: TooManyAttemptsDetail,
            statusCode: StatusCodes.Status429TooManyRequests);
    }
}
