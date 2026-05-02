namespace Settleora.Api.Auth.CurrentUser;

internal sealed record CurrentUserResponse(
    Guid AuthAccountId,
    CurrentUserProfileResponse UserProfile,
    CurrentUserSessionResponse Session,
    IReadOnlyList<string> Roles);
