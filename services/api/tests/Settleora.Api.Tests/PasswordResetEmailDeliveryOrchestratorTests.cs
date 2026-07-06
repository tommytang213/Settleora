using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Settleora.Api.Auth.PasswordReset;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Notifications;

namespace Settleora.Api.Tests;

public sealed class PasswordResetEmailDeliveryOrchestratorTests
{
    private const string RawResetMaterial = "raw-reset-material-secret";
    private const string SubmittedIdentifier = "user@example.invalid";
    private const string RecipientEmail = "recipient@example.invalid";
    private const string SmtpPassword = "smtp-password-placeholder";
    private const string ProviderPayload = "raw provider diagnostic payload";

    [Fact]
    public async Task DisabledOrNotReadyDeliveryRefusesBeforeMaterialIssueOrProviderSend()
    {
        var localReset = new FakeLocalPasswordResetService();
        var transport = new CapturingSmtpEmailTransport();
        var orchestrator = CreateOrchestrator(
            new PasswordResetEmailDeliveryOptions(),
            NotificationPolicyReadinessStates.Disabled,
            CreateCompleteSmtpOptions(),
            localReset,
            transport);

        var result = await orchestrator.DeliverAsync(CreateRequest());

        Assert.False(result.Accepted);
        Assert.Equal(PasswordResetEmailDeliveryResultCategories.DisabledNotReady, result.Category);
        Assert.False(localReset.IssueMaterialWasCalled);
        Assert.False(transport.WasCalled);
        AssertSafeResult(result);
    }

    [Fact]
    public async Task ProductionSmtpDeliveryRequiresReadinessBeforeMaterialIssue()
    {
        var localReset = new FakeLocalPasswordResetService();
        var transport = new CapturingSmtpEmailTransport();
        var orchestrator = CreateOrchestrator(
            CreateProductionOptions(),
            NotificationPolicyReadinessStates.Unconfigured,
            CreateCompleteSmtpOptions(),
            localReset,
            transport);

        var result = await orchestrator.DeliverAsync(CreateRequest());

        Assert.False(result.Accepted);
        Assert.Equal(PasswordResetEmailDeliveryResultCategories.DisabledNotReady, result.Category);
        Assert.Contains(
            PasswordResetEmailDeliveryReadinessCategories.GenericSmtpUnconfigured,
            result.FailureCategories ?? []);
        Assert.False(localReset.IssueMaterialWasCalled);
        Assert.False(transport.WasCalled);
        AssertSafeResult(result);
    }

    [Theory]
    [InlineData(PasswordResetEmailDeliveryModes.LocalSink, "http://localhost:5173")]
    [InlineData(PasswordResetEmailDeliveryModes.TestSink, "http://127.0.0.1:5173")]
    public async Task SinkModesRecordSinkResultWithoutSmtpSend(string mode, string publicBaseUrl)
    {
        var localReset = new FakeLocalPasswordResetService();
        var transport = new CapturingSmtpEmailTransport();
        var orchestrator = CreateOrchestrator(
            new PasswordResetEmailDeliveryOptions
            {
                Enabled = true,
                DeliveryMode = mode,
                PublicBaseUrl = publicBaseUrl,
                ResetLinkLifetime = PasswordResetEmailDeliveryOptions.DefaultResetLinkLifetime
            },
            NotificationPolicyReadinessStates.Unconfigured,
            CreateCompleteSmtpOptions(),
            localReset,
            transport);

        var result = await orchestrator.DeliverAsync(CreateRequest());

        Assert.True(result.Accepted);
        Assert.Equal(PasswordResetEmailDeliveryResultCategories.SinkRecorded, result.Category);
        Assert.True(localReset.IssueMaterialWasCalled);
        Assert.False(transport.WasCalled);
        AssertSafeResult(result);
    }

