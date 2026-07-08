using Microsoft.Extensions.Options;
using Settleora.Api.Auth.Invitations;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Notifications;

namespace Settleora.Api.Tests;

public sealed class InvitationEmailTemplateComposerTests
{
    private const string RawInvitationSecret = "raw-invitation-secret-material";
    private const string ContactEmail = "invited-user@example.invalid";
    private const string SmtpHost = "smtp-host-placeholder";
    private const string SmtpPassword = "smtp-password-placeholder";
    private const string ProviderPayload = "raw provider payload";
    private const string ApprovedSubject = "Settleora invitation";

    [Fact]
    public void CompositionIsUnavailableWhenInvitationEmailDeliveryIsDisabledByDefault()
    {
        var composer = CreateComposer(new InvitationEmailDeliveryOptions());

        var result = composer.Compose(new InvitationEmailTemplateCompositionRequest(RawInvitationSecret));

        Assert.False(result.Available);
        Assert.Null(result.SendReadyMessage);
        Assert.Equal(InvitationEmailTemplateCompositionStatuses.Unavailable, result.Status);
        Assert.Equal(
            InvitationEmailTemplateCompositionCategories.DeliveryReadinessUnavailable,
            result.Category);
        Assert.Contains(
            InvitationEmailDeliveryReadinessCategories.DeliveryDisabled,
            result.FailureCategories);
        AssertSafeRedactedResult(result);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("http://example.invalid")]
    [InlineData("https://example.invalid/invite?invitationSecret=secret")]
    [InlineData("https://example.invalid/#invitationSecret=secret")]
    [InlineData("https://user@example.invalid")]
    public void UnsafeOrMissingPublicOriginBlocksComposition(string? publicBaseUrl)
    {
        var composer = CreateComposer(
            CreateReadyOptions(publicBaseUrl: publicBaseUrl),
            NotificationPolicyReadinessStates.Configured);

        var result = composer.Compose(new InvitationEmailTemplateCompositionRequest(RawInvitationSecret));

        Assert.False(result.Available);
        Assert.Null(result.SendReadyMessage);
        Assert.Contains(
            publicBaseUrl is null or "" or "   "
                ? InvitationEmailDeliveryReadinessCategories.PublicOriginMissing
                : InvitationEmailDeliveryReadinessCategories.PublicOriginUnsafe,
            result.FailureCategories);
        AssertSafeRedactedResult(result);
    }

    [Theory]
    [InlineData("https://evil.example/invite")]
    [InlineData("//evil.example/invite")]
    [InlineData("/auth/invitations/accept?invitationSecret=secret")]
    [InlineData("/auth/invitations/accept#invitationSecret=secret")]
    [InlineData("/auth/../invitations/accept")]
    [InlineData("/auth/%2e%2e/invitations/accept")]
    [InlineData("/auth\\invitations\\accept")]
    [InlineData("/user@example/invitations/accept")]
    [InlineData("/auth//invitations/accept")]
    [InlineData("auth/invitations/accept")]
    [InlineData("/")]
    public void InviteLinkPathValidationBlocksUnsafeOrAmbiguousForms(string inviteLinkPath)
    {
        var options = CreateReadyOptions(inviteLinkPath: inviteLinkPath);
        var composer = CreateComposer(options, NotificationPolicyReadinessStates.Configured);
        var validator = new InvitationEmailDeliveryOptionsValidator();

        var validation = validator.Validate(null, options);
        var result = composer.Compose(new InvitationEmailTemplateCompositionRequest(RawInvitationSecret));

        Assert.True(validation.Failed);
        Assert.False(result.Available);
        Assert.Null(result.SendReadyMessage);
        Assert.Contains(
            InvitationEmailTemplateCompositionCategories.InviteLinkPathUnsafe,
            result.FailureCategories);
        AssertSafeRedactedResult(result);
    }

    [Fact]
    public void GeneratedLinkUsesOnlyConfiguredOriginPathAndFragmentSecret()
    {
        var composer = CreateComposer(
            CreateReadyOptions(
                publicBaseUrl: "https://settleora.example.invalid/base",
                inviteLinkPath: "/auth/invitations/accept"),
            NotificationPolicyReadinessStates.Configured);

        var result = composer.Compose(new InvitationEmailTemplateCompositionRequest(RawInvitationSecret));

        Assert.True(result.Available, DescribeSafeResult(result));
        Assert.NotNull(result.SendReadyMessage);
        Assert.Equal(
            "https://settleora.example.invalid/base/auth/invitations/accept#invitationSecret=raw-invitation-secret-material",
            result.SendReadyMessage.InviteLink.ToString());
        Assert.Empty(result.SendReadyMessage.InviteLink.Query);
        Assert.Equal(
            "#invitationSecret=raw-invitation-secret-material",
            result.SendReadyMessage.InviteLink.Fragment);
        Assert.Contains(RawInvitationSecret, result.SendReadyMessage.TextBody, StringComparison.Ordinal);
        Assert.DoesNotContain("token=", result.SendReadyMessage.InviteLink.ToString(), StringComparison.OrdinalIgnoreCase);
        AssertSafeRedactedResult(result);
    }

