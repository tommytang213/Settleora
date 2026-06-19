using Settleora.Api.Auth;
using Settleora.Api.Auth.CurrentUser;

namespace Settleora.Api.Auth.SignIn;

internal static class LocalSignInEndpoints
{
    private const string SignInFailedTitle = "Sign-in failed";
    private const string SignInFailedDetail = "Unable to sign in with the submitted information.";
    private const string InvalidAuthRequestTitle = "Invalid auth request";
    private const string UnsupportedFieldsDetail = "Unsupported fields are not allowed.";
    private const string TooManyAttemptsTitle = "Too many sign-in attempts";
    private const string TooManyAttemptsDetail = "Too many sign-in attempts. Try again later.";
    private const string LocalSingleNodeSourceKey = "src:local-single-node";
    private const int DeviceLabelMaxLength = 120;
    private static readonly HashSet<string> AllowedSignInProperties = new(StringComparer.OrdinalIgnoreCase)
    {
        "identifier",
        "password",
        "deviceLabel"
    };

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

        var readResult = await AuthEndpointRequestValidation.ReadLimitedJsonObjectAsync<LocalSignInEndpointRequest>(
            request,
            AllowedSignInProperties,
            cancellationToken);
        if (readResult.Status == AuthJsonRequestStatus.UnsupportedFields)
        {
            return UnsupportedFields();
        }

        if (readResult.Status != AuthJsonRequestStatus.Valid
            || readResult.Request is null
            || !TryMapRequest(readResult.Request, out var signInRequest))
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

    private static IResult UnsupportedFields()
    {
        return Results.Problem(
            title: InvalidAuthRequestTitle,
            detail: UnsupportedFieldsDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private delegate bool SignInSuccessMapper(
        LocalSignInResult result,
        out object response);
}
