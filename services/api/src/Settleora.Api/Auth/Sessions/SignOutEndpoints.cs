using Settleora.Api.Auth.Authorization;

namespace Settleora.Api.Auth.Sessions;

internal static class SignOutEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string SignOutFailedTitle = "Sign-out failed";
    private const string SignOutFailedDetail = "Unable to complete sign-out.";
    private const string UserSignOutRevocationReason = "user_sign_out";

    public static WebApplication MapSignOutEndpoints(this WebApplication app)
    {
        app.MapPost("/api/v1/auth/sign-out", SignOutAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        return app;
    }

    private static async Task<IResult> SignOutAsync(
        ICurrentActorAccessor currentActorAccessor,
        IAuthSessionRuntimeService sessionRuntimeService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var revocationResult = await sessionRuntimeService.RevokeSessionAsync(
            new AuthSessionRevocationRequest(
                actor.AuthAccountId,
                actor.AuthSessionId,
                UserSignOutRevocationReason),
            cancellationToken);

        return revocationResult.Status switch
        {
            AuthSessionRevocationStatus.Revoked => Results.NoContent(),
            AuthSessionRevocationStatus.AlreadyRevoked => Results.NoContent(),
            AuthSessionRevocationStatus.PersistenceFailed => SignOutFailed(),
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

    private static IResult SignOutFailed()
    {
        return Results.Problem(
            title: SignOutFailedTitle,
            detail: SignOutFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }
}
