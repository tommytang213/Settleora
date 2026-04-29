namespace Settleora.Api.Health;

internal interface IRabbitMqReadinessCheck
{
    Task<bool> IsReadyAsync(CancellationToken cancellationToken);
}
