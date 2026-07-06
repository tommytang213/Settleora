namespace Settleora.Api.Auth.PasswordReset;

internal enum LocalPasswordResetCompleteStatus
{
    Completed,
    InvalidOrUnavailable,
    InvalidNewPassword,
    PersistenceFailed
}
