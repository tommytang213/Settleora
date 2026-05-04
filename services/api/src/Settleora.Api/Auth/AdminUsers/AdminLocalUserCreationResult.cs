namespace Settleora.Api.Auth.AdminUsers;

internal sealed class AdminLocalUserCreationResult
{
    private AdminLocalUserCreationResult(
        AdminLocalUserCreationStatus status,
        AdminUserSummaryResponse? user)
    {
        Status = status;
        User = user;
    }

    public bool Succeeded => Status is AdminLocalUserCreationStatus.Created;

    public AdminLocalUserCreationStatus Status { get; }

    public AdminUserSummaryResponse? User { get; }

    public static AdminLocalUserCreationResult Created(AdminUserSummaryResponse user)
    {
        return new AdminLocalUserCreationResult(
            AdminLocalUserCreationStatus.Created,
            user);
    }

    public static AdminLocalUserCreationResult Failure(AdminLocalUserCreationStatus status)
    {
        return new AdminLocalUserCreationResult(status, null);
    }
}
