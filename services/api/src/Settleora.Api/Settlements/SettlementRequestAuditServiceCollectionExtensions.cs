using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Settlements;

internal static class SettlementRequestAuditServiceCollectionExtensions
{
    public static IServiceCollection AddSettlementRequestAudit(this IServiceCollection services)
    {
        services.TryAddScoped<ISettlementRequestAuditWriter, EfSettlementRequestAuditWriter>();
        return services;
    }
}
