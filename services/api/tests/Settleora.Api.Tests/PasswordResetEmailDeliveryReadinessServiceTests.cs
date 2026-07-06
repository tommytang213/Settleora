using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Settleora.Api.Auth.PasswordReset;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Notifications;

namespace Settleora.Api.Tests;

public sealed class PasswordResetEmailDeliveryReadinessServiceTests
{
    [Fact]
    public void PasswordResetEmailDeliveryIsDisabledByDefault()
    {
        var service = CreateService(new PasswordResetEmailDeliveryOptions());

        var result = service.GetReadiness();

        Assert.False(result.Ready);
        Assert.Equal(PasswordResetEmailDeliveryReadinessStatuses.Disabled, result.Status);
        Assert.Equal(PasswordResetEmailDeliveryReadinessCategories.NotEvaluated, result.ProviderReadiness);
        Assert.Equal(60, result.ResetLinkLifetimeMinutes);
        Assert.Contains(PasswordResetEmailDeliveryReadinessCategories.DeliveryDisabled, result.FailureCategories);
    }

    [Fact]
    public void ProductionSmtpRequiresGenericSmtpReadiness()
    {
        var service = CreateService(CreateProductionOptions(), NotificationPolicyReadinessStates.Unconfigured);

        var result = service.GetReadiness();

        Assert.False(result.Ready);
        Assert.Equal(PasswordResetEmailDeliveryReadinessStatuses.NotReady, result.Status);
        Assert.Equal(PasswordResetEmailDeliveryReadinessCategories.GenericSmtpUnconfigured, result.ProviderReadiness);
        Assert.Contains(PasswordResetEmailDeliveryReadinessCategories.GenericSmtpUnconfigured, result.FailureCategories);
    }

