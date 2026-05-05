using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Users.PaymentDetails;

internal static class PaymentDetailsAuditServiceCollectionExtensions
{
    public static IServiceCollection AddPaymentDetailsAudit(this IServiceCollection services)
    {
        services.TryAddScoped<IPaymentDetailsAuditWriter, EfPaymentDetailsAuditWriter>();

        return services;
    }
}