    [Fact]
    public async Task ProductionSmtpAcceptedResultDoesNotExposeResetMaterialOrRecipient()
    {
        var transport = new CapturingSmtpEmailTransport();
        var orchestrator = CreateOrchestrator(
            CreateProductionOptions(),
            NotificationPolicyReadinessStates.Configured,
            CreateCompleteSmtpOptions(),
            new FakeLocalPasswordResetService(),
            transport);

        var result = await orchestrator.DeliverAsync(CreateRequest());

        Assert.True(result.Accepted);
        Assert.Equal(PasswordResetEmailDeliveryResultCategories.ProviderSendAccepted, result.Category);
        Assert.Equal(PasswordResetSmtpEmailSendResultCategories.Accepted, result.ProviderCategory);
        Assert.True(transport.WasCalled);
        Assert.Equal(RecipientEmail, transport.To);
        Assert.Equal(PasswordResetEmailTemplateComposer.TemplateSubject, transport.Subject);
        Assert.Contains("resetMaterial=", transport.Body, StringComparison.Ordinal);
        Assert.Contains(RawResetMaterial, transport.Body, StringComparison.Ordinal);
        Assert.DoesNotContain("?token=", transport.Body, StringComparison.OrdinalIgnoreCase);
        AssertSafeResult(result);
    }

    [Theory]
    [InlineData(SmtpStatusCode.GeneralFailure, PasswordResetSmtpEmailSendResultCategories.ProviderUnavailable, true)]
    [InlineData(SmtpStatusCode.MustIssueStartTlsFirst, PasswordResetSmtpEmailSendResultCategories.ConfigurationInvalid, false)]
    [InlineData(SmtpStatusCode.MailboxUnavailable, PasswordResetSmtpEmailSendResultCategories.RecipientRejected, false)]
    public async Task ProviderFailureCategorizesWithoutRawErrorLeakage(
        SmtpStatusCode statusCode,
        string expectedProviderCategory,
        bool expectedRetryable)
    {
        var transport = new CapturingSmtpEmailTransport
        {
            ExceptionToThrow = new SmtpException(
                statusCode,
                $"{ProviderPayload} {SmtpPassword} {RawResetMaterial}")
        };
        var orchestrator = CreateOrchestrator(
            CreateProductionOptions(),
            NotificationPolicyReadinessStates.Configured,
            CreateCompleteSmtpOptions(),
            new FakeLocalPasswordResetService(),
            transport);

        var result = await orchestrator.DeliverAsync(CreateRequest());

        Assert.False(result.Accepted);
        Assert.Equal(PasswordResetEmailDeliveryResultCategories.ProviderSendFailedRedacted, result.Category);
        Assert.Equal(expectedProviderCategory, result.ProviderCategory);
        Assert.Equal(expectedRetryable, result.Retryable);
        AssertSafeResult(result);
    }

    [Fact]
    public async Task MissingRecipientIsInvalidPolicyAndDoesNotCallProvider()
    {
        var transport = new CapturingSmtpEmailTransport();
        var orchestrator = CreateOrchestrator(
            CreateProductionOptions(),
            NotificationPolicyReadinessStates.Configured,
            CreateCompleteSmtpOptions(),
            new FakeLocalPasswordResetService(),
            transport);

        var result = await orchestrator.DeliverAsync(CreateRequest(recipientEmail: null));

        Assert.False(result.Accepted);
        Assert.Equal(PasswordResetEmailDeliveryResultCategories.InvalidPolicy, result.Category);
        Assert.Contains(
            PasswordResetEmailDeliveryFailureCategories.RecipientUnavailable,
            result.FailureCategories ?? []);
        Assert.False(transport.WasCalled);
        AssertSafeResult(result);
    }

