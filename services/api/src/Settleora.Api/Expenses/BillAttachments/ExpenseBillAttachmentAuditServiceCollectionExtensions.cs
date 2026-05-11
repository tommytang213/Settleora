using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Expenses.BillAttachments;

internal static class ExpenseBillAttachmentAuditServiceCollectionExtensions
{
    public static IServiceCollection AddExpenseBillAttachmentAudit(this IServiceCollection services)
    {
        services.TryAddScoped<IExpenseBillAttachmentAuditWriter, EfExpenseBillAttachmentAuditWriter>();
        return services;
    }
}
