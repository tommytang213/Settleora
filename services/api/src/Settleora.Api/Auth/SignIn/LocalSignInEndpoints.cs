using System.Text.Json;
using Settleora.Api.Auth.CurrentUser;

namespace Settleora.Api.Auth.SignIn;

internal static class LocalSignInEndpoints
{
    private const string SignInFailedTitle = "Sign-in failed";
    private const string SignInFailedDetail = "Unable to sign in with the submitted information.";
    private const string TooManyAttemptsTitle = "Too many sign-in attempts";
    private const string TooManyAttemptsDetail = "Too many sign-in attempts. Try again later.";
    private const string LocalSingleNodeSourceKey = "src:local-single-node";
    private const int DeviceLabelMaxLength = 120;

    public static WebApplication MapLocalSignInEndpoints(this WebApplication app)
    {
        app.MapPost("/api/v1/auth/sign-in", SignInLegacyAsync)
            .AllowAnonymous();
        app.MapPost("/api/v1/auth/local/sign-in", SignInWithCurrentUserAsync)
            .AllowAnonymous();

        return app;
    }

    private static async Task<IResult> SignInLegacyAsync(
        HttpRequest request,
        ILocalSignInService localSignInService,
        CancellationToken cancellationToken)
    {
        return await SignInAsync(
            request,
            localSignInService,
            TryMapLegacySuccess,
            cancellationToken);
    }

    private static async Task<IResult> SignInWithCurrentUserAsync(
        HttpRequest request,
        ILocalSignInService localSignInService,
        CancellationToken cancellationToken)
    {
        return await SignInAsync(
            request,
            localSignInService,
            TryMapCurrentUserSuccess,
            cancellationToken);
    }

    private static async Task<IResult> SignInAsync(
        HttpRequest request,
        ILocalSignInService localSignInService,
        SignInSuccessMapper responseMapper,
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
            LocalSignInStatus.SignedIn when responseMapper(result, out var response) => Results.Ok(response),
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

        signInRequest = new LocalSignInRequest(
            endpointRequest.Identifier,
            endpointRequest.Password,
            DeriveSafeSourceKey(),
            DeviceLabel: BoundOptionalField(endpointRequest.DeviceLabel, DeviceLabelMaxLength),
            UserAgentSummary: null,
            NetworkAddressHash: null);
        return true;
    }

    private static bool TryMapLegacySuccess(
        LocalSignInResult result,
        out object response)
    {
        response = default!;
        if (result.AuthSessionId is not { } authSessionId
            || result.RawSessionToken is null
            || result.SessionExpiresAtUtc is not { } sessionExpiresAtUtc
            || result.RawRefreshCredential is null
            || result.RefreshCredentialIdleExpiresAtUtc is not { } refreshCredentialIdleExpiresAtUtc
            || result.RefreshCredentialAbsoluteExpiresAtUtc is not { } refreshCredentialAbsoluteExpiresAtUtc)
        {
            return false;
        }

        response = new LocalSignInResponse(
            new LocalSignInSessionResponse(
                authSessionId,
                result.RawSessionToken,
                sessionExpiresAtUtc),
            new LocalSignInRefreshCredentialResponse(
                result.RawRefreshCredential,
                refreshCredentialIdleExpiresAtUtc,
                refreshCredentialAbsoluteExpiresAtUtc));
        return true;
    }

    private static bool TryMapCurrentUserSuccess(
        LocalSignInResult result,
        out object response)
    {
        response = default!;
        if (!TryMapLegacySuccess(result, out var legacyResponse)
            || legacyResponse is not LocalSignInResponse localSignInResponse
            || result.AuthAccountId is not { } authAccountId
            || result.UserProfileId is not { } userProfileId
            || result.UserProfileDisplayName is null)
        {
            return false;
        }

        response = new LocalSessionSignInResponse(
            localSignInResponse.Session,
            localSignInResponse.RefreshCredential,
            new CurrentUserResponse(
                authAccountId,
                new CurrentUserProfileResponse(
                    userProfileId,
                    result.UserProfileDisplayName,
                    result.UserProfileDefaultCurrency),
                new CurrentUserSessionResponse(
                    localSignInResponse.Session.Id,
                    localSignInResponse.Session.ExpiresAtUtc),
                result.SystemRoles));
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

    private delegate bool SignInSuccessMapper(
        LocalSignInResult result,
        out object response);
}
