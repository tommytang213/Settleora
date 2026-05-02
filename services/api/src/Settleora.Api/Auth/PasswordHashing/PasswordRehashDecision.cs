namespace Settleora.Api.Auth.PasswordHashing;

internal sealed class PasswordRehashDecision
{
    private PasswordRehashDecision(bool required, PasswordRehashReason reason)
    {
        Required = required;
        Reason = reason;
    }

    public bool Required { get; }

    public PasswordRehashReason Reason { get; }

    public static PasswordRehashDecision NotRequired { get; } =
        new PasswordRehashDecision(false, PasswordRehashReason.None);

    public static PasswordRehashDecision RequiredFor(PasswordRehashReason reason)
    {
        return reason is PasswordRehashReason.None
            ? NotRequired
            : new PasswordRehashDecision(true, reason);
    }

    public override string ToString()
    {
        return $"PasswordRehashDecision {{ Required = {Required}, Reason = {Reason} }}";
    }
}
