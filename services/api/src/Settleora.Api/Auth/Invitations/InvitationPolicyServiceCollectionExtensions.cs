using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Auth.Invitations;

internal static class InvitationPolicyServiceCollectionExtensions
{
    public static IServiceCollection AddInvitationPolicyRuntime(this IServiceCollection services)
    {
        services.TryAddScoped<IInvitationPolicyService, InvitationPolicyService>();
        services.TryAddScoped<IInvitationManagementService, InvitationManagementService>();
        return services;
    }
}
