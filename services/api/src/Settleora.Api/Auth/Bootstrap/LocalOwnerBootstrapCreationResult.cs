using Settleora.Api.Domain.Users;

namespace Settleora.Api.Auth.Bootstrap;

internal sealed class LocalOwnerBootstrapCreationResult
{
    private LocalOwnerBootstrapCreationResult(
        LocalOwnerBootstrapCreationStatus status,
        UserProfile? userProfile,
        IReadOnlyList<string> roles)
    {
        Status = status;
        UserProfile = userProfile;
        Roles = roles;
    }

    public bool Succeeded => Status is LocalOwnerBootstrapCreationStatus.Created;

    public LocalOwnerBootstrapCreationStatus Status { get; }

    public UserProfile? UserProfile { get; }

    public IReadOnlyList<string> Roles { get; }

    public static LocalOwnerBootstrapCreationResult Created(
        UserProfile userProfile,
        IReadOnlyList<string> roles)
    {
        return new LocalOwnerBootstrapCreationResult(
            LocalOwnerBootstrapCreationStatus.Created,
            userProfile,
            roles);
    }

    public static LocalOwnerBootstrapCreationResult Failure(
        LocalOwnerBootstrapCreationStatus status)
    {
        return new LocalOwnerBootstrapCreationResult(
            status,
            userProfile: null,
            roles: []);
    }

    public override string ToString()
    {
        return $"LocalOwnerBootstrapCreationResult {{ Succeeded = {Succeeded}, Status = {Status}, HasUserProfile = {UserProfile is not null}, RoleCount = {Roles.Count} }}";
    }
}
