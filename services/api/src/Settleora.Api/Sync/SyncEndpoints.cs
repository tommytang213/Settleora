using Settleora.Api.Auth.Authorization;

namespace Settleora.Api.Sync;

internal static class SyncEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string InvalidSyncRequestTitle = "Invalid sync request";
    private const string SyncWriteFailedTitle = "Sync write failed";
    private const string SyncWriteFailedDetail = "Unable to complete sync operation write.";

    public static WebApplication MapSyncEndpoints(this WebApplication app)
    {
        var sync = app.MapGroup("/api/v1/sync")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        sync.MapPost("/operations", PostOperationAsync);
        sync.MapGet("/changes", GetChangesAsync);

        return app;
    }

    private static async Task<IResult> PostOperationAsync(
        SyncOperationRequest request,
        ICurrentActorAccessor currentActorAccessor,
        SyncOperationService syncOperationService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var result = await syncOperationService.ProcessOperationAsync(
            request,
            actor,
            cancellationToken);

        return result.Kind switch
        {
            SyncOperationProcessResultKind.Ok => Results.Ok(result.Response),
            SyncOperationProcessResultKind.InvalidRequest => InvalidSyncRequest(result.Error!),
            _ => SyncWriteFailed()
        };
    }

    private static async Task<IResult> GetChangesAsync(
        long? sinceVersion,
        int? limit,
        string? resourceType,
        ICurrentActorAccessor currentActorAccessor,
        SyncOperationService syncOperationService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var result = await syncOperationService.ListChangesAsync(
            actor,
            sinceVersion,
            limit,
            resourceType,
            cancellationToken);

        return result.Kind is SyncChangeFeedResultKind.Ok
            ? Results.Ok(result.Response)
            : InvalidSyncRequest(result.Error!);
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult InvalidSyncRequest(string detail)
    {
        return Results.Problem(
            title: InvalidSyncRequestTitle,
            detail: detail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult SyncWriteFailed()
    {
        return Results.Problem(
            title: SyncWriteFailedTitle,
            detail: SyncWriteFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }
}
