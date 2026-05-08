using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Settlements;

internal static class SettlementPaymentAuditServiceCollectionExtensions
{
    public static IServiceCollection AddSettlementPaymentAudit(this IServiceCollection services)
    {
        services.TryAddScoped<ISettlementPaymentAuditWriter, EfSettlementPaymentAuditWriter>();
        return services;
    }
}
