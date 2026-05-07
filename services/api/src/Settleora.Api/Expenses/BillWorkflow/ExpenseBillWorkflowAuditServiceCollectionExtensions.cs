using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Expenses.BillWorkflow;

internal static class ExpenseBillWorkflowAuditServiceCollectionExtensions
{
    public static IServiceCollection AddExpenseBillWorkflowAudit(this IServiceCollection services)
    {
        services.TryAddScoped<IExpenseBillWorkflowAuditWriter, EfExpenseBillWorkflowAuditWriter>();
        return services;
    }
}
