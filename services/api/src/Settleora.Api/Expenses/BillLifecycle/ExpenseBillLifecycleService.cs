using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Expenses.GroupBills;
using Settleora.Api.Expenses.PersonalBills;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.BillLifecycle;

internal sealed class ExpenseBillLifecycleService
{
    private const string BillArchivedAction = "bill.archived";
    private const string BillRestoredAction = "bill.restored";
    private const string ActiveArchiveState = "active";
    private const string ArchivedArchiveState = "archived";
    private const string PersonalGroupMode = "personal";
    private const string GroupMode = "group";

    private static readonly string[] ActiveSettlementRequestStatuses =
    [
        SettlementRequestStatuses.Requested,
        SettlementRequestStatuses.PartiallyPaid,
        SettlementRequestStatuses.MarkedPaid,
        SettlementRequestStatuses.Confirmed
    ];

    private readonly IBusinessAuthorizationService businessAuthorizationService;
    private readonly IPersonalBillAuditWriter personalBillAuditWriter;
    private readonly IGroupBillAuditWriter groupBillAuditWriter;
    private readonly SettleoraDbContext dbContext;
    private readonly TimeProvider timeProvider;

    public ExpenseBillLifecycleService(
        IBusinessAuthorizationService businessAuthorizationService,
        IPersonalBillAuditWriter personalBillAuditWriter,
        IGroupBillAuditWriter groupBillAuditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider)
    {
        this.businessAuthorizationService = businessAuthorizationService;
        this.personalBillAuditWriter = personalBillAuditWriter;
        this.groupBillAuditWriter = groupBillAuditWriter;
        this.dbContext = dbContext;
        this.timeProvider = timeProvider;
    }

    public async Task<ExpenseBillLifecycleResult> ApplyPersonalAsync(
        Guid billId,
        bool archive,
        AuthenticatedActor actor,
        CancellationToken cancellationToken)
    {
        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return ExpenseBillLifecycleResult.Unavailable();
        }

        var bill = await LoadPersonalLifecycleBillAsync(
            billId,
            actor.UserProfileId,
            cancellationToken);
        if (bill is null)
        {
            return ExpenseBillLifecycleResult.Unavailable();
        }

        return await ApplyLoadedAsync(bill, archive, actor, cancellationToken);
    }

    public async Task<ExpenseBillLifecycleResult> ApplyGroupAsync(
        Guid groupId,
        Guid billId,
        bool archive,
        AuthenticatedActor actor,
        CancellationToken cancellationToken)
    {
        var authorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
            groupId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return ExpenseBillLifecycleResult.Unavailable();
        }

        var bill = await LoadGroupLifecycleBillAsync(
            groupId,
            billId,
            cancellationToken);
        if (bill is null)
        {
            return ExpenseBillLifecycleResult.Unavailable();
        }

        return await ApplyLoadedAsync(bill, archive, actor, cancellationToken);
    }

    public async Task<ExpenseBillLifecycleLoadResult> LoadVisibleAsync(
        Guid billId,
        AuthenticatedActor actor,
        CancellationToken cancellationToken)
    {
        var bill = await LifecycleBillQuery(dbContext)
            .SingleOrDefaultAsync(
                candidate => candidate.Id == billId
                    && candidate.CreatedByUserProfile.DeletedAtUtc == null
                    && (candidate.GroupId == null
                        || (candidate.Group != null && candidate.Group.DeletedAtUtc == null)),
                cancellationToken);
        if (bill is null)
        {
            return ExpenseBillLifecycleLoadResult.Unavailable();
        }

        if (bill.GroupId is null)
        {
            var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
                actor.UserProfileId,
                cancellationToken);
            if (!authorizationResult.Allowed
                || (bill.CreatedByUserProfileId != actor.UserProfileId
                    && bill.BillOwnerUserProfileId != actor.UserProfileId))
            {
                return ExpenseBillLifecycleLoadResult.Unavailable();
            }

            return ExpenseBillLifecycleLoadResult.Visible(bill);
        }

        var groupAuthorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
            bill.GroupId.Value,
            cancellationToken);

        return groupAuthorizationResult.Allowed
            ? ExpenseBillLifecycleLoadResult.Visible(bill)
            : ExpenseBillLifecycleLoadResult.Unavailable();
    }

    public async Task<ExpenseBillLifecycleResult> ApplyLoadedAsync(
        ExpenseBill bill,
        bool archive,
        AuthenticatedActor actor,
        CancellationToken cancellationToken)
    {
        var stateChanged = await ApplyLifecycleAsync(bill, archive, cancellationToken);
        if (stateChanged is null)
        {
            return ExpenseBillLifecycleResult.Conflict(
                bill.GroupId,
                bill.BillOwnerUserProfileId,
                bill.ArchivedAtUtc is not null);
        }

        if (stateChanged.Value)
        {
            if (bill.GroupId is null)
            {
                await personalBillAuditWriter.WriteAsync(
                    new PersonalBillAuditEvent(
                        archive ? BillArchivedAction : BillRestoredAction,
                        actor.AuthAccountId,
                        actor.AuthAccountId,
                        bill.Id,
                        PersonalGroupMode,
                        bill.Status,
                        bill.Items.Count,
                        bill.Adjustments.Count,
                        bill.Participants.Count,
                        bill.TotalCurrency,
                        bill.TotalAmount,
                        bill.UpdatedAtUtc),
                    cancellationToken);
            }
            else
            {
                await groupBillAuditWriter.WriteAsync(
                    new GroupBillAuditEvent(
                        archive ? BillArchivedAction : BillRestoredAction,
                        actor.AuthAccountId,
                        actor.AuthAccountId,
                        bill.Id,
                        bill.GroupId.Value,
                        GroupMode,
                        bill.Status,
                        bill.Items.Count,
                        bill.Adjustments.Count,
                        bill.Participants.Count,
                        bill.Payers.Count,
                        bill.TotalCurrency,
                        bill.TotalAmount,
                        bill.UpdatedAtUtc),
                    cancellationToken);
            }
        }

        return ExpenseBillLifecycleResult.Applied(
            MapResponse(bill),
            stateChanged.Value,
            bill.GroupId,
            bill.BillOwnerUserProfileId,
            bill.ArchivedAtUtc is not null);
    }

    private async Task<bool?> ApplyLifecycleAsync(
        ExpenseBill bill,
        bool archive,
        CancellationToken cancellationToken)
    {
        var isArchived = bill.ArchivedAtUtc is not null;
        if (archive && isArchived || !archive && !isArchived)
        {
            return false;
        }

        if (archive && await HasActiveSettlementStateAsync(bill.Id, cancellationToken))
        {
            return null;
        }

        var now = timeProvider.GetUtcNow();
        bill.ArchivedAtUtc = archive ? now : null;
        bill.UpdatedAtUtc = now;
        return true;
    }

    private async Task<ExpenseBill?> LoadPersonalLifecycleBillAsync(
        Guid billId,
        Guid actorUserProfileId,
        CancellationToken cancellationToken)
    {
        return await LifecycleBillQuery(dbContext)
            .SingleOrDefaultAsync(
                bill => bill.Id == billId
                    && bill.GroupId == null
                    && bill.CreatedByUserProfile.DeletedAtUtc == null
                    && (bill.CreatedByUserProfileId == actorUserProfileId
                        || bill.BillOwnerUserProfileId == actorUserProfileId),
                cancellationToken);
    }

    private async Task<ExpenseBill?> LoadGroupLifecycleBillAsync(
        Guid groupId,
        Guid billId,
        CancellationToken cancellationToken)
    {
        return await LifecycleBillQuery(dbContext)
            .SingleOrDefaultAsync(
                bill => bill.Id == billId
                    && bill.GroupId == groupId
                    && bill.Group != null
                    && bill.Group.DeletedAtUtc == null
                    && bill.CreatedByUserProfile.DeletedAtUtc == null,
                cancellationToken);
    }

    private static IQueryable<ExpenseBill> LifecycleBillQuery(SettleoraDbContext dbContext)
    {
        return dbContext.Set<ExpenseBill>()
            .Include(bill => bill.Group)
            .Include(bill => bill.CreatedByUserProfile)
            .Include(bill => bill.Items)
            .Include(bill => bill.Participants)
            .Include(bill => bill.Payers)
            .Include(bill => bill.Adjustments);
    }

    private async Task<bool> HasActiveSettlementStateAsync(
        Guid billId,
        CancellationToken cancellationToken)
    {
        return await dbContext.Set<SettlementRequest>()
            .AsNoTracking()
            .AnyAsync(
                settlementRequest => settlementRequest.SourceExpenseBillId == billId
                    && settlementRequest.ArchivedAtUtc == null
                    && ActiveSettlementRequestStatuses.Contains(settlementRequest.Status),
                cancellationToken);
    }

    private static ExpenseBillLifecycleResponse MapResponse(ExpenseBill bill)
    {
        return new ExpenseBillLifecycleResponse(
            bill.Id,
            bill.GroupId,
            bill.Status,
            bill.ArchivedAtUtc is null ? ActiveArchiveState : ArchivedArchiveState,
            bill.ArchivedAtUtc,
            bill.UpdatedAtUtc);
    }
}

