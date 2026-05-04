namespace Settleora.Api.Users.Groups;

internal sealed record GroupResponse(
    Guid Id,
    string Name,
    string CurrentUserRole,
    string CurrentUserStatus,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc);
