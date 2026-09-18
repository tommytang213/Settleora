using System.Globalization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Money;

namespace Settleora.Api.Expenses.ReceiptOcrReviews;

internal sealed record ReceiptOcrReviewListResponse(
    IReadOnlyList<ReceiptOcrReviewSummaryResponse> Reviews);

internal sealed record ReceiptOcrReviewSummaryResponse(
    Guid ReviewId,
    Guid BillId,
    Guid? GroupId,
    Guid FileId,
    string Status,
    string Source,
    string? MerchantText,
    string? Currency,
    int LineCount,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc);

internal sealed record ReceiptOcrReviewResponse(
    Guid Id,
    Guid BillId,
    Guid FileId,
    Guid? GroupId,
    string Status,
    string Source,
    string? MerchantText,
    DateTimeOffset? ReceiptIssuedAtUtc,
    string? Currency,
    string? SubtotalAmount,
    string? TaxAmount,
    string? ServiceChargeAmount,
    string? DiscountAmount,
    string? GrandTotalAmount,
    IReadOnlyList<ReceiptOcrReviewLineResponse> Lines,
    IReadOnlyList<ReceiptOcrReviewAdjustmentResponse> AdjustmentEvidence,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc)
{
    public static ReceiptOcrReviewResponse From(ReceiptOcrReview review)
    {
        return new ReceiptOcrReviewResponse(
            review.Id,
            review.ExpenseBillId,
            review.FileObjectId,
            review.GroupId,
            review.Status,
            review.Source,
            review.MerchantText,
            review.ReceiptIssuedAtUtc,
            review.Currency,
            FormatAmount(review.SubtotalAmount),
            FormatAmount(review.TaxAmount),
            FormatAmount(review.ServiceChargeAmount),
            FormatAmount(review.DiscountAmount),
            FormatAmount(review.GrandTotalAmount),
            review.Lines
                .OrderBy(line => line.SortOrder)
                .Select(ReceiptOcrReviewLineResponse.From)
                .ToArray(),
            review.Adjustments
                .OrderBy(adjustment => adjustment.SortOrder)
                .ThenBy(adjustment => adjustment.Id)
                .Select(ReceiptOcrReviewAdjustmentResponse.From)
                .ToArray(),
            review.CreatedAtUtc,
            review.UpdatedAtUtc);
    }

    private static string? FormatAmount(decimal? amount)
    {
        return amount?.ToString("0.####", CultureInfo.InvariantCulture);
    }
}

internal sealed record ReceiptOcrReviewAdjustmentResponse(
    Guid Id,
    int SortOrder,
    string Kind,
    string OriginalLabel,
    string Amount,
    string Currency,
    string Direction,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc)
{
    public static ReceiptOcrReviewAdjustmentResponse From(ReceiptOcrReviewAdjustment adjustment)
    {
        return new ReceiptOcrReviewAdjustmentResponse(
            adjustment.Id,
            adjustment.SortOrder,
            adjustment.Kind,
            adjustment.OriginalLabel,
            adjustment.Amount.ToString("0.####", CultureInfo.InvariantCulture),
            adjustment.Currency,
            adjustment.Direction,
            adjustment.CreatedAtUtc,
            adjustment.UpdatedAtUtc);
    }
}

internal sealed record ReceiptOcrReviewAssignmentResponse(
    Guid Id,
    Guid ReceiptOcrReviewId,
    Guid BillId,
    Guid FileId,
    Guid? GroupId,
    string AssignmentStatus,
    Guid AssignedToUserProfileId,
    Guid? AssignedByUserProfileId,
    string AssignmentSource,
    Guid? SourceActorUserProfileId,
    string? SourceCorrelationId,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    DateTimeOffset? CompletedAtUtc,
    DateTimeOffset? CancelledAtUtc,
    DateTimeOffset? SupersededAtUtc)
{
    public static ReceiptOcrReviewAssignmentResponse From(ReceiptOcrReviewAssignment assignment)
    {
        return new ReceiptOcrReviewAssignmentResponse(
            assignment.Id,
            assignment.ReceiptOcrReviewId,
            assignment.ExpenseBillId,
            assignment.FileObjectId,
            assignment.GroupId,
            assignment.AssignmentStatus,
            assignment.AssignedToUserProfileId,
            assignment.AssignedByUserProfileId,
            assignment.AssignmentSource,
            assignment.SourceActorUserProfileId,
            assignment.SourceCorrelationId,
            assignment.CreatedAtUtc,
            assignment.UpdatedAtUtc,
            assignment.CompletedAtUtc,
            assignment.CancelledAtUtc,
            assignment.SupersededAtUtc);
    }
}

