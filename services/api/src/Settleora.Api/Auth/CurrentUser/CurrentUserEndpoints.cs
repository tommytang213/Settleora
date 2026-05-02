using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.CurrentUser;

internal static class CurrentUserEndpoints
{
    private const string BearerScheme = "Bearer";
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";

    public static WebApplication MapCurrentUserEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/auth/current-user", GetCurrentUserAsync);

        return app;
    }

    private static async Task<IResult> GetCurrentUserAsync(
        HttpRequest request,
        IAuthSessionRuntimeService sessionRuntimeService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var rawSessionToken = TryGetBearerToken(request);
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

        return await BuildCurrentUserResponseAsync(
            validationResult.Actor,
            dbContext,
            cancellationToken);
    }

    private static async Task<IResult> BuildCurrentUserResponseAsync(
        AuthenticatedSessionActor actor,
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

        var roles = await dbContext.Set<SystemRoleAssignment>()
            .AsNoTracking()
            .Where(roleAssignment => roleAssignment.AuthAccountId == actor.AuthAccountId)
            .Select(roleAssignment => roleAssignment.Role)
            .ToListAsync(cancellationToken);
        roles.Sort(CompareSystemRoles);

        return Results.Ok(new CurrentUserResponse(
            actor.AuthAccountId,
            new CurrentUserProfileResponse(
                userProfile.Id,
                userProfile.DisplayName,
                userProfile.DefaultCurrency),
            new CurrentUserSessionResponse(
                actor.AuthSessionId,
                actor.SessionExpiresAtUtc),
            roles));
    }

    private static string? TryGetBearerToken(HttpRequest request)
    {
        var authorizationHeaders = request.Headers.Authorization;
        if (authorizationHeaders.Count != 1)
        {
            return null;
        }

        var authorizationHeader = authorizationHeaders[0];
        if (string.IsNullOrWhiteSpace(authorizationHeader)
            || authorizationHeader.Contains(',', StringComparison.Ordinal))
        {
            return null;
        }

        var trimmedAuthorizationHeader = authorizationHeader.Trim();
        if (trimmedAuthorizationHeader.Length <= BearerScheme.Length
            || !trimmedAuthorizationHeader.StartsWith(BearerScheme, StringComparison.OrdinalIgnoreCase)
            || !char.IsWhiteSpace(trimmedAuthorizationHeader[BearerScheme.Length]))
        {
            return null;
        }

        var rawSessionToken = trimmedAuthorizationHeader[BearerScheme.Length..].Trim();
        if (rawSessionToken.Length == 0 || rawSessionToken.Any(char.IsWhiteSpace))
        {
            return null;
        }

        return rawSessionToken;
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static int CompareSystemRoles(string left, string right)
    {
        var sortIndexComparison = GetSystemRoleSortIndex(left).CompareTo(GetSystemRoleSortIndex(right));
        return sortIndexComparison != 0
            ? sortIndexComparison
            : StringComparer.Ordinal.Compare(left, right);
    }

    private static int GetSystemRoleSortIndex(string role)
    {
        return role switch
        {
            SystemRoles.Owner => 0,
            SystemRoles.Admin => 1,
            SystemRoles.User => 2,
            _ => int.MaxValue
        };
    }
}
