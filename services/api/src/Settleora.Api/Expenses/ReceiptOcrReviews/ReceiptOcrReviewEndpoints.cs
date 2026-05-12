using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Files;
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
    private const string PersonalGroupMode = "personal";
    private const string GroupMode = "group";
    private const string ReviewSavedAction = "bill_attachment.ocr_review_saved";
    private const string ReviewReadAction = "bill_attachment.ocr_review_read";
    private const string ReviewRemovedAction = "bill_attachment.ocr_review_removed";

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

    public static WebApplication MapReceiptOcrReviewEndpoints(this WebApplication app)
    {
        var bills = app.MapGroup("/api/v1/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        bills.MapPut("/{billId:guid}/attachments/{fileId:guid}/ocr-review", UpsertPersonalReceiptOcrReviewAsync);
        bills.MapGet("/{billId:guid}/attachments/{fileId:guid}/ocr-review", GetPersonalReceiptOcrReviewAsync);
        bills.MapDelete("/{billId:guid}/attachments/{fileId:guid}/ocr-review", RemovePersonalReceiptOcrReviewAsync);

        var groupBills = app.MapGroup("/api/v1/groups/{groupId:guid}/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        groupBills.MapPut("/{billId:guid}/attachments/{fileId:guid}/ocr-review", UpsertGroupReceiptOcrReviewAsync);
        groupBills.MapGet("/{billId:guid}/attachments/{fileId:guid}/ocr-review", GetGroupReceiptOcrReviewAsync);
        groupBills.MapDelete("/{billId:guid}/attachments/{fileId:guid}/ocr-review", RemoveGroupReceiptOcrReviewAsync);

        return app;
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

        var readResult = await ReadReceiptOcrReviewRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.Review is null)
        {
            return InvalidReceiptOcrReview(readResult.Errors);
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
            dbContext,
            timeProvider,
            cancellationToken);
    }

    private static Task<IResult> GetGroupReceiptOcrReviewAsync(
        Guid groupId,
        Guid billId,
        Guid fileId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IReceiptOcrReviewAuditWriter auditWriter,
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

    private static Task<IResult> RemovePersonalReceiptOcrReviewAsync(
        Guid billId,
        Guid fileId,
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
                bill.Status))
            .SingleOrDefaultAsync(cancellationToken);
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
        CancellationToken cancellationToken)
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
        string BillStatus);
}