internal sealed record ReceiptOcrReviewLineResponse(
    Guid Id,
    int SortOrder,
    string Text,
    string? Quantity,
    string? UnitPriceAmount,
    string? LineTotalAmount,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc)
{
    public static ReceiptOcrReviewLineResponse From(ReceiptOcrReviewLine line)
    {
        return new ReceiptOcrReviewLineResponse(
            line.Id,
            line.SortOrder,
            line.Text,
            FormatAmount(line.Quantity),
            FormatAmount(line.UnitPriceAmount),
            FormatAmount(line.LineTotalAmount),
            line.CreatedAtUtc,
            line.UpdatedAtUtc);
    }

    private static string? FormatAmount(decimal? amount)
    {
        return amount?.ToString("0.####", CultureInfo.InvariantCulture);
    }
}

internal sealed record ReceiptOcrReviewApplyPreviewResponse(
    Guid ReviewId,
    Guid BillId,
    Guid? GroupId,
    Guid FileId,
    string Status,
    string Source,
    string? ProposedMerchantText,
    DateTimeOffset? ProposedReceiptIssuedAtUtc,
    string? ProposedCurrency,
    string? ProposedSubtotalAmount,
    string? ProposedTaxAmount,
    string? ProposedServiceChargeAmount,
    string? ProposedDiscountAmount,
    string? ProposedGrandTotalAmount,
    IReadOnlyList<ReceiptOcrReviewApplyPreviewLineCandidateResponse> ProposedLines,
    IReadOnlyList<ReceiptOcrReviewAdjustmentResponse> AdjustmentEvidence,
    ReceiptOcrReviewApplyPreviewSummaryResponse Summary,
    bool CanApply,
    IReadOnlyList<string> BlockedReasons,
    IReadOnlyList<string> Warnings,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc)
{
    public static ReceiptOcrReviewApplyPreviewResponse From(ReceiptOcrReview review, string billCurrency)
    {
        var orderedLines = review.Lines
            .OrderBy(line => line.SortOrder)
            .ThenBy(line => line.Id)
            .ToArray();
        var proposedLines = orderedLines
            .Select(ReceiptOcrReviewApplyPreviewLineCandidateResponse.From)
            .ToArray();
        var blockedReasons = new List<string>();
        var warnings = new List<string>();

        if (review.Adjustments.Count > 0)
        {
            AddWarning(warnings, ReceiptOcrReviewApplyPreviewIssueCodes.AdjustmentsNotAutoApplied);
            if (review.Adjustments.Any(adjustment => !string.Equals(
                    adjustment.Currency,
                    review.Currency,
                    StringComparison.Ordinal)))
            {
                AddWarning(warnings, ReceiptOcrReviewApplyPreviewIssueCodes.AdjustmentCurrencyNotReconciled);
            }
        }

        if (!ReceiptOcrReviewStatuses.IsSupported(review.Status))
        {
            AddBlockedIssue(blockedReasons, warnings, ReceiptOcrReviewApplyPreviewIssueCodes.UnsupportedReviewStatus);
        }

        if (!ReceiptOcrReviewSources.IsSupported(review.Source))
        {
            AddBlockedIssue(blockedReasons, warnings, ReceiptOcrReviewApplyPreviewIssueCodes.UnsupportedReviewSource);
        }

        if (string.IsNullOrWhiteSpace(review.Currency))
        {
            AddBlockedIssue(blockedReasons, warnings, ReceiptOcrReviewApplyPreviewIssueCodes.MissingCurrency);
        }
        else if (!CurrencyCode.TryCreate(review.Currency, out var parsedCurrency)
            || !SupportedCurrencyPolicy.Default.ValidateSupported(parsedCurrency).Succeeded)
        {
            AddBlockedIssue(blockedReasons, warnings, ReceiptOcrReviewApplyPreviewIssueCodes.UnsupportedCurrency);
        }
        else if (!string.Equals(parsedCurrency.Value, billCurrency, StringComparison.Ordinal))
        {
            AddBlockedIssue(blockedReasons, warnings, ReceiptOcrReviewApplyPreviewIssueCodes.CurrencyMismatch);
        }

        if (!review.GrandTotalAmount.HasValue)
        {
            AddBlockedIssue(blockedReasons, warnings, ReceiptOcrReviewApplyPreviewIssueCodes.MissingGrandTotal);
        }

        if (orderedLines.Length == 0)
        {
            AddBlockedIssue(blockedReasons, warnings, ReceiptOcrReviewApplyPreviewIssueCodes.EmptyLineSet);
        }

        foreach (var line in orderedLines)
        {
            if (!ReceiptOcrReviewApplyPreviewLineCandidateResponse.TryGetProposedLineTotal(line, out _))
            {
                AddBlockedIssue(blockedReasons, warnings, ReceiptOcrReviewApplyPreviewIssueCodes.UnsupportedLineState);
            }
            else if (!line.LineTotalAmount.HasValue)
            {
                AddWarning(warnings, ReceiptOcrReviewApplyPreviewIssueCodes.LineTotalMissing);
            }

            if (ReceiptOcrReviewApplyPreviewLineCandidateResponse.HasLineTotalMismatch(line))
            {
                AddBlockedIssue(blockedReasons, warnings, ReceiptOcrReviewApplyPreviewIssueCodes.LineTotalMismatch);
            }
        }

        var hasExpectedHeaderTotal = TryCalculateExpectedHeaderTotal(
            review,
            out var expectedHeaderTotal,
            out var expectedHeaderTotalOutOfRange);
        if (expectedHeaderTotalOutOfRange
            || (hasExpectedHeaderTotal
                && review.GrandTotalAmount.HasValue
                && NormalizeAmount(expectedHeaderTotal) != NormalizeAmount(review.GrandTotalAmount.Value)))
        {
            AddBlockedIssue(blockedReasons, warnings, ReceiptOcrReviewApplyPreviewIssueCodes.HeaderTotalMismatch);
        }

        if (TryCalculateProposedLineTotalSum(orderedLines, out var proposedLineTotalSum)
            && orderedLines.Length > 0)
        {
            var comparisonAmount = GetLineSumComparisonAmount(review);
            if (comparisonAmount.HasValue && NormalizeAmount(proposedLineTotalSum) != NormalizeAmount(comparisonAmount.Value))
            {
                AddWarning(warnings, ReceiptOcrReviewApplyPreviewIssueCodes.LineSumMismatch);
            }
        }

        var summary = ReceiptOcrReviewApplyPreviewSummaryResponse.From(review, orderedLines);
        return new ReceiptOcrReviewApplyPreviewResponse(
            review.Id,
            review.ExpenseBillId,
            review.GroupId,
            review.FileObjectId,
            review.Status,
            review.Source,
            review.MerchantText,
            review.ReceiptIssuedAtUtc,
            review.Currency,
            FormatAmount(review.SubtotalAmount),
            FormatAmount(review.TaxAmount),
            FormatAmount(review.ServiceChargeAmount),
            FormatAmount(review.DiscountAmount),
            FormatAmount(review.GrandTotalAmount),
            proposedLines,
            review.Adjustments
                .OrderBy(adjustment => adjustment.SortOrder)
                .ThenBy(adjustment => adjustment.Id)
                .Select(ReceiptOcrReviewAdjustmentResponse.From)
                .ToArray(),
            summary,
            blockedReasons.Count == 0,
            blockedReasons,
            warnings,
            review.CreatedAtUtc,
            review.UpdatedAtUtc);
    }

    private static void AddBlockedIssue(List<string> blockedReasons, List<string> warnings, string code)
    {
        AddWarning(blockedReasons, code);
        AddWarning(warnings, code);
    }

    private static void AddWarning(List<string> warnings, string code)
    {
        if (!warnings.Contains(code, StringComparer.Ordinal))
        {
            warnings.Add(code);
        }
    }

    private static bool TryCalculateExpectedHeaderTotal(
        ReceiptOcrReview review,
        out decimal expectedHeaderTotal,
        out bool outOfRange)
    {
        expectedHeaderTotal = 0m;
        outOfRange = false;
        if (!review.SubtotalAmount.HasValue)
        {
            return false;
        }

        expectedHeaderTotal = review.SubtotalAmount.Value
            + (review.TaxAmount ?? 0m)
            + (review.ServiceChargeAmount ?? 0m)
            - (review.DiscountAmount ?? 0m);
        foreach (var adjustment in review.Adjustments)
        {
            if (!string.Equals(adjustment.Currency, review.Currency, StringComparison.Ordinal))
            {
                expectedHeaderTotal = 0m;
                return false;
            }

            expectedHeaderTotal += adjustment.Direction is ReceiptOcrReviewAdjustmentDirections.Credit
                ? -adjustment.Amount
                : adjustment.Amount;
        }
        if (expectedHeaderTotal < 0m || expectedHeaderTotal > ReceiptOcrReviewConstraints.MoneyAmountMaxValue)
        {
            expectedHeaderTotal = 0m;
            outOfRange = true;
            return false;
        }

        expectedHeaderTotal = NormalizeAmount(expectedHeaderTotal);
        return true;
    }

    private static decimal? GetLineSumComparisonAmount(ReceiptOcrReview review)
    {
        if (review.SubtotalAmount.HasValue)
        {
            return review.SubtotalAmount.Value;
        }

        if (review.TaxAmount.HasValue
            || review.ServiceChargeAmount.HasValue
            || review.DiscountAmount.HasValue
            || !review.GrandTotalAmount.HasValue)
        {
            return null;
        }

        var merchandiseAmount = review.GrandTotalAmount.Value;
        foreach (var adjustment in review.Adjustments)
        {
            if (!string.Equals(adjustment.Currency, review.Currency, StringComparison.Ordinal))
            {
                return null;
            }

            merchandiseAmount += adjustment.Direction is ReceiptOcrReviewAdjustmentDirections.Credit
                ? adjustment.Amount
                : -adjustment.Amount;
        }

        return merchandiseAmount is >= 0m and <= ReceiptOcrReviewConstraints.MoneyAmountMaxValue
            ? NormalizeAmount(merchandiseAmount)
            : null;
    }

    private static bool TryCalculateProposedLineTotalSum(
        IReadOnlyList<ReceiptOcrReviewLine> lines,
        out decimal proposedLineTotalSum)
    {
        proposedLineTotalSum = 0m;
        foreach (var line in lines)
        {
            if (!ReceiptOcrReviewApplyPreviewLineCandidateResponse.TryGetProposedLineTotal(line, out var proposedLineTotal))
            {
                proposedLineTotalSum = 0m;
                return false;
            }

            proposedLineTotalSum += proposedLineTotal;
            if (proposedLineTotalSum > ReceiptOcrReviewConstraints.MoneyAmountMaxValue)
            {
                proposedLineTotalSum = 0m;
                return false;
            }
        }

        proposedLineTotalSum = NormalizeAmount(proposedLineTotalSum);
        return true;
    }

    private static decimal NormalizeAmount(decimal amount)
    {
        return decimal.Round(amount, ReceiptOcrReviewConstraints.MoneyAmountScale, MidpointRounding.ToEven);
    }

    private static string? FormatAmount(decimal? amount)
    {
        return amount?.ToString("0.####", CultureInfo.InvariantCulture);
    }
}

