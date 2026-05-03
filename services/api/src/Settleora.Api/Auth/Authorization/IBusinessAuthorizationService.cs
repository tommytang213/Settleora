namespace Settleora.Api.Auth.Authorization;

internal interface IBusinessAuthorizationService
{
    Task<BusinessAuthorizationResult> CanAccessProfileAsync(
        Guid userProfileId,
        CancellationToken cancellationToken = default);

    Task<BusinessAuthorizationResult> CanAccessGroupAsync(
        Guid groupId,
        CancellationToken cancellationToken = default);

    Task<BusinessAuthorizationResult> CanManageGroupMembershipAsync(
        Guid groupId,
        CancellationToken cancellationToken = default);

    Task<BusinessAuthorizationResult> CanManageGroupSettingsAsync(
        Guid groupId,
        CancellationToken cancellationToken = default);

    BusinessAuthorizationResult HasSystemRole(string systemRole);
}
