namespace Settleora.Api.Auth.PasswordReset;

internal sealed class PasswordResetAbuseThrottleOptions
{
    public static PasswordResetAbuseThrottleOptions Default { get; } = new();

    public TimeSpan Window { get; init; } = TimeSpan.FromMinutes(15);

    public TimeSpan ThrottleDuration { get; init; } = TimeSpan.FromMinutes(5);

    public TimeSpan EntryRetention { get; init; } = TimeSpan.FromHours(1);

    public int SourceLimit { get; init; } = 20;

    public int IdentifierLimit { get; init; } = 3;

    public int CombinedLimit { get; init; } = 3;

    public int GlobalLimit { get; init; } = 100;

    public int ProviderSendLimit { get; init; } = 3;

    public void Validate()
    {
        RequirePositive(Window, nameof(Window));
        RequirePositive(ThrottleDuration, nameof(ThrottleDuration));
        RequirePositive(EntryRetention, nameof(EntryRetention));
        RequirePositive(SourceLimit, nameof(SourceLimit));
        RequirePositive(IdentifierLimit, nameof(IdentifierLimit));
        RequirePositive(CombinedLimit, nameof(CombinedLimit));
        RequirePositive(GlobalLimit, nameof(GlobalLimit));
        RequirePositive(ProviderSendLimit, nameof(ProviderSendLimit));

        if (EntryRetention < Window)
        {
            throw new InvalidOperationException("Password reset throttle retention must cover the counting window.");
        }

        if (EntryRetention < ThrottleDuration)
        {
            throw new InvalidOperationException("Password reset throttle retention must cover the throttle duration.");
        }
    }

    private static void RequirePositive(TimeSpan value, string name)
    {
        if (value <= TimeSpan.Zero)
        {
            throw new InvalidOperationException($"{name} must be positive.");
        }
    }

    private static void RequirePositive(int value, string name)
    {
        if (value <= 0)
        {
            throw new InvalidOperationException($"{name} must be positive.");
        }
    }
}
