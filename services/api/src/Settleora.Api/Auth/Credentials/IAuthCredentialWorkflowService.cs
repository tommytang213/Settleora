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
}
