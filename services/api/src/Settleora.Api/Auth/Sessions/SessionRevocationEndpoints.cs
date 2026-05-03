namespace Settleora.Api.Auth.Sessions;

internal static class SessionRevocationEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string SessionUnavailableTitle = "Session unavailable";
    private const string SessionUnavailableDetail = "The requested session is unavailable.";
    private const string SessionRevocationFailedTitle = "Session revocation failed";
    private const string SessionRevocationFailedDetail = "Unable to complete session revocation.";
    private const string UserSessionRevocationReason = "user_session_revoke";

    public static WebApplication MapSessionRevocationEndpoints(this WebApplication app)
    {
        app.MapDelete("/api/v1/auth/sessions/{sessionId:guid}", RevokeSessionAsync);

        return app;
    }

    private static async Task<IResult> RevokeSessionAsync(
        Guid sessionId,
        HttpRequest request,
        IAuthSessionRuntimeService sessionRuntimeService,
        CancellationToken cancellationToken)
    {
        var rawSessionToken = SessionBearerTokenReader.TryGetBearerToken(request);
        if (rawSessionToken is null)
        {
            return Unauthenticated();
        }

        var validationResult = await sessionRuntimeService.ValidateSessionAsync(
            rawSessionToken,
            cancellationToken);
        if (!validationResult.Succeeded || validationResult.Actor is null)
        {
            return Unauthenticated();
        }

        var actor = validationResult.Actor;
        var revocationResult = await sessionRuntimeService.RevokeSessionAsync(
            new AuthSessionRevocationRequest(
                actor.AuthAccountId,
                sessionId,
                UserSessionRevocationReason),
            cancellationToken);

        return revocationResult.Status switch
        {
            AuthSessionRevocationStatus.Revoked => Results.NoContent(),
            AuthSessionRevocationStatus.NotFound => SessionUnavailable(),
            AuthSessionRevocationStatus.AlreadyRevoked => SessionUnavailable(),
            AuthSessionRevocationStatus.SessionInactive => SessionUnavailable(),
            AuthSessionRevocationStatus.AccountUnavailable => Unauthenticated(),
            AuthSessionRevocationStatus.PersistenceFailed => SessionRevocationFailed(),
            _ => SessionUnavailable()
        };
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult SessionUnavailable()
    {
        return Results.Problem(
            title: SessionUnavailableTitle,
            detail: SessionUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult SessionRevocationFailed()
    {
        return Results.Problem(
            title: SessionRevocationFailedTitle,
            detail: SessionRevocationFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }
}
