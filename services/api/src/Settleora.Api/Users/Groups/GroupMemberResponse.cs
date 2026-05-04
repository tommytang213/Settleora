namespace Settleora.Api.Users.Groups;

internal sealed record GroupMemberResponse(
    Guid UserProfileId,
    string DisplayName,
    string Role,
    string Status,
    DateTimeOffset JoinedAtUtc,
    DateTimeOffset UpdatedAtUtc);
