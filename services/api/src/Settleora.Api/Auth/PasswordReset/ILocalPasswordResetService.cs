namespace Settleora.Api.Auth.PasswordReset;

internal interface ILocalPasswordResetService
{
    Task<LocalPasswordResetRequestResult> RequestResetAsync(
        LocalPasswordResetRequest request,
        CancellationToken cancellationToken = default);

    Task<LocalPasswordResetMaterialIssueResult> IssueMaterialAsync(
        LocalPasswordResetMaterialIssueRequest request,
        CancellationToken cancellationToken = default);

    Task<LocalPasswordResetCompleteResult> CompleteResetAsync(
        LocalPasswordResetCompleteRequest request,
        CancellationToken cancellationToken = default);
}
