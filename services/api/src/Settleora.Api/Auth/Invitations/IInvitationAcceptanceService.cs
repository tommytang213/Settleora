namespace Settleora.Api.Auth.Invitations;

internal interface IInvitationAcceptanceService
{
    Task<InvitationAcceptanceResult> AcceptInvitationAsync(
        InvitationAcceptRequest request,
        CancellationToken cancellationToken);
}
