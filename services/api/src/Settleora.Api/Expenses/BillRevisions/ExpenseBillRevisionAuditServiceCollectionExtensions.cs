using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Expenses.BillRevisions;

internal static class ExpenseBillRevisionAuditServiceCollectionExtensions
{
    public static IServiceCollection AddExpenseBillRevisionAudit(this IServiceCollection services)
    {
        services.TryAddScoped<IExpenseBillRevisionAuditWriter, EfExpenseBillRevisionAuditWriter>();

        return services;
    }
}
