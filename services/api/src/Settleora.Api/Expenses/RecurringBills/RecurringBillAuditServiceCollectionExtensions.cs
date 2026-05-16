using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Expenses.RecurringBills;

internal static class RecurringBillAuditServiceCollectionExtensions
{
    public static IServiceCollection AddRecurringBillAudit(this IServiceCollection services)
    {
        services.TryAddScoped<IRecurringBillAuditWriter, EfRecurringBillAuditWriter>();

        return services;
    }
}
