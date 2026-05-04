namespace Settleora.Api.Auth.Bootstrap;

internal interface ILocalOwnerBootstrapService
{
    Task<bool> IsBootstrapRequiredAsync(CancellationToken cancellationToken = default);

    Task<LocalOwnerBootstrapCreationResult> CreateLocalOwnerAsync(
        LocalOwnerBootstrapRequest request,
        CancellationToken cancellationToken = default);
}
