using Microsoft.EntityFrameworkCore;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.Sessions;

internal static class SessionListEndpoints
{
    private const int MaxSessionListCount = 50;
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";

    public static WebApplication MapSessionListEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/auth/sessions", GetSessionsAsync);

        return app;
    }

    private static async Task<IResult> GetSessionsAsync(
        HttpRequest request,
        IAuthSessionRuntimeService sessionRuntimeService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
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
        var occurredAtUtc = timeProvider.GetUtcNow();
        var sessions = await dbContext.Set<AuthSession>()
            .AsNoTracking()
            .Where(session => session.AuthAccountId == actor.AuthAccountId
                && session.Status == AuthSessionStatuses.Active
                && session.RevokedAtUtc == null
                && session.ExpiresAtUtc > occurredAtUtc)
            .OrderByDescending(session => session.LastSeenAtUtc ?? session.IssuedAtUtc)
            .ThenByDescending(session => session.IssuedAtUtc)
            .ThenBy(session => session.Id)
            .Take(MaxSessionListCount)
            .Select(session => new SessionSummaryResponse(
                session.Id,
                session.Id == actor.AuthSessionId,
                session.Status,
                session.IssuedAtUtc,
                session.ExpiresAtUtc,
                session.LastSeenAtUtc,
                session.DeviceLabel))
            .ToListAsync(cancellationToken);

        return Results.Ok(new SessionListResponse(sessions));
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }
}
