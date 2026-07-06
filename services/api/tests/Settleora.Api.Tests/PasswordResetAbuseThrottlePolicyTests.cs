using Settleora.Api.Auth.PasswordReset;

namespace Settleora.Api.Tests;

public sealed class PasswordResetAbuseThrottlePolicyTests
{
    private const string SubmittedIdentifier = "Reset.User+Case@Example.COM";
    private const string SourceBucket = "src.reset";

    [Fact]
    public void RepeatedResetRequestsThrottleBeforeFurtherMaterialIssuance()
    {
        var service = CreateService(new PasswordResetAbuseThrottleOptions
        {
            Window = TimeSpan.FromMinutes(15),
            ThrottleDuration = TimeSpan.FromMinutes(5),
            EntryRetention = TimeSpan.FromHours(1),
            SourceLimit = 10,
            IdentifierLimit = 2,
            CombinedLimit = 10,
            GlobalLimit = 50,
            ProviderSendLimit = 10
        });
        var request = CreateRequest();

        Assert.True(service.CheckRequest(request).Allowed);
        service.RecordRequestAttempt(request);
        Assert.True(service.CheckRequest(request).Allowed);
        service.RecordRequestAttempt(request);

        var throttled = service.CheckRequest(request);

        Assert.False(throttled.Allowed);
        Assert.Equal(PasswordResetThrottleStatuses.Throttled, throttled.Status);
        Assert.Equal(PasswordResetThrottleCategories.Request, throttled.Category);
        Assert.Equal(PasswordResetThrottleScopes.Identifier, throttled.Scope);
        AssertSafeDecision(throttled);
    }

    [Fact]
    public void RepeatedProviderSendAttemptsThrottleBeforeFurtherSmtpHandoff()
    {
        var service = CreateService(new PasswordResetAbuseThrottleOptions
        {
            Window = TimeSpan.FromMinutes(15),
            ThrottleDuration = TimeSpan.FromMinutes(5),
            EntryRetention = TimeSpan.FromHours(1),
            SourceLimit = 10,
            IdentifierLimit = 10,
            CombinedLimit = 10,
            GlobalLimit = 50,
            ProviderSendLimit = 1
        });
        var request = CreateRequest();

        Assert.True(service.CheckProviderSend(request).Allowed);
        service.RecordProviderSendAttempt(request);

        var throttled = service.CheckProviderSend(request);

        Assert.False(throttled.Allowed);
        Assert.Equal(PasswordResetThrottleCategories.ProviderSend, throttled.Category);
        Assert.Equal(PasswordResetThrottleScopes.ProviderSend, throttled.Scope);
        AssertSafeDecision(throttled);
    }

    [Fact]
    public void ThrottleRequestsDoNotExposeRawIdentifierInReadbacks()
    {
        var request = CreateRequest();
        var readback = string.Join(
            " ",
            request.ToString(),
            request.IdentifierKey,
            request.SourceKey);

        Assert.DoesNotContain(SubmittedIdentifier, readback, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(SubmittedIdentifier.ToLowerInvariant(), readback, StringComparison.OrdinalIgnoreCase);
        Assert.StartsWith("reset-id-sha256:", request.IdentifierKey, StringComparison.Ordinal);
    }

    private static InMemoryPasswordResetAbuseThrottlePolicy CreateService(
        PasswordResetAbuseThrottleOptions options)
    {
        return new InMemoryPasswordResetAbuseThrottlePolicy(
            new TestTimeProvider(new DateTimeOffset(2026, 7, 6, 19, 0, 0, TimeSpan.Zero)),
            options);
    }

    private static PasswordResetThrottleRequest CreateRequest()
    {
        return new PasswordResetThrottleRequest(
            SubmittedIdentifier,
            SourceBucket,
            "corr.reset");
    }

    private static void AssertSafeDecision(PasswordResetThrottleDecision decision)
    {
        var readback = decision.ToString();
        Assert.DoesNotContain(SubmittedIdentifier, readback, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(SourceBucket, readback, StringComparison.OrdinalIgnoreCase);
    }

    private sealed class TestTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset utcNow;

        public TestTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow()
        {
            return utcNow;
        }
    }
}
