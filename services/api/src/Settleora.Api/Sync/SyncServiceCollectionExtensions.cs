using Microsoft.Extensions.DependencyInjection.Extensions;
using Settleora.Api.Expenses.BillLifecycle;

namespace Settleora.Api.Sync;

internal static class SyncServiceCollectionExtensions
{
    public static IServiceCollection AddSyncOfflineFoundation(this IServiceCollection services)
    {
        services.TryAddScoped<ExpenseBillLifecycleService>();
        services.TryAddScoped<SyncOperationService>();
        services.TryAddScoped<ISyncOperationAuditWriter, EfSyncOperationAuditWriter>();

        return services;
    }
}
