using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Options;

namespace Settleora.Api.Notifications;

internal sealed class SmtpEmailNotificationSender : ISmtpEmailNotificationSender
{
    private readonly SmtpEmailNotificationOptions options;
    private readonly ISmtpEmailTransport transport;

    public SmtpEmailNotificationSender(
        IOptions<SmtpEmailNotificationOptions> options,
        ISmtpEmailTransport transport)
    {
        this.options = options.Value;
        this.transport = transport;
    }

    public async Task<SmtpEmailNotificationSendResult> SendAsync(
        SmtpEmailNotificationSendRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!options.Enabled)
        {
            return SmtpEmailNotificationSendResult.DisabledByConfiguration();
        }

        if (!options.HasRequiredConnectionFields()
            || string.IsNullOrWhiteSpace(request.RecipientEmailAddress))
        {
            return SmtpEmailNotificationSendResult.ProviderUnconfigured();
        }

        try
        {
            using var message = BuildMessage(request);
            await transport.SendAsync(options, message, cancellationToken);
            return SmtpEmailNotificationSendResult.AcceptedByProvider();
        }
        catch (SmtpException exception)
        {
            return ClassifySmtpException(exception);
        }
        catch (InvalidOperationException)
        {
            return SmtpEmailNotificationSendResult.FailedPermanent(
                SmtpEmailNotificationResultCategories.ConfigurationInvalid);
        }
        catch (FormatException)
        {
            return SmtpEmailNotificationSendResult.FailedPermanent(
                SmtpEmailNotificationResultCategories.ContentRejected);
        }
    }

    private MailMessage BuildMessage(SmtpEmailNotificationSendRequest request)
    {
        var fromName = string.IsNullOrWhiteSpace(options.FromName) ? "Settleora" : options.FromName.Trim();
        var message = new MailMessage
        {
            From = new MailAddress(options.FromAddress!, fromName),
            Subject = SmtpEmailNotificationTemplate.BuildSubject(request),
            Body = SmtpEmailNotificationTemplate.BuildTextBody(request),
            IsBodyHtml = false
        };
        message.To.Add(new MailAddress(request.RecipientEmailAddress!));
        return message;
    }

    private static SmtpEmailNotificationSendResult ClassifySmtpException(SmtpException exception)
    {
        return exception.StatusCode switch
        {
            SmtpStatusCode.GeneralFailure
                or SmtpStatusCode.ServiceNotAvailable
                or SmtpStatusCode.MailboxBusy
                or SmtpStatusCode.TransactionFailed
                or SmtpStatusCode.InsufficientStorage => SmtpEmailNotificationSendResult.FailedTransient(
                    SmtpEmailNotificationResultCategories.ProviderUnavailable),
            SmtpStatusCode.MustIssueStartTlsFirst
                or SmtpStatusCode.ClientNotPermitted
                or SmtpStatusCode.CommandNotImplemented
                or SmtpStatusCode.CommandParameterNotImplemented => SmtpEmailNotificationSendResult.FailedPermanent(
                    SmtpEmailNotificationResultCategories.ConfigurationInvalid),
            SmtpStatusCode.MailboxUnavailable
                or SmtpStatusCode.UserNotLocalTryAlternatePath
                or SmtpStatusCode.ExceededStorageAllocation
                or SmtpStatusCode.MailboxNameNotAllowed => SmtpEmailNotificationSendResult.FailedPermanent(
                    SmtpEmailNotificationResultCategories.RecipientRejected),
            _ => SmtpEmailNotificationSendResult.FailedPermanent(
                SmtpEmailNotificationResultCategories.AuthenticationFailedRedacted)
        };
    }
}

internal interface ISmtpEmailTransport
{
    Task SendAsync(
        SmtpEmailNotificationOptions options,
        MailMessage message,
        CancellationToken cancellationToken);
}

internal sealed class SmtpEmailTransport : ISmtpEmailTransport
{
    public async Task SendAsync(
        SmtpEmailNotificationOptions options,
        MailMessage message,
        CancellationToken cancellationToken)
    {
        using var client = new SmtpClient(options.Host!, options.Port)
        {
            EnableSsl = options.UseTls,
            Timeout = checked(options.TimeoutSeconds * 1000)
        };

        if (!string.IsNullOrWhiteSpace(options.Username))
        {
            client.Credentials = new NetworkCredential(options.Username, options.Password);
        }

        await client.SendMailAsync(message, cancellationToken);
    }
}

internal static class SmtpEmailNotificationTemplate
{
    public static string BuildSubject(SmtpEmailNotificationSendRequest request)
    {
        return request.EventType switch
        {
            var eventType when eventType.StartsWith("bill.", StringComparison.Ordinal) => "Settleora bill notification",
            var eventType when eventType.StartsWith("settlement.", StringComparison.Ordinal) => "Settleora settlement notification",
            var eventType when eventType.StartsWith("recurring_bill.", StringComparison.Ordinal) => "Settleora recurring bill notification",
            var eventType when eventType.StartsWith("sync.", StringComparison.Ordinal) => "Settleora sync notification",
            var eventType when eventType.StartsWith("ocr.", StringComparison.Ordinal) => "Settleora receipt review notification",
            _ => "Settleora notification"
        };
    }

    public static string BuildTextBody(SmtpEmailNotificationSendRequest request)
    {
        var safeReference = ResolveSafeReference(request);
        return string.Join(
            Environment.NewLine,
            "A notification is available in Settleora.",
            string.Empty,
            "Open Settleora to review it. Details are available only after signing in and passing the normal authorization checks.",
            string.Empty,
            $"Notification type: {request.EventType}",
            $"Reference: {safeReference}");
    }

    private static string ResolveSafeReference(SmtpEmailNotificationSendRequest request)
    {
        return request.ExpenseBillId?.ToString()
            ?? request.ExpenseBillRevisionId?.ToString()
            ?? request.SettlementRequestId?.ToString()
            ?? request.SettlementPaymentId?.ToString()
            ?? request.RecurringBillOccurrenceId?.ToString()
            ?? request.RecurringBillTemplateId?.ToString()
            ?? request.ReceiptOcrReviewId?.ToString()
            ?? request.SyncOperationId?.ToString()
            ?? request.GroupId?.ToString()
            ?? request.InAppNotificationId?.ToString()
            ?? "available-in-app";
    }
}
