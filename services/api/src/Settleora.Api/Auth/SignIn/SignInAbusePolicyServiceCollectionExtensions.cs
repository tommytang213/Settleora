using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Auth.SignIn;

internal static class SignInAbusePolicyServiceCollectionExtensions
{
    public static IServiceCollection AddSignInAbusePolicy(this IServiceCollection services)
    {
        services.TryAddSingleton(TimeProvider.System);
        services.TryAddSingleton(_ => SignInAbusePolicyOptions.Default);
        services.AddSingleton<ISignInAbusePolicyService, InMemorySignInAbusePolicyService>();

        return services;
    }
}
