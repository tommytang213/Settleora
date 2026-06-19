using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Money;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.ReceiptOcrReviews;

internal static class ReceiptOcrReviewEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string BillUnavailableTitle = "Bill unavailable";
    private const string BillUnavailableDetail = "The requested bill is unavailable.";
    private const string ReceiptOcrReviewUnavailableTitle = "Receipt OCR review unavailable";
    private const string ReceiptOcrReviewUnavailableDetail = "The requested receipt OCR review is unavailable.";
    private const string InvalidReceiptOcrReviewTitle = "Invalid receipt OCR review";
    private const string InvalidReceiptOcrReviewDetail = "The submitted receipt OCR review is invalid.";
    private const string ReceiptOcrReviewConflictTitle = "Receipt OCR review conflict";
    private const string ReceiptOcrReviewConflictDetail = "The receipt OCR review cannot be changed for the current bill state.";
    private const string ReceiptOcrReviewSaveFailedTitle = "Receipt OCR review save failed";
    private const string ReceiptOcrReviewSaveFailedDetail = "Unable to save the receipt OCR review.";
    private const string ReceiptOcrReviewAccessFailedTitle = "Receipt OCR review access failed";
    private const string ReceiptOcrReviewAccessFailedDetail = "Unable to complete receipt OCR review access.";
    private const string InvalidReceiptOcrReviewQueryTitle = "Invalid receipt OCR review query";
    private const string InvalidReceiptOcrReviewQueryDetail = "The submitted receipt OCR review query is invalid.";
    private const string InvalidReceiptOcrReviewApplyTitle = "Invalid receipt OCR review apply request";
    private const string InvalidReceiptOcrReviewApplyDetail = "The submitted receipt OCR review apply request is invalid.";
    private const string PersonalGroupMode = "personal";
    private const string GroupMode = "group";
    private const string ReviewSavedAction = "bill_attachment.ocr_review_saved";
    private const string ReviewReadAction = "bill_attachment.ocr_review_read";
    private const string ReviewRemovedAction = "bill_attachment.ocr_review_removed";
    private const string ReviewAppliedAction = "bill_attachment.ocr_review_applied";
    private const int DefaultReceiptOcrReviewQueueLimit = 50;
    private const int MaxReceiptOcrReviewQueueLimit = 100;

    private static readonly string[] VisibleBillStatuses =
    [
        ExpenseBillStatuses.Draft,
        ExpenseBillStatuses.PendingConfirmation,
        ExpenseBillStatuses.Confirmed,
        ExpenseBillStatuses.Rejected,
        ExpenseBillStatuses.Finalized
    ];

    private static readonly string[] MutableBillStatuses =
    [
        ExpenseBillStatuses.Draft,
        ExpenseBillStatuses.PendingConfirmation,
        ExpenseBillStatuses.Confirmed,
        ExpenseBillStatuses.Rejected
    ];

    private static readonly string[] SupportedReceiptContentTypeValues =
    [
        "image/png",
        "image/jpeg",
        "image/webp"
    ];

    private static readonly HashSet<string> HeaderAmountProperties =
    [
        "subtotalAmount",
        "taxAmount",
        "serviceChargeAmount",
        "discountAmount",
        "grandTotalAmount"
    ];

    private static readonly HashSet<string> AllowedRootProperties =
    [
        "status",
        "source",
        "merchantText",
        "receiptIssuedAtUtc",
        "currency",
        "subtotalAmount",
        "taxAmount",
        "serviceChargeAmount",
        "discountAmount",
        "grandTotalAmount",
        "lines"
    ];

    private static readonly HashSet<string> AllowedLineProperties =
    [
        "text",
        "quantity",
        "unitPriceAmount",
        "lineTotalAmount"
    ];

    private static readonly HashSet<string> AllowedQueueQueryProperties =
    [
        "status",
        "source",
        "limit"
    ];

    private static readonly HashSet<string> AllowedApplyRootProperties =
    [
        "applyMode",
        "expectedReviewUpdatedAtUtc"
    ];

    public static WebApplication MapReceiptOcrReviewEndpoints(this WebApplication app)
    {
        var reviewQueue = app.MapGroup("/api/v1/receipt-ocr-reviews")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        reviewQueue.MapGet("", ListReceiptOcrReviewsForCurrentActorAsync);

        var groupReviewQueue = app.MapGroup("/api/v1/groups/{groupId:guid}/receipt-ocr-reviews")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        groupReviewQueue.MapGet("", ListGroupReceiptOcrReviewsAsync);

        var bills = app.MapGroup("/api/v1/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        bills.MapPut("/{billId:guid}/attachments/{fileId:guid}/ocr-review", UpsertPersonalReceiptOcrReviewAsync);
        bills.MapGet("/{billId:guid}/attachments/{fileId:guid}/ocr-review", GetPersonalReceiptOcrReviewAsync);
        bills.MapGet("/{billId:guid}/attachments/{fileId:guid}/ocr-review/apply-preview", GetPersonalReceiptOcrReviewApplyPreviewAsync);
        bills.MapPost("/{billId:guid}/attachments/{fileId:guid}/ocr-review/apply", ApplyPersonalReceiptOcrReviewAsync);
        bills.MapDelete("/{billId:guid}/attachments/{fileId:guid}/ocr-review", RemovePersonalReceiptOcrReviewAsync);

        var groupBills = app.MapGroup("/api/v1/groups/{groupId:guid}/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        groupBills.MapPut("/{billId:guid}/attachments/{fileId:guid}/ocr-review", UpsertGroupReceiptOcrReviewAsync);
        groupBills.MapGet("/{billId:guid}/attachments/{fileId:guid}/ocr-review", GetGroupReceiptOcrReviewAsync);
        groupBills.MapGet("/{billId:guid}/attachments/{fileId:guid}/ocr-review/apply-preview", GetGroupReceiptOcrReviewApplyPreviewAsync);
        groupBills.MapPost("/{billId:guid}/attachments/{fileId:guid}/ocr-review/apply", ApplyGroupReceiptOcrReviewAsync);
        groupBills.MapDelete("/{billId:guid}/attachments/{fileId:guid}/ocr-review", RemoveGroupReceiptOcrReviewAsync);

        return app;
    }

    private static Task<IResult> ListReceiptOcrReviewsForCurrentActorAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        return ListReceiptOcrReviewQueueAsync(
            routeGroupId: null,
            request,
            currentActorAccessor,
            businessAuthorizationService,
            dbContext,
            cancellationToken);
    }

    private static Task<IResult> ListGroupReceiptOcrReviewsAsync(
        Guid groupId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        return ListReceiptOcrReviewQueueAsync(
            groupId,
            request,
            currentActorAccessor,
            businessAuthorizationService,
            dbContext,
            cancellationToken);
    }

    private static async Task<IResult> ListReceiptOcrReviewQueueAsync(
        Guid? routeGroupId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var scopeAuthorizationResult = await AuthorizeScopeAsync(
            businessAuthorizationService,
            actor.UserProfileId,
            routeGroupId,
            cancellationToken);
        if (!scopeAuthorizationResult.Allowed)
        {
            return MapAuthorizationFailure(scopeAuthorizationResult);
        }

        var readResult = ReadReceiptOcrReviewQueueRequest(request);
        if (!readResult.Succeeded || readResult.Filters is null)
        {
            return InvalidReceiptOcrReviewQuery(readResult.Errors);
        }

        var filters = readResult.Filters;
        var query = VisibleReceiptOcrReviewQueueQuery(
            dbContext,
            actor.UserProfileId,
            routeGroupId);

        if (filters.Status is not null)
        {
            query = query.Where(review => review.Status == filters.Status);
        }

        if (filters.Source is not null)
        {
            query = query.Where(review => review.Source == filters.Source);
        }

        var reviews = await query
            .OrderByDescending(review => review.UpdatedAtUtc)
            .ThenByDescending(review => review.CreatedAtUtc)
            .ThenBy(review => review.Id)
            .Take(filters.Limit)
            .Select(review => new ReceiptOcrReviewSummaryResponse(
                review.Id,
                review.ExpenseBillId,
                review.GroupId,
                review.FileObjectId,
                review.Status,
                review.Source,
                review.MerchantText,
                review.Currency,
                review.Lines.Count,
                review.CreatedAtUtc,
                review.UpdatedAtUtc))
            .ToArrayAsync(cancellationToken);

        return Results.Ok(new ReceiptOcrReviewListResponse(reviews));
    }

    private static Task<IResult> UpsertPersonalReceiptOcrReviewAsync(
        Guid billId,
        Guid fileId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IReceiptOcrReviewAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        return UpsertReceiptOcrReviewAsync(
            routeGroupId: null,
            billId,
            fileId,
            request,
            currentActorAccessor,
            businessAuthorizationService,
            auditWriter,
            dbContext,
            timeProvider,
            cancellationToken);
    }

    private static Task<IResult> UpsertGroupReceiptOcrReviewAsync(
        Guid groupId,
        Guid billId,
        Guid fileId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IReceiptOcrReviewAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        return UpsertReceiptOcrReviewAsync(
            groupId,
            billId,
            fileId,
            request,
            currentActorAccessor,
            businessAuthorizationService,
            auditWriter,
            dbContext,
            timeProvider,
            cancellationToken);
    }

    private static async Task<IResult> UpsertReceiptOcrReviewAsync(
        Guid? routeGroupId,
        Guid billId,
        Guid fileId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IReceiptOcrReviewAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var scopeAuthorizationResult = await AuthorizeScopeAsync(
            businessAuthorizationService,
            actor.UserProfileId,
            routeGroupId,
            cancellationToken);
        if (!scopeAuthorizationResult.Allowed)
        {
            return MapAuthorizationFailure(scopeAuthorizationResult);
        }

        var queryReadResult = ReadNoReceiptOcrReviewRouteQueryRequest(request);
        if (!queryReadResult.Succeeded)
        {
            return InvalidReceiptOcrReviewQuery(queryReadResult.Errors);
        }

        var readResult = await ReadReceiptOcrReviewRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.Review is null)
        {
            return InvalidReceiptOcrReview(readResult.Errors);
        }

        var billContext = await LoadVisibleBillContextAsync(
            dbContext,
            routeGroupId,
            billId,
            actor.UserProfileId,
            cancellationToken);
        if (billContext is null)
        {
            return BillUnavailable();
        }

        if (!CanMutateReview(billContext, actor.UserProfileId))
        {
            return BillUnavailable();
        }

        if (!CanChangeReviewInCurrentState(billContext))
        {
            return ReceiptOcrReviewConflict();
        }

        var attachment = await LoadReadableReceiptAttachmentQuery(dbContext, billContext, fileId)
            .SingleOrDefaultAsync(cancellationToken);
        if (attachment is null)
        {
            return BillUnavailable();
        }

        var submittedReview = readResult.Review;
        var now = timeProvider.GetUtcNow();
        var review = await dbContext.Set<ReceiptOcrReview>()
            .Include(candidate => candidate.Lines)
            .Where(candidate => candidate.ExpenseBillId == billContext.BillId
                && candidate.FileObjectId == attachment.FileObjectId
                && candidate.RemovedAtUtc == null)
            .SingleOrDefaultAsync(cancellationToken);

        var created = review is null;
        if (review is null)
        {
            review = new ReceiptOcrReview
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = billContext.BillId,
                FileObjectId = attachment.FileObjectId,
                CreatedByUserProfileId = actor.UserProfileId,
                GroupId = billContext.GroupId,
                CreatedAtUtc = now
            };
            dbContext.Set<ReceiptOcrReview>().Add(review);
        }
        else
        {
            var existingLines = review.Lines.ToArray();
            dbContext.Set<ReceiptOcrReviewLine>().RemoveRange(existingLines);
        }

        ApplySubmittedReview(review, submittedReview, now);
        AddSubmittedLines(dbContext, review, submittedReview.Lines, now);

        await WriteReviewAuditAsync(
            auditWriter,
            actor.AuthAccountId,
            billContext,
            ReviewSavedAction,
            "ocr_review_saved",
            review,
            submittedReview.Lines.Count,
            now,
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return ReceiptOcrReviewSaveFailed();
        }

        var savedReview = await LoadReadableReceiptOcrReviewQuery(dbContext, billContext, attachment.FileObjectId)
            .SingleAsync(cancellationToken);
        return created
            ? Results.Created(CreateReceiptOcrReviewPath(billContext, attachment.FileObjectId), ReceiptOcrReviewResponse.From(savedReview))
            : Results.Ok(ReceiptOcrReviewResponse.From(savedReview));
    }

    private static Task<IResult> GetPersonalReceiptOcrReviewAsync(
        Guid billId,
        Guid fileId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IReceiptOcrReviewAuditWriter auditWriter,
        HttpRequest request,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        return GetReceiptOcrReviewAsync(
            routeGroupId: null,
            billId,
            fileId,
            currentActorAccessor,
            businessAuthorizationService,
            auditWriter,
            request,
            dbContext,
            timeProvider,
            cancellationToken);
    }

    private static Task<IResult> GetPersonalReceiptOcrReviewApplyPreviewAsync(
        Guid billId,
        Guid fileId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        HttpRequest request,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        return GetReceiptOcrReviewApplyPreviewAsync(
            routeGroupId: null,
            billId,
            fileId,
            request,
            currentActorAccessor,
            businessAuthorizationService,
            dbContext,
            cancellationToken);
    }

    private static Task<IResult> GetGroupReceiptOcrReviewAsync(
        Guid groupId,
        Guid billId,
        Guid fileId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IReceiptOcrReviewAuditWriter auditWriter,
        HttpRequest request,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        return GetReceiptOcrReviewAsync(
            groupId,
            billId,
            fileId,
            currentActorAccessor,
            businessAuthorizationService,
            auditWriter,
            request,
            dbContext,
            timeProvider,
            cancellationToken);
    }

    private static Task<IResult> GetGroupReceiptOcrReviewApplyPreviewAsync(
        Guid groupId,
        Guid billId,
        Guid fileId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        HttpRequest request,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        return GetReceiptOcrReviewApplyPreviewAsync(
            groupId,
            billId,
            fileId,
            request,
            currentActorAccessor,
            businessAuthorizationService,
            dbContext,
            cancellationToken);
    }

    private static Task<IResult> ApplyPersonalReceiptOcrReviewAsync(
        Guid billId,
        Guid fileId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IReceiptOcrReviewAuditWriter auditWriter,
        ExpenseBillCalculationService calculationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        return ApplyReceiptOcrReviewAsync(
            routeGroupId: null,
            billId,
            fileId,
            request,
            currentActorAccessor,
            businessAuthorizationService,
            auditWriter,
            calculationService,
            dbContext,
            timeProvider,
            cancellationToken);
    }

    private static Task<IResult> ApplyGroupReceiptOcrReviewAsync(
        Guid groupId,
        Guid billId,
        Guid fileId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IReceiptOcrReviewAuditWriter auditWriter,
        ExpenseBillCalculationService calculationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        return ApplyReceiptOcrReviewAsync(
            groupId,
            billId,
            fileId,
            request,
            currentActorAccessor,
            businessAuthorizationService,
            auditWriter,
            calculationService,
            dbContext,
            timeProvider,
            cancellationToken);
    }

    private static async Task<IResult> GetReceiptOcrReviewAsync(
        Guid? routeGroupId,
        Guid billId,
        Guid fileId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IReceiptOcrReviewAuditWriter auditWriter,
        HttpRequest request,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var scopeAuthorizationResult = await AuthorizeScopeAsync(
            businessAuthorizationService,
            actor.UserProfileId,
            routeGroupId,
            cancellationToken);
        if (!scopeAuthorizationResult.Allowed)
        {
            return MapAuthorizationFailure(scopeAuthorizationResult);
        }

        var queryReadResult = ReadNoReceiptOcrReviewRouteQueryRequest(request);
        if (!queryReadResult.Succeeded)
        {
            return InvalidReceiptOcrReviewQuery(queryReadResult.Errors);
        }

        var billContext = await LoadVisibleBillContextAsync(
            dbContext,
            routeGroupId,
            billId,
            actor.UserProfileId,
            cancellationToken);
        if (billContext is null)
        {
            return BillUnavailable();
        }

        var attachment = await LoadReadableReceiptAttachmentQuery(dbContext, billContext, fileId)
            .SingleOrDefaultAsync(cancellationToken);
        if (attachment is null)
        {
            return BillUnavailable();
        }

        var review = await LoadReadableReceiptOcrReviewQuery(dbContext, billContext, attachment.FileObjectId)
            .SingleOrDefaultAsync(cancellationToken);
        if (review is null)
        {
            return ReceiptOcrReviewUnavailable();
        }

        await WriteReviewAuditAsync(
            auditWriter,
            actor.AuthAccountId,
            billContext,
            ReviewReadAction,
            "ocr_review_read",
            review,
            review.Lines.Count,
            timeProvider.GetUtcNow(),
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return ReceiptOcrReviewAccessFailed();
        }

        return Results.Ok(ReceiptOcrReviewResponse.From(review));
    }

    private static async Task<IResult> GetReceiptOcrReviewApplyPreviewAsync(
        Guid? routeGroupId,
        Guid billId,
        Guid fileId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var scopeAuthorizationResult = await AuthorizeScopeAsync(
            businessAuthorizationService,
            actor.UserProfileId,
            routeGroupId,
            cancellationToken);
        if (!scopeAuthorizationResult.Allowed)
        {
            return MapAuthorizationFailure(scopeAuthorizationResult);
        }

        var queryReadResult = ReadNoReceiptOcrReviewRouteQueryRequest(request);
        if (!queryReadResult.Succeeded)
        {
            return InvalidReceiptOcrReviewQuery(queryReadResult.Errors);
        }

        var billContext = await LoadVisibleBillContextAsync(
            dbContext,
            routeGroupId,
            billId,
            actor.UserProfileId,
            cancellationToken);
        if (billContext is null)
        {
            return BillUnavailable();
        }

        var attachment = await LoadReadableReceiptAttachmentQuery(dbContext, billContext, fileId)
            .SingleOrDefaultAsync(cancellationToken);
        if (attachment is null)
        {
            return BillUnavailable();
        }

        var review = await LoadReadableReceiptOcrReviewQuery(dbContext, billContext, attachment.FileObjectId)
            .SingleOrDefaultAsync(cancellationToken);
        if (review is null)
        {
            return ReceiptOcrReviewUnavailable();
        }

        return Results.Ok(ReceiptOcrReviewApplyPreviewResponse.From(review, billContext.BillCurrency));
    }

    private static async Task<IResult> ApplyReceiptOcrReviewAsync(
        Guid? routeGroupId,
        Guid billId,
        Guid fileId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IReceiptOcrReviewAuditWriter auditWriter,
        ExpenseBillCalculationService calculationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var scopeAuthorizationResult = await AuthorizeScopeAsync(
            businessAuthorizationService,
            actor.UserProfileId,
            routeGroupId,
            cancellationToken);
        if (!scopeAuthorizationResult.Allowed)
        {
            return MapAuthorizationFailure(scopeAuthorizationResult);
        }

        var queryReadResult = ReadNoReceiptOcrReviewRouteQueryRequest(request);
        if (!queryReadResult.Succeeded)
        {
            return InvalidReceiptOcrReviewQuery(queryReadResult.Errors);
        }

        var applyReadResult = await ReadReceiptOcrReviewApplyRequestAsync(request, cancellationToken);
        if (!applyReadResult.Succeeded || applyReadResult.Request is null)
        {
            return InvalidReceiptOcrReviewApply(applyReadResult.Errors);
        }

        var applyRequest = applyReadResult.Request;
        var billContext = await LoadVisibleBillContextAsync(
            dbContext,
            routeGroupId,
            billId,
            actor.UserProfileId,
            cancellationToken);
        if (billContext is null)
        {
            return BillUnavailable();
        }

        if (!CanMutateReview(billContext, actor.UserProfileId))
        {
            return BillUnavailable();
        }

        if (!CanApplyReviewInCurrentState(billContext))
        {
            return ReceiptOcrReviewConflict();
        }

        var attachment = await LoadReadableReceiptAttachmentQuery(dbContext, billContext, fileId)
            .SingleOrDefaultAsync(cancellationToken);
        if (attachment is null)
        {
            return BillUnavailable();
        }

        var review = await LoadReadableReceiptOcrReviewQuery(dbContext, billContext, attachment.FileObjectId)
            .SingleOrDefaultAsync(cancellationToken);
        if (review is null)
        {
            return ReceiptOcrReviewUnavailable();
        }

        if (review.Status is not ReceiptOcrReviewStatuses.Reviewed
            || !ReceiptOcrReviewSources.IsSupported(review.Source)
            || review.UpdatedAtUtc != applyRequest.ExpectedReviewUpdatedAtUtc)
        {
            return ReceiptOcrReviewConflict();
        }

        var preview = ReceiptOcrReviewApplyPreviewResponse.From(review, billContext.BillCurrency);
        if (!CanApplyPreviewAtWriteTime(preview))
        {
            return ReceiptOcrReviewConflict();
        }

        if (await HasDownstreamSettlementStateAsync(dbContext, billContext.BillId, cancellationToken))
        {
            return ReceiptOcrReviewConflict();
        }

        IDbContextTransaction? transaction = null;
        try
        {
            if (dbContext.Database.IsRelational())
            {
                transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
            }

            var bill = await LoadTrackedBillForApplyQuery(dbContext, billContext)
                .SingleOrDefaultAsync(cancellationToken);
            if (bill is null)
            {
                return BillUnavailable();
            }

            if (!CanApplyTrackedBillState(bill)
                || !CanApplyBillShapeWithoutInferringSplitPolicy(bill, out var soleParticipantId))
            {
                return ReceiptOcrReviewConflict();
            }

            var now = timeProvider.GetUtcNow();
            SoftDeletePriorOcrItemsFromSameReview(bill, review.Id, now);
            var appliedItemCount = AddAppliedOcrItemCandidates(dbContext, bill, review, soleParticipantId, now);
            if (appliedItemCount == 0)
            {
                return ReceiptOcrReviewConflict();
            }

            if (!TryPrepareSinglePayerForDraftRecalculation(bill, now, out _))
            {
                return ReceiptOcrReviewConflict();
            }

            var calculation = calculationService.Calculate(bill);
            if (!calculation.Succeeded)
            {
                return ReceiptOcrReviewConflict();
            }

            ApplyCalculation(bill, calculation);
            bill.UpdatedAtUtc = now;

            await WriteReviewAuditAsync(
                auditWriter,
                actor.AuthAccountId,
                billContext,
                ReviewAppliedAction,
                "ocr_review_applied",
                review,
                appliedItemCount,
                now,
                cancellationToken,
                applyRequest.ApplyMode);

            await dbContext.SaveChangesAsync(cancellationToken);
            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken);
            }

            return Results.Ok(ReceiptOcrReviewApplyResponse.From(
                review,
                applyRequest.ApplyMode,
                appliedItemCount,
                preview,
                now));
        }
        catch (DbUpdateException)
        {
            if (transaction is not null)
            {
                await transaction.RollbackAsync(cancellationToken);
            }

            dbContext.ChangeTracker.Clear();
            return ReceiptOcrReviewSaveFailed();
        }
        finally
        {
            if (transaction is not null)
            {
                await transaction.DisposeAsync();
            }
        }
    }

    private static Task<IResult> RemovePersonalReceiptOcrReviewAsync(
        Guid billId,
        Guid fileId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IReceiptOcrReviewAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        return RemoveReceiptOcrReviewAsync(
            routeGroupId: null,
            billId,
            fileId,
            request,
            currentActorAccessor,
            businessAuthorizationService,
            auditWriter,
            dbContext,
            timeProvider,
            cancellationToken);
    }

    private static Task<IResult> RemoveGroupReceiptOcrReviewAsync(
        Guid groupId,
        Guid billId,
        Guid fileId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IReceiptOcrReviewAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        return RemoveReceiptOcrReviewAsync(
            groupId,
            billId,
            fileId,
            request,
            currentActorAccessor,
            businessAuthorizationService,
            auditWriter,
            dbContext,
            timeProvider,
            cancellationToken);
    }

    private static async Task<IResult> RemoveReceiptOcrReviewAsync(
        Guid? routeGroupId,
        Guid billId,
        Guid fileId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IReceiptOcrReviewAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var scopeAuthorizationResult = await AuthorizeScopeAsync(
            businessAuthorizationService,
            actor.UserProfileId,
            routeGroupId,
            cancellationToken);
        if (!scopeAuthorizationResult.Allowed)
        {
            return MapAuthorizationFailure(scopeAuthorizationResult);
        }

        var queryReadResult = ReadNoReceiptOcrReviewRouteQueryRequest(request);
        if (!queryReadResult.Succeeded)
        {
            return InvalidReceiptOcrReviewQuery(queryReadResult.Errors);
        }

        var billContext = await LoadVisibleBillContextAsync(
            dbContext,
            routeGroupId,
            billId,
            actor.UserProfileId,
            cancellationToken);
        if (billContext is null)
        {
            return BillUnavailable();
        }

        if (!CanMutateReview(billContext, actor.UserProfileId))
        {
            return BillUnavailable();
        }

        if (!CanChangeReviewInCurrentState(billContext))
        {
            return ReceiptOcrReviewConflict();
        }

        var attachment = await LoadReadableReceiptAttachmentQuery(dbContext, billContext, fileId)
            .SingleOrDefaultAsync(cancellationToken);
        if (attachment is null)
        {
            return BillUnavailable();
        }

        var review = await LoadReadableReceiptOcrReviewQuery(dbContext, billContext, attachment.FileObjectId, trackChanges: true)
            .SingleOrDefaultAsync(cancellationToken);
        if (review is null)
        {
            return ReceiptOcrReviewUnavailable();
        }

        var now = timeProvider.GetUtcNow();
        review.RemovedAtUtc = now;
        review.UpdatedAtUtc = now;

        await WriteReviewAuditAsync(
            auditWriter,
            actor.AuthAccountId,
            billContext,
            ReviewRemovedAction,
            "ocr_review_removed",
            review,
            review.Lines.Count,
            now,
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return ReceiptOcrReviewSaveFailed();
        }

        return Results.NoContent();
    }

    private static ReceiptOcrReviewQueryReadResult ReadNoReceiptOcrReviewRouteQueryRequest(HttpRequest request)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var queryKey in request.Query.Keys)
        {
            AddError(errors, queryKey, "Query field is not supported for this receipt OCR review route.");
        }

        return errors.Count > 0
            ? ReceiptOcrReviewQueryReadResult.Invalid(ToErrorDictionary(errors))
            : ReceiptOcrReviewQueryReadResult.Valid();
    }

    private static ReceiptOcrReviewQueueReadResult ReadReceiptOcrReviewQueueRequest(HttpRequest request)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var queryKey in request.Query.Keys)
        {
            if (!AllowedQueueQueryProperties.Contains(queryKey))
            {
                AddError(errors, queryKey, "Filter is not supported for receipt OCR review queue.");
            }
        }

        var status = ReadOptionalQueryValue(request, "status", errors);
        if (status is not null && !ReceiptOcrReviewStatuses.IsSupported(status))
        {
            AddError(errors, "status", "Receipt OCR review status filter is not supported.");
        }

        var source = ReadOptionalQueryValue(request, "source", errors);
        if (source is not null && !ReceiptOcrReviewSources.IsSupported(source))
        {
            AddError(errors, "source", "Receipt OCR review source filter is not supported.");
        }

        var limit = DefaultReceiptOcrReviewQueueLimit;
        var submittedLimit = ReadOptionalQueryValue(request, "limit", errors);
        if (submittedLimit is not null)
        {
            if (!int.TryParse(submittedLimit, NumberStyles.None, CultureInfo.InvariantCulture, out limit)
                || limit < 1
                || limit > MaxReceiptOcrReviewQueueLimit)
            {
                AddError(errors, "limit", $"Receipt OCR review queue limit must be between 1 and {MaxReceiptOcrReviewQueueLimit}.");
            }
        }

        return errors.Count > 0
            ? ReceiptOcrReviewQueueReadResult.Invalid(ToErrorDictionary(errors))
            : ReceiptOcrReviewQueueReadResult.Valid(new ReceiptOcrReviewQueueFilters(status, source, limit));
    }

    private static string? ReadOptionalQueryValue(
        HttpRequest request,
        string key,
        Dictionary<string, List<string>> errors)
    {
        if (!request.Query.TryGetValue(key, out var values))
        {
            return null;
        }

        if (values.Count != 1 || string.IsNullOrWhiteSpace(values[0]))
        {
            AddError(errors, key, "A single non-empty query value is required.");
            return null;
        }

        return values[0];
    }

    private static async Task<ReceiptOcrReviewApplyReadResult> ReadReceiptOcrReviewApplyRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        if (request.Body is null || request.ContentLength == 0)
        {
            AddError(errors, "body", "A non-empty JSON receipt OCR review apply payload is required.");
            return ReceiptOcrReviewApplyReadResult.Invalid(ToErrorDictionary(errors));
        }

        JsonDocument document;
        try
        {
            document = await JsonDocument.ParseAsync(request.Body, cancellationToken: cancellationToken);
        }
        catch (JsonException)
        {
            AddError(errors, "body", "A valid JSON object is required.");
            return ReceiptOcrReviewApplyReadResult.Invalid(ToErrorDictionary(errors));
        }

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind is not JsonValueKind.Object)
            {
                AddError(errors, "body", "A JSON object is required.");
                return ReceiptOcrReviewApplyReadResult.Invalid(ToErrorDictionary(errors));
            }

            foreach (var property in root.EnumerateObject())
            {
                if (!AllowedApplyRootProperties.Contains(property.Name))
                {
                    AddError(errors, property.Name, "Field is not supported for receipt OCR review apply.");
                }
            }

            var applyMode = ReadRequiredSupportedString(
                root,
                "applyMode",
                ReceiptOcrReviewApplyModes.IsSupported,
                "Receipt OCR review apply mode is not supported.",
                errors);
            var expectedReviewUpdatedAtUtc = ReadRequiredDateTimeOffset(
                root,
                "expectedReviewUpdatedAtUtc",
                "Expected review update timestamp is required.",
                errors);

            return errors.Count > 0 || applyMode is null || !expectedReviewUpdatedAtUtc.HasValue
                ? ReceiptOcrReviewApplyReadResult.Invalid(ToErrorDictionary(errors))
                : ReceiptOcrReviewApplyReadResult.Valid(new ReceiptOcrReviewApplyRequest(
                    applyMode,
                    expectedReviewUpdatedAtUtc.Value));
        }
    }

    private static async Task<ReceiptOcrReviewReadResult> ReadReceiptOcrReviewRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        if (request.Body is null || request.ContentLength == 0)
        {
            AddError(errors, "body", "A non-empty JSON receipt OCR review payload is required.");
            return ReceiptOcrReviewReadResult.Invalid(ToErrorDictionary(errors));
        }

        JsonDocument document;
        try
        {
            document = await JsonDocument.ParseAsync(request.Body, cancellationToken: cancellationToken);
        }
        catch (JsonException)
        {
            AddError(errors, "body", "A valid JSON object is required.");
            return ReceiptOcrReviewReadResult.Invalid(ToErrorDictionary(errors));
        }

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind is not JsonValueKind.Object)
            {
                AddError(errors, "body", "A JSON object is required.");
                return ReceiptOcrReviewReadResult.Invalid(ToErrorDictionary(errors));
            }

            foreach (var property in root.EnumerateObject())
            {
                if (!AllowedRootProperties.Contains(property.Name))
                {
                    AddError(errors, property.Name, "Field is not supported for receipt OCR review intake.");
                }
            }

            var status = ReadRequiredSupportedString(
                root,
                "status",
                ReceiptOcrReviewStatuses.IsSupported,
                "Receipt OCR review status is not supported.",
                errors);
            var source = ReadRequiredSupportedString(
                root,
                "source",
                ReceiptOcrReviewSources.IsSupported,
                "Receipt OCR review source is not supported.",
                errors);
            var merchantText = ReadOptionalBoundedString(
                root,
                "merchantText",
                ReceiptOcrReviewConstraints.MerchantTextMaxLength,
                "Merchant text must be a non-empty string when supplied.",
                errors);
            var receiptIssuedAtUtc = ReadOptionalDateTimeOffset(root, "receiptIssuedAtUtc", errors);
            var currency = ReadOptionalCurrency(root, errors);
            var currencyCode = CurrencyCode.TryCreate(currency, out var parsedCurrencyCode)
                ? parsedCurrencyCode
                : null;

            var subtotalAmount = ReadOptionalMoney(root, "subtotalAmount", currencyCode, errors);
            var taxAmount = ReadOptionalMoney(root, "taxAmount", currencyCode, errors);
            var serviceChargeAmount = ReadOptionalMoney(root, "serviceChargeAmount", currencyCode, errors);
            var discountAmount = ReadOptionalMoney(root, "discountAmount", currencyCode, errors);
            var grandTotalAmount = ReadOptionalMoney(root, "grandTotalAmount", currencyCode, errors);
            var lines = ReadLines(root, currencyCode, errors);

            var hasHeaderAmount = HeaderAmountProperties.Any(propertyName =>
                root.TryGetProperty(propertyName, out var property) && property.ValueKind is not JsonValueKind.Null);
            var hasMeaningfulPayload = merchantText is not null
                || receiptIssuedAtUtc.HasValue
                || currency is not null
                || hasHeaderAmount
                || lines.Count > 0;
            if (!hasMeaningfulPayload)
            {
                AddError(errors, "body", "At least one reviewed OCR field or line is required.");
            }

            if (errors.Count > 0 || status is null || source is null)
            {
                return ReceiptOcrReviewReadResult.Invalid(ToErrorDictionary(errors));
            }

            return ReceiptOcrReviewReadResult.Valid(
                new SubmittedReceiptOcrReview(
                    status,
                    source,
                    merchantText,
                    receiptIssuedAtUtc,
                    currency,
                    subtotalAmount,
                    taxAmount,
                    serviceChargeAmount,
                    discountAmount,
                    grandTotalAmount,
                    lines));
        }
    }

    private static string? ReadRequiredSupportedString(
        JsonElement root,
        string propertyName,
        Func<string?, bool> isSupported,
        string errorMessage,
        Dictionary<string, List<string>> errors)
    {
        if (!root.TryGetProperty(propertyName, out var value) || value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, propertyName, errorMessage);
            return null;
        }

        var text = value.GetString();
        if (!isSupported(text))
        {
            AddError(errors, propertyName, errorMessage);
            return null;
        }

        return text;
    }

    private static string? ReadOptionalBoundedString(
        JsonElement root,
        string propertyName,
        int maxLength,
        string errorMessage,
        Dictionary<string, List<string>> errors)
    {
        if (!root.TryGetProperty(propertyName, out var value) || value.ValueKind is JsonValueKind.Null)
        {
            return null;
        }

        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, propertyName, errorMessage);
            return null;
        }

        var text = value.GetString()?.Trim();
        if (string.IsNullOrWhiteSpace(text) || text.Length > maxLength)
        {
            AddError(errors, propertyName, errorMessage);
            return null;
        }

        return text;
    }

    private static DateTimeOffset? ReadOptionalDateTimeOffset(
        JsonElement root,
        string propertyName,
        Dictionary<string, List<string>> errors)
    {
        if (!root.TryGetProperty(propertyName, out var value) || value.ValueKind is JsonValueKind.Null)
        {
            return null;
        }

        if (value.ValueKind is not JsonValueKind.String
            || !DateTimeOffset.TryParse(
                value.GetString(),
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var parsed))
        {
            AddError(errors, propertyName, "Receipt date/time must be an ISO 8601 date-time string.");
            return null;
        }

        return parsed.ToUniversalTime();
    }

    private static DateTimeOffset? ReadRequiredDateTimeOffset(
        JsonElement root,
        string propertyName,
        string errorMessage,
        Dictionary<string, List<string>> errors)
    {
        if (!root.TryGetProperty(propertyName, out var value)
            || value.ValueKind is not JsonValueKind.String
            || !DateTimeOffset.TryParse(
                value.GetString(),
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var parsed))
        {
            AddError(errors, propertyName, errorMessage);
            return null;
        }

        return parsed.ToUniversalTime();
    }

    private static string? ReadOptionalCurrency(
        JsonElement root,
        Dictionary<string, List<string>> errors)
    {
        if (!root.TryGetProperty("currency", out var value) || value.ValueKind is JsonValueKind.Null)
        {
            return null;
        }

        if (value.ValueKind is not JsonValueKind.String
            || !CurrencyCode.TryCreate(value.GetString(), out var currencyCode))
        {
            AddError(errors, "currency", "Currency must be an uppercase three-letter code.");
            return null;
        }

        var supportedResult = SupportedCurrencyPolicy.Default.ValidateSupported(currencyCode);
        if (!supportedResult.Succeeded)
        {
            AddError(errors, "currency", supportedResult.Message);
            return null;
        }

        return currencyCode.Value;
    }

    private static decimal? ReadOptionalMoney(
        JsonElement root,
        string propertyName,
        CurrencyCode? currencyCode,
        Dictionary<string, List<string>> errors)
    {
        if (!root.TryGetProperty(propertyName, out var value) || value.ValueKind is JsonValueKind.Null)
        {
            return null;
        }

        if (currencyCode is null)
        {
            AddError(errors, "currency", "Currency is required when OCR money candidates are supplied.");
            return null;
        }

        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, propertyName, "Amount must be a plain base-10 decimal string.");
            return null;
        }

        var validationResult = MoneyAmount.TryParse(
            value.GetString(),
            currencyCode,
            MoneyValidationOptions.Default with
            {
                AllowZero = true,
                AmountField = propertyName,
                CurrencyField = "currency"
            },
            SupportedCurrencyPolicy.Default,
            out var moneyAmount);
        if (!validationResult.Succeeded)
        {
            AddError(errors, validationResult.Field, validationResult.Message);
            return null;
        }

        return moneyAmount.Amount;
    }

    private static decimal? ReadOptionalQuantity(
        JsonElement line,
        string fieldName,
        string errorPrefix,
        Dictionary<string, List<string>> errors)
    {
        if (!line.TryGetProperty(fieldName, out var value) || value.ValueKind is JsonValueKind.Null)
        {
            return null;
        }

        var errorKey = $"{errorPrefix}.{fieldName}";
        if (value.ValueKind is not JsonValueKind.String || !IsPlainDecimalString(value.GetString()))
        {
            AddError(errors, errorKey, "Quantity must be a plain positive base-10 decimal string.");
            return null;
        }

        if (!decimal.TryParse(
            value.GetString(),
            NumberStyles.AllowDecimalPoint,
            CultureInfo.InvariantCulture,
            out var quantity)
            || quantity <= 0
            || quantity > ReceiptOcrReviewConstraints.QuantityMaxValue
            || GetSubmittedFractionalDigitCount(value.GetString()!) > ReceiptOcrReviewConstraints.QuantityScale)
        {
            AddError(errors, errorKey, "Quantity must be a plain positive base-10 decimal string.");
            return null;
        }

        return quantity;
    }

    private static IReadOnlyList<SubmittedReceiptOcrReviewLine> ReadLines(
        JsonElement root,
        CurrencyCode? currencyCode,
        Dictionary<string, List<string>> errors)
    {
        if (!root.TryGetProperty("lines", out var value) || value.ValueKind is JsonValueKind.Null)
        {
            return [];
        }

        if (value.ValueKind is not JsonValueKind.Array)
        {
            AddError(errors, "lines", "Lines must be an array.");
            return [];
        }

        var lineCount = value.GetArrayLength();
        if (lineCount > ReceiptOcrReviewConstraints.MaxLineCount)
        {
            AddError(errors, "lines", "Too many receipt OCR review lines were supplied.");
            return [];
        }

        var lines = new List<SubmittedReceiptOcrReviewLine>(lineCount);
        var sortOrder = 0;
        foreach (var lineElement in value.EnumerateArray())
        {
            var errorPrefix = $"lines[{sortOrder}]";
            if (lineElement.ValueKind is not JsonValueKind.Object)
            {
                AddError(errors, errorPrefix, "Line must be an object.");
                sortOrder++;
                continue;
            }

            foreach (var property in lineElement.EnumerateObject())
            {
                if (!AllowedLineProperties.Contains(property.Name))
                {
                    AddError(errors, $"{errorPrefix}.{property.Name}", "Field is not supported for receipt OCR review lines.");
                }
            }

            var text = ReadLineText(lineElement, errorPrefix, errors);
            var quantity = ReadOptionalQuantity(lineElement, "quantity", errorPrefix, errors);
            var unitPriceAmount = ReadOptionalLineMoney(lineElement, "unitPriceAmount", currencyCode, errorPrefix, errors);
            var lineTotalAmount = ReadOptionalLineMoney(lineElement, "lineTotalAmount", currencyCode, errorPrefix, errors);
            if (text is not null)
            {
                lines.Add(new SubmittedReceiptOcrReviewLine(
                    sortOrder,
                    text,
                    quantity,
                    unitPriceAmount,
                    lineTotalAmount));
            }

            sortOrder++;
        }

        return lines;
    }

    private static string? ReadLineText(
        JsonElement line,
        string errorPrefix,
        Dictionary<string, List<string>> errors)
    {
        if (!line.TryGetProperty("text", out var value)
            || value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, $"{errorPrefix}.text", "Line text is required.");
            return null;
        }

        var text = value.GetString()?.Trim();
        if (string.IsNullOrWhiteSpace(text) || text.Length > ReceiptOcrReviewConstraints.LineTextMaxLength)
        {
            AddError(errors, $"{errorPrefix}.text", "Line text is required.");
            return null;
        }

        return text;
    }

    private static decimal? ReadOptionalLineMoney(
        JsonElement line,
        string propertyName,
        CurrencyCode? currencyCode,
        string errorPrefix,
        Dictionary<string, List<string>> errors)
    {
        if (!line.TryGetProperty(propertyName, out var value) || value.ValueKind is JsonValueKind.Null)
        {
            return null;
        }

        if (currencyCode is null)
        {
            AddError(errors, "currency", "Currency is required when OCR money candidates are supplied.");
            return null;
        }

        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, $"{errorPrefix}.{propertyName}", "Amount must be a plain base-10 decimal string.");
            return null;
        }

        var validationResult = MoneyAmount.TryParse(
            value.GetString(),
            currencyCode,
            MoneyValidationOptions.Default with
            {
                AllowZero = true,
                AmountField = $"{errorPrefix}.{propertyName}",
                CurrencyField = "currency"
            },
            SupportedCurrencyPolicy.Default,
            out var moneyAmount);
        if (!validationResult.Succeeded)
        {
            AddError(errors, validationResult.Field, validationResult.Message);
            return null;
        }

        return moneyAmount.Amount;
    }

    private static bool IsPlainDecimalString(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return false;
        }

        var integerDigits = 0;
        var fractionalDigits = 0;
        var decimalPointSeen = false;
        foreach (var character in value)
        {
            if (character is >= '0' and <= '9')
            {
                if (decimalPointSeen)
                {
                    fractionalDigits++;
                }
                else
                {
                    integerDigits++;
                }

                continue;
            }

            if (character is '.' && !decimalPointSeen)
            {
                decimalPointSeen = true;
                continue;
            }

            return false;
        }

        return integerDigits > 0 && (!decimalPointSeen || fractionalDigits > 0);
    }

    private static int GetSubmittedFractionalDigitCount(string submittedAmount)
    {
        var decimalPointIndex = submittedAmount.IndexOf('.', StringComparison.Ordinal);
        return decimalPointIndex < 0 ? 0 : submittedAmount.Length - decimalPointIndex - 1;
    }

    private static async Task<BusinessAuthorizationResult> AuthorizeScopeAsync(
        IBusinessAuthorizationService businessAuthorizationService,
        Guid actorUserProfileId,
        Guid? routeGroupId,
        CancellationToken cancellationToken)
    {
        return routeGroupId.HasValue
            ? await businessAuthorizationService.CanAccessGroupAsync(routeGroupId.Value, cancellationToken)
            : await businessAuthorizationService.CanAccessProfileAsync(actorUserProfileId, cancellationToken);
    }

    private static IQueryable<ReceiptOcrReview> VisibleReceiptOcrReviewQueueQuery(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId,
        Guid? routeGroupId)
    {
        var query = dbContext.Set<ReceiptOcrReview>()
            .AsNoTracking()
            .Where(review => review.RemovedAtUtc == null
                && review.CreatedByUserProfile.DeletedAtUtc == null
                && review.Attachment.RemovedAtUtc == null
                && review.Attachment.Purpose == ExpenseBillAttachmentPurposes.Receipt
                && review.Attachment.CreatedByUserProfile.DeletedAtUtc == null
                && review.Attachment.FileObject.DeletedAtUtc == null
                && review.Attachment.FileObject.OwnerUserProfileId == review.Attachment.CreatedByUserProfileId
                && review.Attachment.FileObject.CreatedByUserProfileId == review.Attachment.CreatedByUserProfileId
                && review.Attachment.FileObject.Status == FileObjectStatuses.Active
                && review.Attachment.FileObject.Purpose == FileObjectPurposes.ReceiptImage
                && SupportedReceiptContentTypeValues.Contains(review.Attachment.FileObject.ContentType)
                && ((review.GroupId == null && review.Attachment.ExpenseBill.GroupId == null)
                    || (review.GroupId != null && review.GroupId == review.Attachment.ExpenseBill.GroupId))
                && review.Attachment.ExpenseBill.ArchivedAtUtc == null
                && VisibleBillStatuses.Contains(review.Attachment.ExpenseBill.Status)
                && review.Attachment.ExpenseBill.CreatedByUserProfile.DeletedAtUtc == null
                && review.Attachment.ExpenseBill.BillOwnerUserProfile.DeletedAtUtc == null
                && (review.Attachment.ExpenseBill.CreatedByUserProfileId == actorUserProfileId
                    || review.Attachment.ExpenseBill.BillOwnerUserProfileId == actorUserProfileId
                    || review.Attachment.ExpenseBill.Participants.Any(participant => participant.UserProfileId == actorUserProfileId)
                    || review.Attachment.ExpenseBill.Payers.Any(payer => payer.UserProfileId == actorUserProfileId)));

        if (routeGroupId.HasValue)
        {
            return query.Where(review => review.GroupId == routeGroupId.Value
                && review.Attachment.ExpenseBill.GroupId == routeGroupId.Value
                && review.Attachment.ExpenseBill.Group != null
                && review.Attachment.ExpenseBill.Group.DeletedAtUtc == null
                && dbContext.Set<GroupMembership>().Any(membership =>
                    membership.GroupId == routeGroupId.Value
                    && membership.UserProfileId == actorUserProfileId
                    && membership.Status == GroupMembershipStatuses.Active));
        }

        return query.Where(review => review.Attachment.ExpenseBill.GroupId == null
            || (review.Attachment.ExpenseBill.GroupId != null
                && review.Attachment.ExpenseBill.Group != null
                && review.Attachment.ExpenseBill.Group.DeletedAtUtc == null
                && dbContext.Set<GroupMembership>().Any(membership =>
                    membership.GroupId == review.Attachment.ExpenseBill.GroupId.Value
                    && membership.UserProfileId == actorUserProfileId
                    && membership.Status == GroupMembershipStatuses.Active)));
    }

    private static IQueryable<ExpenseBillAttachment> LoadReadableReceiptAttachmentQuery(
        SettleoraDbContext dbContext,
        ReceiptOcrReviewContext billContext,
        Guid fileId)
    {
        return dbContext.Set<ExpenseBillAttachment>()
            .AsNoTracking()
            .Include(attachment => attachment.FileObject)
            .Where(attachment => attachment.ExpenseBillId == billContext.BillId
                && attachment.FileObjectId == fileId
                && attachment.RemovedAtUtc == null
                && attachment.Purpose == ExpenseBillAttachmentPurposes.Receipt
                && attachment.CreatedByUserProfile.DeletedAtUtc == null
                && attachment.FileObject.DeletedAtUtc == null
                && attachment.FileObject.OwnerUserProfileId == attachment.CreatedByUserProfileId
                && attachment.FileObject.CreatedByUserProfileId == attachment.CreatedByUserProfileId
                && attachment.FileObject.Status == FileObjectStatuses.Active
                && attachment.FileObject.Purpose == FileObjectPurposes.ReceiptImage
                && SupportedReceiptContentTypeValues.Contains(attachment.FileObject.ContentType));
    }

    private static IQueryable<ReceiptOcrReview> LoadReadableReceiptOcrReviewQuery(
        SettleoraDbContext dbContext,
        ReceiptOcrReviewContext billContext,
        Guid fileId,
        bool trackChanges = false)
    {
        var query = dbContext.Set<ReceiptOcrReview>()
            .Include(review => review.Lines)
            .Where(review => review.ExpenseBillId == billContext.BillId
                && review.FileObjectId == fileId
                && review.GroupId == billContext.GroupId
                && review.RemovedAtUtc == null
                && review.CreatedByUserProfile.DeletedAtUtc == null);

        return trackChanges ? query : query.AsNoTracking();
    }

    private static async Task<ReceiptOcrReviewContext?> LoadVisibleBillContextAsync(
        SettleoraDbContext dbContext,
        Guid? routeGroupId,
        Guid billId,
        Guid actorUserProfileId,
        CancellationToken cancellationToken)
    {
        var query = dbContext.Set<ExpenseBill>().AsNoTracking();
        if (routeGroupId.HasValue)
        {
            query = query.Where(bill => bill.GroupId == routeGroupId.Value
                && bill.Group != null
                && bill.Group.DeletedAtUtc == null
                && dbContext.Set<GroupMembership>().Any(membership =>
                    membership.GroupId == routeGroupId.Value
                    && membership.UserProfileId == actorUserProfileId
                    && membership.Status == GroupMembershipStatuses.Active));
        }
        else
        {
            query = query.Where(bill => bill.GroupId == null);
        }

        return await query
            .Where(bill => bill.Id == billId
                && bill.ArchivedAtUtc == null
                && VisibleBillStatuses.Contains(bill.Status)
                && bill.CreatedByUserProfile.DeletedAtUtc == null
                && bill.BillOwnerUserProfile.DeletedAtUtc == null
                && (bill.CreatedByUserProfileId == actorUserProfileId
                    || bill.BillOwnerUserProfileId == actorUserProfileId
                    || bill.Participants.Any(participant => participant.UserProfileId == actorUserProfileId)
                    || bill.Payers.Any(payer => payer.UserProfileId == actorUserProfileId)))
            .Select(bill => new ReceiptOcrReviewContext(
                bill.Id,
                bill.GroupId,
                bill.CreatedByUserProfileId,
                bill.BillOwnerUserProfileId,
                bill.Status,
                bill.TotalCurrency))
            .SingleOrDefaultAsync(cancellationToken);
    }

    private static IQueryable<ExpenseBill> LoadTrackedBillForApplyQuery(
        SettleoraDbContext dbContext,
        ReceiptOcrReviewContext billContext)
    {
        return dbContext.Set<ExpenseBill>()
            .Include(bill => bill.Items)
                .ThenInclude(item => item.Splits)
            .Include(bill => bill.Participants)
            .Include(bill => bill.Payers)
            .Include(bill => bill.Adjustments)
            .Where(bill => bill.Id == billContext.BillId
                && bill.GroupId == billContext.GroupId
                && bill.ArchivedAtUtc == null
                && bill.CreatedByUserProfile.DeletedAtUtc == null
                && bill.BillOwnerUserProfile.DeletedAtUtc == null);
    }

    private static async Task<bool> HasDownstreamSettlementStateAsync(
        SettleoraDbContext dbContext,
        Guid billId,
        CancellationToken cancellationToken)
    {
        return await dbContext.Set<SettlementRequest>()
                .AsNoTracking()
                .AnyAsync(settlementRequest => settlementRequest.SourceExpenseBillId == billId, cancellationToken)
            || await dbContext.Set<SettlementRequestLine>()
                .AsNoTracking()
                .AnyAsync(line => line.SourceExpenseBillId == billId, cancellationToken);
    }

    private static bool CanApplyPreviewAtWriteTime(ReceiptOcrReviewApplyPreviewResponse preview)
    {
        return preview.CanApply
            && !preview.Warnings.Contains(ReceiptOcrReviewApplyPreviewIssueCodes.LineSumMismatch, StringComparer.Ordinal);
    }

    private static bool CanApplyTrackedBillState(ExpenseBill bill)
    {
        return bill.Status == ExpenseBillStatuses.Draft
            && bill.ArchivedAtUtc is null
            && bill.ActiveAcceptedBillRevisionId is null;
    }

    private static bool CanApplyBillShapeWithoutInferringSplitPolicy(
        ExpenseBill bill,
        out Guid soleParticipantId)
    {
        soleParticipantId = default;
        var participantIds = bill.Participants
            .Select(participant => participant.UserProfileId)
            .Distinct()
            .ToArray();
        if (participantIds.Length != 1)
        {
            return false;
        }

        soleParticipantId = participantIds[0];
        return bill.Payers.Count is 0
            || (bill.Payers.Count == 1 && bill.Payers.Single().UserProfileId == soleParticipantId);
    }

    private static void SoftDeletePriorOcrItemsFromSameReview(
        ExpenseBill bill,
        Guid reviewId,
        DateTimeOffset now)
    {
        foreach (var item in bill.Items.Where(item =>
            item.DeletedAtUtc is null
            && item.SourceKind == ExpenseBillItemSourceKinds.ReceiptOcrReviewApply
            && item.SourceReceiptOcrReviewId == reviewId))
        {
            item.DeletedAtUtc = now;
            item.UpdatedAtUtc = now;
        }
    }

    private static int AddAppliedOcrItemCandidates(
        SettleoraDbContext dbContext,
        ExpenseBill bill,
        ReceiptOcrReview review,
        Guid soleParticipantId,
        DateTimeOffset now)
    {
        var nextSortOrder = bill.Items
            .Select(item => item.SortOrder)
            .DefaultIfEmpty(-1)
            .Max() + 1;
        var appliedItemCount = 0;
        foreach (var line in review.Lines.OrderBy(line => line.SortOrder).ThenBy(line => line.Id))
        {
            if (!ReceiptOcrReviewApplyPreviewLineCandidateResponse.TryGetProposedLineTotal(line, out var proposedLineTotal)
                || proposedLineTotal <= 0m)
            {
                return 0;
            }

            var item = new ExpenseBillItem
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = bill.Id,
                Name = line.Text,
                Quantity = line.Quantity,
                Amount = proposedLineTotal,
                Currency = review.Currency!,
                SortOrder = nextSortOrder++,
                SourceKind = ExpenseBillItemSourceKinds.ReceiptOcrReviewApply,
                SourceReceiptOcrReviewId = review.Id,
                SourceReceiptOcrReviewLineId = line.Id,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };
            var split = new ExpenseBillItemSplit
            {
                Id = Guid.NewGuid(),
                ExpenseBillItemId = item.Id,
                ExpenseBillItem = item,
                UserProfileId = soleParticipantId,
                SplitMethod = ExpenseBillItemSplitMethods.ExactAmount,
                BasisValue = proposedLineTotal,
                ResolvedAmount = 0m,
                ResolvedCurrency = review.Currency!,
                AllocationOrder = 0,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };
            item.Splits.Add(split);

            bill.Items.Add(item);
            dbContext.Set<ExpenseBillItem>().Add(item);
            appliedItemCount++;
        }

        return appliedItemCount;
    }

    private static bool TryPrepareSinglePayerForDraftRecalculation(
        ExpenseBill bill,
        DateTimeOffset now,
        out decimal draftTotal)
    {
        draftTotal = bill.Items
            .Where(item => item.DeletedAtUtc is null)
            .Sum(item => item.Amount);
        foreach (var adjustment in bill.Adjustments.OrderBy(adjustment => adjustment.SortOrder).ThenBy(adjustment => adjustment.Id))
        {
            draftTotal += adjustment.Direction is ExpenseBillAdjustmentDirections.Charge
                ? adjustment.Amount
                : -adjustment.Amount;
        }

        if (draftTotal < 0m || draftTotal > ExpenseBillConstraints.MoneyAmountMaxValue)
        {
            return false;
        }

        if (bill.Payers.Count == 0)
        {
            return true;
        }

        if (bill.Payers.Count != 1)
        {
            return false;
        }

        var payer = bill.Payers.Single();
        payer.Amount = decimal.Round(draftTotal, ExpenseBillConstraints.MoneyAmountScale, MidpointRounding.ToEven);
        payer.Currency = bill.TotalCurrency;
        payer.UpdatedAtUtc = now;
        return true;
    }

    private static void ApplyCalculation(
        ExpenseBill bill,
        ExpenseBillCalculationResult calculation)
    {
        bill.TotalAmount = calculation.BillTotal!.Amount;
        bill.TotalCurrency = calculation.BillTotal.Currency.Value;

        var splitsById = bill.Items
            .SelectMany(item => item.Splits)
            .ToDictionary(split => split.Id);
        foreach (var calculatedSplit in calculation.ItemSplits)
        {
            var split = splitsById[calculatedSplit.ExpenseBillItemSplitId];
            split.ResolvedAmount = calculatedSplit.ResolvedAmount;
            split.ResolvedCurrency = calculatedSplit.ResolvedCurrency;
            split.ReceivedResidualMinorUnit = calculatedSplit.ReceivedResidualMinorUnit;
        }

        var participantsById = bill.Participants.ToDictionary(participant => participant.UserProfileId);
        foreach (var calculatedShare in calculation.ParticipantShares)
        {
            var participant = participantsById[calculatedShare.UserProfileId];
            participant.ResolvedShareAmount = calculatedShare.ResolvedShareAmount;
            participant.ResolvedShareCurrency = calculatedShare.ResolvedShareCurrency;
            participant.Status = calculatedShare.Status;
        }
    }

    private static void ApplySubmittedReview(
        ReceiptOcrReview review,
        SubmittedReceiptOcrReview submittedReview,
        DateTimeOffset now)
    {
        review.Status = submittedReview.Status;
        review.Source = submittedReview.Source;
        review.MerchantText = submittedReview.MerchantText;
        review.ReceiptIssuedAtUtc = submittedReview.ReceiptIssuedAtUtc;
        review.Currency = submittedReview.Currency;
        review.SubtotalAmount = submittedReview.SubtotalAmount;
        review.TaxAmount = submittedReview.TaxAmount;
        review.ServiceChargeAmount = submittedReview.ServiceChargeAmount;
        review.DiscountAmount = submittedReview.DiscountAmount;
        review.GrandTotalAmount = submittedReview.GrandTotalAmount;
        review.UpdatedAtUtc = now;
        review.RemovedAtUtc = null;
    }

    private static void AddSubmittedLines(
        SettleoraDbContext dbContext,
        ReceiptOcrReview review,
        IReadOnlyList<SubmittedReceiptOcrReviewLine> lines,
        DateTimeOffset now)
    {
        foreach (var line in lines)
        {
            var reviewLine = new ReceiptOcrReviewLine
            {
                Id = Guid.NewGuid(),
                ReceiptOcrReviewId = review.Id,
                SortOrder = line.SortOrder,
                Text = line.Text,
                Quantity = line.Quantity,
                UnitPriceAmount = line.UnitPriceAmount,
                LineTotalAmount = line.LineTotalAmount,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };

            review.Lines.Add(reviewLine);
            dbContext.Entry(reviewLine).State = EntityState.Added;
        }

        if (dbContext.Entry(review).State is EntityState.Unchanged or EntityState.Modified)
        {
            dbContext.Entry(review).State = EntityState.Modified;
        }
    }

    private static ValueTask WriteReviewAuditAsync(
        IReceiptOcrReviewAuditWriter auditWriter,
        Guid actorAuthAccountId,
        ReceiptOcrReviewContext billContext,
        string action,
        string actionCategory,
        ReceiptOcrReview review,
        int lineCount,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken,
        string? applyMode = null)
    {
        return auditWriter.WriteAsync(
            new ReceiptOcrReviewAuditEvent(
                action,
                actorAuthAccountId,
                actorAuthAccountId,
                billContext.BillId,
                billContext.GroupId,
                billContext.GroupId.HasValue ? GroupMode : PersonalGroupMode,
                billContext.BillStatus,
                review.FileObjectId,
                review.Id,
                ExpenseBillAttachmentPurposes.Receipt,
                review.Status,
                review.Source,
                lineCount,
                review.Currency,
                actionCategory,
                applyMode,
                occurredAtUtc),
            cancellationToken);
    }

    private static bool CanMutateReview(
        ReceiptOcrReviewContext billContext,
        Guid actorUserProfileId)
    {
        return billContext.CreatedByUserProfileId == actorUserProfileId
            || billContext.BillOwnerUserProfileId == actorUserProfileId;
    }

    private static bool CanChangeReviewInCurrentState(ReceiptOcrReviewContext billContext)
    {
        return MutableBillStatuses.Contains(billContext.BillStatus);
    }

    private static bool CanApplyReviewInCurrentState(ReceiptOcrReviewContext billContext)
    {
        return billContext.BillStatus == ExpenseBillStatuses.Draft;
    }

    private static string CreateReceiptOcrReviewPath(
        ReceiptOcrReviewContext billContext,
        Guid fileId)
    {
        return billContext.GroupId.HasValue
            ? $"/api/v1/groups/{billContext.GroupId.Value:D}/bills/{billContext.BillId:D}/attachments/{fileId:D}/ocr-review"
            : $"/api/v1/bills/{billContext.BillId:D}/attachments/{fileId:D}/ocr-review";
    }

    private static Dictionary<string, string[]> ToErrorDictionary(Dictionary<string, List<string>> errors)
    {
        return errors.ToDictionary(
            pair => pair.Key,
            pair => pair.Value.Distinct(StringComparer.Ordinal).ToArray(),
            StringComparer.Ordinal);
    }

    private static void AddError(
        Dictionary<string, List<string>> errors,
        string key,
        string message)
    {
        if (!errors.TryGetValue(key, out var messages))
        {
            messages = [];
            errors[key] = messages;
        }

        messages.Add(message);
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
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

    private static IResult ReceiptOcrReviewUnavailable()
    {
        return Results.Problem(
            title: ReceiptOcrReviewUnavailableTitle,
            detail: ReceiptOcrReviewUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult InvalidReceiptOcrReview(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidReceiptOcrReviewTitle,
            detail: InvalidReceiptOcrReviewDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult InvalidReceiptOcrReviewQuery(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidReceiptOcrReviewQueryTitle,
            detail: InvalidReceiptOcrReviewQueryDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult InvalidReceiptOcrReviewApply(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidReceiptOcrReviewApplyTitle,
            detail: InvalidReceiptOcrReviewApplyDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult ReceiptOcrReviewConflict()
    {
        return Results.Problem(
            title: ReceiptOcrReviewConflictTitle,
            detail: ReceiptOcrReviewConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult ReceiptOcrReviewSaveFailed()
    {
        return Results.Problem(
            title: ReceiptOcrReviewSaveFailedTitle,
            detail: ReceiptOcrReviewSaveFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static IResult ReceiptOcrReviewAccessFailed()
    {
        return Results.Problem(
            title: ReceiptOcrReviewAccessFailedTitle,
            detail: ReceiptOcrReviewAccessFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private sealed class ReceiptOcrReviewReadResult
    {
        private ReceiptOcrReviewReadResult(
            SubmittedReceiptOcrReview? review,
            IDictionary<string, string[]> errors)
        {
            Review = review;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public SubmittedReceiptOcrReview? Review { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static ReceiptOcrReviewReadResult Valid(SubmittedReceiptOcrReview review)
        {
            return new ReceiptOcrReviewReadResult(
                review,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static ReceiptOcrReviewReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new ReceiptOcrReviewReadResult(null, errors);
        }
    }

    private sealed class ReceiptOcrReviewQueueReadResult
    {
        private ReceiptOcrReviewQueueReadResult(
            ReceiptOcrReviewQueueFilters? filters,
            IDictionary<string, string[]> errors)
        {
            Filters = filters;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public ReceiptOcrReviewQueueFilters? Filters { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static ReceiptOcrReviewQueueReadResult Valid(ReceiptOcrReviewQueueFilters filters)
        {
            return new ReceiptOcrReviewQueueReadResult(
                filters,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static ReceiptOcrReviewQueueReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new ReceiptOcrReviewQueueReadResult(null, errors);
        }
    }

    private sealed class ReceiptOcrReviewQueryReadResult
    {
        private ReceiptOcrReviewQueryReadResult(IDictionary<string, string[]> errors)
        {
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public IDictionary<string, string[]> Errors { get; }

        public static ReceiptOcrReviewQueryReadResult Valid()
        {
            return new ReceiptOcrReviewQueryReadResult(new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static ReceiptOcrReviewQueryReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new ReceiptOcrReviewQueryReadResult(errors);
        }
    }

    private sealed record ReceiptOcrReviewQueueFilters(
        string? Status,
        string? Source,
        int Limit);

    private sealed class ReceiptOcrReviewApplyReadResult
    {
        private ReceiptOcrReviewApplyReadResult(
            ReceiptOcrReviewApplyRequest? request,
            IDictionary<string, string[]> errors)
        {
            Request = request;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public ReceiptOcrReviewApplyRequest? Request { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static ReceiptOcrReviewApplyReadResult Valid(ReceiptOcrReviewApplyRequest request)
        {
            return new ReceiptOcrReviewApplyReadResult(
                request,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static ReceiptOcrReviewApplyReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new ReceiptOcrReviewApplyReadResult(null, errors);
        }
    }

    private sealed record ReceiptOcrReviewApplyRequest(
        string ApplyMode,
        DateTimeOffset ExpectedReviewUpdatedAtUtc);

    private sealed record SubmittedReceiptOcrReview(
        string Status,
        string Source,
        string? MerchantText,
        DateTimeOffset? ReceiptIssuedAtUtc,
        string? Currency,
        decimal? SubtotalAmount,
        decimal? TaxAmount,
        decimal? ServiceChargeAmount,
        decimal? DiscountAmount,
        decimal? GrandTotalAmount,
        IReadOnlyList<SubmittedReceiptOcrReviewLine> Lines);

    private sealed record SubmittedReceiptOcrReviewLine(
        int SortOrder,
        string Text,
        decimal? Quantity,
        decimal? UnitPriceAmount,
        decimal? LineTotalAmount);

    private sealed record ReceiptOcrReviewContext(
        Guid BillId,
        Guid? GroupId,
        Guid CreatedByUserProfileId,
        Guid BillOwnerUserProfileId,
        string BillStatus,
        string BillCurrency);
}