internal sealed record ReceiptOcrReviewApplyResponse(
    Guid ReviewId,
    Guid BillId,
    Guid? GroupId,
    Guid FileId,
    string ApplyMode,
    int AppliedItemCount,
    string Currency,
    string? SubtotalAmount,
    string? GrandTotalAmount,
    ReceiptOcrReviewApplyPreviewSummaryResponse Summary,
    IReadOnlyList<string> BlockedReasons,
    IReadOnlyList<string> Warnings,
    DateTimeOffset AppliedAtUtc)
{
    public static ReceiptOcrReviewApplyResponse From(
        ReceiptOcrReview review,
        string applyMode,
        int appliedItemCount,
        ReceiptOcrReviewApplyPreviewResponse preview,
        DateTimeOffset appliedAtUtc)
    {
        return new ReceiptOcrReviewApplyResponse(
            review.Id,
            review.ExpenseBillId,
            review.GroupId,
            review.FileObjectId,
            applyMode,
            appliedItemCount,
            review.Currency!,
            FormatAmount(review.SubtotalAmount),
            FormatAmount(review.GrandTotalAmount),
            preview.Summary,
            [],
            preview.Warnings,
            appliedAtUtc);
    }

    private static string? FormatAmount(decimal? amount)
    {
        return amount?.ToString("0.####", CultureInfo.InvariantCulture);
    }
}

