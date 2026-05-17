using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.BillLifecycle;

internal static class ExpenseBillLifecycleEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string BillUnavailableTitle = "Bill unavailable";
    private const string BillUnavailableDetail = "The requested bill is unavailable.";
    private const string GroupBillUnavailableTitle = "Group bill unavailable";
    private const string GroupBillUnavailableDetail = "The requested group bill is unavailable.";
    private const string BillLifecycleConflictTitle = "Bill lifecycle conflict";
    private const string BillLifecycleConflictDetail = "The requested bill lifecycle transition is not allowed.";
    private const string BillLifecycleWriteFailedTitle = "Bill lifecycle write failed";
    private const string BillLifecycleWriteFailedDetail = "Unable to complete bill lifecycle write.";

    public static WebApplication MapExpenseBillLifecycleEndpoints(this WebApplication app)
    {
        var personalBills = app.MapGroup("/api/v1/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        personalBills.MapPost("/{billId:guid}/archive", ArchivePersonalBillAsync);
        personalBills.MapPost("/{billId:guid}/restore", RestorePersonalBillAsync);

        var groupBills = app.MapGroup("/api/v1/groups/{groupId:guid}/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        groupBills.MapPost("/{billId:guid}/archive", ArchiveGroupBillAsync);
        groupBills.MapPost("/{billId:guid}/restore", RestoreGroupBillAsync);

        return app;
    }

    private static async Task<IResult> ArchivePersonalBillAsync(
        Guid billId,
        ICurrentActorAccessor currentActorAccessor,
        ExpenseBillLifecycleService lifecycleService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var result = await lifecycleService.ApplyPersonalAsync(
            billId,
            archive: true,
            actor,
            cancellationToken);

        return await MapPersonalLifecycleResultAsync(result, dbContext, cancellationToken);
    }

    private static async Task<IResult> RestorePersonalBillAsync(
        Guid billId,
        ICurrentActorAccessor currentActorAccessor,
        ExpenseBillLifecycleService lifecycleService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var result = await lifecycleService.ApplyPersonalAsync(
            billId,
            archive: false,
            actor,
            cancellationToken);

        return await MapPersonalLifecycleResultAsync(result, dbContext, cancellationToken);
    }

    private static async Task<IResult> ArchiveGroupBillAsync(
        Guid groupId,
        Guid billId,
        ICurrentActorAccessor currentActorAccessor,
        ExpenseBillLifecycleService lifecycleService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var result = await lifecycleService.ApplyGroupAsync(
            groupId,
            billId,
            archive: true,
            actor,
            cancellationToken);

        return await MapGroupLifecycleResultAsync(result, dbContext, cancellationToken);
    }

    private static async Task<IResult> RestoreGroupBillAsync(
        Guid groupId,
        Guid billId,
        ICurrentActorAccessor currentActorAccessor,
        ExpenseBillLifecycleService lifecycleService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var result = await lifecycleService.ApplyGroupAsync(
            groupId,
            billId,
            archive: false,
            actor,
            cancellationToken);

        return await MapGroupLifecycleResultAsync(result, dbContext, cancellationToken);
    }

    private static async Task<IResult> MapPersonalLifecycleResultAsync(
        ExpenseBillLifecycleResult result,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        return await MapLifecycleResultAsync(
            result,
            unavailableResult: BillUnavailable,
            dbContext,
            cancellationToken);
    }

    private static async Task<IResult> MapGroupLifecycleResultAsync(
        ExpenseBillLifecycleResult result,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        return await MapLifecycleResultAsync(
            result,
            unavailableResult: GroupBillUnavailable,
            dbContext,
            cancellationToken);
    }

    private static async Task<IResult> MapLifecycleResultAsync(
        ExpenseBillLifecycleResult result,
        Func<IResult> unavailableResult,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (result.Kind is ExpenseBillLifecycleResultKind.Unavailable)
        {
            return unavailableResult();
        }

        if (result.Kind is ExpenseBillLifecycleResultKind.Conflict)
        {
            return BillLifecycleConflict();
        }

        if (result.Mutated)
        {
            var saveResult = await SaveLifecycleAsync(dbContext, cancellationToken);
            if (saveResult is not null)
            {
                return saveResult;
            }
        }

        return Results.Ok(result.Response);
    }

    private static async Task<IResult?> SaveLifecycleAsync(
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return BillLifecycleWriteFailed();
        }

        return null;
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult BillUnavailable()
    {
        return Results.Problem(
            title: BillUnavailableTitle,
            detail: BillUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult GroupBillUnavailable()
    {
        return Results.Problem(
            title: GroupBillUnavailableTitle,
            detail: GroupBillUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult BillLifecycleConflict()
    {
        return Results.Problem(
            title: BillLifecycleConflictTitle,
            detail: BillLifecycleConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult BillLifecycleWriteFailed()
    {
        return Results.Problem(
            title: BillLifecycleWriteFailedTitle,
            detail: BillLifecycleWriteFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }
}
