using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Settleora.Api.Auth.PasswordReset;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Notifications;

namespace Settleora.Api.Tests;

public sealed class PasswordResetEmailTemplateComposerTests
{
    private const string RawResetMaterial = "raw-reset-material-secret";
    private const string SubmittedIdentifier = "reset-user@example.invalid";
    private const string AccountEmail = "account-user@example.invalid";
    private const string AccountUsername = "account-user";
    private const string SmtpHost = "smtp-host-placeholder";
    private const string SmtpPassword = "smtp-password-placeholder";
    private const string ProviderPayload = "raw provider payload";
    private const string ApprovedSubject = "Reset your Settleora password";

    [Fact]
    public void CompositionIsUnavailableWhenEmailDeliveryIsDisabledByDefault()
    {
        var composer = CreateComposer(new PasswordResetEmailDeliveryOptions());

        var result = composer.Compose(new PasswordResetEmailTemplateCompositionRequest(RawResetMaterial));

        Assert.False(result.Available);
        Assert.Null(result.SendReadyMessage);
        Assert.Equal(PasswordResetEmailTemplateCompositionStatuses.Unavailable, result.Status);
        Assert.Equal(
            PasswordResetEmailTemplateCompositionCategories.DeliveryReadinessUnavailable,
            result.Category);
        Assert.Contains(
            PasswordResetEmailDeliveryReadinessCategories.DeliveryDisabled,
            result.FailureCategories);
        AssertSafeRedactedResult(result);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("http://example.invalid")]
    [InlineData("https://example.invalid/reset?token=secret")]
    [InlineData("https://example.invalid/#token=secret")]
    [InlineData("https://user@example.invalid")]
    public void UnsafeOrMissingPublicOriginBlocksComposition(string? publicBaseUrl)
    {
        var composer = CreateComposer(
            CreateReadyOptions(publicBaseUrl: publicBaseUrl),
            NotificationPolicyReadinessStates.Configured);

        var result = composer.Compose(new PasswordResetEmailTemplateCompositionRequest(RawResetMaterial));

        Assert.False(result.Available);
        Assert.Null(result.SendReadyMessage);
        Assert.Contains(
            publicBaseUrl is null or "" or "   "
                ? PasswordResetEmailDeliveryReadinessCategories.PublicOriginMissing
                : PasswordResetEmailDeliveryReadinessCategories.PublicOriginUnsafe,
            result.FailureCategories);
        AssertSafeRedactedResult(result);
    }

    [Theory]
    [InlineData(14)]
    [InlineData(121)]
    public void ResetLinkLifetimeOutsideApprovedRangeBlocksComposition(int lifetimeMinutes)
    {
        var composer = CreateComposer(
            CreateReadyOptions(resetLinkLifetime: TimeSpan.FromMinutes(lifetimeMinutes)),
            NotificationPolicyReadinessStates.Configured);

        var result = composer.Compose(new PasswordResetEmailTemplateCompositionRequest(RawResetMaterial));

        Assert.False(result.Available);
        Assert.Null(result.SendReadyMessage);
        Assert.Equal(lifetimeMinutes, result.ResetLinkLifetimeMinutes);
        Assert.Contains(
            PasswordResetEmailDeliveryReadinessCategories.ResetLinkLifetimeOutOfRange,
            result.FailureCategories);
        AssertSafeRedactedResult(result);
    }

    [Theory]
    [InlineData(15)]
    [InlineData(60)]
    [InlineData(120)]
    public void ResetLinkLifetimeApprovedRangeCanCompose(int lifetimeMinutes)
    {
        var composer = CreateComposer(
            CreateReadyOptions(resetLinkLifetime: TimeSpan.FromMinutes(lifetimeMinutes)),
            NotificationPolicyReadinessStates.Configured);

        var result = composer.Compose(new PasswordResetEmailTemplateCompositionRequest(RawResetMaterial));

        Assert.True(result.Available, DescribeSafeResult(result));
        Assert.NotNull(result.SendReadyMessage);
        Assert.Equal(lifetimeMinutes, result.ResetLinkLifetimeMinutes);
        Assert.Equal(lifetimeMinutes, result.SendReadyMessage.ResetLinkLifetimeMinutes);
        Assert.Empty(result.FailureCategories);
        AssertSafeRedactedResult(result);
    }

