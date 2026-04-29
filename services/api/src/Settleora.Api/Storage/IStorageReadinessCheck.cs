namespace Settleora.Api.Storage;

internal interface IStorageReadinessCheck
{
    Task<bool> IsReadyAsync(CancellationToken cancellationToken);
}
