using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Expenses.PersonalBills;

internal static class PersonalBillAuditServiceCollectionExtensions
{
    public static IServiceCollection AddPersonalBillAudit(this IServiceCollection services)
    {
        services.TryAddScoped<IPersonalBillAuditWriter, EfPersonalBillAuditWriter>();

        return services;
    }
}
