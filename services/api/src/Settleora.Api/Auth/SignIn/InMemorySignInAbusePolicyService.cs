namespace Settleora.Api.Auth.SignIn;

internal sealed class InMemorySignInAbusePolicyService : ISignInAbusePolicyService
{
    private const int KeyMaxLength = 128;
    private const char CombinedKeySeparator = '\u001f';

    private readonly object syncRoot = new();
    private readonly Dictionary<string, BucketState> sourceBuckets = new(StringComparer.Ordinal);
    private readonly Dictionary<string, BucketState> identifierBuckets = new(StringComparer.Ordinal);
    private readonly Dictionary<string, BucketState> combinedBuckets = new(StringComparer.Ordinal);
    private readonly BucketState globalBucket = new();
    private readonly TimeProvider timeProvider;
    private readonly SignInAbusePolicyOptions options;

    public InMemorySignInAbusePolicyService(
        TimeProvider timeProvider,
        SignInAbusePolicyOptions options)
    {
        this.timeProvider = timeProvider;
        this.options = options;
        this.options.Validate();
    }

    internal int StoredBucketCount
    {
        get
        {
            lock (syncRoot)
            {
                PruneAll(timeProvider.GetUtcNow());

                return sourceBuckets.Count
                    + identifierBuckets.Count
                    + combinedBuckets.Count
                    + (IsEmpty(globalBucket) ? 0 : 1);
            }
        }
    }

    public SignInAbusePreCheckResult CheckPreVerification(SignInAbusePolicyRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var identifierKey = RequireSafeKey(request.IdentifierKey, nameof(request.IdentifierKey));
        var sourceKey = RequireSafeKey(request.SourceKey, nameof(request.SourceKey));
        var combinedKey = CreateCombinedKey(sourceKey, identifierKey);
        var now = timeProvider.GetUtcNow();

        lock (syncRoot)
        {
            PruneAll(now);

            var status = GetPreCheckStatus(sourceKey, identifierKey, combinedKey, now);
            return status is SignInAbusePreCheckStatus.Allowed
                ? SignInAbusePreCheckResult.Allowed()
                : SignInAbusePreCheckResult.Throttled(status);
        }
    }

    public void RecordAttempt(SignInAttemptRecord attempt)
    {
        ArgumentNullException.ThrowIfNull(attempt);
        if (!Enum.IsDefined(attempt.Outcome))
        {
            throw new ArgumentOutOfRangeException(nameof(attempt), "Sign-in attempt outcome must be a bounded policy outcome.");
        }

        var identifierKey = RequireSafeKey(attempt.IdentifierKey, nameof(attempt.IdentifierKey));
        var sourceKey = RequireSafeKey(attempt.SourceKey, nameof(attempt.SourceKey));
        var combinedKey = CreateCombinedKey(sourceKey, identifierKey);
        var now = timeProvider.GetUtcNow();

        lock (syncRoot)
        {
            PruneAll(now);

            if (attempt.Outcome is SignInAttemptOutcome.Succeeded)
            {
                identifierBuckets.Remove(identifierKey);
                combinedBuckets.Remove(combinedKey);
                return;
            }

            RecordCountedAttempt(sourceBuckets, sourceKey, now);
            RecordCountedAttempt(identifierBuckets, identifierKey, now);
            RecordCountedAttempt(combinedBuckets, combinedKey, now);
            RecordCountedAttempt(globalBucket, now);

            ApplyThrottleIfLimitReached(
                sourceBuckets[sourceKey],
                now,
                options.SourceShortWindowLimit,
                longWindowLimit: null);
            ApplyThrottleIfLimitReached(
                identifierBuckets[identifierKey],
                now,
                options.IdentifierShortWindowLimit,
                options.IdentifierLongWindowLimit);
            ApplyThrottleIfLimitReached(
                combinedBuckets[combinedKey],
                now,
                options.CombinedShortWindowLimit,
                options.CombinedLongWindowLimit);
            ApplyThrottleIfLimitReached(
                globalBucket,
                now,
                options.GlobalShortWindowLimit,
                longWindowLimit: null);

            TrimDictionary(sourceBuckets, options.MaxTrackedSourceBuckets);
            TrimDictionary(identifierBuckets, options.MaxTrackedIdentifierBuckets);
            TrimDictionary(combinedBuckets, options.MaxTrackedCombinedBuckets);
        }
    }

