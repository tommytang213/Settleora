using System.Globalization;
using Settleora.Api.Domain.Expenses;

namespace Settleora.Api.Expenses.ReceiptOcrReviews;

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
            review.CreatedAtUtc,
            review.UpdatedAtUtc);
    }

    private static string? FormatAmount(decimal? amount)
    {
        return amount?.ToString("0.####", CultureInfo.InvariantCulture);
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
