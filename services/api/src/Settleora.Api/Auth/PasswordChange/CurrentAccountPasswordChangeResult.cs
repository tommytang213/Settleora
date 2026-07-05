namespace Settleora.Api.Auth.PasswordChange;

internal sealed class CurrentAccountPasswordChangeResult
{
    private CurrentAccountPasswordChangeResult(CurrentAccountPasswordChangeStatus status)
    {
        Status = status;
    }

    public bool Succeeded => Status is CurrentAccountPasswordChangeStatus.Changed;

    public CurrentAccountPasswordChangeStatus Status { get; }

    public static CurrentAccountPasswordChangeResult Changed()
    {
        return new CurrentAccountPasswordChangeResult(CurrentAccountPasswordChangeStatus.Changed);
    }

    public static CurrentAccountPasswordChangeResult Failure(CurrentAccountPasswordChangeStatus status)
    {
        return new CurrentAccountPasswordChangeResult(status);
    }

    public override string ToString()
    {
        return $"CurrentAccountPasswordChangeResult {{ Succeeded = {Succeeded}, Status = {Status} }}";
    }
}
