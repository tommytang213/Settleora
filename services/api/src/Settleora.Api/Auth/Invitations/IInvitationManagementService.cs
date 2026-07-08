using Settleora.Api.Auth.Authorization;

namespace Settleora.Api.Auth.Invitations;

internal interface IInvitationManagementService
{
    Task<AdminInvitationListResponse> ListInvitationsAsync(
        InvitationListFilters filters,
        CancellationToken cancellationToken);

    Task<InvitationManagementResult> CreateInvitationAsync(
        AuthenticatedActor actor,
        AdminInvitationCreateRequest request,
        CancellationToken cancellationToken);

    Task<InvitationManagementResult> GetInvitationAsync(
        Guid invitationId,
        CancellationToken cancellationToken);

    Task<InvitationManagementResult> RevokeInvitationAsync(
        AuthenticatedActor actor,
        Guid invitationId,
        AdminInvitationRevokeRequest request,
        CancellationToken cancellationToken);

    Task<InvitationManagementResult> ResendInvitationAsync(
        AuthenticatedActor actor,
        Guid invitationId,
        AdminInvitationResendRequest request,
        CancellationToken cancellationToken);
}
