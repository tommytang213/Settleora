namespace Settleora.Api.Auth.PasswordReset;

internal sealed record LocalPasswordResetRequestResult(
    LocalPasswordResetRequestStatus Status)
{
    public static LocalPasswordResetRequestResult Accepted()
    {
        return new LocalPasswordResetRequestResult(LocalPasswordResetRequestStatus.Accepted);
    }
}
