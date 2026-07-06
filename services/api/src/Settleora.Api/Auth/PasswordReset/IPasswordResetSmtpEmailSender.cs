using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Options;
using Settleora.Api.Notifications;

namespace Settleora.Api.Auth.PasswordReset;

internal interface IPasswordResetSmtpEmailSender
{
    Task<PasswordResetSmtpEmailSendResult> SendAsync(
        PasswordResetSmtpEmailSendRequest request,
        CancellationToken cancellationToken = default);
}

internal sealed record PasswordResetSmtpEmailSendRequest(
    string? RecipientEmailAddress,
    PasswordResetEmailSendReadyMessage SendReadyMessage)
{
    public override string ToString()
    {
        return string.Join(
            " ",
            nameof(PasswordResetSmtpEmailSendRequest),
            $"HasRecipientEmailAddress={!string.IsNullOrWhiteSpace(RecipientEmailAddress)}",
            $"DeliveryMode={SendReadyMessage.DeliveryMode}",
            $"ResetLinkLifetimeMinutes={SendReadyMessage.ResetLinkLifetimeMinutes}",
            "SendReadyMessage=[redacted]");
    }
}

internal sealed record PasswordResetSmtpEmailSendResult(
    string Category,
    bool Accepted = false,
    bool Retryable = false,
    bool Disabled = false,
    bool Unconfigured = false)
{
    public static PasswordResetSmtpEmailSendResult AcceptedByProvider()
    {
        return new PasswordResetSmtpEmailSendResult(
            PasswordResetSmtpEmailSendResultCategories.Accepted,
            Accepted: true);
    }

    public static PasswordResetSmtpEmailSendResult DisabledByConfiguration()
    {
        return new PasswordResetSmtpEmailSendResult(
            PasswordResetSmtpEmailSendResultCategories.DisabledByConfiguration,
            Disabled: true);
    }

    public static PasswordResetSmtpEmailSendResult ProviderUnconfigured()
    {
        return new PasswordResetSmtpEmailSendResult(
            PasswordResetSmtpEmailSendResultCategories.ProviderUnconfigured,
            Unconfigured: true);
    }

    public static PasswordResetSmtpEmailSendResult FailedTransient(string category)
    {
        return new PasswordResetSmtpEmailSendResult(category, Retryable: true);
    }

    public static PasswordResetSmtpEmailSendResult FailedPermanent(string category)
    {
        return new PasswordResetSmtpEmailSendResult(category);
    }
}

internal static class PasswordResetSmtpEmailSendResultCategories
{
    public const string Accepted = "accepted";
    public const string DisabledByConfiguration = "disabled_by_configuration";
    public const string ProviderUnconfigured = "provider_unconfigured";
    public const string ProviderUnavailable = "provider_unavailable";
    public const string AuthenticationFailedRedacted = "authentication_failed_redacted";
    public const string ConfigurationInvalid = "configuration_invalid";
    public const string RecipientRejected = "recipient_rejected";
    public const string ContentRejected = "content_rejected";
}

internal sealed class PasswordResetSmtpEmailSender : IPasswordResetSmtpEmailSender
{
    private readonly SmtpEmailNotificationOptions options;
    private readonly ISmtpEmailTransport transport;

    public PasswordResetSmtpEmailSender(
        IOptions<SmtpEmailNotificationOptions> options,
        ISmtpEmailTransport transport)
    {
        this.options = options.Value;
        this.transport = transport;
    }

    public async Task<PasswordResetSmtpEmailSendResult> SendAsync(
        PasswordResetSmtpEmailSendRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!options.Enabled)
        {
            return PasswordResetSmtpEmailSendResult.DisabledByConfiguration();
        }

        if (!options.HasRequiredConnectionFields()
            || string.IsNullOrWhiteSpace(request.RecipientEmailAddress))
        {
            return PasswordResetSmtpEmailSendResult.ProviderUnconfigured();
        }

        try
        {
            using var message = BuildMessage(request);
            await transport.SendAsync(options, message, cancellationToken);
            return PasswordResetSmtpEmailSendResult.AcceptedByProvider();
        }
        catch (SmtpException exception)
        {
            return ClassifySmtpException(exception);
        }
        catch (InvalidOperationException)
        {
            return PasswordResetSmtpEmailSendResult.FailedPermanent(
                PasswordResetSmtpEmailSendResultCategories.ConfigurationInvalid);
        }
        catch (FormatException)
        {
            return PasswordResetSmtpEmailSendResult.FailedPermanent(
                PasswordResetSmtpEmailSendResultCategories.ContentRejected);
        }
    }

    private MailMessage BuildMessage(PasswordResetSmtpEmailSendRequest request)
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

    private static PasswordResetSmtpEmailSendResult ClassifySmtpException(SmtpException exception)
    {
        return exception.StatusCode switch
        {
            SmtpStatusCode.GeneralFailure
                or SmtpStatusCode.ServiceNotAvailable
                or SmtpStatusCode.MailboxBusy
                or SmtpStatusCode.TransactionFailed
                or SmtpStatusCode.InsufficientStorage => PasswordResetSmtpEmailSendResult.FailedTransient(
                    PasswordResetSmtpEmailSendResultCategories.ProviderUnavailable),
            SmtpStatusCode.MustIssueStartTlsFirst
                or SmtpStatusCode.ClientNotPermitted
                or SmtpStatusCode.CommandNotImplemented
                or SmtpStatusCode.CommandParameterNotImplemented => PasswordResetSmtpEmailSendResult.FailedPermanent(
                    PasswordResetSmtpEmailSendResultCategories.ConfigurationInvalid),
            SmtpStatusCode.MailboxUnavailable
                or SmtpStatusCode.UserNotLocalTryAlternatePath
                or SmtpStatusCode.ExceededStorageAllocation
                or SmtpStatusCode.MailboxNameNotAllowed => PasswordResetSmtpEmailSendResult.FailedPermanent(
                    PasswordResetSmtpEmailSendResultCategories.RecipientRejected),
            _ => PasswordResetSmtpEmailSendResult.FailedPermanent(
                PasswordResetSmtpEmailSendResultCategories.AuthenticationFailedRedacted)
        };
    }
}
