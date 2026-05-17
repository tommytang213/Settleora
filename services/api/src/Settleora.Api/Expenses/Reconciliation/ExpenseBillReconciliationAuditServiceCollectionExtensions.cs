namespace Settleora.Api.Expenses.Reconciliation;

internal static class ExpenseBillReconciliationAuditServiceCollectionExtensions
{
    public static IServiceCollection AddExpenseBillReconciliationAudit(this IServiceCollection services)
    {
        services.AddScoped<IExpenseBillReconciliationAuditWriter, EfExpenseBillReconciliationAuditWriter>();
        return services;
    }
}
