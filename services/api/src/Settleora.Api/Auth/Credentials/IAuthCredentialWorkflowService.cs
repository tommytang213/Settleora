namespace Settleora.Api.Auth.Credentials;

internal interface IAuthCredentialWorkflowService
{
    Task<CredentialCreationResult> CreateLocalPasswordCredentialAsync(
        Guid authAccountId,
        string plaintextPassword,
        CancellationToken cancellationToken = default);

    Task<PasswordCredentialVerificationResult> VerifyLocalPasswordAsync(
        Guid authAccountId,
        string submittedPassword,
        CancellationToken cancellationToken = default);

    Task<PasswordCredentialChangeResult> ChangeLocalPasswordAsync(
        Guid authAccountId,
        string currentPassword,
        string newPassword,
        CancellationToken cancellationToken = default);

    Task<PasswordCredentialResetResult> ResetLocalPasswordAsync(
        Guid authAccountId,
        string newPassword,
        CancellationToken cancellationToken = default);
}
