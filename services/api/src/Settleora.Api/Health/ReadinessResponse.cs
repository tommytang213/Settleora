namespace Settleora.Api.Health;

internal sealed record ReadinessResponse(
    string Status,
    string Service,
    ReadinessChecksResponse Checks);
