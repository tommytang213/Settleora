namespace Settleora.Api.Health;

internal sealed record HealthResponse(
    string Status,
    string Service);
