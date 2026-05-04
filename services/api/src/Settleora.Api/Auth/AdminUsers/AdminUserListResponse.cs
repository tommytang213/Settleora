namespace Settleora.Api.Auth.AdminUsers;

internal sealed record AdminUserListResponse(
    IReadOnlyList<AdminUserSummaryResponse> Users);
