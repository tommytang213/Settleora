namespace Settleora.Api.Auth.PasswordReset;

internal sealed class InMemoryPasswordResetAbuseThrottlePolicy : IPasswordResetAbuseThrottlePolicy
{
    private const char CombinedKeySeparator = '\u001f';

    private readonly object syncRoot = new();
    private readonly Dictionary<string, BucketState> sourceBuckets = new(StringComparer.Ordinal);
    private readonly Dictionary<string, BucketState> identifierBuckets = new(StringComparer.Ordinal);
    private readonly Dictionary<string, BucketState> combinedBuckets = new(StringComparer.Ordinal);
    private readonly Dictionary<string, BucketState> providerSendBuckets = new(StringComparer.Ordinal);
    private readonly BucketState globalBucket = new();
    private readonly TimeProvider timeProvider;
    private readonly PasswordResetAbuseThrottleOptions options;

    public InMemoryPasswordResetAbuseThrottlePolicy(
        TimeProvider timeProvider,
        PasswordResetAbuseThrottleOptions options)
    {
        this.timeProvider = timeProvider;
        this.options = options;
        this.options.Validate();
    }

    public PasswordResetThrottleDecision CheckRequest(PasswordResetThrottleRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = timeProvider.GetUtcNow();
        var sourceKey = request.SourceKey;
        var identifierKey = request.IdentifierKey;
        var combinedKey = CreateCombinedKey(sourceKey, identifierKey);

        lock (syncRoot)
        {
            PruneAll(now);

            return GetBlockedDecision(sourceBuckets.GetValueOrDefault(sourceKey), now, options.SourceLimit, PasswordResetThrottleScopes.Source)
                ?? GetBlockedDecision(identifierBuckets.GetValueOrDefault(identifierKey), now, options.IdentifierLimit, PasswordResetThrottleScopes.Identifier)
                ?? GetBlockedDecision(combinedBuckets.GetValueOrDefault(combinedKey), now, options.CombinedLimit, PasswordResetThrottleScopes.Combined)
                ?? GetBlockedDecision(globalBucket, now, options.GlobalLimit, PasswordResetThrottleScopes.Global)
                ?? PasswordResetThrottleDecision.Allow(PasswordResetThrottleCategories.Request);
        }
    }

    public PasswordResetThrottleDecision CheckProviderSend(PasswordResetThrottleRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = timeProvider.GetUtcNow();
        var providerKey = CreateProviderSendKey(request.SourceKey, request.IdentifierKey);

        lock (syncRoot)
        {
            PruneAll(now);

            return GetBlockedDecision(
                    providerSendBuckets.GetValueOrDefault(providerKey),
                    now,
                    options.ProviderSendLimit,
                    PasswordResetThrottleScopes.ProviderSend,
                    PasswordResetThrottleCategories.ProviderSend)
                ?? PasswordResetThrottleDecision.Allow(PasswordResetThrottleCategories.ProviderSend);
        }
    }

    public void RecordRequestAttempt(PasswordResetThrottleRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = timeProvider.GetUtcNow();
        var sourceKey = request.SourceKey;
        var identifierKey = request.IdentifierKey;
        var combinedKey = CreateCombinedKey(sourceKey, identifierKey);

        lock (syncRoot)
        {
            PruneAll(now);
            Record(sourceBuckets, sourceKey, now);
            Record(identifierBuckets, identifierKey, now);
            Record(combinedBuckets, combinedKey, now);
            Record(globalBucket, now);
            ApplyThrottle(sourceBuckets[sourceKey], now, options.SourceLimit);
            ApplyThrottle(identifierBuckets[identifierKey], now, options.IdentifierLimit);
            ApplyThrottle(combinedBuckets[combinedKey], now, options.CombinedLimit);
            ApplyThrottle(globalBucket, now, options.GlobalLimit);
        }
    }

    public void RecordProviderSendAttempt(PasswordResetThrottleRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = timeProvider.GetUtcNow();
        var providerKey = CreateProviderSendKey(request.SourceKey, request.IdentifierKey);

        lock (syncRoot)
        {
            PruneAll(now);
            Record(providerSendBuckets, providerKey, now);
            ApplyThrottle(providerSendBuckets[providerKey], now, options.ProviderSendLimit);
        }
    }