    [Fact]
    public void SendReadyMessageUsesGenericPrivacySafeCopy()
    {
        var composer = CreateComposer(
            CreateReadyOptions(),
            NotificationPolicyReadinessStates.Configured);

        var result = composer.Compose(new InvitationEmailTemplateCompositionRequest(RawInvitationSecret));

        Assert.True(result.Available, DescribeSafeResult(result));
        Assert.NotNull(result.SendReadyMessage);
        Assert.Equal(ApprovedSubject, result.SendReadyMessage.Subject);
        Assert.Equal(
            string.Join(
                Environment.NewLine,
                ApprovedSubject,
                string.Empty,
                "Use this link to continue accepting your Settleora invitation:",
                string.Empty,
                result.SendReadyMessage.InviteLink.ToString(),
                string.Empty,
                "This link expires after a limited time. If you did not expect this, you can ignore this email."),
            result.SendReadyMessage.TextBody);
        Assert.DoesNotContain(ContactEmail, result.SendReadyMessage.TextBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("admin", result.SendReadyMessage.TextBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("owner", result.SendReadyMessage.TextBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("delivered", result.SendReadyMessage.TextBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("accepted", result.SendReadyMessage.TextBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("mailbox", result.SendReadyMessage.TextBody, StringComparison.OrdinalIgnoreCase);
        AssertSafeRedactedResult(result);
    }

    [Fact]
    public void RawInvitationSecretIsRequiredOnlyInsideInternalLinkConstruction()
    {
        var composer = CreateComposer(
            CreateReadyOptions(),
            NotificationPolicyReadinessStates.Configured);

        var missing = composer.Compose(new InvitationEmailTemplateCompositionRequest(null));
        var composed = composer.Compose(new InvitationEmailTemplateCompositionRequest(RawInvitationSecret));

        Assert.False(missing.Available);
        Assert.Contains(
            InvitationEmailTemplateCompositionCategories.InvitationSecretMissing,
            missing.FailureCategories);
        Assert.True(composed.Available, DescribeSafeResult(composed));
        Assert.NotNull(composed.SendReadyMessage);
        Assert.Contains(RawInvitationSecret, composed.SendReadyMessage.InviteLink.ToString(), StringComparison.Ordinal);
        Assert.DoesNotContain(RawInvitationSecret, composed.ToString(), StringComparison.Ordinal);
        Assert.DoesNotContain(RawInvitationSecret, composed.SendReadyMessage.ToString(), StringComparison.Ordinal);
        AssertSafeRedactedResult(missing);
        AssertSafeRedactedResult(composed);
    }

    [Theory]
    [InlineData(InvitationEmailDeliveryModes.LocalSink, "http://localhost:5173")]
    [InlineData(InvitationEmailDeliveryModes.TestSink, "http://127.0.0.1:5173")]
    public void SinkModesComposeOnlyAsExplicitNonProductionSinkBehavior(
        string deliveryMode,
        string publicBaseUrl)
    {
        var composer = CreateComposer(new InvitationEmailDeliveryOptions
        {
            Enabled = true,
            DeliveryMode = deliveryMode,
            PublicBaseUrl = publicBaseUrl,
            InviteLinkPath = "/auth/invitations/accept"
        });

        var result = composer.Compose(new InvitationEmailTemplateCompositionRequest(RawInvitationSecret));

        Assert.True(result.Available, DescribeSafeResult(result));
        Assert.NotNull(result.SendReadyMessage);
        Assert.Equal(deliveryMode, result.DeliveryMode);
        Assert.Equal(
            deliveryMode == InvitationEmailDeliveryModes.LocalSink
                ? InvitationEmailTemplateCompositionCategories.LocalSinkReadyNoSmtpSend
                : InvitationEmailTemplateCompositionCategories.TestSinkReadyNoSmtpSend,
            result.Category);
        AssertSafeRedactedResult(result);
    }

    private static InvitationEmailTemplateComposer CreateComposer(
        InvitationEmailDeliveryOptions options,
        string emailProviderReadiness = NotificationPolicyReadinessStates.Disabled)
    {
        var monitor = new FakeOptionsMonitor(options);
        return new InvitationEmailTemplateComposer(
            new InvitationEmailDeliveryReadinessService(
                monitor,
                new FakeNotificationProviderReadinessService(emailProviderReadiness)),
            monitor);
    }

    private static InvitationEmailDeliveryOptions CreateReadyOptions(
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

    private static void AssertSafeRedactedResult(InvitationEmailTemplateCompositionResult result)
    {
        var combined = string.Join(
            " ",
            result.ToString(),
            result.RedactedPreview.ToString(),
            string.Join(" ", result.FailureCategories));

        Assert.DoesNotContain(RawInvitationSecret, combined, StringComparison.Ordinal);
        Assert.DoesNotContain("invitationSecret=", combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token=", combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(ContactEmail, combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(SmtpHost, combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(SmtpPassword, combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(ProviderPayload, combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("settleora.example.invalid", combined, StringComparison.OrdinalIgnoreCase);
    }

    private static string DescribeSafeResult(InvitationEmailTemplateCompositionResult result)
    {
        return string.Join(
            " ",
            result.ToString(),
            string.Join(",", result.FailureCategories));
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
