using Settleora.Api.Auth.Authorization;

namespace Settleora.Api.Auth.Invitations;

internal interface IInvitationPolicyService
{
    Task<InvitationCapabilityReadoutResponse> GetCapabilityReadoutAsync(
        AuthenticatedActor actor,
        CancellationToken cancellationToken);

    Task<AdminInvitationPolicyReadoutResponse> GetAdminPolicyReadoutAsync(
        AuthenticatedActor actor,
        CancellationToken cancellationToken);

    Task<InvitationPolicyUpdateResult> UpdatePolicyAsync(
        AuthenticatedActor actor,
        AdminInvitationPolicyUpdateRequest request,
        CancellationToken cancellationToken);
}
