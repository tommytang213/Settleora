namespace Settleora.Api.Auth.PasswordChange;

internal enum CurrentAccountPasswordChangeStatus
{
    Changed,
    InvalidCurrentPassword,
    InvalidNewPassword,
    SamePassword,
    Unavailable,
    PersistenceFailed
}
