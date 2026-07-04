using Microsoft.Extensions.Options;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Notifications;

namespace Settleora.Api.Tests;

public sealed class NotificationProviderReadinessServiceTests
{
    [Fact]
    public void DisabledOptionsReturnDisabledCategoriesWithoutProviderInternals()
    {
        var service = CreateService(
            new SmtpEmailNotificationOptions(),
            new PushNotificationOptions());

        var snapshot = service.GetSnapshot();

        Assert.Equal(NotificationPolicyReadinessStates.Disabled, snapshot.Email);
        Assert.Equal(NotificationPolicyReadinessStates.Disabled, snapshot.MobilePush);
        AssertSafeSnapshot(snapshot);
    }

    [Fact]
    public void IncompleteEnabledSmtpReturnsUnconfiguredWithoutLeakingConfiguredFields()
    {
        var service = CreateService(
            new SmtpEmailNotificationOptions
            {
                Enabled = true,
                Host = "smtp.internal.example",
                Username = "smtp-user-placeholder",
                Password = "smtp-password-placeholder"
            },
            new PushNotificationOptions { Enabled = true });

        var snapshot = service.GetSnapshot();

        Assert.Equal(NotificationPolicyReadinessStates.Unconfigured, snapshot.Email);
        Assert.Equal(NotificationPolicyReadinessStates.Unconfigured, snapshot.MobilePush);
        AssertSafeSnapshot(snapshot);
    }

    [Fact]
    public void CompleteSmtpOptionsReturnConfiguredButDoNotEnablePushByInference()
    {
        var service = CreateService(
            new SmtpEmailNotificationOptions
            {
                Enabled = true,
                Host = "smtp.internal.example",
                Port = 2525,
                Username = "smtp-user-placeholder",
                Password = "smtp-password-placeholder",
                FromAddress = "from-address-placeholder@example.invalid",
                TimeoutSeconds = 10
            },
            new PushNotificationOptions { Enabled = true });

        var snapshot = service.GetSnapshot();

        Assert.Equal(NotificationPolicyReadinessStates.Configured, snapshot.Email);
        Assert.Equal(NotificationPolicyReadinessStates.Unconfigured, snapshot.MobilePush);
        AssertSafeSnapshot(snapshot);
    }

    private static NotificationProviderReadinessSnapshotService CreateService(
        SmtpEmailNotificationOptions smtpOptions,
        PushNotificationOptions pushOptions)
    {
        return new NotificationProviderReadinessSnapshotService(
            new FixedOptionsMonitor<SmtpEmailNotificationOptions>(smtpOptions),
            new FixedOptionsMonitor<PushNotificationOptions>(pushOptions));
    }

    private static void AssertSafeSnapshot(NotificationProviderReadinessSnapshot snapshot)
    {
        var content = string.Join("|", snapshot.Email, snapshot.MobilePush);

        string[] forbidden =
        [
            "smtp.internal.example",
            "smtp-user-placeholder",
            "smtp-password-placeholder",
            "from-address-placeholder",
            "providerPayload",
            "deviceToken",
            "tokenFingerprint",
            "protectedTokenBlob",
            "secret",
            "password"
        ];

        foreach (var text in forbidden)
        {
            Assert.DoesNotContain(text, content, StringComparison.OrdinalIgnoreCase);
        }
    }

    private sealed class FixedOptionsMonitor<T> : IOptionsMonitor<T>
    {
        public FixedOptionsMonitor(T value)
        {
            CurrentValue = value;
        }

        public T CurrentValue { get; }

        public T Get(string? name)
        {
            return CurrentValue;
        }

        public IDisposable? OnChange(Action<T, string?> listener)
        {
            return null;
        }
    }
}
