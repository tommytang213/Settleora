using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Invitations;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class InvitationLifecycleCleanupRuntimeTests
{
    private const string RawInvitationSecret = "cleanup-visible-invitation-material";
    private const string RawContactIdentifier = "cleanup.target@example.com";
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 7, 8, 14, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset CleanupTimestamp = InitialTimestamp.AddDays(120);

    [Fact]
    public async Task ExpiredPendingInvitationsAreMarkedExpiredWithRetentionTimestamp()
    {
        await using var dbContext = CreateDbContext();
        var timeProvider = new CleanupTestTimeProvider(CleanupTimestamp);
        var invitationId = SeedInvitation(
            dbContext,
            AuthInvitationStatuses.Pending,
            RawContactIdentifier,
            expiresAtUtc: CleanupTimestamp.AddMinutes(-1));
        await dbContext.SaveChangesAsync();
        var service = new InvitationLifecycleCleanupService(dbContext, timeProvider);

        var result = await service.ExecuteCleanupAsync(CancellationToken.None);

        Assert.Equal(1, result.ExpiredPendingCount);
        Assert.Equal(0, result.TerminalCleanupCount);
        var invitation = await dbContext.Set<AuthInvitation>().SingleAsync(invitation => invitation.Id == invitationId);
        Assert.Equal(AuthInvitationStatuses.Expired, invitation.Status);
        Assert.Equal(CleanupTimestamp, invitation.ExpiredAtUtc);
        Assert.Equal(CleanupTimestamp, invitation.UpdatedAtUtc);
        Assert.Equal(CleanupTimestamp.AddDays(90), invitation.CleanupEligibleAtUtc);
    }

    [Fact]
    public async Task TerminalInvitationsBeforeCleanupEligibilityAreRetained()
    {
        await using var dbContext = CreateDbContext();
        var timeProvider = new CleanupTestTimeProvider(CleanupTimestamp);
        SeedInvitation(
            dbContext,
            AuthInvitationStatuses.Accepted,
            "accepted.before.cleanup@example.com",
            acceptedAtUtc: InitialTimestamp,
            cleanupEligibleAtUtc: CleanupTimestamp.AddMinutes(1));
        SeedInvitation(
            dbContext,
            AuthInvitationStatuses.Revoked,
            "revoked.before.cleanup@example.com",
            revokedAtUtc: InitialTimestamp,
            cleanupEligibleAtUtc: CleanupTimestamp.AddMinutes(1));
        SeedInvitation(
            dbContext,
            AuthInvitationStatuses.Expired,
            "expired.before.cleanup@example.com",
            expiredAtUtc: InitialTimestamp,
            cleanupEligibleAtUtc: CleanupTimestamp.AddMinutes(1));
        await dbContext.SaveChangesAsync();
        var service = new InvitationLifecycleCleanupService(dbContext, timeProvider);

        var result = await service.ExecuteCleanupAsync(CancellationToken.None);

        Assert.Equal(0, result.ExpiredPendingCount);
        Assert.Equal(0, result.TerminalCleanupCount);
        Assert.Equal(3, await dbContext.Set<AuthInvitation>().CountAsync());
        Assert.Empty(await dbContext.Set<AuthAuditEvent>().ToListAsync());
    }

    [Fact]
    public async Task TerminalInvitationsAfterCleanupEligibilityAreHardDeleted()
    {
        await using var dbContext = CreateDbContext();
        var timeProvider = new CleanupTestTimeProvider(CleanupTimestamp);
        SeedInvitation(
            dbContext,
            AuthInvitationStatuses.Accepted,
            "accepted.after.cleanup@example.com",
            acceptedAtUtc: InitialTimestamp,
            cleanupEligibleAtUtc: CleanupTimestamp.AddMinutes(-1));
        SeedInvitation(
            dbContext,
            AuthInvitationStatuses.Revoked,
            "revoked.after.cleanup@example.com",
            revokedAtUtc: InitialTimestamp,
            cleanupEligibleAtUtc: CleanupTimestamp.AddMinutes(-1));
        SeedInvitation(
            dbContext,
            AuthInvitationStatuses.Expired,
            "expired.after.cleanup@example.com",
            expiredAtUtc: InitialTimestamp,
            cleanupEligibleAtUtc: CleanupTimestamp.AddMinutes(-1));
        await dbContext.SaveChangesAsync();
        var service = new InvitationLifecycleCleanupService(dbContext, timeProvider);

        var result = await service.ExecuteCleanupAsync(CancellationToken.None);

        Assert.Equal(0, result.ExpiredPendingCount);
        Assert.Equal(3, result.TerminalCleanupCount);
        Assert.Empty(await dbContext.Set<AuthInvitation>().ToListAsync());
    }

    [Fact]
    public async Task CleanupIsIdempotent()
    {
        await using var dbContext = CreateDbContext();
        var timeProvider = new CleanupTestTimeProvider(CleanupTimestamp);
        SeedInvitation(
            dbContext,
            AuthInvitationStatuses.Expired,
            "idempotent.cleanup@example.com",
            expiredAtUtc: InitialTimestamp,
            cleanupEligibleAtUtc: CleanupTimestamp.AddMinutes(-1));
        await dbContext.SaveChangesAsync();
        var service = new InvitationLifecycleCleanupService(dbContext, timeProvider);

        var first = await service.ExecuteCleanupAsync(CancellationToken.None);
        var second = await service.ExecuteCleanupAsync(CancellationToken.None);

        Assert.Equal(1, first.TerminalCleanupCount);
        Assert.Equal(0, second.ExpiredPendingCount);
        Assert.Equal(0, second.TerminalCleanupCount);
        Assert.Single(await dbContext.Set<AuthAuditEvent>().ToListAsync());
    }

    [Fact]
    public async Task CleanupIsBatchBounded()
    {
        await using var dbContext = CreateDbContext();
        var timeProvider = new CleanupTestTimeProvider(CleanupTimestamp);
        for (var index = 0; index < 60; index++)
        {
            SeedInvitation(
                dbContext,
                AuthInvitationStatuses.Pending,
                $"batch-{index}@example.com",
                expiresAtUtc: CleanupTimestamp.AddMinutes(-index - 1));
        }

        await dbContext.SaveChangesAsync();
        var service = new InvitationLifecycleCleanupService(dbContext, timeProvider);

        var result = await service.ExecuteCleanupAsync(CancellationToken.None);

        Assert.Equal(50, result.ExpiredPendingCount);
        Assert.Equal(0, result.TerminalCleanupCount);
        Assert.True(result.BatchCapReached);
        Assert.Equal(50, await dbContext.Set<AuthInvitation>().CountAsync(
            invitation => invitation.Status == AuthInvitationStatuses.Expired));
        Assert.Equal(10, await dbContext.Set<AuthInvitation>().CountAsync(
            invitation => invitation.Status == AuthInvitationStatuses.Pending));
    }

    [Fact]
    public async Task CleanupAuditUsesOnlyCountsAndCategories()
    {
        await using var dbContext = CreateDbContext();
        var timeProvider = new CleanupTestTimeProvider(CleanupTimestamp);
        var invitationId = SeedInvitation(
            dbContext,
            AuthInvitationStatuses.Expired,
            RawContactIdentifier,
            rawInvitationSecret: RawInvitationSecret,
            expiredAtUtc: InitialTimestamp,
            cleanupEligibleAtUtc: CleanupTimestamp.AddMinutes(-1));
        await dbContext.SaveChangesAsync();
        var service = new InvitationLifecycleCleanupService(dbContext, timeProvider);

        await service.ExecuteCleanupAsync(CancellationToken.None);

        var audit = await dbContext.Set<AuthAuditEvent>().SingleAsync();
        Assert.Equal("invitation.cleanup_completed", audit.Action);
        Assert.Equal(AuthAuditOutcomes.Success, audit.Outcome);
        Assert.Null(audit.ActorAuthAccountId);
        Assert.Null(audit.SubjectAuthAccountId);
        AssertSafeCleanupAuditContent(audit.SafeMetadataJson ?? string.Empty, invitationId);

        using var metadata = JsonDocument.Parse(audit.SafeMetadataJson!);
        Assert.Equal(0, metadata.RootElement.GetProperty("expiredPendingCount").GetInt32());
        Assert.Equal(1, metadata.RootElement.GetProperty("terminalCleanupCount").GetInt32());
        Assert.Equal("completed", metadata.RootElement.GetProperty("statusCategory").GetString());
        Assert.Equal("cleanup_invocation", metadata.RootElement.GetProperty("timingBucket").GetString());
        var statusCount = Assert.Single(metadata.RootElement.GetProperty("terminalStatusCounts").EnumerateArray());
        Assert.Equal(AuthInvitationStatuses.Expired, statusCount.GetProperty("statusCategory").GetString());
        Assert.Equal(1, statusCount.GetProperty("count").GetInt32());
    }

    private static SettleoraDbContext CreateDbContext()
    {
        return new SettleoraDbContext(new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
    }

    private static Guid SeedInvitation(
        SettleoraDbContext dbContext,
        string status,
        string contactIdentifier,
        string rawInvitationSecret = RawInvitationSecret,
        DateTimeOffset? expiresAtUtc = null,
        DateTimeOffset? acceptedAtUtc = null,
        DateTimeOffset? revokedAtUtc = null,
        DateTimeOffset? expiredAtUtc = null,
        DateTimeOffset? cleanupEligibleAtUtc = null)
    {
        var invitationId = Guid.NewGuid();
        dbContext.Set<AuthInvitation>().Add(new AuthInvitation
        {
            Id = invitationId,
            Status = status,
            ContactIdentifierKind = AuthInvitationContactIdentifierKinds.Email,
            ContactIdentifierNormalized = contactIdentifier,
            InvitationSecretHash = InvitationSecretHasher.DeriveInvitationSecretHash(rawInvitationSecret),
            InvitationSecretHashVersion = InvitationSecretHasher.HashVersion,
            TargetSystemRole = SystemRoles.User,
            InvitedByAuthAccountId = Guid.NewGuid(),
            InvitedByUserProfileId = Guid.NewGuid(),
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            ExpiresAtUtc = expiresAtUtc ?? InitialTimestamp.AddDays(7),
            AcceptedAtUtc = acceptedAtUtc,
            RevokedByAuthAccountId = revokedAtUtc is null ? null : Guid.NewGuid(),
            RevokedAtUtc = revokedAtUtc,
            ExpiredAtUtc = expiredAtUtc,
            CleanupEligibleAtUtc = cleanupEligibleAtUtc
        });
        return invitationId;
    }

    private static void AssertSafeCleanupAuditContent(string content, Guid invitationId)
    {
        var forbiddenFragments = new[]
        {
            RawInvitationSecret,
            RawContactIdentifier,
            InvitationSecretHasher.DeriveInvitationSecretHash(RawInvitationSecret),
            invitationId.ToString("D"),
            "raw",
            "secret",
            "link",
            "token",
            "password",
            "credential",
            "requestBody",
            "providerPayload",
            "providerDiagnostics",
            "smtp",
            "sessionToken",
            "refresh"
        };

        foreach (var fragment in forbiddenFragments)
        {
            if (content.Contains(fragment, StringComparison.OrdinalIgnoreCase))
            {
                throw new Xunit.Sdk.XunitException("Cleanup audit redaction check failed.");
            }
        }
    }

    private sealed class CleanupTestTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset utcNow;

        public CleanupTestTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow()
        {
            return utcNow;
        }
    }
}
