using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.Policy;

internal sealed class AuthSecurityPolicyService : IAuthSecurityPolicyService
{
    private const int DefaultChallengeExpirySeconds = 300;
    private const int DefaultChallengeMaxAttemptCount = 3;
    private const int DefaultRecoveryCodeCount = 10;
    private const int DefaultRecoveryCodeMinimumRemainingWarningCount = 2;
    private const int StepUpFreshnessSeconds = 900;

    private readonly SettleoraDbContext dbContext;
    private readonly TimeProvider timeProvider;

    public AuthSecurityPolicyService(SettleoraDbContext dbContext, TimeProvider timeProvider)
    {
        this.dbContext = dbContext;
        this.timeProvider = timeProvider;
    }

    public async Task<AuthSecurityPolicyDecision> GetCurrentPolicyAsync(CancellationToken cancellationToken)
    {
        var occurredAtUtc = timeProvider.GetUtcNow();
        var policy = await dbContext.Set<AuthSecurityPolicy>()
            .Where(candidate => candidate.Status == AuthSecurityPolicyStatuses.Active
                && (candidate.EffectiveFromUtc == null || candidate.EffectiveFromUtc <= occurredAtUtc)
                && candidate.RetiredAtUtc == null)
            .OrderByDescending(candidate => candidate.EffectiveFromUtc ?? candidate.CreatedAtUtc)
            .ThenByDescending(candidate => candidate.PolicyVersion)
            .FirstOrDefaultAsync(cancellationToken);

        return policy is null ? DefaultPolicy() : FromEntity(policy);
    }

    public async Task<AuthSecurityPolicyReadout> CreateReadoutAsync(
        AuthenticatedActor actor,
        bool requiresFreshStepUp,
        CancellationToken cancellationToken)
    {
        var policy = await GetCurrentPolicyAsync(cancellationToken);
        var compliance = await EvaluateAccountComplianceAsync(actor, policy, cancellationToken);
        var recoveryCodesLow = await HasLowRecoveryCodesAsync(actor.AuthAccountId, policy, cancellationToken);

        return new AuthSecurityPolicyReadout(
            policy.PolicyVersion,
            policy.PasskeySupportMode,
            policy.TotpSupportMode,
            policy.RecoveryCodeSupportMode,
            EnforcementModeForActor(actor, policy),
            compliance,
            RequiresEnrollment(actor, policy, compliance),
            requiresFreshStepUp,
            recoveryCodesLow,
            ServerAuthoritative: true);
    }

    public async Task<bool> IsPasskeySupportedAsync(AuthenticatedActor? actor, CancellationToken cancellationToken)
    {
        var policy = await GetCurrentPolicyAsync(cancellationToken);
        return SupportModeAllows(policy.PasskeySupportMode, actor);
    }

    public async Task<bool> IsTotpSupportedAsync(AuthenticatedActor actor, CancellationToken cancellationToken)
    {
        var policy = await GetCurrentPolicyAsync(cancellationToken);
        return SupportModeAllows(policy.TotpSupportMode, actor);
    }

    public async Task<bool> IsRecoveryCodeSupportedAsync(AuthenticatedActor actor, CancellationToken cancellationToken)
    {
        var policy = await GetCurrentPolicyAsync(cancellationToken);
        return SupportModeAllows(policy.RecoveryCodeSupportMode, actor);
    }

    public async Task<bool> RequiresFreshStepUpAsync(
        AuthenticatedActor actor,
        string operationCategory,
        CancellationToken cancellationToken)
    {
        _ = AuthSecurityPolicyOperations.Normalize(operationCategory);
        var policy = await GetCurrentPolicyAsync(cancellationToken);
        return EnforcementModeForActor(actor, policy) == AuthSecurityPolicyEnforcementModes.Required
            && await HasAnyEnrolledAssuranceAsync(actor.AuthAccountId, cancellationToken);
    }

