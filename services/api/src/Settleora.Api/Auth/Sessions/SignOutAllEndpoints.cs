namespace Settleora.Api.Auth.Sessions;

internal static class SignOutAllEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string SignOutAllFailedTitle = "Sign-out-all failed";
    private const string SignOutAllFailedDetail = "Unable to complete sign-out-all.";
    private const string UserSignOutAllRevocationReason = "user_sign_out_all";

    public static WebApplication MapSignOutAllEndpoints(this WebApplication app)
    {
        app.MapPost("/api/v1/auth/sign-out-all", SignOutAllAsync);

        return app;
    }

    private static async Task<IResult> SignOutAllAsync(
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
            return validationResult.Status is AuthSessionValidationStatus.PersistenceFailed
                ? SignOutAllFailed()
                : Unauthenticated();
        }

        var revocationResult = await sessionRuntimeService.RevokeActiveSessionsForAccountAsync(
            new AuthAccountSessionRevocationRequest(
                validationResult.Actor.AuthAccountId,
                UserSignOutAllRevocationReason),
            cancellationToken);

        return revocationResult.Status switch
        {
            AuthAccountSessionRevocationStatus.Revoked => Results.NoContent(),
            AuthAccountSessionRevocationStatus.PersistenceFailed => SignOutAllFailed(),
            _ => Unauthenticated()
        };
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult SignOutAllFailed()
    {
        return Results.Problem(
            title: SignOutAllFailedTitle,
            detail: SignOutAllFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }
}
