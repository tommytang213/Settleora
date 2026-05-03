using Microsoft.Extensions.Options;

namespace Settleora.Api.Auth.Sessions;

internal sealed class AuthSessionPolicyOptions
{
    public const string SectionName = "Settleora:Auth:Sessions";

    private static readonly TimeSpan MaximumClockSkewAllowance = TimeSpan.FromMinutes(2);

    public TimeSpan CurrentAccessSessionDefaultLifetime { get; init; } = TimeSpan.FromHours(8);

    public TimeSpan CurrentAccessSessionMaxLifetime { get; init; } = TimeSpan.FromDays(30);

    public TimeSpan RefreshAccessSessionDefaultLifetime { get; init; } = TimeSpan.FromMinutes(15);

    public TimeSpan RefreshAccessSessionMaxLifetime { get; init; } = TimeSpan.FromMinutes(30);

    public TimeSpan RefreshIdleTimeout { get; init; } = TimeSpan.FromDays(7);

    public TimeSpan RefreshAbsoluteLifetime { get; init; } = TimeSpan.FromDays(30);

    public TimeSpan ClockSkewAllowance { get; init; } = TimeSpan.FromMinutes(2);

    public TimeSpan ChooseCurrentAccessSessionLifetime(TimeSpan? requestedLifetime)
    {
        if (requestedLifetime is null || requestedLifetime <= TimeSpan.Zero)
        {
            return CurrentAccessSessionDefaultLifetime;
        }

        return requestedLifetime.Value > CurrentAccessSessionMaxLifetime
            ? CurrentAccessSessionMaxLifetime
            : requestedLifetime.Value;
    }

    internal IReadOnlyCollection<string> GetValidationFailures()
    {
        List<string> failures = [];

        RequirePositive(
            CurrentAccessSessionDefaultLifetime,
            nameof(CurrentAccessSessionDefaultLifetime),
            failures);
        RequirePositive(
            CurrentAccessSessionMaxLifetime,
            nameof(CurrentAccessSessionMaxLifetime),
            failures);
        RequirePositive(
            RefreshAccessSessionDefaultLifetime,
            nameof(RefreshAccessSessionDefaultLifetime),
            failures);
        RequirePositive(
            RefreshAccessSessionMaxLifetime,
            nameof(RefreshAccessSessionMaxLifetime),
            failures);
        RequirePositive(
            RefreshIdleTimeout,
            nameof(RefreshIdleTimeout),
            failures);
        RequirePositive(
            RefreshAbsoluteLifetime,
            nameof(RefreshAbsoluteLifetime),
            failures);

        if (CurrentAccessSessionDefaultLifetime > CurrentAccessSessionMaxLifetime)
        {
            failures.Add(
                $"{ConfigKey(nameof(CurrentAccessSessionDefaultLifetime))} must be less than or equal to {ConfigKey(nameof(CurrentAccessSessionMaxLifetime))}.");
        }

        if (RefreshAccessSessionDefaultLifetime > RefreshAccessSessionMaxLifetime)
        {
            failures.Add(
                $"{ConfigKey(nameof(RefreshAccessSessionDefaultLifetime))} must be less than or equal to {ConfigKey(nameof(RefreshAccessSessionMaxLifetime))}.");
        }

        if (RefreshAccessSessionMaxLifetime > RefreshIdleTimeout)
        {
            failures.Add(
                $"{ConfigKey(nameof(RefreshAccessSessionMaxLifetime))} must be less than or equal to {ConfigKey(nameof(RefreshIdleTimeout))}.");
        }

        if (RefreshIdleTimeout > RefreshAbsoluteLifetime)
        {
            failures.Add(
                $"{ConfigKey(nameof(RefreshIdleTimeout))} must be less than or equal to {ConfigKey(nameof(RefreshAbsoluteLifetime))}.");
        }

        if (ClockSkewAllowance < TimeSpan.Zero)
        {
            failures.Add($"{ConfigKey(nameof(ClockSkewAllowance))} must not be negative.");
        }

        if (ClockSkewAllowance > MaximumClockSkewAllowance)
        {
            failures.Add(
                $"{ConfigKey(nameof(ClockSkewAllowance))} must be less than or equal to {MaximumClockSkewAllowance}.");
        }

        return failures;
    }

    private static void RequirePositive(
        TimeSpan value,
        string propertyName,
        ICollection<string> failures)
    {
        if (value <= TimeSpan.Zero)
        {
            failures.Add($"{ConfigKey(propertyName)} must be positive.");
        }
    }

    private static string ConfigKey(string propertyName)
    {
        return $"{SectionName}:{propertyName}";
    }
}

internal sealed class AuthSessionPolicyOptionsValidator : IValidateOptions<AuthSessionPolicyOptions>
{
    public ValidateOptionsResult Validate(string? name, AuthSessionPolicyOptions options)
    {
        var failures = options.GetValidationFailures();

        return failures.Count is 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }
}
