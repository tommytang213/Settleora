using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace Settleora.Api.Auth.PasswordReset;

internal static class LocalPasswordResetServiceCollectionExtensions
{
    public static IServiceCollection AddLocalPasswordResetRuntime(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services
            .AddOptions<PasswordResetEmailDeliveryOptions>()
            .Bind(configuration.GetSection(PasswordResetEmailDeliveryOptions.SectionName));
        services.TryAddEnumerable(ServiceDescriptor.Singleton<
            IValidateOptions<PasswordResetEmailDeliveryOptions>,
            PasswordResetEmailDeliveryOptionsValidator>());
        services.AddScoped<IPasswordResetMaterialService, PasswordResetMaterialService>();
        services.AddScoped<IPasswordResetAuditWriter, EfPasswordResetAuditWriter>();
        services.AddScoped<ILocalPasswordResetService, LocalPasswordResetService>();
        services.AddScoped<IPasswordResetEmailDeliveryReadinessService, PasswordResetEmailDeliveryReadinessService>();
        services.AddScoped<IPasswordResetEmailTemplateComposer, PasswordResetEmailTemplateComposer>();
        services.AddScoped<IPasswordResetSmtpEmailSender, PasswordResetSmtpEmailSender>();
        services.AddScoped<IPasswordResetEmailDeliveryOrchestrator, PasswordResetEmailDeliveryOrchestrator>();
        return services;
    }
}