internal sealed record ReceiptOcrReviewApplyPreviewLineCandidateResponse(
    Guid ReviewLineId,
    int SortOrder,
    string Text,
    string? Quantity,
    string? UnitPriceAmount,
    string? LineTotalAmount,
    string? ProposedLineTotalAmount)
{
    public static ReceiptOcrReviewApplyPreviewLineCandidateResponse From(ReceiptOcrReviewLine line)
    {
        return new ReceiptOcrReviewApplyPreviewLineCandidateResponse(
            line.Id,
            line.SortOrder,
            line.Text,
            FormatAmount(line.Quantity),
            FormatAmount(line.UnitPriceAmount),
            FormatAmount(line.LineTotalAmount),
            TryGetProposedLineTotal(line, out var proposedLineTotal)
                ? FormatAmount(proposedLineTotal)
                : null);
    }

    internal static bool TryGetProposedLineTotal(ReceiptOcrReviewLine line, out decimal proposedLineTotal)
    {
        if (line.LineTotalAmount.HasValue)
        {
            proposedLineTotal = NormalizeAmount(line.LineTotalAmount.Value);
            return true;
        }

        if (!line.Quantity.HasValue || !line.UnitPriceAmount.HasValue)
        {
            proposedLineTotal = 0m;
            return false;
        }

        try
        {
            proposedLineTotal = NormalizeAmount(line.Quantity.Value * line.UnitPriceAmount.Value);
            return proposedLineTotal <= ReceiptOcrReviewConstraints.MoneyAmountMaxValue;
        }
        catch (OverflowException)
        {
            proposedLineTotal = 0m;
            return false;
        }
    }

    internal static bool HasLineTotalMismatch(ReceiptOcrReviewLine line)
    {
        if (!line.Quantity.HasValue || !line.UnitPriceAmount.HasValue || !line.LineTotalAmount.HasValue)
        {
            return false;
        }

        try
        {
            var expectedLineTotal = NormalizeAmount(line.Quantity.Value * line.UnitPriceAmount.Value);
            return expectedLineTotal != NormalizeAmount(line.LineTotalAmount.Value);
        }
        catch (OverflowException)
        {
            return true;
        }
    }

    private static decimal NormalizeAmount(decimal amount)
    {
        return decimal.Round(amount, ReceiptOcrReviewConstraints.MoneyAmountScale, MidpointRounding.ToEven);
    }

    private static string? FormatAmount(decimal? amount)
    {
        return amount?.ToString("0.####", CultureInfo.InvariantCulture);
    }
}

