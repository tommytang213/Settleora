namespace Settleora.Api.Expenses.ReceiptOcrReviews;

internal static class ReceiptOcrReviewAuditServiceCollectionExtensions
{
    public static IServiceCollection AddReceiptOcrReviewAudit(this IServiceCollection services)
    {
        services.AddScoped<IReceiptOcrReviewAuditWriter, EfReceiptOcrReviewAuditWriter>();
        return services;
    }
}