    [Theory]
    [InlineData("https://evil.example/reset")]
    [InlineData("//evil.example/reset")]
    [InlineData("/auth/password-reset?token=secret")]
    [InlineData("/auth/password-reset#token=secret")]
    [InlineData("/auth/../password-reset")]
    [InlineData("/auth/%2e%2e/password-reset")]
    [InlineData("/auth\\password-reset")]
    [InlineData("/user@example/password-reset")]
    [InlineData("/auth//password-reset")]
    [InlineData("auth/password-reset")]
    [InlineData("/")]
    public void ResetLinkPathValidationBlocksUnsafeOrAmbiguousForms(string resetLinkPath)
    {
        var options = CreateReadyOptions(resetLinkPath: resetLinkPath);
        var composer = CreateComposer(options, NotificationPolicyReadinessStates.Configured);
        var validator = new PasswordResetEmailDeliveryOptionsValidator();

        var validation = validator.Validate(null, options);
        var result = composer.Compose(new PasswordResetEmailTemplateCompositionRequest(RawResetMaterial));

        Assert.True(validation.Failed);
        Assert.False(result.Available);
        Assert.Null(result.SendReadyMessage);
        Assert.Contains(
            PasswordResetEmailTemplateCompositionCategories.ResetLinkPathUnsafe,
            result.FailureCategories);
        AssertSafeRedactedResult(result);
    }

    [Fact]
    public void GeneratedLinkUsesSafeConfiguredOriginPathAndFragmentMaterial()
    {
        var composer = CreateComposer(
            CreateReadyOptions(
                publicBaseUrl: "https://settleora.example.invalid/base",
                resetLinkPath: "/auth/password-reset"),
            NotificationPolicyReadinessStates.Configured);

        var result = composer.Compose(new PasswordResetEmailTemplateCompositionRequest(RawResetMaterial));

        Assert.True(result.Available, DescribeSafeResult(result));
        Assert.NotNull(result.SendReadyMessage);
        Assert.Equal(
            "https://settleora.example.invalid/base/auth/password-reset#resetMaterial=raw-reset-material-secret",
            result.SendReadyMessage.ResetLink.ToString());
        Assert.Empty(result.SendReadyMessage.ResetLink.Query);
        Assert.Equal("#resetMaterial=raw-reset-material-secret", result.SendReadyMessage.ResetLink.Fragment);
        Assert.Contains(RawResetMaterial, result.SendReadyMessage.TextBody, StringComparison.Ordinal);
        Assert.DoesNotContain("token=", result.SendReadyMessage.ResetLink.ToString(), StringComparison.OrdinalIgnoreCase);
        AssertSafeRedactedResult(result);
    }

