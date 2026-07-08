using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Options;
using Settleora.Api.Notifications;

namespace Settleora.Api.Auth.Invitations;

internal interface IInvitationEmailSender
{
    Task<InvitationEmailSendResult> SendAsync(
        InvitationEmailSendRequest request,
        CancellationToken cancellationToken = default);
}

internal sealed record InvitationEmailSendRequest(
    string? RecipientEmailAddress,
    InvitationEmailSendReadyMessage SendReadyMessage)
{
    public override string ToString()
    {
        return string.Join(
            " ",
            nameof(InvitationEmailSendRequest),
            $"HasRecipientEmailAddress={!string.IsNullOrWhiteSpace(RecipientEmailAddress)}",
            $"DeliveryMode={SendReadyMessage.DeliveryMode}",
            "SendReadyMessage=[redacted]");
    }
}

internal sealed record InvitationEmailSendResult(
    string Category,
    bool Accepted = false,
    bool Retryable = false,
    bool Disabled = false,
    bool Unconfigured = false)
{
    public static InvitationEmailSendResult AcceptedByProvider()
    {
        return new InvitationEmailSendResult(
            InvitationEmailSendResultCategories.Accepted,
            Accepted: true);
    }

    public static InvitationEmailSendResult SinkAccepted(string category)
    {
        return new InvitationEmailSendResult(category, Accepted: true);
    }

    public static InvitationEmailSendResult DisabledByConfiguration()
    {
        return new InvitationEmailSendResult(
            InvitationEmailSendResultCategories.DisabledByConfiguration,
            Disabled: true);
    }

    public static InvitationEmailSendResult ProviderUnconfigured()
    {
        return new InvitationEmailSendResult(
            InvitationEmailSendResultCategories.ProviderUnconfigured,
            Unconfigured: true);
    }

    public static InvitationEmailSendResult FailedTransient(string category)
    {
        return new InvitationEmailSendResult(category, Retryable: true);
    }

    public static InvitationEmailSendResult FailedPermanent(string category)
    {
        return new InvitationEmailSendResult(category);
    }

    public override string ToString()
    {
        return string.Join(
            " ",
            nameof(InvitationEmailSendResult),
            $"Category={Category}",
            $"Accepted={Accepted}",
            $"Retryable={Retryable}",
            $"Disabled={Disabled}",
            $"Unconfigured={Unconfigured}");
    }
}

internal static class InvitationEmailSendResultCategories
{
    public const string Accepted = "accepted";
    public const string LocalSinkAccepted = "local_sink_accepted";
    public const string TestSinkAccepted = "test_sink_accepted";
    public const string DisabledByConfiguration = "disabled_by_configuration";
    public const string ProviderUnconfigured = "provider_unconfigured";
    public const string ProviderUnavailable = "provider_unavailable";
    public const string AuthenticationFailedRedacted = "authentication_failed_redacted";
    public const string ConfigurationInvalid = "configuration_invalid";
    public const string RecipientRejected = "recipient_rejected";
    public const string ContentRejected = "content_rejected";
}

internal sealed class InvitationEmailSender : IInvitationEmailSender
{
    private readonly SmtpEmailNotificationOptions options;
    private readonly ISmtpEmailTransport transport;

    public InvitationEmailSender(
        IOptions<SmtpEmailNotificationOptions> options,
        ISmtpEmailTransport transport)
    {
        this.options = options.Value;
        this.transport = transport;
    }

    public async Task<InvitationEmailSendResult> SendAsync(
        InvitationEmailSendRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (StringComparer.Ordinal.Equals(request.SendReadyMessage.DeliveryMode, InvitationEmailDeliveryModes.LocalSink))
        {
            return InvitationEmailSendResult.SinkAccepted(InvitationEmailSendResultCategories.LocalSinkAccepted);
        }

        if (StringComparer.Ordinal.Equals(request.SendReadyMessage.DeliveryMode, InvitationEmailDeliveryModes.TestSink))
        {
            return InvitationEmailSendResult.SinkAccepted(InvitationEmailSendResultCategories.TestSinkAccepted);
        }

        if (!options.Enabled)
        {
            return InvitationEmailSendResult.DisabledByConfiguration();
        }

        if (!options.HasRequiredConnectionFields()
            || string.IsNullOrWhiteSpace(request.RecipientEmailAddress))
        {
            return InvitationEmailSendResult.ProviderUnconfigured();
        }

        try
        {
            using var message = BuildMessage(request);
            await transport.SendAsync(options, message, cancellationToken);
            return InvitationEmailSendResult.AcceptedByProvider();
        }
        catch (SmtpException exception)
        {
            return ClassifySmtpException(exception);
        }
        catch (InvalidOperationException)
        {
            return InvitationEmailSendResult.FailedPermanent(
                InvitationEmailSendResultCategories.ConfigurationInvalid);
        }
        catch (FormatException)
        {
            return InvitationEmailSendResult.FailedPermanent(
                InvitationEmailSendResultCategories.ContentRejected);
        }
    }

    private MailMessage BuildMessage(InvitationEmailSendRequest request)
    {
        var fromName = string.IsNullOrWhiteSpace(options.FromName)
            ? "Settleora"
            : options.FromName.Trim();

        var message = new MailMessage
        {
            From = new MailAddress(options.FromAddress!, fromName),
            Subject = request.SendReadyMessage.Subject,
            Body = request.SendReadyMessage.TextBody,
            IsBodyHtml = false
        };
        message.To.Add(new MailAddress(request.RecipientEmailAddress!));
        return message;
    }

    private static InvitationEmailSendResult ClassifySmtpException(SmtpException exception)
    {
        return exception.StatusCode switch
        {
            SmtpStatusCode.GeneralFailure
                or SmtpStatusCode.ServiceNotAvailable
                or SmtpStatusCode.MailboxBusy
                or SmtpStatusCode.TransactionFailed
                or SmtpStatusCode.InsufficientStorage => InvitationEmailSendResult.FailedTransient(
                    InvitationEmailSendResultCategories.ProviderUnavailable),
            SmtpStatusCode.MustIssueStartTlsFirst
                or SmtpStatusCode.ClientNotPermitted
                or SmtpStatusCode.CommandNotImplemented
                or SmtpStatusCode.CommandParameterNotImplemented => InvitationEmailSendResult.FailedPermanent(
                    InvitationEmailSendResultCategories.ConfigurationInvalid),
            SmtpStatusCode.MailboxUnavailable
                or SmtpStatusCode.UserNotLocalTryAlternatePath
                or SmtpStatusCode.ExceededStorageAllocation
                or SmtpStatusCode.MailboxNameNotAllowed => InvitationEmailSendResult.FailedPermanent(
                    InvitationEmailSendResultCategories.RecipientRejected),
            _ => InvitationEmailSendResult.FailedPermanent(
                InvitationEmailSendResultCategories.AuthenticationFailedRedacted)
        };
    }
}
