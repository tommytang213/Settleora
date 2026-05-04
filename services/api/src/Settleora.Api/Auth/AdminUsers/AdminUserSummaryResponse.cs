namespace Settleora.Api.Auth.AdminUsers;

internal sealed record AdminUserSummaryResponse(
    Guid UserProfileId,
    Guid AuthAccountId,
    string DisplayName,
    string? DefaultCurrency,
    string AccountStatus,
    IReadOnlyList<string> Roles,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc);
