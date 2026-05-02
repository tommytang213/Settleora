namespace Settleora.Api.Auth.SignIn;

internal sealed class SignInAbusePolicyOptions
{
    public static SignInAbusePolicyOptions Default { get; } = new();

    public TimeSpan ShortWindow { get; init; } = TimeSpan.FromMinutes(1);

    public TimeSpan LongWindow { get; init; } = TimeSpan.FromMinutes(15);

    public TimeSpan ThrottleDuration { get; init; } = TimeSpan.FromMinutes(1);

    public TimeSpan EntryRetention { get; init; } = TimeSpan.FromMinutes(30);

    public int SourceShortWindowLimit { get; init; } = 20;

    public int IdentifierShortWindowLimit { get; init; } = 8;

    public int CombinedShortWindowLimit { get; init; } = 5;

    public int GlobalShortWindowLimit { get; init; } = 100;

    public int IdentifierLongWindowLimit { get; init; } = 24;

    public int CombinedLongWindowLimit { get; init; } = 12;

    public int MaxTrackedSourceBuckets { get; init; } = 4096;

    public int MaxTrackedIdentifierBuckets { get; init; } = 4096;

    public int MaxTrackedCombinedBuckets { get; init; } = 8192;

    public void Validate()
    {
        RequirePositive(ShortWindow, nameof(ShortWindow));
        RequirePositive(LongWindow, nameof(LongWindow));
        RequirePositive(ThrottleDuration, nameof(ThrottleDuration));
        RequirePositive(EntryRetention, nameof(EntryRetention));
        RequirePositive(SourceShortWindowLimit, nameof(SourceShortWindowLimit));
        RequirePositive(IdentifierShortWindowLimit, nameof(IdentifierShortWindowLimit));
        RequirePositive(CombinedShortWindowLimit, nameof(CombinedShortWindowLimit));
        RequirePositive(GlobalShortWindowLimit, nameof(GlobalShortWindowLimit));
        RequirePositive(IdentifierLongWindowLimit, nameof(IdentifierLongWindowLimit));
        RequirePositive(CombinedLongWindowLimit, nameof(CombinedLongWindowLimit));
        RequirePositive(MaxTrackedSourceBuckets, nameof(MaxTrackedSourceBuckets));
        RequirePositive(MaxTrackedIdentifierBuckets, nameof(MaxTrackedIdentifierBuckets));
        RequirePositive(MaxTrackedCombinedBuckets, nameof(MaxTrackedCombinedBuckets));

        var minimumRetention = ShortWindow > LongWindow ? ShortWindow : LongWindow;
        if (ThrottleDuration > minimumRetention)
        {
            minimumRetention = ThrottleDuration;
        }

        if (EntryRetention < minimumRetention)
        {
            throw new InvalidOperationException("Sign-in abuse policy retention must cover the configured windows and throttle duration.");
        }
    }

    private static void RequirePositive(TimeSpan value, string name)
    {
        if (value <= TimeSpan.Zero)
        {
            throw new InvalidOperationException($"Sign-in abuse policy option '{name}' must be positive.");
        }
    }

    private static void RequirePositive(int value, string name)
    {
        if (value <= 0)
        {
            throw new InvalidOperationException($"Sign-in abuse policy option '{name}' must be positive.");
        }
    }
}
