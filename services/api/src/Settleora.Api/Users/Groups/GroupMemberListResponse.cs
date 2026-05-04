namespace Settleora.Api.Users.Groups;

internal sealed record GroupMemberListResponse(
    IReadOnlyList<GroupMemberResponse> Members);