    private PasswordResetThrottleDecision? GetBlockedDecision(
        BucketState? bucket,
        DateTimeOffset now,
        int limit,
        string scope,
        string category = PasswordResetThrottleCategories.Request)
    {
        if (bucket is null)
        {
            return null;
        }

        if (bucket.ThrottledUntilUtc is { } throttledUntilUtc && throttledUntilUtc > now)
        {
            return PasswordResetThrottleDecision.Block(category, scope);
        }

        if (CountSince(bucket, now.Subtract(options.Window)) >= limit)
        {
            bucket.ThrottledUntilUtc = now.Add(options.ThrottleDuration);
            bucket.LastTouchedUtc = now;
            return PasswordResetThrottleDecision.Block(category, scope);
        }

        return null;
    }

    private void ApplyThrottle(BucketState bucket, DateTimeOffset now, int limit)
    {
        if (bucket.ThrottledUntilUtc is { } throttledUntilUtc && throttledUntilUtc > now)
        {
            return;
        }

        if (CountSince(bucket, now.Subtract(options.Window)) >= limit)
        {
            bucket.ThrottledUntilUtc = now.Add(options.ThrottleDuration);
            bucket.LastTouchedUtc = now;
        }
    }

    private static int CountSince(BucketState bucket, DateTimeOffset cutoffUtc)
    {
        var count = 0;
        foreach (var timestamp in bucket.AttemptTimestampsUtc)
        {
            if (timestamp > cutoffUtc)
            {
                count++;
            }
        }

        return count;
    }

    private static void Record(Dictionary<string, BucketState> buckets, string key, DateTimeOffset now)
    {
        if (!buckets.TryGetValue(key, out var bucket))
        {
            bucket = new BucketState();
            buckets.Add(key, bucket);
        }

        Record(bucket, now);
    }

    private static void Record(BucketState bucket, DateTimeOffset now)
    {
        bucket.AttemptTimestampsUtc.Enqueue(now);
        bucket.LastTouchedUtc = now;
    }

    private void PruneAll(DateTimeOffset now)
    {
        Prune(sourceBuckets, now);
        Prune(identifierBuckets, now);
        Prune(combinedBuckets, now);
        Prune(providerSendBuckets, now);
        Prune(globalBucket, now);
    }

    private void Prune(Dictionary<string, BucketState> buckets, DateTimeOffset now)
    {
        foreach (var key in buckets.Keys.ToArray())
        {
            var bucket = buckets[key];
            Prune(bucket, now);
            if (bucket.AttemptTimestampsUtc.Count == 0 && bucket.ThrottledUntilUtc is null)
            {
                buckets.Remove(key);
            }
        }
    }

    private void Prune(BucketState bucket, DateTimeOffset now)
    {
        var cutoffUtc = now.Subtract(options.EntryRetention);
        while (bucket.AttemptTimestampsUtc.Count > 0 && bucket.AttemptTimestampsUtc.Peek() <= cutoffUtc)
        {
            bucket.AttemptTimestampsUtc.Dequeue();
        }

        if (bucket.ThrottledUntilUtc is { } throttledUntilUtc && throttledUntilUtc <= now)
        {
            bucket.ThrottledUntilUtc = null;
        }
    }

    private static string CreateCombinedKey(string sourceKey, string identifierKey)
    {
        return string.Concat(sourceKey, CombinedKeySeparator, identifierKey);
    }

    private static string CreateProviderSendKey(string sourceKey, string identifierKey)
    {
        return string.Concat("provider", CombinedKeySeparator, sourceKey, CombinedKeySeparator, identifierKey);
    }

    private sealed class BucketState
    {
        public Queue<DateTimeOffset> AttemptTimestampsUtc { get; } = new();

        public DateTimeOffset LastTouchedUtc { get; set; }

        public DateTimeOffset? ThrottledUntilUtc { get; set; }
    }
}
