using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Auth.Policy;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class AuthSecurityPolicyServiceTests
{
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 6, 25, 14, 30, 0, TimeSpan.Zero);

    [Fact]
    public async Task MissingActivePolicyUsesSecureServerDefaults()
    {
        await using var harness = CreateHarness();
        var actor = CreateActor(SystemRoles.Owner);

        var readout = await harness.Service.CreateReadoutAsync(actor, requiresFreshStepUp: false, CancellationToken.None);

        Assert.Equal("runtime-default", readout.PolicyVersion);
        Assert.Equal(AuthSecurityPolicySupportModes.Optional, readout.PasskeySupportMode);
        Assert.Equal(AuthSecurityPolicySupportModes.Optional, readout.TotpSupportMode);
        Assert.Equal(AuthSecurityPolicySupportModes.Optional, readout.RecoveryCodeSupportMode);
        Assert.Equal(AuthSecurityPolicyEnforcementModes.Required, readout.EnforcementMode);
        Assert.True(readout.ServerAuthoritative);
    }

    [Fact]
    public async Task ActivePolicyReadoutReflectsPersistedPolicyAndLowRecoveryCodes()
    {
        await using var harness = CreateHarness();
        var actor = CreateActor(SystemRoles.Admin);
        SeedPolicy(harness.DbContext, passkeySupportMode: AuthSecurityPolicySupportModes.RequiredForAdmins);
        harness.DbContext.Set<AuthRecoveryCodeBatch>().Add(new AuthRecoveryCodeBatch
        {
            Id = Guid.NewGuid(),
            AuthAccountId = actor.AuthAccountId,
            Status = AuthRecoveryCodeBatchStatuses.Active,
            PolicyVersion = "7",
            TotalGeneratedCount = 10,
            RemainingUnusedCount = 1,
            UsedCount = 9,
            GeneratedAtUtc = InitialTimestamp,
            DisplayedAtUtc = InitialTimestamp,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        await harness.DbContext.SaveChangesAsync();

        var readout = await harness.Service.CreateReadoutAsync(actor, requiresFreshStepUp: true, CancellationToken.None);

        Assert.Equal("7", readout.PolicyVersion);
        Assert.Equal(AuthSecurityPolicySupportModes.RequiredForAdmins, readout.PasskeySupportMode);
        Assert.Equal(AuthSecurityPolicyEnforcementModes.Required, readout.EnforcementMode);
        Assert.Equal("missing_required_factor", readout.AccountCompliance);
        Assert.True(readout.RequiresEnrollment);
        Assert.True(readout.RequiresFreshStepUp);
        Assert.True(readout.RecoveryCodesLow);
    }

    [Fact]
    public async Task FreshnessAcceptsOnlyBoundFreshConsumedStepUpChallenge()
    {
        await using var harness = CreateHarness();
        var actor = CreateActor(SystemRoles.Owner);
        var challengeId = SeedStepUpChallenge(
            harness.DbContext,
            actor.AuthAccountId,
            actor.AuthSessionId,
            AuthSecurityPolicyOperations.PasskeyCredentialManagement,
            InitialTimestamp.AddMinutes(-1),
            AuthChallengePurposes.PasskeyStepUp,
            AuthChallengeFactorTypes.Passkey,
            AuthChallengeStatuses.Consumed);
        await harness.DbContext.SaveChangesAsync();

        var result = await harness.Service.EvaluateFreshnessAsync(
            new StepUpFreshnessRequest(
                actor.AuthAccountId,
                actor.AuthSessionId,
                AuthSecurityPolicyOperations.PasskeyCredentialManagement),
            CancellationToken.None);

        Assert.Equal(StepUpFreshnessStatus.Satisfied, result.Status);
        Assert.Equal(challengeId, result.ChallengeId);
        Assert.Equal(AuthChallengeFactorTypes.Passkey, result.FactorType);
    }

    [Fact]
    public async Task FreshnessRejectsAccountSessionOperationExpiryAndInvalidConsumedState()
    {
        await using var harness = CreateHarness();
        var actor = CreateActor(SystemRoles.Owner);
        SeedStepUpChallenge(
            harness.DbContext,
            actor.AuthAccountId,
            actor.AuthSessionId,
            AuthSecurityPolicyOperations.MfaFactorManagement,
            InitialTimestamp.AddMinutes(-20),
            AuthChallengePurposes.StepUp,
            AuthChallengeFactorTypes.Mfa,
            AuthChallengeStatuses.Verified);
        SeedStepUpChallenge(
            harness.DbContext,
            actor.AuthAccountId,
            Guid.NewGuid(),
            AuthSecurityPolicyOperations.RecoveryCodeManagement,
            InitialTimestamp.AddMinutes(-1),
            AuthChallengePurposes.StepUp,
            AuthChallengeFactorTypes.Mfa,
            AuthChallengeStatuses.Verified);
        SeedStepUpChallenge(
            harness.DbContext,
            actor.AuthAccountId,
            actor.AuthSessionId,
            AuthSecurityPolicyOperations.RecoveryCodeManagement,
            InitialTimestamp.AddMinutes(-1),
            AuthChallengePurposes.PasskeyStepUp,
            AuthChallengeFactorTypes.Passkey,
            AuthChallengeStatuses.Verified);
        await harness.DbContext.SaveChangesAsync();

        var operationMismatch = await harness.Service.EvaluateFreshnessAsync(
            new StepUpFreshnessRequest(
                actor.AuthAccountId,
                actor.AuthSessionId,
                AuthSecurityPolicyOperations.PasskeyCredentialManagement),
            CancellationToken.None);
        var expired = await harness.Service.EvaluateFreshnessAsync(
            new StepUpFreshnessRequest(
                actor.AuthAccountId,
                actor.AuthSessionId,
                AuthSecurityPolicyOperations.MfaFactorManagement),
            CancellationToken.None);
        var invalidConsumedState = await harness.Service.EvaluateFreshnessAsync(
            new StepUpFreshnessRequest(
                actor.AuthAccountId,
                actor.AuthSessionId,
                AuthSecurityPolicyOperations.RecoveryCodeManagement),
            CancellationToken.None);
        var wrongSession = await harness.Service.EvaluateFreshnessAsync(
            new StepUpFreshnessRequest(
                actor.AuthAccountId,
                Guid.NewGuid(),
                AuthSecurityPolicyOperations.RecoveryCodeManagement),
            CancellationToken.None);

        Assert.Equal(StepUpFreshnessStatus.Mismatched, operationMismatch.Status);
        Assert.Equal(StepUpFreshnessStatus.Expired, expired.Status);
        Assert.Equal(StepUpFreshnessStatus.Mismatched, invalidConsumedState.Status);
        Assert.Equal(StepUpFreshnessStatus.Missing, wrongSession.Status);
    }

    private static AuthSecurityPolicyTestHarness CreateHarness()
    {
        var dbContext = new SettleoraDbContext(new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options);
        var timeProvider = new AuthSecurityPolicyTestTimeProvider(InitialTimestamp);
        return new AuthSecurityPolicyTestHarness(
            dbContext,
            timeProvider,
            new AuthSecurityPolicyService(dbContext, timeProvider));
    }

    private static AuthenticatedActor CreateActor(string role)
    {
        return new AuthenticatedActor(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            InitialTimestamp.AddHours(1),
            [role]);
    }

    private static void SeedPolicy(
        SettleoraDbContext dbContext,
        string passkeySupportMode = AuthSecurityPolicySupportModes.Optional)
    {
        dbContext.Set<AuthSecurityPolicy>().Add(new AuthSecurityPolicy
        {
            Id = Guid.NewGuid(),
            PolicyVersion = 7,
            Status = AuthSecurityPolicyStatuses.Active,
            PasskeySupportMode = passkeySupportMode,
            TotpSupportMode = AuthSecurityPolicySupportModes.Optional,
            RecoveryCodeSupportMode = AuthSecurityPolicySupportModes.Optional,
            OwnerAdminMfaMode = AuthSecurityPolicyEnforcementModes.Required,
            UserMfaMode = AuthSecurityPolicyEnforcementModes.Optional,
            ChallengeExpirySeconds = 300,
            ChallengeMaxAttemptCount = 3,
            RecoveryCodeCount = 10,
            RecoveryCodeMinimumRemainingWarningCount = 2,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            EffectiveFromUtc = InitialTimestamp.AddMinutes(-5)
        });
    }

    private static Guid SeedStepUpChallenge(
        SettleoraDbContext dbContext,
        Guid authAccountId,
        Guid authSessionId,
        string operationCategory,
        DateTimeOffset consumedAtUtc,
        string purpose,
        string factorType,
        string status)
    {
        var challenge = new AuthChallenge
        {
            Id = Guid.NewGuid(),
            AuthAccountId = authAccountId,
            AuthSessionId = authSessionId,
            Purpose = purpose,
            FactorType = factorType,
            Status = status,
            ChallengeVerifierHash = "test-verifier",
            ChallengeVerifierAlgorithm = "test",
            RequestContextHash = operationCategory,
            CorrelationId = Guid.NewGuid().ToString("N"),
            AttemptCount = 1,
            MaxAttemptCount = 3,
            CreatedAtUtc = consumedAtUtc.AddMinutes(-1),
            UpdatedAtUtc = consumedAtUtc,
            ExpiresAtUtc = consumedAtUtc.AddMinutes(2),
            ConsumedAtUtc = consumedAtUtc
        };
        dbContext.Set<AuthChallenge>().Add(challenge);
        return challenge.Id;
    }

    private sealed record AuthSecurityPolicyTestHarness(
        SettleoraDbContext DbContext,
        AuthSecurityPolicyTestTimeProvider TimeProvider,
        IAuthSecurityPolicyService Service) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            await DbContext.DisposeAsync();
        }
    }

    private sealed class AuthSecurityPolicyTestTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset utcNow;

        public AuthSecurityPolicyTestTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow() => utcNow;
    }
}
