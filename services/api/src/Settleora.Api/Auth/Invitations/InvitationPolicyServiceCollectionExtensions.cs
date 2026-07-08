using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace Settleora.Api.Auth.Invitations;

internal static class InvitationPolicyServiceCollectionExtensions
{
    public static IServiceCollection AddInvitationPolicyRuntime(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services
            .AddOptions<InvitationEmailDeliveryOptions>()
            .Bind(configuration.GetSection(InvitationEmailDeliveryOptions.SectionName));
        services.TryAddEnumerable(ServiceDescriptor.Singleton<
            IValidateOptions<InvitationEmailDeliveryOptions>,
            InvitationEmailDeliveryOptionsValidator>());
        services.TryAddScoped<IInvitationPolicyService, InvitationPolicyService>();
        services.TryAddScoped<IInvitationManagementService, InvitationManagementService>();
        services.TryAddScoped<IInvitationAcceptanceService, InvitationAcceptanceService>();
        services.TryAddScoped<IInvitationEmailDeliveryReadinessService, InvitationEmailDeliveryReadinessService>();
        services.TryAddScoped<IInvitationEmailTemplateComposer, InvitationEmailTemplateComposer>();
        return services;
    }
}
