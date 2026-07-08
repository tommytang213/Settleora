using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Options;
using Settleora.Api.Auth.Invitations;
using Settleora.Api.Notifications;

namespace Settleora.Api.Tests;

public sealed class InvitationEmailSenderTests
{
    private const string RecipientEmail = "invitee@example.invalid";
    private const string RawInvitationSecret = "raw-invitation-email-sender-material";
    private const string SmtpPassword = "smtp-password-placeholder";

    [Theory]
    [InlineData(InvitationEmailDeliveryModes.LocalSink, InvitationEmailSendResultCategories.LocalSinkAccepted)]
    [InlineData(InvitationEmailDeliveryModes.TestSink, InvitationEmailSendResultCategories.TestSinkAccepted)]
    public async Task SinkModesReturnSafeAcceptedCategoryWithoutSmtpTransport(
        string deliveryMode,
        string expectedCategory)
    {
        var transport = new CapturingSmtpEmailTransport();
        var sender = CreateSender(CreateCompleteOptions(), transport);

        var result = await sender.SendAsync(CreateRequest(deliveryMode));

        Assert.True(result.Accepted);
        Assert.Equal(expectedCategory, result.Category);
        Assert.False(transport.WasCalled);
        AssertSafeResult(result);
    }

    [Fact]
    public async Task DisabledSmtpDoesNotCallTransportOrClaimSent()
    {
        var transport = new CapturingSmtpEmailTransport();
        var sender = CreateSender(new SmtpEmailNotificationOptions(), transport);

        var result = await sender.SendAsync(CreateRequest(InvitationEmailDeliveryModes.ProductionSmtp));

        Assert.False(result.Accepted);
        Assert.True(result.Disabled);
        Assert.Equal(InvitationEmailSendResultCategories.DisabledByConfiguration, result.Category);
        Assert.False(transport.WasCalled);
        AssertSafeResult(result);
    }

    [Fact]
    public async Task CompleteProductionSmtpConfigurationHandsOffSendReadyMessage()
    {
        var transport = new CapturingSmtpEmailTransport();
        var sender = CreateSender(CreateCompleteOptions(), transport);

        var result = await sender.SendAsync(CreateRequest(InvitationEmailDeliveryModes.ProductionSmtp));

        Assert.True(result.Accepted);
        Assert.Equal(InvitationEmailSendResultCategories.Accepted, result.Category);
        Assert.True(transport.WasCalled);
        Assert.Equal(RecipientEmail, transport.To);
        Assert.Equal(InvitationEmailTemplateComposer.TemplateSubject, transport.Subject);
        Assert.Contains(RawInvitationSecret, transport.Body, StringComparison.Ordinal);
        AssertSafeResult(result);
    }

    [Theory]
    [InlineData(SmtpStatusCode.GeneralFailure, InvitationEmailSendResultCategories.ProviderUnavailable, true)]
    [InlineData(SmtpStatusCode.MustIssueStartTlsFirst, InvitationEmailSendResultCategories.ConfigurationInvalid, false)]
    [InlineData(SmtpStatusCode.MailboxUnavailable, InvitationEmailSendResultCategories.RecipientRejected, false)]
    public async Task ProviderExceptionsClassifyWithoutRawDiagnostics(
        SmtpStatusCode statusCode,
        string expectedCategory,
        bool expectedRetryable)
    {
        var transport = new CapturingSmtpEmailTransport
        {
            ExceptionToThrow = new SmtpException(
                statusCode,
                $"raw provider diagnostic {SmtpPassword} {RawInvitationSecret}")
        };
        var sender = CreateSender(CreateCompleteOptions(), transport);

        var result = await sender.SendAsync(CreateRequest(InvitationEmailDeliveryModes.ProductionSmtp));

        Assert.False(result.Accepted);
        Assert.Equal(expectedCategory, result.Category);
        Assert.Equal(expectedRetryable, result.Retryable);
        AssertSafeResult(result);
    }

    [Fact]
    public void RequestToStringRedactsRecipientAndSendReadyMessage()
    {
        var request = CreateRequest(InvitationEmailDeliveryModes.ProductionSmtp);

        var text = request.ToString();

        Assert.Contains("HasRecipientEmailAddress=True", text, StringComparison.Ordinal);
        Assert.Contains("SendReadyMessage=[redacted]", text, StringComparison.Ordinal);
        Assert.DoesNotContain(RecipientEmail, text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(RawInvitationSecret, text, StringComparison.Ordinal);
        Assert.DoesNotContain("https://settleora.example.invalid", text, StringComparison.OrdinalIgnoreCase);
    }

    private static InvitationEmailSender CreateSender(
        SmtpEmailNotificationOptions options,
        ISmtpEmailTransport transport)
    {
        return new InvitationEmailSender(Options.Create(options), transport);
    }

    private static InvitationEmailSendRequest CreateRequest(string deliveryMode)
    {
        var inviteLink = new Uri(
            $"https://settleora.example.invalid/auth/invitations/accept#invitationSecret={RawInvitationSecret}");
        return new InvitationEmailSendRequest(
            RecipientEmail,
            new InvitationEmailSendReadyMessage(
                InvitationEmailTemplateComposer.TemplateSubject,
                $"Use this link: {inviteLink}",
                inviteLink,
                deliveryMode));
    }

    private static SmtpEmailNotificationOptions CreateCompleteOptions()
    {
        return new SmtpEmailNotificationOptions
        {
            Enabled = true,
            Host = "smtp-host-placeholder",
            Port = 2525,
            UseTls = true,
            Username = "smtp-username-placeholder",
            Password = SmtpPassword,
            FromAddress = "from-address-placeholder@example.invalid",
            FromName = "Settleora",
            TimeoutSeconds = 10
        };
    }

    private static void AssertSafeResult(InvitationEmailSendResult result)
    {
        var text = result.ToString();
        Assert.DoesNotContain(RawInvitationSecret, text, StringComparison.Ordinal);
        Assert.DoesNotContain(RecipientEmail, text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(SmtpPassword, text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("raw provider diagnostic", text, StringComparison.OrdinalIgnoreCase);
    }

    private sealed class CapturingSmtpEmailTransport : ISmtpEmailTransport
    {
        public bool WasCalled { get; private set; }

        public string? To { get; private set; }

        public string? Subject { get; private set; }

        public string? Body { get; private set; }

        public Exception? ExceptionToThrow { get; set; }

        public Task SendAsync(
            SmtpEmailNotificationOptions options,
            MailMessage message,
            CancellationToken cancellationToken)
        {
            WasCalled = true;
            To = message.To.Single().Address;
            Subject = message.Subject;
            Body = message.Body;

            if (ExceptionToThrow is not null)
            {
                throw ExceptionToThrow;
            }

            return Task.CompletedTask;
        }
    }
}
