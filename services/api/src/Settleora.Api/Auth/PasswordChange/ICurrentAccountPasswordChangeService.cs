namespace Settleora.Api.Auth.PasswordChange;

internal interface ICurrentAccountPasswordChangeService
{
    Task<CurrentAccountPasswordChangeResult> ChangePasswordAsync(
        CurrentAccountPasswordChangeRequest request,
        CancellationToken cancellationToken = default);
}
