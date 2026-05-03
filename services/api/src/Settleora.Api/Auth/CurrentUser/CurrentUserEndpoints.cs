using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.CurrentUser;

internal static class CurrentUserEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";

    public static WebApplication MapCurrentUserEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/auth/current-user", GetCurrentUserAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        return app;
    }

    private static async Task<IResult> GetCurrentUserAsync(
        ICurrentActorAccessor currentActorAccessor,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        return await BuildCurrentUserResponseAsync(actor, dbContext, cancellationToken);
    }

    private static async Task<IResult> BuildCurrentUserResponseAsync(
        AuthenticatedActor actor,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var userProfile = await dbContext.Set<UserProfile>()
            .AsNoTracking()
            .SingleOrDefaultAsync(
                profile => profile.Id == actor.UserProfileId
                    && profile.DeletedAtUtc == null,
                cancellationToken);

        if (userProfile is null)
        {
            return Unauthenticated();
        }

        return Results.Ok(new CurrentUserResponse(
            actor.AuthAccountId,
            new CurrentUserProfileResponse(
                userProfile.Id,
                userProfile.DisplayName,
                userProfile.DefaultCurrency),
            new CurrentUserSessionResponse(
                actor.AuthSessionId,
                actor.SessionExpiresAtUtc),
            actor.SystemRoles));
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

}
