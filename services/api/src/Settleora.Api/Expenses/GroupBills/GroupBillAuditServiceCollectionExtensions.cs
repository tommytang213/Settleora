using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Expenses.GroupBills;

internal static class GroupBillAuditServiceCollectionExtensions
{
    public static IServiceCollection AddGroupBillAudit(this IServiceCollection services)
    {
        services.TryAddScoped<IGroupBillAuditWriter, EfGroupBillAuditWriter>();

        return services;
    }
}
