using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.Users;
using Settleora.Api.Expenses.BillWorkflow;
using Settleora.Api.Expenses.BillSearch;
using Settleora.Api.Expenses.GroupBills;
using Settleora.Api.Expenses.PersonalBills;
using Settleora.Api.Expenses.RecurringBills;
using Settleora.Api.Notifications;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.FutureBills;

internal static class FutureBillEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string FutureBillUnavailableTitle = "Future bill unavailable";
    private const string FutureBillUnavailableDetail = "The requested future bill is unavailable.";
    private const string InvalidFutureBillRequestTitle = "Invalid future bill request";
    private const string InvalidFutureBillRequestDetail = "The submitted future bill request is invalid.";
    private const string InvalidFutureBillNoBodyTitle = "Invalid future bill request";
    private const string InvalidFutureBillNoBodyDetail = "This future bill action does not accept a request body.";
    private const string FutureBillConflictTitle = "Future bill conflict";
    private const string FutureBillConflictDetail = "The requested future bill transition is not allowed.";
    private const string FutureBillWriteFailedTitle = "Future bill write failed";
    private const string FutureBillWriteFailedDetail = "Unable to complete future bill write.";
    private const string FutureBillCreatedAction = "future_bill.created";
    private const string FutureBillUpdatedAction = "future_bill.updated";
    private const string FutureBillCancelledAction = "future_bill.cancelled";
    private const string BillSubmittedAction = "bill.submitted";
    private const string PersonalGroupMode = "personal";
    private const string GroupMode = "group";
    private static readonly string[] SupportedListQueryFields = ["status", "groupId", "fromDate", "toDate", "includeArchived"];

    public static WebApplication MapFutureBillEndpoints(this WebApplication app)
    {
        var futureBills = app.MapGroup("/api/v1/future-bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        futureBills.MapPost("", CreateFutureBillAsync);
        futureBills.MapGet("", ListFutureBillsAsync);
        futureBills.MapGet("/{futureBillId:guid}", GetFutureBillAsync);
        futureBills.MapPatch("/{futureBillId:guid}", UpdateFutureBillAsync);
        futureBills.MapPost("/{futureBillId:guid}/cancel", CancelFutureBillAsync);
        futureBills.MapPost("/{futureBillId:guid}/post", PostFutureBillAsync);

        return app;
    }

    private static async Task<IResult> CreateFutureBillAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IPersonalBillAuditWriter personalBillAuditWriter,
        IGroupBillAuditWriter groupBillAuditWriter,
        ExpenseBillCalculationService calculationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var readResult = await ReadCreateRequestAsync(request, timeProvider, cancellationToken);
        if (!readResult.Succeeded || readResult.Request is null)
        {
            return InvalidFutureBillRequest(readResult.Errors);
        }

        var writeRequest = readResult.Request;
        var authorizationResult = writeRequest.GroupId is null
            ? await businessAuthorizationService.CanAccessProfileAsync(actor.UserProfileId, cancellationToken)
            : await businessAuthorizationService.CanAccessGroupAsync(writeRequest.GroupId.Value, cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var activeMemberIds = writeRequest.GroupId is null
            ? null
            : await LoadActiveGroupMemberIdsAsync(dbContext, writeRequest.GroupId.Value, cancellationToken);
        if (!PayloadReferencesVisibleProfiles(
            writeRequest.Payload,
            actor.UserProfileId,
            actor.UserProfileId,
            writeRequest.GroupId,
            activeMemberIds))
        {
            return FutureBillUnavailable();
        }

        var now = timeProvider.GetUtcNow();
        var bill = CreateCalculatedDraftBill(
            writeRequest.GroupId,
            actor.UserProfileId,
            actor.UserProfileId,
            writeRequest.MerchantName,
            writeRequest.DueDate,
            writeRequest.Payload,
            calculationService,
            now,
            out var calculationFailure);
        if (bill is null)
        {
            return InvalidFutureBillRequest(calculationFailure!);
        }

        dbContext.Set<ExpenseBill>().Add(bill);
        await WriteAuditAsync(
            writeRequest.GroupId,
            FutureBillCreatedAction,
            actor,
            bill,
            personalBillAuditWriter,
            groupBillAuditWriter,
            cancellationToken);

        var saveResult = await SaveFutureBillAsync(dbContext, cancellationToken);
        return saveResult ?? Results.Created($"/api/v1/future-bills/{bill.Id:D}", MapResponse(bill));
    }

    private static async Task<IResult> ListFutureBillsAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var filterResult = ReadListFilter(request);
        if (!filterResult.Succeeded || filterResult.Filter is null)
        {
            return InvalidFutureBillRequest(filterResult.Errors);
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var query = VisibleFutureBills(dbContext, actor.UserProfileId, trackChanges: false);
        query = query.Where(bill => filterResult.Filter.GroupId == null || bill.GroupId == filterResult.Filter.GroupId);
        query = query.Where(bill => filterResult.Filter.Status == null || bill.Status == filterResult.Filter.Status);
        query = query.Where(bill => filterResult.Filter.FromDate == null || bill.BillDate >= filterResult.Filter.FromDate);
        query = query.Where(bill => filterResult.Filter.ToDate == null || bill.BillDate <= filterResult.Filter.ToDate);
        if (!filterResult.Filter.IncludeArchived)
        {
            query = query.Where(bill => bill.ArchivedAtUtc == null);
        }

        var bills = await query
            .OrderBy(bill => bill.BillDate)
            .ThenBy(bill => bill.CreatedAtUtc)
            .ThenBy(bill => bill.Id)
            .ToListAsync(cancellationToken);

        return Results.Ok(new FutureBillListResponse(bills.Select(MapResponse).ToArray()));
    }

    private static async Task<IResult> GetFutureBillAsync(
        Guid futureBillId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (TryRejectFutureBillReadEnvelope(request, out var result))
        {
            return result;
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var bill = await VisibleFutureBills(dbContext, actor.UserProfileId, trackChanges: false)
            .SingleOrDefaultAsync(candidate => candidate.Id == futureBillId, cancellationToken);
        return bill is null ? FutureBillUnavailable() : Results.Ok(MapResponse(bill));
    }

    private static async Task<IResult> UpdateFutureBillAsync(
        Guid futureBillId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IPersonalBillAuditWriter personalBillAuditWriter,
        IGroupBillAuditWriter groupBillAuditWriter,
        ExpenseBillCalculationService calculationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var patchResult = await ReadPatchRequestAsync(request, timeProvider, cancellationToken);
        if (!patchResult.Succeeded || patchResult.Request is null)
        {
            return InvalidFutureBillRequest(patchResult.Errors);
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var bill = await VisibleFutureBills(dbContext, actor.UserProfileId, trackChanges: true)
            .SingleOrDefaultAsync(candidate => candidate.Id == futureBillId, cancellationToken);
        if (bill is null)
        {
            return FutureBillUnavailable();
        }

        if (bill.Status != ExpenseBillStatuses.Draft || bill.ArchivedAtUtc is not null)
        {
            return FutureBillConflict();
        }

        if (bill.CreatedByUserProfileId != actor.UserProfileId
            && bill.BillOwnerUserProfileId != actor.UserProfileId)
        {
            return FutureBillUnavailable();
        }

        var nextMerchantName = patchResult.Request.MerchantNameSpecified
            ? patchResult.Request.MerchantName
            : bill.MerchantName;
        var nextDueDate = patchResult.Request.DueDate ?? bill.BillDate;
        var now = timeProvider.GetUtcNow();
        bill.MerchantName = nextMerchantName;
        bill.BillDate = nextDueDate;
        bill.UpdatedAtUtc = now;
        await WriteAuditAsync(
            bill.GroupId,
            FutureBillUpdatedAction,
            actor,
            bill,
            personalBillAuditWriter,
            groupBillAuditWriter,
            cancellationToken);

        var saveResult = await SaveFutureBillAsync(dbContext, cancellationToken);
        return saveResult ?? Results.Ok(MapResponse(bill));
    }

    private static async Task<IResult> CancelFutureBillAsync(
        Guid futureBillId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IPersonalBillAuditWriter personalBillAuditWriter,
        IGroupBillAuditWriter groupBillAuditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        if (RequestHasBody(request))
        {
            return InvalidFutureBillNoBody();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var bill = await VisibleFutureBills(dbContext, actor.UserProfileId, trackChanges: true)
            .SingleOrDefaultAsync(candidate => candidate.Id == futureBillId, cancellationToken);
        if (bill is null)
        {
            return FutureBillUnavailable();
        }

        if (bill.Status != ExpenseBillStatuses.Draft || bill.ArchivedAtUtc is not null)
        {
            return FutureBillConflict();
        }

        if (bill.CreatedByUserProfileId != actor.UserProfileId
            && bill.BillOwnerUserProfileId != actor.UserProfileId)
        {
            return FutureBillUnavailable();
        }

        var now = timeProvider.GetUtcNow();
        bill.Status = ExpenseBillStatuses.Cancelled;
        bill.ArchivedAtUtc = now;
        bill.UpdatedAtUtc = now;
        await WriteAuditAsync(
            bill.GroupId,
            FutureBillCancelledAction,
            actor,
            bill,
            personalBillAuditWriter,
            groupBillAuditWriter,
            cancellationToken);

        var saveResult = await SaveFutureBillAsync(dbContext, cancellationToken);
        return saveResult ?? Results.Ok(MapResponse(bill));
    }

    private static async Task<IResult> PostFutureBillAsync(
        Guid futureBillId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IExpenseBillWorkflowAuditWriter workflowAuditWriter,
        IInAppNotificationWriter notificationWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        if (RequestHasBody(request))
        {
            return InvalidFutureBillNoBody();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var bill = await VisibleFutureBills(dbContext, actor.UserProfileId, trackChanges: true)
            .SingleOrDefaultAsync(candidate => candidate.Id == futureBillId, cancellationToken);
        if (bill is null)
        {
            return FutureBillUnavailable();
        }

        if (bill.GroupId is not null)
        {
            var groupAuthorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
                bill.GroupId.Value,
                cancellationToken);
            if (!groupAuthorizationResult.Allowed)
            {
                return MapAuthorizationFailure(groupAuthorizationResult);
            }
        }

        if (bill.CreatedByUserProfileId != actor.UserProfileId)
        {
            return FutureBillUnavailable();
        }

        if (bill.Status != ExpenseBillStatuses.Draft
            || bill.ArchivedAtUtc is not null
            || bill.Participants.Count == 0
            || !CanResetParticipantStatuses(bill))
        {
            return FutureBillConflict();
        }

        var now = timeProvider.GetUtcNow();
        var previousBillStatus = bill.Status;
        foreach (var participant in bill.Participants)
        {
            if (participant.UserProfileId == actor.UserProfileId)
            {
                participant.Status = ExpenseBillParticipantStatuses.Accepted;
                participant.AcceptedAtUtc = now;
            }
            else
            {
                participant.Status = ExpenseBillParticipantStatuses.PendingAcceptance;
                participant.AcceptedAtUtc = null;
            }

            participant.RejectedAtUtc = null;
            participant.RejectionReasonCode = null;
            participant.UpdatedAtUtc = now;
        }

        bill.Status = bill.Participants.All(participant => participant.Status == ExpenseBillParticipantStatuses.Accepted)
            ? ExpenseBillStatuses.Confirmed
            : ExpenseBillStatuses.PendingConfirmation;
        bill.UpdatedAtUtc = now;

        var counts = CountParticipants(bill);
        await workflowAuditWriter.WriteAsync(
            new ExpenseBillWorkflowAuditEvent(
                BillSubmittedAction,
                actor.AuthAccountId,
                actor.AuthAccountId,
                bill.Id,
                bill.GroupId,
                bill.GroupId is null ? PersonalGroupMode : GroupMode,
                previousBillStatus,
                bill.Status,
                PreviousParticipantStatus: null,
                NewParticipantStatus: null,
                ParticipantUserProfileId: null,
                counts.ParticipantCount,
                counts.AcceptedCount,
                counts.RejectedCount,
                bill.TotalCurrency,
                bill.TotalAmount,
                RejectionReasonCode: null,
                now),
            cancellationToken);
        await InAppNotificationEvents.WriteBillPendingParticipantNotificationsAsync(
            notificationWriter,
            bill,
            actor.UserProfileId,
            BillSubmittedAction,
            InAppNotificationPriorities.Attention,
            now,
            cancellationToken);

        var saveResult = await SaveFutureBillAsync(dbContext, cancellationToken);
        return saveResult ?? Results.Ok(MapResponse(bill));
    }

    private static ExpenseBill? CreateCalculatedDraftBill(
        Guid? groupId,
        Guid ownerUserProfileId,
        Guid actorUserProfileId,
        string? merchantName,
        DateOnly dueDate,
        RecurringBillTemplatePayload payload,
        ExpenseBillCalculationService calculationService,
        DateTimeOffset now,
        out ExpenseBillCalculationFailure? failure)
    {
        var bill = RecurringBillDraftBuilder.CreateDraftBill(
            groupId,
            ownerUserProfileId,
            actorUserProfileId,
            merchantName,
            dueDate,
            payload,
            now);
        var initialCalculation = calculationService.Calculate(bill);
        if (!initialCalculation.Succeeded)
        {
            failure = initialCalculation.Failure;
            return null;
        }

        RecurringBillDraftBuilder.ApplyCalculation(bill, initialCalculation);
        RecurringBillDraftBuilder.AddPayers(
            bill,
            groupId is null ? ownerUserProfileId : actorUserProfileId,
            actorUserProfileId,
            payload,
            initialCalculation.BillTotal!.Amount,
            initialCalculation.BillTotal.Currency.Value,
            now);
        var finalCalculation = calculationService.Calculate(bill);
        if (!finalCalculation.Succeeded)
        {
            failure = finalCalculation.Failure;
            return null;
        }

        RecurringBillDraftBuilder.ApplyCalculation(bill, finalCalculation);
        bill.TotalAmount = finalCalculation.BillTotal!.Amount;
        bill.TotalCurrency = finalCalculation.BillTotal.Currency.Value;
        failure = null;
        return bill;
    }

    private static IQueryable<ExpenseBill> VisibleFutureBills(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId,
        bool trackChanges)
    {
        var today = DateOnly.MinValue;
        var query = dbContext.Set<ExpenseBill>()
            .Where(bill => bill.BillDate > today)
            .Where(bill => bill.Status == ExpenseBillStatuses.Draft
                || bill.Status == ExpenseBillStatuses.PendingConfirmation
                || bill.Status == ExpenseBillStatuses.Confirmed
                || bill.Status == ExpenseBillStatuses.Rejected
                || bill.Status == ExpenseBillStatuses.Cancelled)
            .Where(bill => bill.CreatedByUserProfile.DeletedAtUtc == null
                && ((bill.GroupId == null
                        && bill.BillOwnerUserProfileId == actorUserProfileId)
                    || (bill.GroupId != null
                        && bill.Group != null
                        && bill.Group.DeletedAtUtc == null
                        && bill.Group.Memberships.Any(membership => membership.UserProfileId == actorUserProfileId
                            && membership.Status == GroupMembershipStatuses.Active
                            && membership.UserProfile.DeletedAtUtc == null))))
            .WithBillDetails();

        return trackChanges ? query : query.AsNoTracking();
    }

    private static async Task<HashSet<Guid>> LoadActiveGroupMemberIdsAsync(
        SettleoraDbContext dbContext,
        Guid groupId,
        CancellationToken cancellationToken)
    {
        return await dbContext.Set<GroupMembership>()
            .AsNoTracking()
            .Where(membership => membership.GroupId == groupId
                && membership.Status == GroupMembershipStatuses.Active
                && membership.Group.DeletedAtUtc == null
                && membership.UserProfile.DeletedAtUtc == null)
            .Select(membership => membership.UserProfileId)
            .ToHashSetAsync(cancellationToken);
    }

    private static bool PayloadReferencesVisibleProfiles(
        RecurringBillTemplatePayload payload,
        Guid ownerUserProfileId,
        Guid actorUserProfileId,
        Guid? groupId,
        IReadOnlySet<Guid>? activeMemberIds)
    {
        var referencedProfileIds = RecurringBillDraftBuilder.ReferencedProfileIds(
            payload,
            ownerUserProfileId,
            actorUserProfileId,
            groupId is not null);

        return groupId is null
            ? referencedProfileIds.All(profileId => profileId == ownerUserProfileId)
            : activeMemberIds is not null
                && activeMemberIds.Contains(actorUserProfileId)
                && referencedProfileIds.All(activeMemberIds.Contains);
    }

    private static RecurringBillTemplatePayload ToPayload(ExpenseBill bill)
    {
        return new RecurringBillTemplatePayload(
            bill.TotalCurrency,
            bill.Items
                .Where(item => item.DeletedAtUtc is null)
                .OrderBy(item => item.SortOrder)
                .ThenBy(item => item.Id)
                .Select(item => new RecurringBillTemplatePayloadItem(
                    item.Name,
                    item.Note,
                    item.Amount,
                    item.Currency,
                    item.Splits
                        .OrderBy(split => split.AllocationOrder)
                        .ThenBy(split => split.UserProfileId)
                        .Select(split => new RecurringBillTemplatePayloadItemSplit(
                            split.UserProfileId,
                            split.SplitMethod,
                            split.BasisValue,
                            split.AllocationOrder))
                        .ToArray()))
                .ToArray(),
            bill.Adjustments
                .OrderBy(adjustment => adjustment.SortOrder)
                .ThenBy(adjustment => adjustment.Id)
                .Select(adjustment => new RecurringBillTemplatePayloadAdjustment(
                    adjustment.Type,
                    adjustment.Direction,
                    adjustment.AllocationMethod,
                    adjustment.Amount,
                    adjustment.Currency,
                    adjustment.ReasonNote))
                .ToArray(),
            bill.Payers
                .OrderBy(payer => payer.CreatedAtUtc)
                .ThenBy(payer => payer.Id)
                .Select(payer => new RecurringBillTemplatePayloadPayer(
                    payer.UserProfileId,
                    payer.Amount,
                    payer.Currency,
                    payer.PaymentMethodLabelSnapshot))
                .ToArray());
    }

    private static FutureBillResponse MapResponse(ExpenseBill bill)
    {
        var payload = ToPayload(bill);
        return new FutureBillResponse(
            bill.Id,
            bill.BillOwnerUserProfileId,
            bill.GroupId,
            bill.MerchantName,
            bill.BillDate,
            bill.Status,
            SettlementEffective: bill.Status == ExpenseBillStatuses.Confirmed,
            FormatAmount(bill.TotalAmount),
            bill.TotalCurrency,
            new RecurringBillTemplatePayloadResponse(
                payload.Currency,
                payload.Items.Select(item => new RecurringBillTemplatePayloadItemResponse(
                    item.Name,
                    item.Note,
                    FormatAmount(item.Amount),
                    item.Currency,
                    item.Splits.Select(split => new RecurringBillTemplatePayloadItemSplitResponse(
                        split.UserProfileId,
                        split.SplitMethod,
                        split.BasisValue is null ? null : FormatAmount(split.BasisValue.Value),
                        split.AllocationOrder)).ToArray())).ToArray(),
                payload.Adjustments.Select(adjustment => new RecurringBillTemplatePayloadAdjustmentResponse(
                    adjustment.Type,
                    adjustment.Direction,
                    adjustment.AllocationMethod,
                    FormatAmount(adjustment.Amount),
                    adjustment.Currency,
                    adjustment.ReasonNote)).ToArray(),
                payload.Payers.Select(payer => new RecurringBillTemplatePayloadPayerResponse(
                    payer.UserProfileId,
                    FormatAmount(payer.Amount),
                    payer.Currency,
                    payer.PaymentMethodLabelSnapshot)).ToArray()),
            bill.CreatedAtUtc,
            bill.UpdatedAtUtc,
            bill.ArchivedAtUtc);
    }

    private static bool CanResetParticipantStatuses(ExpenseBill bill)
    {
        return bill.Participants.All(participant => participant.Status is
            ExpenseBillParticipantStatuses.PendingAcceptance
            or ExpenseBillParticipantStatuses.Accepted
            or ExpenseBillParticipantStatuses.Rejected);
    }

    private static ParticipantCounts CountParticipants(ExpenseBill bill)
    {
        return new ParticipantCounts(
            bill.Participants.Count,
            bill.Participants.Count(participant => participant.Status == ExpenseBillParticipantStatuses.Accepted),
            bill.Participants.Count(participant => participant.Status == ExpenseBillParticipantStatuses.Rejected));
    }

    private static async Task WriteAuditAsync(
        Guid? groupId,
        string action,
        AuthenticatedActor actor,
        ExpenseBill bill,
        IPersonalBillAuditWriter personalBillAuditWriter,
        IGroupBillAuditWriter groupBillAuditWriter,
        CancellationToken cancellationToken)
    {
        if (groupId is null)
        {
            await personalBillAuditWriter.WriteAsync(
                new PersonalBillAuditEvent(
                    action,
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
            return;
        }

        await groupBillAuditWriter.WriteAsync(
            new GroupBillAuditEvent(
                action,
                actor.AuthAccountId,
                actor.AuthAccountId,
                bill.Id,
                groupId.Value,
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

    private static async Task<IResult?> SaveFutureBillAsync(
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return null;
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return FutureBillWriteFailed();
        }
    }

    private static async Task<FutureBillCreateReadResult> ReadCreateRequestAsync(
        HttpRequest request,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        var document = await ReadJsonDocumentAsync(request, errors, cancellationToken);
        if (document is null)
        {
            return FutureBillCreateReadResult.Invalid(ToErrorDictionary(errors));
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                AddError(errors, "body", "A JSON object body is required.");
                return FutureBillCreateReadResult.Invalid(ToErrorDictionary(errors));
            }

            var groupId = document.RootElement.TryGetProperty("groupId", out var groupIdElement)
                ? ReadNullableGuid(groupIdElement, "groupId", "Group ID", errors)
                : null;
            string? merchantName = null;
            DateOnly? dueDate = null;
            RecurringBillTemplatePayload? payload = null;

            foreach (var property in document.RootElement.EnumerateObject())
            {
                switch (property.Name)
                {
                    case "groupId":
                        break;
                    case "merchantName":
                        merchantName = ReadNullableText(
                            property.Value,
                            "merchantName",
                            "Merchant name",
                            ExpenseBillConstraints.MerchantNameMaxLength,
                            errors);
                        break;
                    case "dueDate":
                        dueDate = ReadFutureDueDate(property.Value, "dueDate", timeProvider, errors);
                        break;
                    case "billPayload":
                        payload = RecurringBillTemplatePayloadReader
                            .Read(property.Value, groupId is not null, errors)
                            .Payload;
                        break;
                    default:
                        AddUnsupportedFieldError(errors);
                        break;
                }
            }

            if (dueDate is null)
            {
                AddError(errors, "dueDate", "Due date is required.");
            }

            if (payload is null)
            {
                AddError(errors, "billPayload", "Bill payload is required.");
            }

            return errors.Count == 0
                ? FutureBillCreateReadResult.Valid(new FutureBillCreateRequest(groupId, merchantName, dueDate!.Value, payload!))
                : FutureBillCreateReadResult.Invalid(ToErrorDictionary(errors));
        }
    }

    private static async Task<FutureBillPatchReadResult> ReadPatchRequestAsync(
        HttpRequest request,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        var document = await ReadJsonDocumentAsync(request, errors, cancellationToken);
        if (document is null)
        {
            return FutureBillPatchReadResult.Invalid(ToErrorDictionary(errors));
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                AddError(errors, "body", "A JSON object body is required.");
                return FutureBillPatchReadResult.Invalid(ToErrorDictionary(errors));
            }

            string? merchantName = null;
            var merchantNameSpecified = false;
            DateOnly? dueDate = null;
            var hasSupportedField = false;
            foreach (var property in document.RootElement.EnumerateObject())
            {
                switch (property.Name)
                {
                    case "merchantName":
                        hasSupportedField = true;
                        merchantNameSpecified = true;
                        merchantName = ReadNullableText(
                            property.Value,
                            "merchantName",
                            "Merchant name",
                            ExpenseBillConstraints.MerchantNameMaxLength,
                            errors);
                        break;
                    case "dueDate":
                        hasSupportedField = true;
                        dueDate = ReadFutureDueDate(property.Value, "dueDate", timeProvider, errors);
                        break;
                    default:
                        AddUnsupportedFieldError(errors);
                        break;
                }
            }

            if (!hasSupportedField)
            {
                AddError(errors, "body", "At least one supported update field is required.");
            }

            return errors.Count == 0
                ? FutureBillPatchReadResult.Valid(new FutureBillPatchRequest(
                    merchantNameSpecified,
                    merchantName,
                    dueDate))
                : FutureBillPatchReadResult.Invalid(ToErrorDictionary(errors));
        }
    }

    private static FutureBillListFilterReadResult ReadListFilter(HttpRequest request)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        RejectListRequestBody(request, errors);
        RejectUnsupportedListQueryFields(request, errors);

        var status = ReadOptionalListQueryString(request, "status", errors);
        if (status is not null
            && status != ExpenseBillStatuses.Draft
            && status != ExpenseBillStatuses.PendingConfirmation
            && status != ExpenseBillStatuses.Confirmed
            && status != ExpenseBillStatuses.Rejected
            && status != ExpenseBillStatuses.Cancelled)
        {
            AddError(errors, "status", "Future bill status is not supported.");
        }

        var groupId = ReadOptionalQueryGuid(request, "groupId", errors);
        var fromDate = ReadOptionalQueryDate(request, "fromDate", errors);
        var toDate = ReadOptionalQueryDate(request, "toDate", errors);
        if (fromDate is not null && toDate is not null && toDate < fromDate)
        {
            AddError(errors, "toDate", "To date must be on or after from date.");
        }

        var includeArchived = ReadOptionalQueryBool(request, "includeArchived", errors) ?? false;
        return errors.Count == 0
            ? FutureBillListFilterReadResult.Valid(new FutureBillListFilter(status, groupId, fromDate, toDate, includeArchived))
            : FutureBillListFilterReadResult.Invalid(ToErrorDictionary(errors));
    }

    private static void RejectListRequestBody(
        HttpRequest request,
        Dictionary<string, List<string>> errors)
    {
        if (RequestHasBody(request))
        {
            AddError(errors, "body", "Future bill list requests do not accept a body.");
        }
    }

    private static bool TryRejectFutureBillReadEnvelope(HttpRequest request, out IResult result)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        if (request.Query.Count > 0)
        {
            AddError(errors, "query", "Unsupported query fields are not allowed.");
        }

        if (RequestHasBody(request))
        {
            AddError(errors, "body", "Future bill read requests do not accept a body.");
        }

        if (errors.Count == 0)
        {
            result = null!;
            return false;
        }

        result = InvalidFutureBillRequest(ToErrorDictionary(errors));
        return true;
    }

    private static void RejectUnsupportedListQueryFields(
        HttpRequest request,
        Dictionary<string, List<string>> errors)
    {
        foreach (var field in request.Query.Keys)
        {
            if (!SupportedListQueryFields.Contains(field, StringComparer.Ordinal))
            {
                AddError(errors, "query", "Unsupported query fields are not allowed.");
                return;
            }
        }
    }

    private static async Task<JsonDocument?> ReadJsonDocumentAsync(
        HttpRequest request,
        Dictionary<string, List<string>> errors,
        CancellationToken cancellationToken)
    {
        if (!request.HasJsonContentType())
        {
            AddError(errors, "body", "A JSON object body is required.");
            return null;
        }

        try
        {
            return await JsonDocument.ParseAsync(request.Body, cancellationToken: cancellationToken);
        }
        catch (JsonException)
        {
            AddError(errors, "body", "A JSON object body is required.");
            return null;
        }
        catch (BadHttpRequestException)
        {
            AddError(errors, "body", "A JSON object body is required.");
            return null;
        }
    }

    private static DateOnly? ReadFutureDueDate(
        JsonElement value,
        string errorKey,
        TimeProvider timeProvider,
        Dictionary<string, List<string>> errors)
    {
        var date = ReadDate(value, errorKey, errors);
        if (date is null)
        {
            return null;
        }

        var today = DateOnly.FromDateTime(timeProvider.GetUtcNow().UtcDateTime);
        if (date <= today)
        {
            AddError(errors, errorKey, "Due date must be in the future.");
            return null;
        }

        return date;
    }

    private static DateOnly? ReadDate(
        JsonElement value,
        string errorKey,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String
            || !DateOnly.TryParseExact(
                value.GetString(),
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var parsed))
        {
            AddError(errors, errorKey, "Date must be a yyyy-MM-dd date string.");
            return null;
        }

        return parsed;
    }

    private static Guid? ReadNullableGuid(
        JsonElement value,
        string errorKey,
        string label,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is JsonValueKind.Null)
        {
            return null;
        }

        if (value.ValueKind is not JsonValueKind.String
            || !Guid.TryParse(value.GetString(), out var parsed)
            || parsed == Guid.Empty)
        {
            AddError(errors, errorKey, $"{label} must be a valid non-empty GUID string.");
            return null;
        }

        return parsed;
    }

    private static Guid? ReadOptionalQueryGuid(
        HttpRequest request,
        string key,
        Dictionary<string, List<string>> errors)
    {
        var value = ReadOptionalListQueryString(request, key, errors);
        if (value is null)
        {
            return null;
        }

        if (!Guid.TryParse(value, out var parsed) || parsed == Guid.Empty)
        {
            AddError(errors, key, $"{key} must be a valid non-empty GUID.");
            return null;
        }

        return parsed;
    }

    private static DateOnly? ReadOptionalQueryDate(
        HttpRequest request,
        string key,
        Dictionary<string, List<string>> errors)
    {
        var value = ReadOptionalListQueryString(request, key, errors);
        if (value is null)
        {
            return null;
        }

        if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
        {
            AddError(errors, key, $"{key} must be a yyyy-MM-dd date string.");
            return null;
        }

        return parsed;
    }

    private static bool? ReadOptionalQueryBool(
        HttpRequest request,
        string key,
        Dictionary<string, List<string>> errors)
    {
        var value = ReadOptionalListQueryString(request, key, errors);
        if (value is null)
        {
            return null;
        }

        if (string.Equals(value, "true", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (string.Equals(value, "false", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        AddError(errors, key, $"{key} must be true or false.");
        return null;
    }

    private static string? ReadOptionalListQueryString(
        HttpRequest request,
        string key,
        Dictionary<string, List<string>> errors)
    {
        if (!request.Query.TryGetValue(key, out var values) || values == StringValues.Empty)
        {
            return null;
        }

        if (values.Count > 1)
        {
            AddError(errors, key, "Only one value is supported.");
            return null;
        }

        return values.ToString();
    }

    private static string? ReadNullableText(
        JsonElement value,
        string errorKey,
        string label,
        int maxLength,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is JsonValueKind.Null)
        {
            return null;
        }

        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, errorKey, $"{label} must be a string.");
            return null;
        }

        var trimmed = value.GetString()?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            AddError(errors, errorKey, $"{label} must not be blank when supplied.");
            return null;
        }

        if (trimmed.Length > maxLength)
        {
            AddError(errors, errorKey, $"{label} is too long.");
            return null;
        }

        return trimmed;
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : FutureBillUnavailable();
    }

    private static IResult InvalidFutureBillRequest(ExpenseBillCalculationFailure failure)
    {
        return InvalidFutureBillRequest(new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            [failure.Field.Replace("items.", "billPayload.items.", StringComparison.Ordinal)] = [failure.Message]
        });
    }

    private static IResult InvalidFutureBillRequest(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidFutureBillRequestTitle,
            detail: InvalidFutureBillRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult InvalidFutureBillNoBody()
    {
        return Results.Problem(
            title: InvalidFutureBillNoBodyTitle,
            detail: InvalidFutureBillNoBodyDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult FutureBillUnavailable()
    {
        return Results.Problem(
            title: FutureBillUnavailableTitle,
            detail: FutureBillUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult FutureBillConflict()
    {
        return Results.Problem(
            title: FutureBillConflictTitle,
            detail: FutureBillConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult FutureBillWriteFailed()
    {
        return Results.Problem(
            title: FutureBillWriteFailedTitle,
            detail: FutureBillWriteFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static bool RequestHasBody(HttpRequest request)
    {
        return request.ContentLength.GetValueOrDefault() > 0
            || request.Headers.TryGetValue("Transfer-Encoding", out var transferEncoding)
            && transferEncoding.Count > 0;
    }

    private static void AddUnsupportedFieldError(Dictionary<string, List<string>> errors)
    {
        AddError(errors, "body", "Request contains unsupported fields.");
    }

    private static void AddError(Dictionary<string, List<string>> errors, string key, string message)
    {
        if (!errors.TryGetValue(key, out var messages))
        {
            messages = [];
            errors[key] = messages;
        }

        messages.Add(message);
    }

    private static IDictionary<string, string[]> ToErrorDictionary(Dictionary<string, List<string>> errors)
    {
        return errors.ToDictionary(
            pair => pair.Key,
            pair => pair.Value.ToArray(),
            StringComparer.Ordinal);
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", CultureInfo.InvariantCulture);
    }

    private sealed record FutureBillCreateRequest(
        Guid? GroupId,
        string? MerchantName,
        DateOnly DueDate,
        RecurringBillTemplatePayload Payload);

    private sealed record FutureBillPatchRequest(
        bool MerchantNameSpecified,
        string? MerchantName,
        DateOnly? DueDate);

    private sealed record FutureBillListFilter(
        string? Status,
        Guid? GroupId,
        DateOnly? FromDate,
        DateOnly? ToDate,
        bool IncludeArchived);

    private sealed record ParticipantCounts(
        int ParticipantCount,
        int AcceptedCount,
        int RejectedCount);

    private sealed class FutureBillCreateReadResult
    {
        private FutureBillCreateReadResult(FutureBillCreateRequest? request, IDictionary<string, string[]> errors)
        {
            Request = request;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public FutureBillCreateRequest? Request { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static FutureBillCreateReadResult Valid(FutureBillCreateRequest request)
        {
            return new FutureBillCreateReadResult(request, new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static FutureBillCreateReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new FutureBillCreateReadResult(null, errors);
        }
    }

    private sealed class FutureBillPatchReadResult
    {
        private FutureBillPatchReadResult(FutureBillPatchRequest? request, IDictionary<string, string[]> errors)
        {
            Request = request;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public FutureBillPatchRequest? Request { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static FutureBillPatchReadResult Valid(FutureBillPatchRequest request)
        {
            return new FutureBillPatchReadResult(request, new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static FutureBillPatchReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new FutureBillPatchReadResult(null, errors);
        }
    }

    private sealed class FutureBillListFilterReadResult
    {
        private FutureBillListFilterReadResult(FutureBillListFilter? filter, IDictionary<string, string[]> errors)
        {
            Filter = filter;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public FutureBillListFilter? Filter { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static FutureBillListFilterReadResult Valid(FutureBillListFilter filter)
        {
            return new FutureBillListFilterReadResult(filter, new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static FutureBillListFilterReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new FutureBillListFilterReadResult(null, errors);
        }
    }
}
