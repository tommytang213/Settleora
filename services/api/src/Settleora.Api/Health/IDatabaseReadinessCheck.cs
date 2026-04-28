namespace Settleora.Api.Health;

internal interface IDatabaseReadinessCheck
{
    Task<bool> IsReadyAsync(CancellationToken cancellationToken);
}
