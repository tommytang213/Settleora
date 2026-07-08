namespace Settleora.Api.Auth.Invitations;

internal sealed class InMemoryInvitationAbusePolicyService : IInvitationAbusePolicyService
{
    private const char CombinedKeySeparator = '\u001f';

    private readonly object syncRoot = new();
    private readonly Dictionary<string, BucketState> sourceBuckets = new(StringComparer.Ordinal);
    private readonly Dictionary<string, BucketState> actorBuckets = new(StringComparer.Ordinal);
    private readonly Dictionary<string, BucketState> subjectBuckets = new(StringComparer.Ordinal);
    private readonly Dictionary<string, BucketState> actorSubjectBuckets = new(StringComparer.Ordinal);
    private readonly Dictionary<string, BucketState> globalBuckets = new(StringComparer.Ordinal);
    private readonly TimeProvider timeProvider;
    private readonly InvitationAbusePolicyOptions options;

    public InMemoryInvitationAbusePolicyService(
        TimeProvider timeProvider,
        InvitationAbusePolicyOptions options)
    {
        this.timeProvider = timeProvider;
        this.options = options;
        this.options.Validate();
    }

    public InvitationAbusePolicyDecision CheckAttempt(InvitationAbusePolicyRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var now = timeProvider.GetUtcNow();
        var sourceKey = CreateScopedKey(request.OperationKey, request.SourceKey);
        var actorKey = CreateScopedKey(request.OperationKey, request.ActorKey);
        var subjectKey = CreateScopedKey(request.OperationKey, request.SubjectKey);
        var actorSubjectKey = CreateCombinedKey(actorKey, subjectKey);
        var globalKey = request.OperationKey;

        lock (syncRoot)
        {
            PruneAll(now);

            return GetBlockedDecision(sourceBuckets.GetValueOrDefault(sourceKey), now, options.SourceLimit, InvitationAbusePolicyScopes.Source)
                ?? GetBlockedDecision(actorBuckets.GetValueOrDefault(actorKey), now, options.ActorLimit, InvitationAbusePolicyScopes.Actor)
                ?? GetBlockedDecision(subjectBuckets.GetValueOrDefault(subjectKey), now, options.SubjectLimit, InvitationAbusePolicyScopes.Subject)
                ?? GetBlockedDecision(actorSubjectBuckets.GetValueOrDefault(actorSubjectKey), now, options.ActorSubjectLimit, InvitationAbusePolicyScopes.ActorSubject)
                ?? GetBlockedDecision(globalBuckets.GetValueOrDefault(globalKey), now, options.GlobalLimit, InvitationAbusePolicyScopes.Global)
                ?? InvitationAbusePolicyDecision.Allow();
        }
    }

    public void RecordAttempt(InvitationAbusePolicyRequest request, InvitationAbusePolicyOutcome outcome)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (!Enum.IsDefined(outcome))
        {
            throw new ArgumentOutOfRangeException(nameof(outcome), "Invitation abuse policy outcome must be bounded.");
        }

        var now = timeProvider.GetUtcNow();
        var sourceKey = CreateScopedKey(request.OperationKey, request.SourceKey);
        var actorKey = CreateScopedKey(request.OperationKey, request.ActorKey);
        var subjectKey = CreateScopedKey(request.OperationKey, request.SubjectKey);
        var actorSubjectKey = CreateCombinedKey(actorKey, subjectKey);
        var globalKey = request.OperationKey;

        lock (syncRoot)
        {
            PruneAll(now);

            if (outcome is InvitationAbusePolicyOutcome.Succeeded
                && request.OperationCategory == InvitationAbusePolicyOperations.Accept)
            {
                subjectBuckets.Remove(subjectKey);
                actorSubjectBuckets.Remove(actorSubjectKey);
                return;
            }

            Record(sourceBuckets, sourceKey, now);
            Record(actorBuckets, actorKey, now);
            Record(subjectBuckets, subjectKey, now);
            Record(actorSubjectBuckets, actorSubjectKey, now);
            Record(globalBuckets, globalKey, now);

            ApplyThrottle(sourceBuckets[sourceKey], now, options.SourceLimit);
            ApplyThrottle(actorBuckets[actorKey], now, options.ActorLimit);
            ApplyThrottle(subjectBuckets[subjectKey], now, options.SubjectLimit);
            ApplyThrottle(actorSubjectBuckets[actorSubjectKey], now, options.ActorSubjectLimit);
            ApplyThrottle(globalBuckets[globalKey], now, options.GlobalLimit);
        }
    }

    private InvitationAbusePolicyDecision? GetBlockedDecision(
        BucketState? bucket,
        DateTimeOffset now,
        int limit,
        string scope)
    {
        if (bucket is null)
        {
            return null;
        }

        if (bucket.ThrottledUntilUtc is { } throttledUntilUtc && throttledUntilUtc > now)
        {
            return InvitationAbusePolicyDecision.Throttle(scope);
        }

        if (CountSince(bucket, now.Subtract(options.Window)) >= limit)
        {
            bucket.ThrottledUntilUtc = now.Add(options.ThrottleDuration);
            bucket.LastTouchedUtc = now;
            return InvitationAbusePolicyDecision.Throttle(scope);
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
        Prune(actorBuckets, now);
        Prune(subjectBuckets, now);
        Prune(actorSubjectBuckets, now);
        Prune(globalBuckets, now);
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

    private static string CreateScopedKey(string operationKey, string key)
    {
        return string.Concat(operationKey, CombinedKeySeparator, key);
    }

    private static string CreateCombinedKey(string actorKey, string subjectKey)
    {
        return string.Concat(actorKey, CombinedKeySeparator, subjectKey);
    }

    private sealed class BucketState
    {
        public Queue<DateTimeOffset> AttemptTimestampsUtc { get; } = new();

        public DateTimeOffset LastTouchedUtc { get; set; }

        public DateTimeOffset? ThrottledUntilUtc { get; set; }
    }
}
