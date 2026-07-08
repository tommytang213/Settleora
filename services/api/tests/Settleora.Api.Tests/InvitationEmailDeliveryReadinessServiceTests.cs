using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Settleora.Api.Auth.Invitations;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Notifications;

namespace Settleora.Api.Tests;

public sealed class InvitationEmailDeliveryReadinessServiceTests
{
    [Fact]
    public void InvitationEmailDeliveryIsDisabledByDefault()
    {
        var service = CreateService(new InvitationEmailDeliveryOptions());

        var result = service.GetReadiness();

        Assert.False(result.Ready);
        Assert.Equal(InvitationEmailDeliveryReadinessStatuses.Disabled, result.Status);
        Assert.Equal(InvitationEmailDeliveryReadinessCategories.NotEvaluated, result.ProviderReadiness);
        Assert.Contains(InvitationEmailDeliveryReadinessCategories.DeliveryDisabled, result.FailureCategories);
        Assert.DoesNotContain("sent", result.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ProductionSmtpRequiresGenericSmtpReadiness()
    {
        var service = CreateService(CreateProductionOptions(), NotificationPolicyReadinessStates.Unconfigured);

        var result = service.GetReadiness();

        Assert.False(result.Ready);
        Assert.Equal(InvitationEmailDeliveryReadinessStatuses.NotReady, result.Status);
        Assert.Equal(InvitationEmailDeliveryReadinessCategories.GenericSmtpUnconfigured, result.ProviderReadiness);
        Assert.Contains(InvitationEmailDeliveryReadinessCategories.GenericSmtpUnconfigured, result.FailureCategories);
    }

    [Theory]
    [InlineData(null, InvitationEmailDeliveryReadinessCategories.PublicOriginMissing)]
    [InlineData("   ", InvitationEmailDeliveryReadinessCategories.PublicOriginMissing)]
    [InlineData("http://example.invalid", InvitationEmailDeliveryReadinessCategories.PublicOriginUnsafe)]
    [InlineData("https://example.invalid/invite?invitationSecret=raw-secret", InvitationEmailDeliveryReadinessCategories.PublicOriginUnsafe)]
    [InlineData("https://example.invalid/#invitationSecret=raw-secret", InvitationEmailDeliveryReadinessCategories.PublicOriginUnsafe)]
    [InlineData("https://user@example.invalid", InvitationEmailDeliveryReadinessCategories.PublicOriginUnsafe)]
    public void ProductionReadinessRequiresSafeConfiguredPublicOrigin(
        string? publicBaseUrl,
        string expectedCategory)
    {
        var service = CreateService(
            CreateProductionOptions(publicBaseUrl),
            NotificationPolicyReadinessStates.Configured);

        var result = service.GetReadiness();

        Assert.False(result.Ready);
        Assert.Equal(expectedCategory, result.PublicOriginReadiness);
        Assert.Contains(expectedCategory, result.FailureCategories);
        Assert.DoesNotContain("example.invalid/invite", result.ToString(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("invitationSecret=", result.ToString(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("raw-secret", result.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void UnsafeRelativeInvitePathIsNotReady()
    {
        var service = CreateService(
            CreateProductionOptions(inviteLinkPath: "/auth/invitations/accept?invitationSecret=raw-secret"),
            NotificationPolicyReadinessStates.Configured);

        var result = service.GetReadiness();

        Assert.False(result.Ready);
        Assert.Contains(
            InvitationEmailDeliveryReadinessCategories.InviteLinkPathUnsafe,
            result.FailureCategories);
        Assert.DoesNotContain("raw-secret", result.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(InvitationEmailDeliveryModes.LocalSink, "http://localhost:5173")]
    [InlineData(InvitationEmailDeliveryModes.TestSink, "http://127.0.0.1:5173")]
    public void SinkModesAreExplicitAndDoNotRequireGenericSmtp(string mode, string publicBaseUrl)
    {
        var service = CreateService(new InvitationEmailDeliveryOptions
        {
            Enabled = true,
            DeliveryMode = mode,
            PublicBaseUrl = publicBaseUrl,
            InviteLinkPath = "/auth/invitations/accept"
        });

        var result = service.GetReadiness();

        Assert.True(result.Ready);
        Assert.Equal(mode, result.DeliveryMode);
        Assert.Equal(
            mode == InvitationEmailDeliveryModes.LocalSink
                ? InvitationEmailDeliveryReadinessCategories.LocalSinkNoSmtpSend
                : InvitationEmailDeliveryReadinessCategories.TestSinkNoSmtpSend,
            result.ProviderReadiness);
        Assert.Empty(result.FailureCategories);
    }

    [Fact]
    public void OptionsValidatorEnforcesSupportedModeAndSafeInvitePathWithoutEchoingValues()
    {
        var validator = new InvitationEmailDeliveryOptionsValidator();
        var result = validator.Validate(null, new InvitationEmailDeliveryOptions
        {
            Enabled = true,
            DeliveryMode = "smtp-provider-payload",
            PublicBaseUrl = "https://settleora.example.invalid",
            InviteLinkPath = "/auth/invitations/accept?invitationSecret=raw-secret"
        });

        Assert.True(result.Failed);
        var failures = string.Join(" ", result.Failures ?? []);
        Assert.Contains(nameof(InvitationEmailDeliveryOptions.DeliveryMode), failures, StringComparison.Ordinal);
        Assert.Contains(nameof(InvitationEmailDeliveryOptions.InviteLinkPath), failures, StringComparison.Ordinal);
        Assert.DoesNotContain("smtp-provider-payload", failures, StringComparison.Ordinal);
        Assert.DoesNotContain("settleora.example.invalid", failures, StringComparison.Ordinal);
        Assert.DoesNotContain("raw-secret", failures, StringComparison.Ordinal);
    }

    [Fact]
    public void InvitationEmailDeliveryOptionsBindFromConfiguration()
    {
        Dictionary<string, string?> values = new()
        {
            [$"{InvitationEmailDeliveryOptions.SectionName}:Enabled"] = "true",
            [$"{InvitationEmailDeliveryOptions.SectionName}:DeliveryMode"] = InvitationEmailDeliveryModes.ProductionSmtp,
            [$"{InvitationEmailDeliveryOptions.SectionName}:PublicBaseUrl"] = "https://settleora.example.invalid",
            [$"{InvitationEmailDeliveryOptions.SectionName}:InviteLinkPath"] = "/auth/invitations/accept"
        };

        IConfiguration configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();

        var options = configuration
            .GetSection(InvitationEmailDeliveryOptions.SectionName)
            .Get<InvitationEmailDeliveryOptions>();

        Assert.NotNull(options);
        Assert.True(options.Enabled);
        Assert.Equal(InvitationEmailDeliveryModes.ProductionSmtp, options.DeliveryMode);
        Assert.Equal("https://settleora.example.invalid", options.PublicBaseUrl);
        Assert.Equal("/auth/invitations/accept", options.InviteLinkPath);
    }

    [Fact]
    public void InvitationPolicyRuntimeRegistersInternalReadinessAndComposerServices()
    {
        IConfiguration configuration = new ConfigurationBuilder().Build();
        var services = new ServiceCollection();
        services.AddOptions();
        services.AddSingleton<INotificationProviderReadinessService>(
            new FakeNotificationProviderReadinessService(NotificationPolicyReadinessStates.Configured));
        services.AddInvitationPolicyRuntime(configuration);

        using var provider = services.BuildServiceProvider();

        Assert.NotNull(provider.GetRequiredService<IInvitationEmailDeliveryReadinessService>());
        Assert.NotNull(provider.GetRequiredService<IInvitationEmailTemplateComposer>());
    }

    private static InvitationEmailDeliveryReadinessService CreateService(
        InvitationEmailDeliveryOptions options,
        string emailProviderReadiness = NotificationPolicyReadinessStates.Disabled)
    {
        return new InvitationEmailDeliveryReadinessService(
            new FakeOptionsMonitor(options),
            new FakeNotificationProviderReadinessService(emailProviderReadiness));
    }

    private static InvitationEmailDeliveryOptions CreateProductionOptions(
        string? publicBaseUrl = "https://settleora.example.invalid",
        string inviteLinkPath = "/auth/invitations/accept")
    {
        return new InvitationEmailDeliveryOptions
        {
            Enabled = true,
            DeliveryMode = InvitationEmailDeliveryModes.ProductionSmtp,
            PublicBaseUrl = publicBaseUrl,
            InviteLinkPath = inviteLinkPath
        };
    }

    private sealed class FakeOptionsMonitor : IOptionsMonitor<InvitationEmailDeliveryOptions>
    {
        public FakeOptionsMonitor(InvitationEmailDeliveryOptions options)
        {
            CurrentValue = options;
        }

        public InvitationEmailDeliveryOptions CurrentValue { get; }

        public InvitationEmailDeliveryOptions Get(string? name)
        {
            return CurrentValue;
        }

        public IDisposable? OnChange(Action<InvitationEmailDeliveryOptions, string?> listener)
        {
            return null;
        }
    }

    private sealed class FakeNotificationProviderReadinessService : INotificationProviderReadinessService
    {
        private readonly string emailProviderReadiness;

        public FakeNotificationProviderReadinessService(string emailProviderReadiness)
        {
            this.emailProviderReadiness = emailProviderReadiness;
        }

        public NotificationProviderReadinessSnapshot GetSnapshot()
        {
            return new NotificationProviderReadinessSnapshot(
                emailProviderReadiness,
                NotificationPolicyReadinessStates.Unconfigured);
        }
    }
}
