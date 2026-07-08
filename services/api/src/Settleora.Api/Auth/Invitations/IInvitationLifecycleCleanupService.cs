namespace Settleora.Api.Auth.Invitations;

internal interface IInvitationLifecycleCleanupService
{
    Task<InvitationLifecycleCleanupResult> ExecuteCleanupAsync(CancellationToken cancellationToken);
}

internal sealed record InvitationLifecycleCleanupResult(
    int ExpiredPendingCount,
    int TerminalCleanupCount,
    bool BatchCapReached);