internal enum ExpenseBillLifecycleResultKind
{
    Applied,
    Unavailable,
    Conflict
}

internal sealed record ExpenseBillLifecycleResult(
    ExpenseBillLifecycleResultKind Kind,
    ExpenseBillLifecycleResponse? Response,
    bool Mutated,
    Guid? GroupId,
    Guid? OwnerUserProfileId,
    bool? IsArchived)
{
    public static ExpenseBillLifecycleResult Applied(
        ExpenseBillLifecycleResponse response,
        bool mutated,
        Guid? groupId,
        Guid ownerUserProfileId,
        bool isArchived)
    {
        return new ExpenseBillLifecycleResult(
            ExpenseBillLifecycleResultKind.Applied,
            response,
            mutated,
            groupId,
            ownerUserProfileId,
            isArchived);
    }

    public static ExpenseBillLifecycleResult Unavailable()
    {
        return new ExpenseBillLifecycleResult(
            ExpenseBillLifecycleResultKind.Unavailable,
            null,
            Mutated: false,
            GroupId: null,
            OwnerUserProfileId: null,
            IsArchived: null);
    }

    public static ExpenseBillLifecycleResult Conflict(
        Guid? groupId,
        Guid ownerUserProfileId,
        bool isArchived)
    {
        return new ExpenseBillLifecycleResult(
            ExpenseBillLifecycleResultKind.Conflict,
            null,
            Mutated: false,
            groupId,
            ownerUserProfileId,
            isArchived);
    }
}

internal enum ExpenseBillLifecycleLoadResultKind
{
    Visible,
    Unavailable
}

internal sealed record ExpenseBillLifecycleLoadResult(
    ExpenseBillLifecycleLoadResultKind Kind,
    ExpenseBill? Bill)
{
    public static ExpenseBillLifecycleLoadResult Visible(ExpenseBill bill)
    {
        return new ExpenseBillLifecycleLoadResult(
            ExpenseBillLifecycleLoadResultKind.Visible,
            bill);
    }

    public static ExpenseBillLifecycleLoadResult Unavailable()
    {
        return new ExpenseBillLifecycleLoadResult(
            ExpenseBillLifecycleLoadResultKind.Unavailable,
            null);
    }
}