    [Fact]
    public void RequestAndProviderModelsRedactSensitiveValuesInToString()
    {
        var message = new PasswordResetEmailSendReadyMessage(
            PasswordResetEmailTemplateComposer.TemplateSubject,
            $"body {RawResetMaterial} resetMaterial={RawResetMaterial}",
            new Uri($"https://settleora.example.invalid/auth/password-reset#resetMaterial={RawResetMaterial}"),
            PasswordResetEmailDeliveryModes.ProductionSmtp,
            60);
        var request = new PasswordResetSmtpEmailSendRequest(RecipientEmail, message);
        var deliveryRequest = CreateRequest();

        var combined = string.Join(" ", request.ToString(), message.ToString(), deliveryRequest.ToString());

        Assert.DoesNotContain(RawResetMaterial, combined, StringComparison.Ordinal);
        Assert.DoesNotContain("resetMaterial=", combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(SubmittedIdentifier, combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(RecipientEmail, combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("settleora.example.invalid", combined, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void LocalPasswordResetRuntimeRegistersInternalDeliveryOrchestrationServices()
    {
        IConfiguration configuration = new ConfigurationBuilder().Build();
        var services = new ServiceCollection();
        services.AddOptions();
        services.AddLocalPasswordResetRuntime(configuration);

        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IPasswordResetEmailDeliveryOrchestrator));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IPasswordResetSmtpEmailSender));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IPasswordResetEmailDeliveryReadinessService));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IPasswordResetEmailTemplateComposer));
    }

    private static PasswordResetEmailDeliveryOrchestrator CreateOrchestrator(
        PasswordResetEmailDeliveryOptions deliveryOptions,
        string emailProviderReadiness,
        SmtpEmailNotificationOptions smtpOptions,
        FakeLocalPasswordResetService localPasswordResetService,
        CapturingSmtpEmailTransport transport)
    {
        var deliveryOptionsMonitor = new FakeOptionsMonitor(deliveryOptions);
        var readinessService = new PasswordResetEmailDeliveryReadinessService(
            deliveryOptionsMonitor,
            new FakeNotificationProviderReadinessService(emailProviderReadiness));
        var composer = new PasswordResetEmailTemplateComposer(readinessService, deliveryOptionsMonitor);
        var sender = new PasswordResetSmtpEmailSender(Options.Create(smtpOptions), transport);

        return new PasswordResetEmailDeliveryOrchestrator(
            readinessService,
            localPasswordResetService,
            composer,
            sender);
    }

    private static PasswordResetEmailDeliveryRequest CreateRequest(string? recipientEmail = RecipientEmail)
    {
        return new PasswordResetEmailDeliveryRequest(
            SubmittedIdentifier,
            recipientEmail,
            "source_bucket_placeholder",
            "correlation_placeholder");
    }

    private static PasswordResetEmailDeliveryOptions CreateProductionOptions()
    {
        return new PasswordResetEmailDeliveryOptions
        {
            Enabled = true,
            DeliveryMode = PasswordResetEmailDeliveryModes.ProductionSmtp,
            PublicBaseUrl = "https://settleora.example.invalid",
            ResetLinkPath = "/auth/password-reset",
            ResetLinkLifetime = PasswordResetEmailDeliveryOptions.DefaultResetLinkLifetime
        };
    }

    private static SmtpEmailNotificationOptions CreateCompleteSmtpOptions()
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

    private static void AssertSafeResult(PasswordResetEmailDeliveryResult result)
    {
        var combined = string.Join(
            " ",
            result.ToString(),
            result.RedactedPreview?.ToString(),
            result.RedactedPreview?.TextBody,
            string.Join(",", result.FailureCategories ?? []));

        Assert.DoesNotContain(RawResetMaterial, combined, StringComparison.Ordinal);
        Assert.DoesNotContain("resetMaterial=", combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("?token=", combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(SubmittedIdentifier, combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(RecipientEmail, combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("smtp-host-placeholder", combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(SmtpPassword, combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(ProviderPayload, combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("settleora.example.invalid", combined, StringComparison.OrdinalIgnoreCase);
    }

    private sealed class FakeLocalPasswordResetService : ILocalPasswordResetService
    {
        public bool IssueMaterialWasCalled { get; private set; }

        public Task<LocalPasswordResetRequestResult> RequestResetAsync(
            LocalPasswordResetRequest request,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(LocalPasswordResetRequestResult.Accepted());
        }

        public Task<LocalPasswordResetMaterialIssueResult> IssueMaterialAsync(
            LocalPasswordResetMaterialIssueRequest request,
            CancellationToken cancellationToken = default)
        {
            IssueMaterialWasCalled = true;
            return Task.FromResult(
                LocalPasswordResetMaterialIssueResult.Issued(
                    Guid.Parse("11111111-1111-1111-1111-111111111111"),
                    RawResetMaterial));
        }

        public Task<LocalPasswordResetCompleteResult> CompleteResetAsync(
            LocalPasswordResetCompleteRequest request,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(
                LocalPasswordResetCompleteResult.Failure(LocalPasswordResetCompleteStatus.InvalidOrUnavailable));
        }
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
