using System.Net.Mail;
using Microsoft.Extensions.Options;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Notifications;

namespace Settleora.Api.Tests;

public sealed class SmtpEmailNotificationSenderTests
{
    private static readonly Guid RecipientId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid BillId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    [Fact]
    public async Task SmtpEmailIsDisabledByDefaultAndDoesNotCallTransport()
    {
        var transport = new CapturingSmtpEmailTransport();
        var sender = CreateSender(new SmtpEmailNotificationOptions(), transport);

        var result = await sender.SendAsync(CreateRequest());

        Assert.False(result.Accepted);
        Assert.True(result.Disabled);
        Assert.Equal(SmtpEmailNotificationResultCategories.DisabledByConfiguration, result.Category);
        Assert.False(transport.WasCalled);
        Assert.DoesNotContain("sent", result.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task EnabledButIncompleteConfigurationReturnsUnconfiguredWithoutFakeSentSuccess()
    {
        var transport = new CapturingSmtpEmailTransport();
        var sender = CreateSender(new SmtpEmailNotificationOptions
        {
            Enabled = true,
            Host = "smtp-host-placeholder"
        }, transport);

        var result = await sender.SendAsync(CreateRequest());

        Assert.False(result.Accepted);
        Assert.True(result.Unconfigured);
        Assert.Equal(SmtpEmailNotificationResultCategories.ProviderUnconfigured, result.Category);
        Assert.False(transport.WasCalled);
        Assert.DoesNotContain("sent", result.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task CompleteConfigurationBuildsBoundedPrivacySafeMessageThroughTransportBoundary()
    {
        var transport = new CapturingSmtpEmailTransport();
        var sender = CreateSender(CreateCompleteOptions(), transport);

        var result = await sender.SendAsync(CreateRequest());

        Assert.True(result.Accepted);
        Assert.Equal(SmtpEmailNotificationResultCategories.Accepted, result.Category);
        Assert.True(transport.WasCalled);
        Assert.Equal("recipient-placeholder@example.invalid", transport.To);
        Assert.Equal("from-address-placeholder@example.invalid", transport.From);
        Assert.Equal("Settleora bill notification", transport.Subject);
        Assert.Contains("A notification is available in Settleora.", transport.Body, StringComparison.Ordinal);
        Assert.Contains(InAppNotificationEventTypes.BillSubmitted, transport.Body, StringComparison.Ordinal);
        Assert.Contains(BillId.ToString(), transport.Body, StringComparison.Ordinal);
        Assert.DoesNotContain("smtp-password-placeholder", transport.Body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("payment handle", transport.Body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("raw ocr", transport.Body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("signed-url", transport.Body, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(SmtpStatusCode.GeneralFailure, SmtpEmailNotificationResultCategories.ProviderUnavailable, true)]
    [InlineData(SmtpStatusCode.MustIssueStartTlsFirst, SmtpEmailNotificationResultCategories.ConfigurationInvalid, false)]
    [InlineData(SmtpStatusCode.MailboxUnavailable, SmtpEmailNotificationResultCategories.RecipientRejected, false)]
    public async Task ProviderExceptionsClassifyToSafeCategoriesWithoutRawResponseLeakage(
        SmtpStatusCode statusCode,
        string expectedCategory,
        bool expectedRetryable)
    {
        const string rawSecretBearingResponse = "raw smtp response with smtp-password-placeholder and provider diagnostics";
        var transport = new CapturingSmtpEmailTransport
        {
            ExceptionToThrow = new SmtpException(statusCode, rawSecretBearingResponse)
        };
        var sender = CreateSender(CreateCompleteOptions(), transport);

        var result = await sender.SendAsync(CreateRequest());

        Assert.False(result.Accepted);
        Assert.Equal(expectedRetryable, result.Retryable);
        Assert.Equal(expectedCategory, result.Category);
        Assert.DoesNotContain(rawSecretBearingResponse, result.ToString(), StringComparison.Ordinal);
        Assert.DoesNotContain("smtp-password-placeholder", result.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void TemplateUsesOnlyGenericCopyAndSafeReferences()
    {
        var request = CreateRequest();

        var subject = SmtpEmailNotificationTemplate.BuildSubject(request);
        var body = SmtpEmailNotificationTemplate.BuildTextBody(request);

        Assert.Equal("Settleora bill notification", subject);
        Assert.Contains("Open Settleora to review it.", body, StringComparison.Ordinal);
        Assert.Contains(BillId.ToString(), body, StringComparison.Ordinal);
        Assert.DoesNotContain("receipt text", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("payment details", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("private note", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("object key", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("recipient-placeholder@example.invalid", body, StringComparison.OrdinalIgnoreCase);
    }

    private static SmtpEmailNotificationSender CreateSender(
        SmtpEmailNotificationOptions options,
        ISmtpEmailTransport transport)
    {
        return new SmtpEmailNotificationSender(Options.Create(options), transport);
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
            Password = "smtp-password-placeholder",
            FromAddress = "from-address-placeholder@example.invalid",
            FromName = "Settleora",
            TimeoutSeconds = 10
        };
    }

    private static SmtpEmailNotificationSendRequest CreateRequest()
    {
        return new SmtpEmailNotificationSendRequest(
            "recipient-placeholder@example.invalid",
            InAppNotificationEventTypes.BillSubmitted,
            InAppNotificationSubjectTypes.ExpenseBill,
            RecipientId,
            InAppNotificationId: null,
            GroupId: null,
            ExpenseBillId: BillId,
            ExpenseBillRevisionId: null,
            SettlementRequestId: null,
            SettlementPaymentId: null,
            RecurringBillTemplateId: null,
            RecurringBillOccurrenceId: null,
            ReceiptOcrReviewId: null,
            SyncOperationId: null);
    }

    private sealed class CapturingSmtpEmailTransport : ISmtpEmailTransport
    {
        public bool WasCalled { get; private set; }

        public string? From { get; private set; }

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
            From = message.From?.Address;
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
