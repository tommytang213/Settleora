using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Users.Groups;

internal static class GroupMembershipAuditServiceCollectionExtensions
{
    public static IServiceCollection AddGroupMembershipAudit(this IServiceCollection services)
    {
        services.TryAddScoped<IGroupMembershipAuditWriter, EfGroupMembershipAuditWriter>();

        return services;
    }
}
