namespace Settleora.Api.Auth.PasswordReset;

internal sealed record LocalPasswordResetCompleteResult(
    LocalPasswordResetCompleteStatus Status)
{
    public bool Succeeded => Status == LocalPasswordResetCompleteStatus.Completed;

    public static LocalPasswordResetCompleteResult Completed()
    {
        return new LocalPasswordResetCompleteResult(LocalPasswordResetCompleteStatus.Completed);
    }

    public static LocalPasswordResetCompleteResult Failure(LocalPasswordResetCompleteStatus status)
    {
        return new LocalPasswordResetCompleteResult(status);
    }
}
