using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Expenses.BillRevisions;

internal static class ExpenseBillRevisionNotificationServiceCollectionExtensions
{
    public static IServiceCollection AddExpenseBillRevisionNotifications(this IServiceCollection services)
    {
        services.TryAddScoped<ExpenseBillRevisionNotificationWriter>();

        return services;
    }
}