    [Theory]
    [InlineData(null, PasswordResetEmailDeliveryReadinessCategories.PublicOriginMissing)]
    [InlineData("   ", PasswordResetEmailDeliveryReadinessCategories.PublicOriginMissing)]
    [InlineData("http://example.invalid", PasswordResetEmailDeliveryReadinessCategories.PublicOriginUnsafe)]
    [InlineData("https://example.invalid/reset?token=secret", PasswordResetEmailDeliveryReadinessCategories.PublicOriginUnsafe)]
    [InlineData("https://user@example.invalid", PasswordResetEmailDeliveryReadinessCategories.PublicOriginUnsafe)]
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
        Assert.DoesNotContain("example.invalid/reset", result.ToString(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token=secret", result.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(14)]
    [InlineData(121)]
    public void ResetLinkLifetimeOutsideApprovedRangeIsNotReady(int lifetimeMinutes)
    {
        var service = CreateService(
            CreateProductionOptions(resetLinkLifetime: TimeSpan.FromMinutes(lifetimeMinutes)),
            NotificationPolicyReadinessStates.Configured);

        var result = service.GetReadiness();

        Assert.False(result.Ready);
        Assert.Equal(lifetimeMinutes, result.ResetLinkLifetimeMinutes);
        Assert.Contains(
            PasswordResetEmailDeliveryReadinessCategories.ResetLinkLifetimeOutOfRange,
            result.FailureCategories);
    }

    [Theory]
    [InlineData(15)]
    [InlineData(60)]
    [InlineData(120)]
    public void ResetLinkLifetimeApprovedRangeCanBeReady(int lifetimeMinutes)
    {
        var service = CreateService(
            CreateProductionOptions(resetLinkLifetime: TimeSpan.FromMinutes(lifetimeMinutes)),
            NotificationPolicyReadinessStates.Configured);

        var result = service.GetReadiness();

        Assert.True(result.Ready);
        Assert.Equal(PasswordResetEmailDeliveryReadinessStatuses.Ready, result.Status);
        Assert.Equal(lifetimeMinutes, result.ResetLinkLifetimeMinutes);
        Assert.Empty(result.FailureCategories);
    }

    [Theory]
    [InlineData(PasswordResetEmailDeliveryModes.LocalSink, "http://localhost:5173")]
    [InlineData(PasswordResetEmailDeliveryModes.TestSink, "http://127.0.0.1:5173")]
    public void SinkModesAreExplicitAndDoNotRequireGenericSmtp(string mode, string publicBaseUrl)
    {
        var service = CreateService(new PasswordResetEmailDeliveryOptions
        {
            Enabled = true,
            DeliveryMode = mode,
            PublicBaseUrl = publicBaseUrl,
            ResetLinkLifetime = PasswordResetEmailDeliveryOptions.DefaultResetLinkLifetime
        });

        var result = service.GetReadiness();

        Assert.True(result.Ready);
        Assert.Equal(mode, result.DeliveryMode);
        Assert.Equal(
            mode == PasswordResetEmailDeliveryModes.LocalSink
                ? PasswordResetEmailDeliveryReadinessCategories.LocalSinkNoSmtpSend
                : PasswordResetEmailDeliveryReadinessCategories.TestSinkNoSmtpSend,
            result.ProviderReadiness);
        Assert.Empty(result.FailureCategories);
    }

    [Fact]
    public void ReadinessOutputUsesSafeCategoriesAndDoesNotExposeConfiguredSecretsOrOrigins()
    {
        var service = CreateService(
            CreateProductionOptions("https://settleora.example.invalid/reset?token=raw-reset-material"),
            NotificationPolicyReadinessStates.Disabled);

        var result = service.GetReadiness();
        var combined = result.ToString();

        Assert.DoesNotContain("smtp-password-placeholder", combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("smtp-host-placeholder", combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("settleora.example.invalid", combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("raw-reset-material", combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token=", combined, StringComparison.OrdinalIgnoreCase);
        Assert.Contains(PasswordResetEmailDeliveryReadinessCategories.GenericSmtpDisabled, result.FailureCategories);
        Assert.Contains(PasswordResetEmailDeliveryReadinessCategories.PublicOriginUnsafe, result.FailureCategories);
    }

    [Fact]
    public void OptionsValidatorEnforcesApprovedLifetimeRangeAndSupportedMode()
    {
        var validator = new PasswordResetEmailDeliveryOptionsValidator();
        var result = validator.Validate(null, new PasswordResetEmailDeliveryOptions
        {
            Enabled = true,
            DeliveryMode = "smtp-provider-payload",
            PublicBaseUrl = "https://settleora.example.invalid",
            ResetLinkLifetime = TimeSpan.FromMinutes(10)
        });

        Assert.True(result.Failed);
        var failures = string.Join(" ", result.Failures ?? []);
        Assert.Contains(nameof(PasswordResetEmailDeliveryOptions.DeliveryMode), failures, StringComparison.Ordinal);
        Assert.Contains(nameof(PasswordResetEmailDeliveryOptions.ResetLinkLifetime), failures, StringComparison.Ordinal);
        Assert.DoesNotContain("smtp-provider-payload", failures, StringComparison.Ordinal);
        Assert.DoesNotContain("settleora.example.invalid", failures, StringComparison.Ordinal);
    }

    [Fact]
    public void PasswordResetEmailDeliveryOptionsBindFromConfiguration()
    {
        Dictionary<string, string?> values = new()
        {
            [$"{PasswordResetEmailDeliveryOptions.SectionName}:Enabled"] = "true",
            [$"{PasswordResetEmailDeliveryOptions.SectionName}:DeliveryMode"] = PasswordResetEmailDeliveryModes.ProductionSmtp,
            [$"{PasswordResetEmailDeliveryOptions.SectionName}:PublicBaseUrl"] = "https://settleora.example.invalid",
            [$"{PasswordResetEmailDeliveryOptions.SectionName}:ResetLinkPath"] = "/auth/password-reset",
            [$"{PasswordResetEmailDeliveryOptions.SectionName}:ResetLinkLifetime"] = "01:30:00"
        };

        IConfiguration configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();

        var options = configuration
            .GetSection(PasswordResetEmailDeliveryOptions.SectionName)
            .Get<PasswordResetEmailDeliveryOptions>();

        Assert.NotNull(options);
        Assert.True(options.Enabled);
        Assert.Equal(PasswordResetEmailDeliveryModes.ProductionSmtp, options.DeliveryMode);
        Assert.Equal("https://settleora.example.invalid", options.PublicBaseUrl);
        Assert.Equal("/auth/password-reset", options.ResetLinkPath);
        Assert.Equal(TimeSpan.FromMinutes(90), options.ResetLinkLifetime);
    }

    [Fact]
    public void LocalPasswordResetRuntimeRegistersInternalReadinessServiceOnly()
    {
        IConfiguration configuration = new ConfigurationBuilder().Build();
        var services = new ServiceCollection();
        services.AddOptions();
        services.AddSingleton<INotificationProviderReadinessService>(
            new FakeNotificationProviderReadinessService(NotificationPolicyReadinessStates.Configured));
        services.AddLocalPasswordResetRuntime(configuration);

        using var provider = services.BuildServiceProvider();

        Assert.NotNull(provider.GetRequiredService<IPasswordResetEmailDeliveryReadinessService>());
        Assert.NotNull(provider.GetRequiredService<IPasswordResetEmailTemplateComposer>());
    }

    private static PasswordResetEmailDeliveryReadinessService CreateService(
        PasswordResetEmailDeliveryOptions options,
        string emailProviderReadiness = NotificationPolicyReadinessStates.Disabled)
    {
        return new PasswordResetEmailDeliveryReadinessService(
            new FakeOptionsMonitor(options),
            new FakeNotificationProviderReadinessService(emailProviderReadiness));
    }

    private static PasswordResetEmailDeliveryOptions CreateProductionOptions(
        string? publicBaseUrl = "https://settleora.example.invalid",
        TimeSpan? resetLinkLifetime = null)
    {
        return new PasswordResetEmailDeliveryOptions
        {
            Enabled = true,
            DeliveryMode = PasswordResetEmailDeliveryModes.ProductionSmtp,
            PublicBaseUrl = publicBaseUrl,
            ResetLinkLifetime = resetLinkLifetime
                ?? PasswordResetEmailDeliveryOptions.DefaultResetLinkLifetime
        };
    }

    private sealed class FakeOptionsMonitor : IOptionsMonitor<PasswordResetEmailDeliveryOptions>
    {
        public FakeOptionsMonitor(PasswordResetEmailDeliveryOptions options)
        {
            CurrentValue = options;
        }

        public PasswordResetEmailDeliveryOptions CurrentValue { get; }

        public PasswordResetEmailDeliveryOptions Get(string? name)
        {
            return CurrentValue;
        }

        public IDisposable? OnChange(Action<PasswordResetEmailDeliveryOptions, string?> listener)
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
