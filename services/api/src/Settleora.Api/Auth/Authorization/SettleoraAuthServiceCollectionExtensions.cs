using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Settleora.Api.Domain.Auth;

namespace Settleora.Api.Auth.Authorization;

internal static class SettleoraAuthServiceCollectionExtensions
{
    public static IServiceCollection AddSettleoraAuth(this IServiceCollection services)
    {
        AppContext.SetSwitch(
            "Microsoft.AspNetCore.Authentication.SuppressAutoDefaultScheme",
            isEnabled: true);

        services.AddHttpContextAccessor();
        services.TryAddScoped<ICurrentActorAccessor, HttpContextCurrentActorAccessor>();

        services.AddAuthentication()
            .AddScheme<AuthenticationSchemeOptions, SettleoraSessionAuthenticationHandler>(
                SettleoraSessionAuthenticationDefaults.AuthenticationScheme,
                options => { });

        services.AddAuthorization(options =>
        {
            var authenticatedUserPolicy = CreateAuthenticatedUserPolicy();
            options.DefaultPolicy = authenticatedUserPolicy;
            options.AddPolicy(
                SettleoraAuthorizationPolicies.AuthenticatedUser,
                authenticatedUserPolicy);
            options.AddPolicy(
                SettleoraAuthorizationPolicies.SystemRoleOwner,
                CreateSystemRolePolicy(SystemRoles.Owner));
            options.AddPolicy(
                SettleoraAuthorizationPolicies.SystemRoleAdmin,
                CreateSystemRolePolicy(SystemRoles.Admin));
            options.AddPolicy(
                SettleoraAuthorizationPolicies.SystemRoleUser,
                CreateSystemRolePolicy(SystemRoles.User));
        });

        return services;
    }

    private static AuthorizationPolicy CreateAuthenticatedUserPolicy()
    {
        return new AuthorizationPolicyBuilder(
                SettleoraSessionAuthenticationDefaults.AuthenticationScheme)
            .RequireAuthenticatedUser()
            .Build();
    }

    private static AuthorizationPolicy CreateSystemRolePolicy(string role)
    {
        return new AuthorizationPolicyBuilder(
                SettleoraSessionAuthenticationDefaults.AuthenticationScheme)
            .RequireAuthenticatedUser()
            .RequireRole(role)
            .Build();
    }
}
