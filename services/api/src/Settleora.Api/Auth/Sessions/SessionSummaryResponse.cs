namespace Settleora.Api.Auth.Sessions;

internal sealed record SessionSummaryResponse(
    Guid Id,
    bool IsCurrent,
    string Status,
    DateTimeOffset IssuedAtUtc,
    DateTimeOffset ExpiresAtUtc,
    DateTimeOffset? LastSeenAtUtc,
    string? DeviceLabel);