    [Fact]
    public void SendReadyMessageUsesApprovedA04SubjectAndGenericBodyCopy()
    {
        var composer = CreateComposer(
            CreateReadyOptions(),
            NotificationPolicyReadinessStates.Configured);

        var result = composer.Compose(new PasswordResetEmailTemplateCompositionRequest(RawResetMaterial));

        Assert.True(result.Available, DescribeSafeResult(result));
        Assert.NotNull(result.SendReadyMessage);
        Assert.Equal(ApprovedSubject, result.SendReadyMessage.Subject);
        Assert.Equal(
            string.Join(
                Environment.NewLine,
                ApprovedSubject,
                string.Empty,
                "Use this link to continue resetting your Settleora password:",
                string.Empty,
                result.SendReadyMessage.ResetLink.ToString(),
                string.Empty,
                "This link expires after a limited time. If you did not request this, you can ignore this email."),
            result.SendReadyMessage.TextBody);
        Assert.DoesNotContain("local", result.SendReadyMessage.TextBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("delivered", result.SendReadyMessage.TextBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("accepted", result.SendReadyMessage.TextBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("mailbox", result.SendReadyMessage.TextBody, StringComparison.OrdinalIgnoreCase);
        AssertSafeRedactedResult(result);
    }

    [Fact]
    public void RawResetMaterialIsRequiredOnlyInsideInternalLinkConstruction()
    {
        var composer = CreateComposer(
            CreateReadyOptions(),
            NotificationPolicyReadinessStates.Configured);

        var missing = composer.Compose(new PasswordResetEmailTemplateCompositionRequest(null));
        var composed = composer.Compose(new PasswordResetEmailTemplateCompositionRequest(RawResetMaterial));

        Assert.False(missing.Available);
        Assert.Contains(
            PasswordResetEmailTemplateCompositionCategories.ResetMaterialMissing,
            missing.FailureCategories);
        Assert.True(composed.Available, DescribeSafeResult(composed));
        Assert.NotNull(composed.SendReadyMessage);
        Assert.Contains(RawResetMaterial, composed.SendReadyMessage.ResetLink.ToString(), StringComparison.Ordinal);
        Assert.DoesNotContain(RawResetMaterial, composed.ToString(), StringComparison.Ordinal);
        Assert.DoesNotContain(RawResetMaterial, composed.SendReadyMessage.ToString(), StringComparison.Ordinal);
        AssertSafeRedactedResult(missing);
        AssertSafeRedactedResult(composed);
    }

    [Theory]
    [InlineData(PasswordResetEmailDeliveryModes.LocalSink, "http://localhost:5173")]
    [InlineData(PasswordResetEmailDeliveryModes.TestSink, "http://127.0.0.1:5173")]
    public void SinkModesComposeOnlyAsExplicitNonProductionSinkBehavior(
        string deliveryMode,
        string publicBaseUrl)
    {
        var composer = CreateComposer(new PasswordResetEmailDeliveryOptions
        {
            Enabled = true,
            DeliveryMode = deliveryMode,
            PublicBaseUrl = publicBaseUrl,
            ResetLinkPath = "/auth/password-reset",
            ResetLinkLifetime = PasswordResetEmailDeliveryOptions.DefaultResetLinkLifetime
        });

        var result = composer.Compose(new PasswordResetEmailTemplateCompositionRequest(RawResetMaterial));

        Assert.True(result.Available, DescribeSafeResult(result));
        Assert.NotNull(result.SendReadyMessage);
        Assert.Equal(deliveryMode, result.DeliveryMode);
        Assert.Equal(
            deliveryMode == PasswordResetEmailDeliveryModes.LocalSink
                ? PasswordResetEmailTemplateCompositionCategories.LocalSinkReadyNoSmtpSend
                : PasswordResetEmailTemplateCompositionCategories.TestSinkReadyNoSmtpSend,
            result.Category);
        AssertSafeRedactedResult(result);
    }

    [Fact]
    public void LocalPasswordResetRuntimeRegistersInternalTemplateComposerOnly()
    {
        IConfiguration configuration = new ConfigurationBuilder().Build();
        var services = new ServiceCollection();
        services.AddOptions();
        services.AddSingleton<INotificationProviderReadinessService>(
            new FakeNotificationProviderReadinessService(NotificationPolicyReadinessStates.Configured));
        services.AddLocalPasswordResetRuntime(configuration);

        using var provider = services.BuildServiceProvider();

        Assert.NotNull(provider.GetRequiredService<IPasswordResetEmailTemplateComposer>());
    }

    private static PasswordResetEmailTemplateComposer CreateComposer(
        PasswordResetEmailDeliveryOptions options,
        string emailProviderReadiness = NotificationPolicyReadinessStates.Disabled)
    {
        var monitor = new FakeOptionsMonitor(options);
        return new PasswordResetEmailTemplateComposer(
            new PasswordResetEmailDeliveryReadinessService(
                monitor,
                new FakeNotificationProviderReadinessService(emailProviderReadiness)),
            monitor);
    }

    private static PasswordResetEmailDeliveryOptions CreateReadyOptions(
        string? publicBaseUrl = "https://settleora.example.invalid",
        string resetLinkPath = "/auth/password-reset",
        TimeSpan? resetLinkLifetime = null)
    {
        return new PasswordResetEmailDeliveryOptions
        {
            Enabled = true,
            DeliveryMode = PasswordResetEmailDeliveryModes.ProductionSmtp,
            PublicBaseUrl = publicBaseUrl,
            ResetLinkPath = resetLinkPath,
            ResetLinkLifetime = resetLinkLifetime
                ?? PasswordResetEmailDeliveryOptions.DefaultResetLinkLifetime
        };
    }

    private static void AssertSafeRedactedResult(PasswordResetEmailTemplateCompositionResult result)
    {
        var combined = string.Join(
            " ",
            result.ToString(),
            result.RedactedPreview.ToString(),
            string.Join(" ", result.FailureCategories));

        Assert.DoesNotContain(RawResetMaterial, combined, StringComparison.Ordinal);
        Assert.DoesNotContain("resetMaterial=", combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token=", combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(SubmittedIdentifier, combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(AccountEmail, combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(AccountUsername, combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(SmtpHost, combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(SmtpPassword, combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(ProviderPayload, combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("settleora.example.invalid", combined, StringComparison.OrdinalIgnoreCase);
    }

    private static string DescribeSafeResult(PasswordResetEmailTemplateCompositionResult result)
    {
        return string.Join(
            " ",
            result.ToString(),
            string.Join(",", result.FailureCategories));
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
