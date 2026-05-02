using Microsoft.Extensions.DependencyInjection;
using Settleora.Api.Auth.SignIn;

namespace Settleora.Api.Tests;

public sealed class SignInAbusePolicyServiceTests
{
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 3, 9, 0, 0, TimeSpan.Zero);

    [Fact]
    public void FirstAttemptIsAllowed()
    {
        var service = CreateService();

        var result = service.CheckPreVerification(new SignInAbusePolicyRequest("id:first", "src:first"));

        Assert.True(result.IsAllowed);
        Assert.Equal(SignInAbusePreCheckStatus.Allowed, result.Status);
    }

    [Fact]
    public void RepeatedFailuresForSameSourceThrottleBySource()
    {
        var service = CreateService(CreateOptions(sourceShortWindowLimit: 2));

        service.RecordAttempt(Failed("id:one", "src:shared"));
        service.RecordAttempt(Failed("id:two", "src:shared"));

        var result = service.CheckPreVerification(new SignInAbusePolicyRequest("id:three", "src:shared"));

        Assert.False(result.IsAllowed);
        Assert.Equal(SignInAbusePreCheckStatus.ThrottledBySource, result.Status);
    }

    [Fact]
    public void RepeatedFailuresForSameIdentifierThrottleByIdentifier()
    {
        var service = CreateService(CreateOptions(identifierShortWindowLimit: 2));

        service.RecordAttempt(Failed("id:shared", "src:one"));
        service.RecordAttempt(Failed("id:shared", "src:two"));

        var result = service.CheckPreVerification(new SignInAbusePolicyRequest("id:shared", "src:three"));

        Assert.False(result.IsAllowed);
        Assert.Equal(SignInAbusePreCheckStatus.ThrottledByIdentifier, result.Status);
    }

    [Fact]
    public void RepeatedFailuresForSameSourceAndIdentifierThrottleByCombinedBucket()
    {
        var service = CreateService(CreateOptions(combinedShortWindowLimit: 2));

        service.RecordAttempt(Failed("id:shared", "src:shared"));
        service.RecordAttempt(Failed("id:shared", "src:shared"));

        var result = service.CheckPreVerification(new SignInAbusePolicyRequest("id:shared", "src:shared"));

        Assert.False(result.IsAllowed);
        Assert.Equal(SignInAbusePreCheckStatus.ThrottledByCombined, result.Status);
    }

    [Fact]
    public void GlobalBurstEventuallyThrottlesGlobally()
    {
        var service = CreateService(CreateOptions(globalShortWindowLimit: 3));

        service.RecordAttempt(Failed("id:one", "src:one"));
        service.RecordAttempt(Failed("id:two", "src:two"));
        service.RecordAttempt(Failed("id:three", "src:three"));

        var result = service.CheckPreVerification(new SignInAbusePolicyRequest("id:four", "src:four"));

        Assert.False(result.IsAllowed);
        Assert.Equal(SignInAbusePreCheckStatus.ThrottledGlobally, result.Status);
    }

    [Fact]
    public void SuccessClearsIdentifierAndCombinedCountersForThatAttempt()
    {
        var service = CreateService(CreateOptions(identifierShortWindowLimit: 2));

        service.RecordAttempt(Failed("id:shared", "src:one"));
        service.RecordAttempt(Failed("id:shared", "src:two"));
        var throttledResult = service.CheckPreVerification(new SignInAbusePolicyRequest("id:shared", "src:three"));

        service.RecordAttempt(new SignInAttemptRecord("id:shared", "src:three", SignInAttemptOutcome.Succeeded));
        var resultAfterSuccess = service.CheckPreVerification(new SignInAbusePolicyRequest("id:shared", "src:four"));

        Assert.Equal(SignInAbusePreCheckStatus.ThrottledByIdentifier, throttledResult.Status);
        Assert.True(resultAfterSuccess.IsAllowed);
        Assert.Equal(SignInAbusePreCheckStatus.Allowed, resultAfterSuccess.Status);
    }

    [Fact]
    public void ThrottleExpiresAfterWindowAndThrottleDurationPass()
    {
        var timeProvider = new MutableTimeProvider(InitialTimestamp);
        var service = CreateService(
            CreateOptions(
                sourceShortWindowLimit: 2,
                shortWindow: TimeSpan.FromSeconds(10),
                longWindow: TimeSpan.FromSeconds(10),
                throttleDuration: TimeSpan.FromSeconds(5),
                entryRetention: TimeSpan.FromSeconds(20)),
            timeProvider);

        service.RecordAttempt(Failed("id:one", "src:shared"));
        service.RecordAttempt(Failed("id:two", "src:shared"));
        var throttledResult = service.CheckPreVerification(new SignInAbusePolicyRequest("id:three", "src:shared"));

        timeProvider.Advance(TimeSpan.FromSeconds(11));
        var resultAfterWindow = service.CheckPreVerification(new SignInAbusePolicyRequest("id:four", "src:shared"));

        Assert.Equal(SignInAbusePreCheckStatus.ThrottledBySource, throttledResult.Status);
        Assert.True(resultAfterWindow.IsAllowed);
        Assert.Equal(SignInAbusePreCheckStatus.Allowed, resultAfterWindow.Status);
    }

    [Fact]
    public void DifferentIdentifiersAndSourcesDoNotPoisonEachOtherExceptGlobalBucket()
    {
        var service = CreateService(CreateOptions(combinedShortWindowLimit: 2));

        service.RecordAttempt(Failed("id:one", "src:one"));
        service.RecordAttempt(Failed("id:one", "src:one"));

        var samePairResult = service.CheckPreVerification(new SignInAbusePolicyRequest("id:one", "src:one"));
        var differentPairResult = service.CheckPreVerification(new SignInAbusePolicyRequest("id:two", "src:two"));

        Assert.Equal(SignInAbusePreCheckStatus.ThrottledByCombined, samePairResult.Status);
        Assert.True(differentPairResult.IsAllowed);
    }

    [Fact]
    public void BlankOrInvalidKeysAreRejectedSafely()
    {
        var service = CreateService();
        var oversizedKey = new string('a', 129);

        Assert.Throws<ArgumentException>(() =>
            service.CheckPreVerification(new SignInAbusePolicyRequest(" ", "src:safe")));
        Assert.Throws<ArgumentException>(() =>
            service.CheckPreVerification(new SignInAbusePolicyRequest(oversizedKey, "src:safe")));
        Assert.Throws<ArgumentException>(() =>
            service.RecordAttempt(Failed("id:safe", "src/unsafe")));
    }

    [Fact]
    public void ResultAndRequestStringsDoNotExposeIdentifierOrSourceKeys()
    {
        const string identifierKey = "id:visible-result-key";
        const string sourceKey = "src:visible-result-key";
        var service = CreateService();

        var request = new SignInAbusePolicyRequest(identifierKey, sourceKey);
        var result = service.CheckPreVerification(request);
        var attempt = new SignInAttemptRecord(identifierKey, sourceKey, SignInAttemptOutcome.Failed);

        Assert.DoesNotContain(identifierKey, request.ToString());
        Assert.DoesNotContain(sourceKey, request.ToString());
        Assert.DoesNotContain(identifierKey, result.ToString());
        Assert.DoesNotContain(sourceKey, result.ToString());
        Assert.DoesNotContain(identifierKey, attempt.ToString());
        Assert.DoesNotContain(sourceKey, attempt.ToString());
    }

    [Fact]
    public void StorageIsPrunedAfterRetentionWindow()
    {
        var timeProvider = new MutableTimeProvider(InitialTimestamp);
        var service = CreateService(
            CreateOptions(
                shortWindow: TimeSpan.FromSeconds(1),
                longWindow: TimeSpan.FromSeconds(2),
                throttleDuration: TimeSpan.FromSeconds(1),
                entryRetention: TimeSpan.FromSeconds(5)),
            timeProvider);

        for (var index = 0; index < 10; index++)
        {
            service.RecordAttempt(Failed($"id:{index}", $"src:{index}"));
        }

        Assert.True(service.StoredBucketCount > 0);

        timeProvider.Advance(TimeSpan.FromSeconds(6));

        Assert.Equal(0, service.StoredBucketCount);
    }

    [Fact]
    public void DiRegistrationResolvesSingletonPolicyService()
    {
        var services = new ServiceCollection();
        services.AddSignInAbusePolicy();

        using var serviceProvider = services.BuildServiceProvider();

        var policyService = serviceProvider.GetRequiredService<ISignInAbusePolicyService>();
        var secondPolicyService = serviceProvider.GetRequiredService<ISignInAbusePolicyService>();
        var timeProvider = serviceProvider.GetRequiredService<TimeProvider>();

        Assert.IsType<InMemorySignInAbusePolicyService>(policyService);
        Assert.Same(policyService, secondPolicyService);
        Assert.Same(TimeProvider.System, timeProvider);
    }

    private static InMemorySignInAbusePolicyService CreateService(
        SignInAbusePolicyOptions? options = null,
        MutableTimeProvider? timeProvider = null)
    {
        return new InMemorySignInAbusePolicyService(
            timeProvider ?? new MutableTimeProvider(InitialTimestamp),
            options ?? CreateOptions());
    }

    private static SignInAttemptRecord Failed(string identifierKey, string sourceKey)
    {
        return new SignInAttemptRecord(identifierKey, sourceKey, SignInAttemptOutcome.Failed);
    }

    private static SignInAbusePolicyOptions CreateOptions(
        int sourceShortWindowLimit = 50,
        int identifierShortWindowLimit = 50,
        int combinedShortWindowLimit = 50,
        int globalShortWindowLimit = 500,
        int identifierLongWindowLimit = 500,
        int combinedLongWindowLimit = 500,
        TimeSpan? shortWindow = null,
        TimeSpan? longWindow = null,
        TimeSpan? throttleDuration = null,
        TimeSpan? entryRetention = null)
    {
        return new SignInAbusePolicyOptions
        {
            SourceShortWindowLimit = sourceShortWindowLimit,
            IdentifierShortWindowLimit = identifierShortWindowLimit,
            CombinedShortWindowLimit = combinedShortWindowLimit,
            GlobalShortWindowLimit = globalShortWindowLimit,
            IdentifierLongWindowLimit = identifierLongWindowLimit,
            CombinedLongWindowLimit = combinedLongWindowLimit,
            ShortWindow = shortWindow ?? TimeSpan.FromMinutes(1),
            LongWindow = longWindow ?? TimeSpan.FromMinutes(15),
            ThrottleDuration = throttleDuration ?? TimeSpan.FromMinutes(1),
            EntryRetention = entryRetention ?? TimeSpan.FromMinutes(30)
        };
    }

    private sealed class MutableTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public MutableTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow()
        {
            return utcNow;
        }

        public void Advance(TimeSpan duration)
        {
            utcNow = utcNow.Add(duration);
        }
    }
}
