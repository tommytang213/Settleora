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
        services.TryAddSingleton(_ => InvitationAbusePolicyOptions.Default);
        services.TryAddSingleton<IInvitationAbusePolicyService, InMemoryInvitationAbusePolicyService>();
        services.TryAddScoped<IInvitationPolicyService, InvitationPolicyService>();
        services.TryAddScoped<IInvitationLifecycleCleanupService, InvitationLifecycleCleanupService>();
        services.TryAddScoped<IInvitationManagementService, InvitationManagementService>();
        services.TryAddScoped<IInvitationAcceptanceService, InvitationAcceptanceService>();
        services.TryAddScoped<IInvitationEmailDeliveryReadinessService, InvitationEmailDeliveryReadinessService>();
        services.TryAddScoped<IInvitationEmailTemplateComposer, InvitationEmailTemplateComposer>();
        services.TryAddScoped<IInvitationEmailSender, InvitationEmailSender>();
        return services;
    }
}