internal sealed record ReceiptOcrReviewApplyPreviewSummaryResponse(
    int LineCount,
    int LinesWithProposedTotalCount,
    int LinesMissingProposedTotalCount,
    int AdjustmentEvidenceCount,
    int AutoAppliedAdjustmentCount,
    string? ProposedLineTotalSumAmount,
    string? ReconciledAdjustmentChargeTotalAmount,
    string? ReconciledAdjustmentCreditTotalAmount,
    string? ExpectedHeaderTotalAmount)
{
    public static ReceiptOcrReviewApplyPreviewSummaryResponse From(
        ReceiptOcrReview review,
        IReadOnlyList<ReceiptOcrReviewLine> orderedLines)
    {
        var linesWithTotal = 0;
        var proposedLineTotalSum = 0m;
        foreach (var line in orderedLines)
        {
            if (!ReceiptOcrReviewApplyPreviewLineCandidateResponse.TryGetProposedLineTotal(line, out var proposedLineTotal))
            {
                continue;
            }

            linesWithTotal++;
            proposedLineTotalSum += proposedLineTotal;
        }

        var canReconcileAdjustments = review.Adjustments.All(adjustment => string.Equals(
            adjustment.Currency,
            review.Currency,
            StringComparison.Ordinal));
        var reconciledAdjustments = canReconcileAdjustments
            ? review.Adjustments.ToArray()
            : [];
        var adjustmentChargeTotal = reconciledAdjustments
            .Where(adjustment => adjustment.Direction is ReceiptOcrReviewAdjustmentDirections.Charge)
            .Sum(adjustment => adjustment.Amount);
        var adjustmentCreditTotal = reconciledAdjustments
            .Where(adjustment => adjustment.Direction is ReceiptOcrReviewAdjustmentDirections.Credit)
            .Sum(adjustment => adjustment.Amount);
        var expectedHeaderTotalAmount = CalculateExpectedHeaderTotal(review);
        return new ReceiptOcrReviewApplyPreviewSummaryResponse(
            orderedLines.Count,
            linesWithTotal,
            orderedLines.Count - linesWithTotal,
            review.Adjustments.Count,
            0,
            linesWithTotal > 0 ? FormatAmount(NormalizeAmount(proposedLineTotalSum)) : null,
            canReconcileAdjustments ? FormatAmount(NormalizeAmount(adjustmentChargeTotal)) : null,
            canReconcileAdjustments ? FormatAmount(NormalizeAmount(adjustmentCreditTotal)) : null,
            expectedHeaderTotalAmount.HasValue ? FormatAmount(expectedHeaderTotalAmount.Value) : null);
    }

    private static decimal? CalculateExpectedHeaderTotal(ReceiptOcrReview review)
    {
        if (!review.SubtotalAmount.HasValue)
        {
            return null;
        }

        var expectedHeaderTotal = review.SubtotalAmount.Value
            + (review.TaxAmount ?? 0m)
            + (review.ServiceChargeAmount ?? 0m)
            - (review.DiscountAmount ?? 0m);
        foreach (var adjustment in review.Adjustments)
        {
            if (!string.Equals(adjustment.Currency, review.Currency, StringComparison.Ordinal))
            {
                return null;
            }

            expectedHeaderTotal += adjustment.Direction is ReceiptOcrReviewAdjustmentDirections.Credit
                ? -adjustment.Amount
                : adjustment.Amount;
        }
        return expectedHeaderTotal is < 0m or > ReceiptOcrReviewConstraints.MoneyAmountMaxValue
            ? null
            : NormalizeAmount(expectedHeaderTotal);
    }

    private static decimal NormalizeAmount(decimal amount)
    {
        return decimal.Round(amount, ReceiptOcrReviewConstraints.MoneyAmountScale, MidpointRounding.ToEven);
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", CultureInfo.InvariantCulture);
    }
}
