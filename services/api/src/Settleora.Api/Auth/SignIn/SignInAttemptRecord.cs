namespace Settleora.Api.Auth.SignIn;

internal sealed record SignInAttemptRecord(
    string IdentifierKey,
    string SourceKey,
    SignInAttemptOutcome Outcome)
{
    public override string ToString()
    {
        return $"SignInAttemptRecord {{ IdentifierKey = [redacted], SourceKey = [redacted], Outcome = {Outcome} }}";
    }
}
