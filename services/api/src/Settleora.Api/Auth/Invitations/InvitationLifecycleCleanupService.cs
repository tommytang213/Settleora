using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.Invitations;

internal sealed class InvitationLifecycleCleanupService : IInvitationLifecycleCleanupService
{
    private const int BatchSize = 50;
    private const int SafeMetadataJsonMaxLength = 4096;
    private const string WorkflowName = "auth_invitation_lifecycle_cleanup";
    private static readonly TimeSpan TerminalCleanupDelay = TimeSpan.FromDays(90);
    private static readonly string[] TerminalStatuses =
    [
        AuthInvitationStatuses.Accepted,
        AuthInvitationStatuses.Revoked,
        AuthInvitationStatuses.Expired
    ];
    private static readonly JsonSerializerOptions MetadataJsonOptions = new(JsonSerializerDefaults.Web);

    private readonly SettleoraDbContext dbContext;
    private readonly TimeProvider timeProvider;

    public InvitationLifecycleCleanupService(
        SettleoraDbContext dbContext,
        TimeProvider timeProvider)
    {
        this.dbContext = dbContext;
        this.timeProvider = timeProvider;
    }

    public async Task<InvitationLifecycleCleanupResult> ExecuteCleanupAsync(CancellationToken cancellationToken)
    {
        var occurredAtUtc = timeProvider.GetUtcNow();
        var expiredPendingInvitations = await dbContext.Set<AuthInvitation>()
            .Where(invitation => invitation.Status == AuthInvitationStatuses.Pending
                && invitation.AcceptedAtUtc == null
                && invitation.RevokedAtUtc == null
                && invitation.ExpiredAtUtc == null
                && invitation.ExpiresAtUtc <= occurredAtUtc)
            .OrderBy(invitation => invitation.ExpiresAtUtc)
            .ThenBy(invitation => invitation.Id)
            .Take(BatchSize)
            .ToListAsync(cancellationToken);

        foreach (var invitation in expiredPendingInvitations)
        {
            invitation.Status = AuthInvitationStatuses.Expired;
            invitation.ExpiredAtUtc = occurredAtUtc;
            invitation.UpdatedAtUtc = occurredAtUtc;
            invitation.CleanupEligibleAtUtc = occurredAtUtc.Add(TerminalCleanupDelay);
        }

        var terminalBatchSize = BatchSize - expiredPendingInvitations.Count;
        var terminalInvitations = terminalBatchSize > 0
            ? await dbContext.Set<AuthInvitation>()
                .Where(invitation => TerminalStatuses.Contains(invitation.Status)
                    && invitation.CleanupEligibleAtUtc != null
                    && invitation.CleanupEligibleAtUtc <= occurredAtUtc)
                .OrderBy(invitation => invitation.CleanupEligibleAtUtc)
                .ThenBy(invitation => invitation.Id)
                .Take(terminalBatchSize)
                .ToListAsync(cancellationToken)
            : [];

        var terminalStatusCounts = terminalInvitations
            .GroupBy(invitation => invitation.Status, StringComparer.Ordinal)
            .OrderBy(group => group.Key, StringComparer.Ordinal)
            .Select(group => new InvitationCleanupStatusCount(group.Key, group.Count()))
            .ToArray();

        if (terminalInvitations.Count > 0)
        {
            dbContext.Set<AuthInvitation>().RemoveRange(terminalInvitations);
        }

        var expiredPendingCount = expiredPendingInvitations.Count;
        var terminalCleanupCount = terminalInvitations.Count;
        var batchCapReached = expiredPendingCount == BatchSize
            || (terminalBatchSize > 0 && terminalCleanupCount == terminalBatchSize);

        if (expiredPendingCount > 0 || terminalCleanupCount > 0)
        {
            AddCleanupAudit(
                occurredAtUtc,
                new InvitationCleanupAuditMetadata(
                    WorkflowName,
                    "completed",
                    expiredPendingCount,
                    terminalCleanupCount,
                    batchCapReached,
                    ExpiredStatusCategories: expiredPendingCount > 0 ? ["pending_to_expired"] : [],
                    terminalStatusCounts,
                    TimingBucket: "cleanup_invocation"));
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return new InvitationLifecycleCleanupResult(
            expiredPendingCount,
            terminalCleanupCount,
            batchCapReached);
    }

    private void AddCleanupAudit(
        DateTimeOffset occurredAtUtc,
        InvitationCleanupAuditMetadata metadata)
    {
        var safeMetadata = JsonSerializer.Serialize(metadata, MetadataJsonOptions);
        if (safeMetadata.Length > SafeMetadataJsonMaxLength)
        {
            throw new InvalidOperationException("Invitation cleanup audit metadata exceeded the bounded safe metadata length.");
        }

        dbContext.Set<AuthAuditEvent>().Add(new AuthAuditEvent
        {
            Id = Guid.NewGuid(),
            ActorAuthAccountId = null,
            SubjectAuthAccountId = null,
            Action = "invitation.cleanup_completed",
            Outcome = AuthAuditOutcomes.Success,
            OccurredAtUtc = occurredAtUtc,
            CorrelationId = null,
            RequestId = null,
            SafeMetadataJson = safeMetadata
        });
    }

    private sealed record InvitationCleanupAuditMetadata(
        string WorkflowName,
        string StatusCategory,
        int ExpiredPendingCount,
        int TerminalCleanupCount,
        bool BatchCapReached,
        IReadOnlyList<string> ExpiredStatusCategories,
        IReadOnlyList<InvitationCleanupStatusCount> TerminalStatusCounts,
        string TimingBucket);

    private sealed record InvitationCleanupStatusCount(string StatusCategory, int Count);
}