    public async Task<StepUpFreshnessResult> EvaluateFreshnessAsync(
        StepUpFreshnessRequest request,
        CancellationToken cancellationToken)
    {
        var operationCategory = AuthSecurityPolicyOperations.Normalize(request.OperationCategory);
        if (request.AuthAccountId == Guid.Empty || request.AuthSessionId == Guid.Empty)
        {
            return new StepUpFreshnessResult(StepUpFreshnessStatus.InvalidOperation, ReasonCategory: "invalid_binding");
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        var candidates = await dbContext.Set<AuthChallenge>()
            .Where(challenge => challenge.AuthAccountId == request.AuthAccountId
                && challenge.AuthSessionId == request.AuthSessionId
                && challenge.ConsumedAtUtc != null
                && (challenge.Purpose == AuthChallengePurposes.StepUp
                    || challenge.Purpose == AuthChallengePurposes.PasskeyStepUp))
            .OrderByDescending(challenge => challenge.ConsumedAtUtc)
            .Take(10)
            .ToListAsync(cancellationToken);

        if (candidates.Count == 0)
        {
            return new StepUpFreshnessResult(StepUpFreshnessStatus.Missing, ReasonCategory: "missing_step_up");
        }

        foreach (var challenge in candidates)
        {
            if (!string.Equals(challenge.RequestContextHash, operationCategory, StringComparison.Ordinal))
            {
                continue;
            }

            var validStatus = challenge is
            {
                Purpose: AuthChallengePurposes.PasskeyStepUp,
                FactorType: AuthChallengeFactorTypes.Passkey,
                Status: AuthChallengeStatuses.Consumed
            }
            || challenge is
            {
                Purpose: AuthChallengePurposes.StepUp,
                Status: AuthChallengeStatuses.Verified
            };
            if (!validStatus)
            {
                return new StepUpFreshnessResult(
                    StepUpFreshnessStatus.Mismatched,
                    challenge.Id,
                    challenge.FactorType,
                    challenge.ConsumedAtUtc,
                    ReasonCategory: "invalid_challenge_state");
            }

            var consumedAtUtc = challenge.ConsumedAtUtc.GetValueOrDefault();
            if (consumedAtUtc > challenge.ExpiresAtUtc)
            {
                return new StepUpFreshnessResult(
                    StepUpFreshnessStatus.Expired,
                    challenge.Id,
                    challenge.FactorType,
                    consumedAtUtc,
                    challenge.ExpiresAtUtc,
                    "challenge_expired_before_consume");
            }

            var freshUntilUtc = consumedAtUtc.AddSeconds(StepUpFreshnessSeconds);
            if (freshUntilUtc <= occurredAtUtc)
            {
                return new StepUpFreshnessResult(
                    StepUpFreshnessStatus.Expired,
                    challenge.Id,
                    challenge.FactorType,
                    consumedAtUtc,
                    freshUntilUtc,
                    "freshness_expired");
            }

            return new StepUpFreshnessResult(
                StepUpFreshnessStatus.Satisfied,
                challenge.Id,
                challenge.FactorType,
                consumedAtUtc,
                freshUntilUtc,
                "fresh");
        }

        return new StepUpFreshnessResult(StepUpFreshnessStatus.Mismatched, ReasonCategory: "operation_mismatch");
    }

    private async Task<string> EvaluateAccountComplianceAsync(
        AuthenticatedActor actor,
        AuthSecurityPolicyDecision policy,
        CancellationToken cancellationToken)
    {
        if (!SupportModeRequiresEnrollment(policy.PasskeySupportMode, actor)
            && !SupportModeRequiresEnrollment(policy.TotpSupportMode, actor))
        {
            return "not_required";
        }

        return await HasAnyEnrolledAssuranceAsync(actor.AuthAccountId, cancellationToken)
            ? "satisfied"
            : "missing_required_factor";
    }

    private async Task<bool> HasAnyEnrolledAssuranceAsync(Guid authAccountId, CancellationToken cancellationToken)
    {
        var hasPasskey = await dbContext.Set<AuthPasskeyCredential>()
            .AnyAsync(credential => credential.AuthAccountId == authAccountId
                && credential.Status == AuthPasskeyCredentialStatuses.Enrolled
                && credential.DisabledAtUtc == null
                && credential.RevokedAtUtc == null,
                cancellationToken);
        if (hasPasskey)
        {
            return true;
        }

        return await dbContext.Set<AuthMfaFactor>()
            .AnyAsync(factor => factor.AuthAccountId == authAccountId
                && factor.Status == AuthMfaFactorStatuses.Enrolled
                && factor.DisabledAtUtc == null
                && factor.RevokedAtUtc == null,
                cancellationToken);
    }

    private async Task<bool> HasLowRecoveryCodesAsync(
        Guid authAccountId,
        AuthSecurityPolicyDecision policy,
        CancellationToken cancellationToken)
    {
        if (policy.RecoveryCodeMinimumRemainingWarningCount <= 0)
        {
            return false;
        }

        var remaining = await dbContext.Set<AuthRecoveryCodeBatch>()
            .Where(batch => batch.AuthAccountId == authAccountId
                && batch.Status == AuthRecoveryCodeBatchStatuses.Active)
            .OrderByDescending(batch => batch.GeneratedAtUtc)
            .Select(batch => (int?)batch.RemainingUnusedCount)
            .FirstOrDefaultAsync(cancellationToken);

        return remaining is not null && remaining <= policy.RecoveryCodeMinimumRemainingWarningCount;
    }

    private static bool RequiresEnrollment(
        AuthenticatedActor actor,
        AuthSecurityPolicyDecision policy,
        string compliance)
    {
        return compliance == "missing_required_factor"
            && (SupportModeRequiresEnrollment(policy.PasskeySupportMode, actor)
                || SupportModeRequiresEnrollment(policy.TotpSupportMode, actor));
    }

    private static bool SupportModeAllows(string supportMode, AuthenticatedActor? actor)
    {
        return supportMode switch
        {
            AuthSecurityPolicySupportModes.Disabled => false,
            AuthSecurityPolicySupportModes.Optional => true,
            AuthSecurityPolicySupportModes.PolicyPendingEnrollment => true,
            AuthSecurityPolicySupportModes.RequiredForAllUsers => true,
            AuthSecurityPolicySupportModes.RequiredForAdmins => true,
            _ => false
        };
    }

    private static bool SupportModeRequiresEnrollment(string supportMode, AuthenticatedActor actor)
    {
        return supportMode == AuthSecurityPolicySupportModes.RequiredForAllUsers
            || (supportMode == AuthSecurityPolicySupportModes.RequiredForAdmins && IsOwnerOrAdmin(actor));
    }

    private static string EnforcementModeForActor(AuthenticatedActor actor, AuthSecurityPolicyDecision policy)
    {
        return IsOwnerOrAdmin(actor) ? policy.OwnerAdminMfaMode : policy.UserMfaMode;
    }

    private static bool IsOwnerOrAdmin(AuthenticatedActor actor)
    {
        return actor.SystemRoles.Any(role => role is SystemRoles.Owner or SystemRoles.Admin);
    }

    private static AuthSecurityPolicyDecision FromEntity(AuthSecurityPolicy policy)
    {
        return new AuthSecurityPolicyDecision(
            policy.PolicyVersion.ToString(System.Globalization.CultureInfo.InvariantCulture),
            policy.PasskeySupportMode,
            policy.TotpSupportMode,
            policy.RecoveryCodeSupportMode,
            policy.OwnerAdminMfaMode,
            policy.UserMfaMode,
            Math.Clamp(policy.ChallengeExpirySeconds, 60, 900),
            Math.Clamp(policy.ChallengeMaxAttemptCount, 1, 10),
            Math.Clamp(policy.RecoveryCodeCount, 6, 20),
            Math.Max(0, policy.RecoveryCodeMinimumRemainingWarningCount),
            IsDefault: false);
    }

    private static AuthSecurityPolicyDecision DefaultPolicy()
    {
        return new AuthSecurityPolicyDecision(
            "runtime-default",
            AuthSecurityPolicySupportModes.Optional,
            AuthSecurityPolicySupportModes.Optional,
            AuthSecurityPolicySupportModes.Optional,
            AuthSecurityPolicyEnforcementModes.Required,
            AuthSecurityPolicyEnforcementModes.Optional,
            DefaultChallengeExpirySeconds,
            DefaultChallengeMaxAttemptCount,
            DefaultRecoveryCodeCount,
            DefaultRecoveryCodeMinimumRemainingWarningCount,
            IsDefault: true);
    }
}
