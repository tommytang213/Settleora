using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Notifications;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.BillWorkflow;

internal static class ExpenseBillWorkflowEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string BillUnavailableTitle = "Bill unavailable";
    private const string BillUnavailableDetail = "The requested bill is unavailable.";
    private const string GroupBillUnavailableTitle = "Group bill unavailable";
    private const string GroupBillUnavailableDetail = "The requested group bill is unavailable.";
    private const string InvalidBillWorkflowRequestTitle = "Invalid bill workflow request";
    private const string InvalidBillWorkflowRequestDetail = "The submitted bill workflow request is invalid.";
    private const string BillWorkflowConflictTitle = "Bill workflow conflict";
    private const string BillWorkflowConflictDetail = "The requested bill workflow transition is not allowed.";
    private const string BillWorkflowWriteFailedTitle = "Bill workflow write failed";
    private const string BillWorkflowWriteFailedDetail = "Unable to complete bill workflow write.";
    private const string PersonalGroupMode = "personal";
    private const string GroupMode = "group";
    private const string BillSubmittedAction = "bill.submitted";
    private const string BillParticipantAcceptedAction = "bill.participant_accepted";
    private const string BillParticipantRejectedAction = "bill.participant_rejected";
    private const string BillConfirmedAction = "bill.confirmed";

    public static WebApplication MapExpenseBillWorkflowEndpoints(this WebApplication app)
    {
        var personalBills = app.MapGroup("/api/v1/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        personalBills.MapPost("/{billId:guid}/submit", SubmitPersonalBillAsync);
        personalBills.MapPost("/{billId:guid}/participants/{userProfileId:guid}/accept", AcceptPersonalBillParticipantAsync);
        personalBills.MapPost("/{billId:guid}/participants/{userProfileId:guid}/reject", RejectPersonalBillParticipantAsync);

        var groupBills = app.MapGroup("/api/v1/groups/{groupId:guid}/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        groupBills.MapPost("/{billId:guid}/submit", SubmitGroupBillAsync);
        groupBills.MapPost("/{billId:guid}/participants/{userProfileId:guid}/accept", AcceptGroupBillParticipantAsync);
        groupBills.MapPost("/{billId:guid}/participants/{userProfileId:guid}/reject", RejectGroupBillParticipantAsync);

        return app;
    }

    private static async Task<IResult> SubmitPersonalBillAsync(
        Guid billId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IExpenseBillWorkflowAuditWriter auditWriter,
        IInAppNotificationWriter notificationWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult, isGroupBill: false);
        }

        var bill = await LoadPersonalBillForCreatorAsync(
            dbContext,
            billId,
            actor.UserProfileId,
            cancellationToken);
        if (bill is null)
        {
            return BillUnavailable();
        }

        return await SubmitBillAsync(
            bill,
            actor,
            auditWriter,
            notificationWriter,
            dbContext,
            timeProvider,
            PersonalGroupMode,
            groupId: null,
            cancellationToken);
    }

    private static async Task<IResult> SubmitGroupBillAsync(
        Guid groupId,
        Guid billId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IExpenseBillWorkflowAuditWriter auditWriter,
        IInAppNotificationWriter notificationWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
            groupId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult, isGroupBill: true);
        }

        var bill = await LoadGroupBillForCreatorAsync(
            dbContext,
            groupId,
            billId,
            actor.UserProfileId,
            cancellationToken);
        if (bill is null)
        {
            return GroupBillUnavailable();
        }

        return await SubmitBillAsync(
            bill,
            actor,
            auditWriter,
            notificationWriter,
            dbContext,
            timeProvider,
            GroupMode,
            groupId,
            cancellationToken);
    }

    private static async Task<IResult> AcceptPersonalBillParticipantAsync(
        Guid billId,
        Guid userProfileId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IExpenseBillWorkflowAuditWriter auditWriter,
        IInAppNotificationWriter notificationWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        if (actor.UserProfileId != userProfileId)
        {
            return BillUnavailable();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult, isGroupBill: false);
        }

        var bill = await LoadPersonalBillForParticipantAsync(
            dbContext,
            billId,
            actor.UserProfileId,
            cancellationToken);
        if (bill is null)
        {
            return BillUnavailable();
        }

        return await AcceptBillParticipantAsync(
            bill,
            actor,
            auditWriter,
            notificationWriter,
            dbContext,
            timeProvider,
            PersonalGroupMode,
            groupId: null,
            cancellationToken);
    }

    private static async Task<IResult> AcceptGroupBillParticipantAsync(
        Guid groupId,
        Guid billId,
        Guid userProfileId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IExpenseBillWorkflowAuditWriter auditWriter,
        IInAppNotificationWriter notificationWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        if (actor.UserProfileId != userProfileId)
        {
            return GroupBillUnavailable();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
            groupId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult, isGroupBill: true);
        }

        var bill = await LoadGroupBillForParticipantAsync(
            dbContext,
            groupId,
            billId,
            actor.UserProfileId,
            cancellationToken);
        if (bill is null)
        {
            return GroupBillUnavailable();
        }

        return await AcceptBillParticipantAsync(
            bill,
            actor,
            auditWriter,
            notificationWriter,
            dbContext,
            timeProvider,
            GroupMode,
            groupId,
            cancellationToken);
    }

    private static async Task<IResult> RejectPersonalBillParticipantAsync(
        Guid billId,
        Guid userProfileId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IExpenseBillWorkflowAuditWriter auditWriter,
        IInAppNotificationWriter notificationWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        if (actor.UserProfileId != userProfileId)
        {
            return BillUnavailable();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult, isGroupBill: false);
        }

        var readResult = await ReadRejectRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.ReasonCode is null)
        {
            return InvalidBillWorkflowRequest(readResult.Errors);
        }

        var bill = await LoadPersonalBillForParticipantAsync(
            dbContext,
            billId,
            actor.UserProfileId,
            cancellationToken);
        if (bill is null)
        {
            return BillUnavailable();
        }

        return await RejectBillParticipantAsync(
            bill,
            actor,
            readResult.ReasonCode,
            auditWriter,
            notificationWriter,
            dbContext,
            timeProvider,
            PersonalGroupMode,
            groupId: null,
            cancellationToken);
    }

    private static async Task<IResult> RejectGroupBillParticipantAsync(
        Guid groupId,
        Guid billId,
        Guid userProfileId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IExpenseBillWorkflowAuditWriter auditWriter,
        IInAppNotificationWriter notificationWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        if (actor.UserProfileId != userProfileId)
        {
            return GroupBillUnavailable();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
            groupId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult, isGroupBill: true);
        }

        var readResult = await ReadRejectRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.ReasonCode is null)
        {
            return InvalidBillWorkflowRequest(readResult.Errors);
        }

        var bill = await LoadGroupBillForParticipantAsync(
            dbContext,
            groupId,
            billId,
            actor.UserProfileId,
            cancellationToken);
        if (bill is null)
        {
            return GroupBillUnavailable();
        }

        return await RejectBillParticipantAsync(
            bill,
            actor,
            readResult.ReasonCode,
            auditWriter,
            notificationWriter,
            dbContext,
            timeProvider,
            GroupMode,
            groupId,
            cancellationToken);
    }

    private static async Task<IResult> SubmitBillAsync(
        ExpenseBill bill,
        AuthenticatedActor actor,
        IExpenseBillWorkflowAuditWriter auditWriter,
        IInAppNotificationWriter notificationWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        string groupMode,
        Guid? groupId,
        CancellationToken cancellationToken)
    {
        if (bill.Status != ExpenseBillStatuses.Draft
            || bill.Participants.Count == 0
            || !CanResetParticipantStatuses(bill))
        {
            return BillWorkflowConflict();
        }

        var now = timeProvider.GetUtcNow();
        var previousBillStatus = bill.Status;
        bill.Status = ExpenseBillStatuses.PendingConfirmation;
        bill.UpdatedAtUtc = now;

        foreach (var participant in bill.Participants)
        {
            participant.Status = ExpenseBillParticipantStatuses.PendingAcceptance;
            participant.AcceptedAtUtc = null;
            participant.RejectedAtUtc = null;
            participant.RejectionReasonCode = null;
            participant.UpdatedAtUtc = now;
        }

        var counts = CountParticipants(bill);
        await auditWriter.WriteAsync(
            new ExpenseBillWorkflowAuditEvent(
                BillSubmittedAction,
                actor.AuthAccountId,
                actor.AuthAccountId,
                bill.Id,
                groupId,
                groupMode,
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
        await InAppNotificationEvents.WriteBillParticipantNotificationsAsync(
            notificationWriter,
            bill,
            actor.UserProfileId,
            BillSubmittedAction,
            InAppNotificationPriorities.Attention,
            now,
            cancellationToken);

        return await SaveWorkflowAsync(dbContext, cancellationToken);
    }

    private static async Task<IResult> AcceptBillParticipantAsync(
        ExpenseBill bill,
        AuthenticatedActor actor,
        IExpenseBillWorkflowAuditWriter auditWriter,
        IInAppNotificationWriter notificationWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        string groupMode,
        Guid? groupId,
        CancellationToken cancellationToken)
    {
        var participant = FindParticipant(bill, actor.UserProfileId);
        if (participant is null)
        {
            return groupId.HasValue ? GroupBillUnavailable() : BillUnavailable();
        }

        if (bill.Status != ExpenseBillStatuses.PendingConfirmation
            || participant.Status != ExpenseBillParticipantStatuses.PendingAcceptance)
        {
            return BillWorkflowConflict();
        }

        var now = timeProvider.GetUtcNow();
        var previousBillStatus = bill.Status;
        var previousParticipantStatus = participant.Status;

        participant.Status = ExpenseBillParticipantStatuses.Accepted;
        participant.AcceptedAtUtc = now;
        participant.RejectedAtUtc = null;
        participant.RejectionReasonCode = null;
        participant.UpdatedAtUtc = now;

        var confirmed = bill.Participants.All(candidate => candidate.Status == ExpenseBillParticipantStatuses.Accepted);
        bill.Status = confirmed
            ? ExpenseBillStatuses.Confirmed
            : ExpenseBillStatuses.PendingConfirmation;
        bill.UpdatedAtUtc = now;

        var counts = CountParticipants(bill);
        await auditWriter.WriteAsync(
            new ExpenseBillWorkflowAuditEvent(
                BillParticipantAcceptedAction,
                actor.AuthAccountId,
                actor.AuthAccountId,
                bill.Id,
                groupId,
                groupMode,
                previousBillStatus,
                bill.Status,
                previousParticipantStatus,
                participant.Status,
                participant.UserProfileId,
                counts.ParticipantCount,
                counts.AcceptedCount,
                counts.RejectedCount,
                bill.TotalCurrency,
                bill.TotalAmount,
                RejectionReasonCode: null,
                now),
            cancellationToken);
        await InAppNotificationEvents.WriteBillCreatorNotificationAsync(
            notificationWriter,
            bill,
            actor.UserProfileId,
            BillParticipantAcceptedAction,
            InAppNotificationPriorities.Normal,
            now,
            cancellationToken);

        if (confirmed)
        {
            await auditWriter.WriteAsync(
                new ExpenseBillWorkflowAuditEvent(
                    BillConfirmedAction,
                    actor.AuthAccountId,
                    actor.AuthAccountId,
                    bill.Id,
                    groupId,
                    groupMode,
                    previousBillStatus,
                    bill.Status,
                    previousParticipantStatus,
                    participant.Status,
                    participant.UserProfileId,
                    counts.ParticipantCount,
                    counts.AcceptedCount,
                    counts.RejectedCount,
                    bill.TotalCurrency,
                    bill.TotalAmount,
                    RejectionReasonCode: null,
                    now),
                cancellationToken);
            await InAppNotificationEvents.WriteBillCreatorNotificationAsync(
                notificationWriter,
                bill,
                actor.UserProfileId,
                BillConfirmedAction,
                InAppNotificationPriorities.Normal,
                now,
                cancellationToken);
        }

        return await SaveWorkflowAsync(dbContext, cancellationToken);
    }

    private static async Task<IResult> RejectBillParticipantAsync(
        ExpenseBill bill,
        AuthenticatedActor actor,
        string reasonCode,
        IExpenseBillWorkflowAuditWriter auditWriter,
        IInAppNotificationWriter notificationWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        string groupMode,
        Guid? groupId,
        CancellationToken cancellationToken)
    {
        var participant = FindParticipant(bill, actor.UserProfileId);
        if (participant is null)
        {
            return groupId.HasValue ? GroupBillUnavailable() : BillUnavailable();
        }

        if (bill.Status != ExpenseBillStatuses.PendingConfirmation
            || participant.Status != ExpenseBillParticipantStatuses.PendingAcceptance)
        {
            return BillWorkflowConflict();
        }

        var now = timeProvider.GetUtcNow();
        var previousBillStatus = bill.Status;
        var previousParticipantStatus = participant.Status;

        participant.Status = ExpenseBillParticipantStatuses.Rejected;
        participant.AcceptedAtUtc = null;
        participant.RejectedAtUtc = now;
        participant.RejectionReasonCode = reasonCode;
        participant.UpdatedAtUtc = now;

        bill.Status = ExpenseBillStatuses.Rejected;
        bill.UpdatedAtUtc = now;

        var counts = CountParticipants(bill);
        await auditWriter.WriteAsync(
            new ExpenseBillWorkflowAuditEvent(
                BillParticipantRejectedAction,
                actor.AuthAccountId,
                actor.AuthAccountId,
                bill.Id,
                groupId,
                groupMode,
                previousBillStatus,
                bill.Status,
                previousParticipantStatus,
                participant.Status,
                participant.UserProfileId,
                counts.ParticipantCount,
                counts.AcceptedCount,
                counts.RejectedCount,
                bill.TotalCurrency,
                bill.TotalAmount,
                reasonCode,
                now),
            cancellationToken);
        await InAppNotificationEvents.WriteBillCreatorNotificationAsync(
            notificationWriter,
            bill,
            actor.UserProfileId,
            BillParticipantRejectedAction,
            InAppNotificationPriorities.Attention,
            now,
            cancellationToken);

        return await SaveWorkflowAsync(dbContext, cancellationToken);
    }

    private static async Task<ExpenseBill?> LoadPersonalBillForCreatorAsync(
        SettleoraDbContext dbContext,
        Guid billId,
        Guid creatorUserProfileId,
        CancellationToken cancellationToken)
    {
        return await BillWorkflowQuery(dbContext)
            .SingleOrDefaultAsync(
                bill => bill.Id == billId
                    && bill.GroupId == null
                    && bill.CreatedByUserProfileId == creatorUserProfileId
                    && bill.ArchivedAtUtc == null
                    && bill.CreatedByUserProfile.DeletedAtUtc == null,
                cancellationToken);
    }

    private static async Task<ExpenseBill?> LoadPersonalBillForParticipantAsync(
        SettleoraDbContext dbContext,
        Guid billId,
        Guid participantUserProfileId,
        CancellationToken cancellationToken)
    {
        return await BillWorkflowQuery(dbContext)
            .SingleOrDefaultAsync(
                bill => bill.Id == billId
                    && bill.GroupId == null
                    && bill.ArchivedAtUtc == null
                    && bill.CreatedByUserProfile.DeletedAtUtc == null
                    && bill.Participants.Any(participant => participant.UserProfileId == participantUserProfileId
                        && participant.UserProfile.DeletedAtUtc == null),
                cancellationToken);
    }

    private static async Task<ExpenseBill?> LoadGroupBillForCreatorAsync(
        SettleoraDbContext dbContext,
        Guid groupId,
        Guid billId,
        Guid creatorUserProfileId,
        CancellationToken cancellationToken)
    {
        return await BillWorkflowQuery(dbContext)
            .SingleOrDefaultAsync(
                bill => bill.Id == billId
                    && bill.GroupId == groupId
                    && bill.CreatedByUserProfileId == creatorUserProfileId
                    && bill.ArchivedAtUtc == null
                    && bill.Group != null
                    && bill.Group.DeletedAtUtc == null
                    && bill.CreatedByUserProfile.DeletedAtUtc == null,
                cancellationToken);
    }

    private static async Task<ExpenseBill?> LoadGroupBillForParticipantAsync(
        SettleoraDbContext dbContext,
        Guid groupId,
        Guid billId,
        Guid participantUserProfileId,
        CancellationToken cancellationToken)
    {
        return await BillWorkflowQuery(dbContext)
            .SingleOrDefaultAsync(
                bill => bill.Id == billId
                    && bill.GroupId == groupId
                    && bill.ArchivedAtUtc == null
                    && bill.Group != null
                    && bill.Group.DeletedAtUtc == null
                    && bill.CreatedByUserProfile.DeletedAtUtc == null
                    && bill.Participants.Any(participant => participant.UserProfileId == participantUserProfileId
                        && participant.UserProfile.DeletedAtUtc == null),
                cancellationToken);
    }

    private static IQueryable<ExpenseBill> BillWorkflowQuery(SettleoraDbContext dbContext)
    {
        return dbContext.Set<ExpenseBill>()
            .Include(bill => bill.Group)
            .Include(bill => bill.CreatedByUserProfile)
            .Include(bill => bill.Participants)
                .ThenInclude(participant => participant.UserProfile);
    }

    private static async Task<RejectBillParticipantReadResult> ReadRejectRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        if (!request.HasJsonContentType())
        {
            AddError(errors, "body", "A JSON object body is required.");
            return RejectBillParticipantReadResult.Invalid(ToErrorDictionary(errors));
        }

        JsonDocument document;
        try
        {
            document = await JsonDocument.ParseAsync(
                request.Body,
                cancellationToken: cancellationToken);
        }
        catch (JsonException)
        {
            AddError(errors, "body", "A JSON object body is required.");
            return RejectBillParticipantReadResult.Invalid(ToErrorDictionary(errors));
        }
        catch (BadHttpRequestException)
        {
            AddError(errors, "body", "A JSON object body is required.");
            return RejectBillParticipantReadResult.Invalid(ToErrorDictionary(errors));
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                AddError(errors, "body", "A JSON object body is required.");
                return RejectBillParticipantReadResult.Invalid(ToErrorDictionary(errors));
            }

            string? reasonCode = null;
            var hasReasonCode = false;
            foreach (var property in document.RootElement.EnumerateObject())
            {
                switch (property.Name)
                {
                    case "reasonCode":
                        hasReasonCode = true;
                        reasonCode = ReadReasonCode(property.Value, errors);
                        break;
                    default:
                        AddUnsupportedFieldError(errors);
                        break;
                }
            }

            if (!hasReasonCode)
            {
                AddError(errors, "reasonCode", "Rejection reason code is required.");
            }

            return errors.Count == 0 && reasonCode is not null
                ? RejectBillParticipantReadResult.Valid(reasonCode)
                : RejectBillParticipantReadResult.Invalid(ToErrorDictionary(errors));
        }
    }

    private static string? ReadReasonCode(
        JsonElement value,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, "reasonCode", "Rejection reason code is not supported.");
            return null;
        }

        var reasonCode = value.GetString();
        if (!ExpenseBillParticipantRejectionReasonCodes.IsSupported(reasonCode))
        {
            AddError(errors, "reasonCode", "Rejection reason code is not supported.");
            return null;
        }

        return reasonCode;
    }

    private static bool CanResetParticipantStatuses(ExpenseBill bill)
    {
        return bill.Participants.All(participant => participant.Status is
            ExpenseBillParticipantStatuses.PendingAcceptance
            or ExpenseBillParticipantStatuses.Accepted
            or ExpenseBillParticipantStatuses.Rejected);
    }

    private static ExpenseBillParticipant? FindParticipant(
        ExpenseBill bill,
        Guid userProfileId)
    {
        return bill.Participants.SingleOrDefault(participant => participant.UserProfileId == userProfileId);
    }

    private static ParticipantCounts CountParticipants(ExpenseBill bill)
    {
        return new ParticipantCounts(
            bill.Participants.Count,
            bill.Participants.Count(participant => participant.Status == ExpenseBillParticipantStatuses.Accepted),
            bill.Participants.Count(participant => participant.Status == ExpenseBillParticipantStatuses.Rejected));
    }

    private static async Task<IResult> SaveWorkflowAsync(
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
            return BillWorkflowWriteFailed();
        }

        return Results.NoContent();
    }

    private static IResult MapAuthorizationFailure(
        BusinessAuthorizationResult authorizationResult,
        bool isGroupBill)
    {
        if (authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated)
        {
            return Unauthenticated();
        }

        return isGroupBill
            ? GroupBillUnavailable()
            : BillUnavailable();
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

    private static IResult InvalidBillWorkflowRequest(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidBillWorkflowRequestTitle,
            detail: InvalidBillWorkflowRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult BillWorkflowConflict()
    {
        return Results.Problem(
            title: BillWorkflowConflictTitle,
            detail: BillWorkflowConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult BillWorkflowWriteFailed()
    {
        return Results.Problem(
            title: BillWorkflowWriteFailedTitle,
            detail: BillWorkflowWriteFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static void AddUnsupportedFieldError(Dictionary<string, List<string>> errors)
    {
        AddError(errors, "body", "Unsupported fields are not allowed.");
    }

    private static void AddError(
        Dictionary<string, List<string>> errors,
        string key,
        string message)
    {
        if (!errors.TryGetValue(key, out var values))
        {
            values = [];
            errors[key] = values;
        }

        if (!values.Contains(message, StringComparer.Ordinal))
        {
            values.Add(message);
        }
    }

    private static IDictionary<string, string[]> ToErrorDictionary(
        Dictionary<string, List<string>> errors)
    {
        return errors.ToDictionary(
            pair => pair.Key,
            pair => pair.Value.ToArray(),
            StringComparer.Ordinal);
    }

    private sealed record ParticipantCounts(
        int ParticipantCount,
        int AcceptedCount,
        int RejectedCount);

    private sealed class RejectBillParticipantReadResult
    {
        private RejectBillParticipantReadResult(
            string? reasonCode,
            IDictionary<string, string[]> errors)
        {
            ReasonCode = reasonCode;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public string? ReasonCode { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static RejectBillParticipantReadResult Valid(string reasonCode)
        {
            return new RejectBillParticipantReadResult(
                reasonCode,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static RejectBillParticipantReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new RejectBillParticipantReadResult(null, errors);
        }
    }
}
