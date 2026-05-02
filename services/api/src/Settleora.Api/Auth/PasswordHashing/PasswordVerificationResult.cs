namespace Settleora.Api.Auth.PasswordHashing;

internal sealed class PasswordVerificationResult
{
    private PasswordVerificationResult(PasswordVerificationStatus status, PasswordRehashDecision rehashDecision)
    {
        Status = status;
        RehashDecision = rehashDecision;
    }

    public bool Succeeded => Status is PasswordVerificationStatus.Verified;

    public PasswordVerificationStatus Status { get; }

    public bool RequiresRehash => RehashDecision.Required;

    public PasswordRehashDecision RehashDecision { get; }

    public static PasswordVerificationResult Verified(PasswordRehashDecision rehashDecision)
    {
        return new PasswordVerificationResult(PasswordVerificationStatus.Verified, rehashDecision);
    }

    public static PasswordVerificationResult Failure(PasswordVerificationStatus status)
    {
        return new PasswordVerificationResult(status, PasswordRehashDecision.NotRequired);
    }

    public override string ToString()
    {
        return $"PasswordVerificationResult {{ Succeeded = {Succeeded}, Status = {Status}, RequiresRehash = {RequiresRehash}, RehashReason = {RehashDecision.Reason} }}";
    }
}