    private SignInAbusePreCheckStatus GetPreCheckStatus(
        string sourceKey,
        string identifierKey,
        string combinedKey,
        DateTimeOffset now)
    {
        if (GetBucketPreCheckStatus(
                sourceBuckets.GetValueOrDefault(sourceKey),
                now,
                options.SourceShortWindowLimit,
                longWindowLimit: null,
                SignInAbusePreCheckStatus.ThrottledBySource) is { } sourceStatus)
        {
            return sourceStatus;
        }

        if (GetBucketPreCheckStatus(
                identifierBuckets.GetValueOrDefault(identifierKey),
                now,
                options.IdentifierShortWindowLimit,
                options.IdentifierLongWindowLimit,
                SignInAbusePreCheckStatus.ThrottledByIdentifier) is { } identifierStatus)
        {
            return identifierStatus;
        }

        if (GetBucketPreCheckStatus(
                combinedBuckets.GetValueOrDefault(combinedKey),
                now,
                options.CombinedShortWindowLimit,
                options.CombinedLongWindowLimit,
                SignInAbusePreCheckStatus.ThrottledByCombined) is { } combinedStatus)
        {
            return combinedStatus;
        }

        if (GetBucketPreCheckStatus(
                globalBucket,
                now,
                options.GlobalShortWindowLimit,
                longWindowLimit: null,
                SignInAbusePreCheckStatus.ThrottledGlobally) is { } globalStatus)
        {
            return globalStatus;
        }

        return SignInAbusePreCheckStatus.Allowed;
    }

    private SignInAbusePreCheckStatus? GetBucketPreCheckStatus(
        BucketState? bucket,
        DateTimeOffset now,
        int shortWindowLimit,
        int? longWindowLimit,
        SignInAbusePreCheckStatus throttledStatus)
    {
        if (bucket is null)
        {
            return null;
        }

        if (bucket.ThrottledUntilUtc is { } throttledUntilUtc && throttledUntilUtc > now)
        {
            return throttledStatus;
        }

        if (HasReachedLimit(bucket, now, shortWindowLimit, longWindowLimit))
        {
            bucket.ThrottledUntilUtc = now.Add(options.ThrottleDuration);
            bucket.LastTouchedUtc = now;
            return throttledStatus;
        }

        return null;
    }

    private void ApplyThrottleIfLimitReached(
        BucketState bucket,
        DateTimeOffset now,
        int shortWindowLimit,
        int? longWindowLimit)
    {
        if (bucket.ThrottledUntilUtc is { } throttledUntilUtc && throttledUntilUtc > now)
        {
            return;
        }

        if (HasReachedLimit(bucket, now, shortWindowLimit, longWindowLimit))
        {
            bucket.ThrottledUntilUtc = now.Add(options.ThrottleDuration);
            bucket.LastTouchedUtc = now;
        }
    }

    private bool HasReachedLimit(
        BucketState bucket,
        DateTimeOffset now,
        int shortWindowLimit,
        int? longWindowLimit)
    {
        return CountAttemptsSince(bucket, now.Subtract(options.ShortWindow)) >= shortWindowLimit
            || (longWindowLimit is { } limit
                && CountAttemptsSince(bucket, now.Subtract(options.LongWindow)) >= limit);
    }

    private static int CountAttemptsSince(BucketState bucket, DateTimeOffset cutoffUtc)
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

