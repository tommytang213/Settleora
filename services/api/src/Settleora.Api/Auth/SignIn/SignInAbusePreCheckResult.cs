namespace Settleora.Api.Auth.SignIn;

internal sealed class SignInAbusePreCheckResult
{
    private SignInAbusePreCheckResult(SignInAbusePreCheckStatus status)
    {
        Status = status;
    }

    public bool IsAllowed => Status is SignInAbusePreCheckStatus.Allowed;

    public SignInAbusePreCheckStatus Status { get; }

    public static SignInAbusePreCheckResult Allowed()
    {
        return new SignInAbusePreCheckResult(SignInAbusePreCheckStatus.Allowed);
    }

    public static SignInAbusePreCheckResult Throttled(SignInAbusePreCheckStatus status)
    {
        if (status is SignInAbusePreCheckStatus.Allowed)
        {
            throw new ArgumentException("A throttled sign-in abuse policy result requires a throttled status.", nameof(status));
        }

        return new SignInAbusePreCheckResult(status);
    }

    public override string ToString()
    {
        return $"SignInAbusePreCheckResult {{ IsAllowed = {IsAllowed}, Status = {Status} }}";
    }
}
