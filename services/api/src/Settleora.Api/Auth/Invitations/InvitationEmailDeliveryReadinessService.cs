using Microsoft.Extensions.Options;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Notifications;

namespace Settleora.Api.Auth.Invitations;

internal sealed class InvitationEmailDeliveryReadinessService
    : IInvitationEmailDeliveryReadinessService
{
    private readonly IOptionsMonitor<InvitationEmailDeliveryOptions> deliveryOptions;
    private readonly INotificationProviderReadinessService providerReadinessService;

    public InvitationEmailDeliveryReadinessService(
        IOptionsMonitor<InvitationEmailDeliveryOptions> deliveryOptions,
        INotificationProviderReadinessService providerReadinessService)
    {
        this.deliveryOptions = deliveryOptions;
        this.providerReadinessService = providerReadinessService;
    }

    public InvitationEmailDeliveryReadinessResult GetReadiness()
    {
        var options = deliveryOptions.CurrentValue;
        if (!options.Enabled)
        {
            return InvitationEmailDeliveryReadinessResult.Disabled();
        }

        List<string> failures = [];
        var providerReadiness = ResolveProviderReadiness(options, failures);
        var publicOriginReadiness = ResolvePublicOriginReadiness(options, failures);
        ValidateDeliveryMode(options, failures);
        ValidateInviteLinkPath(options, failures);

        var ready = failures.Count is 0;
        return new InvitationEmailDeliveryReadinessResult(
            ready,
            ready
                ? InvitationEmailDeliveryReadinessStatuses.Ready
                : InvitationEmailDeliveryReadinessStatuses.NotReady,
            NormalizeDeliveryMode(options.DeliveryMode),
            providerReadiness,
            publicOriginReadiness,
            failures);
    }

    private string ResolveProviderReadiness(
        InvitationEmailDeliveryOptions options,
        ICollection<string> failures)
    {
        if (StringComparer.Ordinal.Equals(options.DeliveryMode, InvitationEmailDeliveryModes.LocalSink))
        {
            return InvitationEmailDeliveryReadinessCategories.LocalSinkNoSmtpSend;
        }

        if (StringComparer.Ordinal.Equals(options.DeliveryMode, InvitationEmailDeliveryModes.TestSink))
        {
            return InvitationEmailDeliveryReadinessCategories.TestSinkNoSmtpSend;
        }

        var genericReadiness = providerReadinessService.GetSnapshot().Email;
        return genericReadiness switch
        {
            NotificationPolicyReadinessStates.Configured
                => InvitationEmailDeliveryReadinessCategories.GenericSmtpConfigured,
            NotificationPolicyReadinessStates.Disabled
                => AddFailure(
                    failures,
                    InvitationEmailDeliveryReadinessCategories.GenericSmtpDisabled),
            NotificationPolicyReadinessStates.Invalid
                => AddFailure(
                    failures,
                    InvitationEmailDeliveryReadinessCategories.GenericSmtpInvalid),
            _ => AddFailure(
                failures,
                InvitationEmailDeliveryReadinessCategories.GenericSmtpUnconfigured)
        };
    }

    private static string ResolvePublicOriginReadiness(
        InvitationEmailDeliveryOptions options,
        ICollection<string> failures)
    {
        if (string.IsNullOrWhiteSpace(options.PublicBaseUrl))
        {
            return AddFailure(
                failures,
                InvitationEmailDeliveryReadinessCategories.PublicOriginMissing);
        }

        if (!Uri.TryCreate(options.PublicBaseUrl, UriKind.Absolute, out var uri)
            || !InvitationPublicOriginPolicy.IsSafePublicOrigin(uri, options.DeliveryMode))
        {
            return AddFailure(
                failures,
                InvitationEmailDeliveryReadinessCategories.PublicOriginUnsafe);
        }

        return InvitationEmailDeliveryReadinessCategories.PublicOriginConfigured;
    }

    private static void ValidateDeliveryMode(
        InvitationEmailDeliveryOptions options,
        ICollection<string> failures)
    {
        if (!InvitationEmailDeliveryModes.IsSupported(options.DeliveryMode))
        {
            failures.Add(InvitationEmailDeliveryReadinessCategories.DeliveryModeUnsupported);
        }
    }

    private static void ValidateInviteLinkPath(
        InvitationEmailDeliveryOptions options,
        ICollection<string> failures)
    {
        if (!InvitationLinkPathPolicy.IsSafeRelativePath(options.InviteLinkPath))
        {
            failures.Add(InvitationEmailDeliveryReadinessCategories.InviteLinkPathUnsafe);
        }
    }

    private static string AddFailure(ICollection<string> failures, string category)
    {
        failures.Add(category);
        return category;
    }

    private static string NormalizeDeliveryMode(string? deliveryMode)
    {
        return InvitationEmailDeliveryModes.IsSupported(deliveryMode)
            ? deliveryMode!
            : InvitationEmailDeliveryReadinessCategories.DeliveryModeUnsupported;
    }
}
