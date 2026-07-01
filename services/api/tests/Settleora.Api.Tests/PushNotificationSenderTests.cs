using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Notifications;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class PushNotificationSenderTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 1, 14, 25, 0, TimeSpan.Zero);
    private static readonly Guid RecipientId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid BillId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private const string RawProviderToken = "dummy-token-for-redaction-test";
    private const string ProtectedProviderToken = "protected-token-placeholder";

    [Fact]
    public async Task PushProviderIsDisabledByDefaultAndDoesNotReadTokensOrCallProvider()
    {
        await using var dbContext = CreateDbContext();
        await SeedActivePushTokenAsync(dbContext);
        var provider = new CapturingPushNotificationProvider(PushProviderSendResult.ProviderUnconfigured());
        var protector = new CapturingPushTokenProtector();
        var sender = CreateSender(dbContext, new PushNotificationOptions(), protector, provider);

        var result = await sender.SendAsync(CreateRequest());

        Assert.False(result.Accepted);
        Assert.True(result.Disabled);
        Assert.Equal(PushNotificationResultCategories.DisabledByConfiguration, result.Category);
        Assert.False(provider.WasCalled);
        Assert.False(protector.UnprotectWasCalled);
        Assert.DoesNotContain("sent", result.ToString(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("delivered", result.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task EnabledPushWithNoActiveTokensReturnsTruthfulNonSuccess()
    {
        await using var dbContext = CreateDbContext();
        var provider = new CapturingPushNotificationProvider(PushProviderSendResult.ProviderUnconfigured());
        var protector = new CapturingPushTokenProtector();
        var sender = CreateSender(dbContext, new PushNotificationOptions { Enabled = true }, protector, provider);

        var result = await sender.SendAsync(CreateRequest());

        Assert.False(result.Accepted);
        Assert.True(result.NoActiveTokens);
        Assert.Equal(PushNotificationResultCategories.NoActiveTokens, result.Category);
        Assert.False(provider.WasCalled);
        Assert.False(protector.UnprotectWasCalled);
    }

    [Fact]
    public async Task EnabledPushReadsProtectedTokenOnlyInsideSendBoundaryAndUsesProviderNeutralPayload()
    {
        await using var dbContext = CreateDbContext();
        var pushTokenId = await SeedActivePushTokenAsync(dbContext);
        var provider = new CapturingPushNotificationProvider(PushProviderSendResult.ProviderUnconfigured());
        var protector = new CapturingPushTokenProtector();
        var sender = CreateSender(dbContext, new PushNotificationOptions { Enabled = true }, protector, provider);

        var result = await sender.SendAsync(CreateRequest());

        Assert.False(result.Accepted);
        Assert.True(result.Unconfigured);
        Assert.Equal(PushNotificationResultCategories.ProviderUnconfigured, result.Category);
        Assert.True(protector.UnprotectWasCalled);
        Assert.Equal(ProtectedProviderToken, protector.ProtectedBlobSeen);
        Assert.True(provider.WasCalled);
        Assert.NotNull(provider.Request);
        Assert.Equal(pushTokenId, Assert.Single(provider.Request!.Tokens).PushDeviceTokenId);
        Assert.Equal(RawProviderToken, Assert.Single(provider.Request.Tokens).RawProviderToken);
        Assert.Equal("Settleora", provider.Request.Payload.Title);
        Assert.Equal("Open Settleora to view this notification.", provider.Request.Payload.Body);
        Assert.Equal(InAppNotificationEventTypes.BillSubmitted, provider.Request.Payload.EventType);
        Assert.Equal("expense_bill", provider.Request.Payload.ReferenceType);
        Assert.Equal(BillId.ToString(), provider.Request.Payload.ReferenceId);
    }

    [Fact]
    public void PayloadBuilderExcludesSensitiveOrAuthorityBearingFields()
    {
        var payload = PushNotificationPayloadBuilder.Build(CreateRequest());
        var serialized = string.Join(
            "|",
            payload.Title,
            payload.Body,
            payload.EventType,
            payload.SubjectType,
            payload.ReferenceType,
            payload.ReferenceId);

        Assert.Contains("Open Settleora", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("dummy-token", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("protected", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("fingerprint", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("provider credential", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("receipt text", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("payment details", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("private note", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("deep link", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("amount", serialized, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(PushNotificationResultCategories.Accepted, true, false, false)]
    [InlineData(PushNotificationResultCategories.ProviderUnavailable, false, true, false)]
    [InlineData(PushNotificationResultCategories.InvalidToken, false, false, false)]
    [InlineData(PushNotificationResultCategories.RateLimited, false, true, false)]
    [InlineData(PushNotificationResultCategories.MalformedPayload, false, false, false)]
    public async Task ProviderFeedbackClassificationIsDeterministicAndRedacted(
        string category,
        bool accepted,
        bool retryable,
        bool unconfigured)
    {
        await using var dbContext = CreateDbContext();
        await SeedActivePushTokenAsync(dbContext);
        var providerResult = new PushProviderSendResult(category, accepted, retryable, unconfigured);
        var sender = CreateSender(
            dbContext,
            new PushNotificationOptions { Enabled = true },
            new CapturingPushTokenProtector(),
            new CapturingPushNotificationProvider(providerResult));

        var result = await sender.SendAsync(CreateRequest());

        Assert.Equal(accepted, result.Accepted);
        Assert.Equal(retryable, result.Retryable);
        Assert.Equal(category, result.Category);
        Assert.DoesNotContain(RawProviderToken, result.ToString(), StringComparison.Ordinal);
        Assert.DoesNotContain(ProtectedProviderToken, result.ToString(), StringComparison.Ordinal);
    }

    private static PushNotificationSender CreateSender(
        SettleoraDbContext dbContext,
        PushNotificationOptions options,
        IPushTokenProtector tokenProtector,
        IPushNotificationProvider provider)
    {
        return new PushNotificationSender(dbContext, Options.Create(options), tokenProtector, provider);
    }

    private static async Task<Guid> SeedActivePushTokenAsync(SettleoraDbContext dbContext)
    {
        var tokenId = Guid.NewGuid();
        dbContext.Set<PushDeviceToken>().Add(new PushDeviceToken
        {
            Id = tokenId,
            AuthAccountId = Guid.NewGuid(),
            UserProfileId = RecipientId,
            AuthSessionId = Guid.NewGuid(),
            DeviceInstallationHash = "device-installation-hash-placeholder",
            Platform = PushDeviceTokenPlatforms.Ios,
            Provider = PushDeviceTokenProviders.Apns,
            AppBuildEnvironment = PushDeviceTokenAppBuildEnvironments.Development,
            TokenFingerprint = "token-fingerprint-placeholder",
            ProtectedTokenBlob = ProtectedProviderToken,
            ProtectionKeyId = "test-protection-key",
            ProtectionPurpose = PushTokenProtector.ProtectionPurpose,
            TokenVersion = 1,
            PermissionState = PushDeviceTokenPermissionStates.Authorized,
            Status = PushDeviceTokenStatuses.Active,
            LastSeenAtUtc = Now,
            RegisteredAtUtc = Now,
            CreatedAtUtc = Now,
            UpdatedAtUtc = Now
        });
        await dbContext.SaveChangesAsync();

        return tokenId;
    }

    private static PushNotificationSendRequest CreateRequest()
    {
        return new PushNotificationSendRequest(
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

    private static SettleoraDbContext CreateDbContext()
    {
        return new SettleoraDbContext(new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
    }

    private sealed class CapturingPushTokenProtector : IPushTokenProtector
    {
        public bool UnprotectWasCalled { get; private set; }

        public string? ProtectedBlobSeen { get; private set; }

        public PushTokenProtectionResult Protect(string rawToken)
        {
            return new PushTokenProtectionResult(ProtectedProviderToken, "test-protection-key", PushTokenProtector.ProtectionPurpose);
        }

        public string Unprotect(string protectedTokenBlob)
        {
            UnprotectWasCalled = true;
            ProtectedBlobSeen = protectedTokenBlob;
            return RawProviderToken;
        }
    }

    private sealed class CapturingPushNotificationProvider : IPushNotificationProvider
    {
        private readonly PushProviderSendResult result;

        public CapturingPushNotificationProvider(PushProviderSendResult result)
        {
            this.result = result;
        }

        public bool WasCalled { get; private set; }

        public PushProviderSendRequest? Request { get; private set; }

        public Task<PushProviderSendResult> SendAsync(
            PushProviderSendRequest request,
            CancellationToken cancellationToken = default)
        {
            WasCalled = true;
            Request = request;
            return Task.FromResult(result);
        }
    }
}
