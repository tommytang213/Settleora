namespace Settleora.Api.Auth.SignIn;

internal sealed record SignInAbusePolicyRequest(
    string IdentifierKey,
    string SourceKey)
{
    public override string ToString()
    {
        return "SignInAbusePolicyRequest { IdentifierKey = [redacted], SourceKey = [redacted] }";
    }
}