    private static void RecordCountedAttempt(
        Dictionary<string, BucketState> buckets,
        string key,
        DateTimeOffset now)
    {
        if (!buckets.TryGetValue(key, out var bucket))
        {
            bucket = new BucketState();
            buckets.Add(key, bucket);
        }

        RecordCountedAttempt(bucket, now);
    }

    private static void RecordCountedAttempt(BucketState bucket, DateTimeOffset now)
    {
        bucket.AttemptTimestampsUtc.Enqueue(now);
        bucket.LastTouchedUtc = now;
    }

    private void PruneAll(DateTimeOffset now)
    {
        PruneDictionary(sourceBuckets, now);
        PruneDictionary(identifierBuckets, now);
        PruneDictionary(combinedBuckets, now);
        PruneBucket(globalBucket, now);
    }

    private void PruneDictionary(Dictionary<string, BucketState> buckets, DateTimeOffset now)
    {
        foreach (var key in buckets.Keys.ToArray())
        {
            var bucket = buckets[key];
            PruneBucket(bucket, now);
            if (IsEmpty(bucket))
            {
                buckets.Remove(key);
            }
        }
    }

    private void PruneBucket(BucketState bucket, DateTimeOffset now)
    {
        var retentionCutoffUtc = now.Subtract(options.EntryRetention);
        while (bucket.AttemptTimestampsUtc.Count > 0
            && bucket.AttemptTimestampsUtc.Peek() <= retentionCutoffUtc)
        {
            bucket.AttemptTimestampsUtc.Dequeue();
        }

        if (bucket.ThrottledUntilUtc is { } throttledUntilUtc && throttledUntilUtc <= now)
        {
            bucket.ThrottledUntilUtc = null;
        }
    }

    private static void TrimDictionary(Dictionary<string, BucketState> buckets, int maxTrackedBuckets)
    {
        while (buckets.Count > maxTrackedBuckets)
        {
            string? oldestKey = null;
            var oldestTouchedUtc = DateTimeOffset.MaxValue;

            foreach (var bucket in buckets)
            {
                if (bucket.Value.LastTouchedUtc < oldestTouchedUtc)
                {
                    oldestKey = bucket.Key;
                    oldestTouchedUtc = bucket.Value.LastTouchedUtc;
                }
            }

            if (oldestKey is null)
            {
                return;
            }

            buckets.Remove(oldestKey);
        }
    }

    private static bool IsEmpty(BucketState bucket)
    {
        return bucket.AttemptTimestampsUtc.Count == 0
            && bucket.ThrottledUntilUtc is null;
    }

    private static string RequireSafeKey(string key, string parameterName)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            throw new ArgumentException("Sign-in abuse policy bucket keys must be non-blank bounded safe values.", parameterName);
        }

        var trimmed = key.Trim();
        if (trimmed.Length > KeyMaxLength)
        {
            throw new ArgumentException("Sign-in abuse policy bucket keys must be non-blank bounded safe values.", parameterName);
        }

        foreach (var character in trimmed)
        {
            if (!IsSafeKeyCharacter(character))
            {
                throw new ArgumentException("Sign-in abuse policy bucket keys must be non-blank bounded safe values.", parameterName);
            }
        }

        return trimmed;
    }

    private static bool IsSafeKeyCharacter(char character)
    {
        return character is >= 'a' and <= 'z'
            or >= 'A' and <= 'Z'
            or >= '0' and <= '9'
            or '_'
            or '-'
            or '.'
            or ':';
    }

    private static string CreateCombinedKey(string sourceKey, string identifierKey)
    {
        return string.Concat(sourceKey, CombinedKeySeparator, identifierKey);
    }

    private sealed class BucketState
    {
        public Queue<DateTimeOffset> AttemptTimestampsUtc { get; } = new();

        public DateTimeOffset? ThrottledUntilUtc { get; set; }

        public DateTimeOffset LastTouchedUtc { get; set; } = DateTimeOffset.MinValue;
    }
}
