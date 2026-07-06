using Microsoft.Extensions.Options;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Notifications;

namespace Settleora.Api.Auth.PasswordReset;

internal sealed class PasswordResetEmailDeliveryReadinessService
    : IPasswordResetEmailDeliveryReadinessService
{
    private readonly IOptionsMonitor<PasswordResetEmailDeliveryOptions> deliveryOptions;
    private readonly INotificationProviderReadinessService providerReadinessService;

    public PasswordResetEmailDeliveryReadinessService(
        IOptionsMonitor<PasswordResetEmailDeliveryOptions> deliveryOptions,
        INotificationProviderReadinessService providerReadinessService)
    {
        this.deliveryOptions = deliveryOptions;
        this.providerReadinessService = providerReadinessService;
    }

    public PasswordResetEmailDeliveryReadinessResult GetReadiness()
    {
        var options = deliveryOptions.CurrentValue;
        var lifetimeMinutes = Convert.ToInt32(options.ResetLinkLifetime.TotalMinutes);
        if (!options.Enabled)
        {
            return PasswordResetEmailDeliveryReadinessResult.Disabled(lifetimeMinutes);
        }

        List<string> failures = [];
        var providerReadiness = ResolveProviderReadiness(options, failures);
        var publicOriginReadiness = ResolvePublicOriginReadiness(options, failures);
        ValidateLifetime(options, failures);
        ValidateDeliveryMode(options, failures);

        var ready = failures.Count is 0;
        return new PasswordResetEmailDeliveryReadinessResult(
            ready,
            ready
                ? PasswordResetEmailDeliveryReadinessStatuses.Ready
                : PasswordResetEmailDeliveryReadinessStatuses.NotReady,
            NormalizeDeliveryMode(options.DeliveryMode),
            providerReadiness,
            publicOriginReadiness,
            lifetimeMinutes,
            failures);
    }

    private string ResolveProviderReadiness(
        PasswordResetEmailDeliveryOptions options,
        ICollection<string> failures)
    {
        if (StringComparer.Ordinal.Equals(options.DeliveryMode, PasswordResetEmailDeliveryModes.LocalSink))
        {
            return PasswordResetEmailDeliveryReadinessCategories.LocalSinkNoSmtpSend;
        }

        if (StringComparer.Ordinal.Equals(options.DeliveryMode, PasswordResetEmailDeliveryModes.TestSink))
        {
            return PasswordResetEmailDeliveryReadinessCategories.TestSinkNoSmtpSend;
        }

        var genericReadiness = providerReadinessService.GetSnapshot().Email;
        return genericReadiness switch
        {
            NotificationPolicyReadinessStates.Configured
                => PasswordResetEmailDeliveryReadinessCategories.GenericSmtpConfigured,
            NotificationPolicyReadinessStates.Disabled
                => AddFailure(
                    failures,
                    PasswordResetEmailDeliveryReadinessCategories.GenericSmtpDisabled),
            NotificationPolicyReadinessStates.Invalid
                => AddFailure(
                    failures,
                    PasswordResetEmailDeliveryReadinessCategories.GenericSmtpInvalid),
            _ => AddFailure(
                failures,
                PasswordResetEmailDeliveryReadinessCategories.GenericSmtpUnconfigured)
        };
    }

    private static string ResolvePublicOriginReadiness(
        PasswordResetEmailDeliveryOptions options,
        ICollection<string> failures)
    {
        if (string.IsNullOrWhiteSpace(options.PublicBaseUrl))
        {
            return AddFailure(
                failures,
                PasswordResetEmailDeliveryReadinessCategories.PublicOriginMissing);
        }

        if (!Uri.TryCreate(options.PublicBaseUrl, UriKind.Absolute, out var uri)
            || !PasswordResetPublicOriginPolicy.IsSafePublicOrigin(uri, options.DeliveryMode))
        {
            return AddFailure(
                failures,
                PasswordResetEmailDeliveryReadinessCategories.PublicOriginUnsafe);
        }

        return PasswordResetEmailDeliveryReadinessCategories.PublicOriginConfigured;
    }

    private static void ValidateLifetime(
        PasswordResetEmailDeliveryOptions options,
        ICollection<string> failures)
    {
        if (options.ResetLinkLifetime < PasswordResetEmailDeliveryOptions.MinimumResetLinkLifetime
            || options.ResetLinkLifetime > PasswordResetEmailDeliveryOptions.MaximumResetLinkLifetime)
        {
            failures.Add(PasswordResetEmailDeliveryReadinessCategories.ResetLinkLifetimeOutOfRange);
            return;
        }

        failures.Remove(PasswordResetEmailDeliveryReadinessCategories.ResetLinkLifetimeOutOfRange);
    }

    private static void ValidateDeliveryMode(
        PasswordResetEmailDeliveryOptions options,
        ICollection<string> failures)
    {
        if (!PasswordResetEmailDeliveryModes.IsSupported(options.DeliveryMode))
        {
            failures.Add(PasswordResetEmailDeliveryReadinessCategories.DeliveryModeUnsupported);
        }
    }

    private static string AddFailure(ICollection<string> failures, string category)
    {
        failures.Add(category);
        return category;
    }

    private static string NormalizeDeliveryMode(string? deliveryMode)
    {
        return PasswordResetEmailDeliveryModes.IsSupported(deliveryMode)
            ? deliveryMode!
            : PasswordResetEmailDeliveryReadinessCategories.DeliveryModeUnsupported;
    }
}
