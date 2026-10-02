using Settleora.Api.Domain.Expenses;
using Settleora.Api.Expenses.ReceiptOcrReviews;

namespace Settleora.Api.Tests;

public sealed class ReceiptOcrTaxReconciliationTests
{
    [Theory]
    [InlineData("already_in_base", "24", "24", "24", true, "24")]
    [InlineData("add_to_base", "20", "20", "24", true, "24")]
    [InlineData(null, "20", "20", "24", true, "24")]
    [InlineData("already_in_base", "24", "24", "28", false, "24")]
    [InlineData("unresolved", "24", "24", "24", false, null)]
    public void PreviewUsesOneModeAwareAmountForGrossNetAndLegacy(
        string? mode, string lineTotal, string? subtotal, string total,
        bool canApply, string? expectedHeader)
    {
        var review = CreateReview(mode, decimal.Parse(lineTotal),
            subtotal is null ? null : decimal.Parse(subtotal), decimal.Parse(total));
        var preview = ReceiptOcrReviewApplyPreviewResponse.From(review, "GBP");
        Assert.Equal(canApply, preview.CanApply);
        Assert.Equal(expectedHeader, preview.Summary.ExpectedHeaderTotalAmount);
        if (mode is ReceiptOcrReviewTaxReconciliationModes.Unresolved)
            Assert.Contains(ReceiptOcrReviewApplyPreviewIssueCodes.TaxReconciliationUnresolved, preview.BlockedReasons);
        if (mode is ReceiptOcrReviewTaxReconciliationModes.AlreadyInBase && !canApply)
            Assert.Contains(ReceiptOcrReviewApplyPreviewIssueCodes.HeaderTotalMismatch, preview.BlockedReasons);
    }

    [Theory]
    [InlineData("24", "24", true)]
    [InlineData("20", "24", false)]
    public void MissingSubtotalRequiresCompleteLineBase(string lineTotal, string total, bool canApply)
    {
        var review = CreateReview(ReceiptOcrReviewTaxReconciliationModes.AlreadyInBase,
            decimal.Parse(lineTotal), null, decimal.Parse(total));
        var preview = ReceiptOcrReviewApplyPreviewResponse.From(review, "GBP");
        Assert.Equal(canApply, preview.CanApply);
        Assert.Equal(lineTotal, preview.Summary.ExpectedHeaderTotalAmount);
        review.Lines.Single().LineTotalAmount = null;
        review.Lines.Single().Quantity = null;
        review.Lines.Single().UnitPriceAmount = null;
        var incomplete = ReceiptOcrReviewApplyPreviewResponse.From(review, "GBP");
        Assert.False(incomplete.CanApply);
        Assert.Contains(ReceiptOcrReviewApplyPreviewIssueCodes.TaxReconciliationInvalid, incomplete.BlockedReasons);
    }

    [Theory]
    [InlineData("already_in_base", null)]
    [InlineData("already_in_base", "25")]
    [InlineData("add_to_base", null)]
    public void ExplicitModeRequiresBoundedPresentTax(string mode, string? tax)
    {
        var review = CreateReview(mode, 24m, 24m, 24m);
        review.TaxAmount = tax is null ? null : decimal.Parse(tax);
        var preview = ReceiptOcrReviewApplyPreviewResponse.From(review, "GBP");
        Assert.False(preview.CanApply);
        Assert.Contains(ReceiptOcrReviewApplyPreviewIssueCodes.TaxReconciliationInvalid, preview.BlockedReasons);
    }

    private static ReceiptOcrReview CreateReview(string? mode, decimal lineTotal, decimal? subtotal, decimal total)
    {
        var review = new ReceiptOcrReview
        {
            Id = Guid.NewGuid(), ExpenseBillId = Guid.NewGuid(), FileObjectId = Guid.NewGuid(),
            Status = ReceiptOcrReviewStatuses.Reviewed,
            Source = ReceiptOcrReviewSources.OnDevice, Currency = "GBP",
            SubtotalAmount = subtotal, TaxAmount = 4m, GrandTotalAmount = total,
            TaxReconciliationMode = mode
        };
        review.Lines.Add(new ReceiptOcrReviewLine
        {
            Id = Guid.NewGuid(), Text = "Book", SortOrder = 0,
            Quantity = 1m, UnitPriceAmount = lineTotal, LineTotalAmount = lineTotal
        });
        return review;
    }
}
