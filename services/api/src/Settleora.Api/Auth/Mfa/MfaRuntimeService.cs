using System.Security.Cryptography;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Auth.CurrentUser;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.Mfa;

internal sealed class MfaRuntimeService : IMfaRuntimeService
{
    private const int DisplayLabelMaxLength = 120;
    private const int OperationCategoryMaxLength = 120;
    private const string PolicyVersion = "runtime-default";

    private readonly SettleoraDbContext dbContext;
    private readonly ITotpSecretProtector secretProtector;
    private readonly ITotpCodeService totpCodeService;
    private readonly IRecoveryCodeHasher recoveryCodeHasher;
    private readonly IMfaAuditWriter auditWriter;
    private readonly TimeProvider timeProvider;
    private readonly MfaRuntimeOptions options;

    public MfaRuntimeService(
        SettleoraDbContext dbContext,
        ITotpSecretProtector secretProtector,
        ITotpCodeService totpCodeService,
        IRecoveryCodeHasher recoveryCodeHasher,
        IMfaAuditWriter auditWriter,
        TimeProvider timeProvider,
        IOptions<MfaRuntimeOptions> options)
    {
        this.dbContext = dbContext;
        this.secretProtector = secretProtector;
        this.totpCodeService = totpCodeService;
        this.recoveryCodeHasher = recoveryCodeHasher;
        this.auditWriter = auditWriter;
        this.timeProvider = timeProvider;
        this.options = options.Value;
    }

    public async Task<TotpEnrollmentStartServiceResult> StartTotpEnrollmentAsync(
        AuthenticatedActor actor,
        TotpEnrollmentStartRequest request,
        CancellationToken cancellationToken)
    {
        var occurredAtUtc = timeProvider.GetUtcNow();
        var account = await LoadAvailableAccountAsync(actor.AuthAccountId, cancellationToken);
        if (account is null)
        {
            return new TotpEnrollmentStartServiceResult(MfaServiceStatus.Denied);
        }

        var existingPending = await dbContext.Set<AuthMfaFactor>()
            .Where(factor => factor.AuthAccountId == actor.AuthAccountId
                && factor.FactorType == AuthMfaFactorTypes.Totp
                && factor.Status == AuthMfaFactorStatuses.Pending)
            .ToListAsync(cancellationToken);
        foreach (var pending in existingPending)
        {
            pending.Status = AuthMfaFactorStatuses.Revoked;
            pending.RevokedAtUtc = occurredAtUtc;
            pending.UpdatedAtUtc = occurredAtUtc;
            pending.StatusReason = "superseded";
        }

        var issuer = BoundRequired(options.TotpIssuer, 120) ?? "Settleora";
        var accountLabel = BoundRequired(account.UserProfile.DisplayName, 320) ?? actor.AuthAccountId.ToString("N");
        var secret = RandomNumberGenerator.GetBytes(Math.Clamp(options.TotpSecretBytes, 16, 64));
        var manualEntryKey = Base32Encode(secret);
        var digits = options.TotpDigits == 8 ? 8 : 6;
        var periodSeconds = Math.Clamp(options.TotpPeriodSeconds, 15, 120);
        var expiresAtUtc = occurredAtUtc.AddSeconds(Math.Clamp(options.EnrollmentExpirySeconds, 60, 1800));
        var factor = new AuthMfaFactor
        {
            Id = Guid.NewGuid(),
            AuthAccountId = actor.AuthAccountId,
            FactorType = AuthMfaFactorTypes.Totp,
            Status = AuthMfaFactorStatuses.Pending,
            DisplayLabel = BoundOptional(request.DisplayLabel, DisplayLabelMaxLength),
            TotpSecretStorageKind = AuthTotpSecretStorageKinds.EncryptedPayload,
            TotpEncryptedSecretPayload = secretProtector.Protect(secret),
            TotpIssuer = issuer,
            TotpAccountLabel = accountLabel,
            TotpAlgorithm = "sha1",
            TotpDigits = digits,
            TotpPeriodSeconds = periodSeconds,
            PolicyVersion = PolicyVersion,
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc,
            ExpiresAtUtc = expiresAtUtc,
            LastStatusChangedByAuthAccountId = actor.AuthAccountId,
            LastStatusChangeCorrelationId = Guid.NewGuid().ToString("N")
        };
        dbContext.Set<AuthMfaFactor>().Add(factor);
        await WriteAuditAsync("totp.enrollment_started", AuthAuditOutcomes.Success, actor.AuthAccountId, actor.AuthAccountId, factor.Id, null, null, AuthChallengeFactorTypes.Totp, "created", occurredAtUtc, cancellationToken);
        if (!await TrySaveAsync(cancellationToken))
        {
            return new TotpEnrollmentStartServiceResult(MfaServiceStatus.PersistenceFailed);
        }

        var provisioningUri = CreateProvisioningUri(issuer, accountLabel, manualEntryKey, digits, periodSeconds);
        return new TotpEnrollmentStartServiceResult(
            MfaServiceStatus.Succeeded,
            new TotpEnrollmentStartResponse(
                factor.Id,
                new TotpEnrollmentSetup(issuer, accountLabel, "sha1", digits, periodSeconds, provisioningUri, manualEntryKey),
                MapFactor(factor),
                expiresAtUtc,
                CreatePolicyReadout()));
    }

    public async Task<MfaFactorServiceResult> VerifyTotpEnrollmentAsync(
        AuthenticatedActor actor,
        Guid totpEnrollmentId,
        TotpEnrollmentVerifyRequest request,
        CancellationToken cancellationToken)
    {
        var occurredAtUtc = timeProvider.GetUtcNow();
        var factor = await LoadOwnedTotpFactorAsync(actor.AuthAccountId, totpEnrollmentId, cancellationToken);
        if (factor is null)
        {
            return new MfaFactorServiceResult(MfaServiceStatus.NotFound);
        }

        if (factor.Status != AuthMfaFactorStatuses.Pending)
        {
            return new MfaFactorServiceResult(MfaServiceStatus.Conflict);
        }

        if (factor.ExpiresAtUtc <= occurredAtUtc)
        {
            factor.Status = AuthMfaFactorStatuses.Expired;
            factor.UpdatedAtUtc = occurredAtUtc;
            factor.StatusReason = "expired";
            await TrySaveAsync(cancellationToken);
            return new MfaFactorServiceResult(MfaServiceStatus.Conflict);
        }

        if (!VerifyTotpCode(factor, request.Code, occurredAtUtc))
        {
            await WriteAuditAsync("totp.enrollment_failed", AuthAuditOutcomes.Failure, actor.AuthAccountId, actor.AuthAccountId, factor.Id, null, null, AuthChallengeFactorTypes.Totp, "verification_failed", occurredAtUtc, cancellationToken);
            await TrySaveAsync(cancellationToken);
            return new MfaFactorServiceResult(MfaServiceStatus.VerificationFailed);
        }

        factor.Status = AuthMfaFactorStatuses.Enrolled;
        factor.VerifiedAtUtc = occurredAtUtc;
        factor.UpdatedAtUtc = occurredAtUtc;
        factor.ExpiresAtUtc = null;
        factor.LastStatusChangedByAuthAccountId = actor.AuthAccountId;
        factor.LastStatusChangeCorrelationId = Guid.NewGuid().ToString("N");
        await WriteAuditAsync("totp.enrollment_verified", AuthAuditOutcomes.Success, actor.AuthAccountId, actor.AuthAccountId, factor.Id, null, null, AuthChallengeFactorTypes.Totp, "verified", occurredAtUtc, cancellationToken);
        if (!await TrySaveAsync(cancellationToken))
        {
            return new MfaFactorServiceResult(MfaServiceStatus.PersistenceFailed);
        }

        return new MfaFactorServiceResult(MfaServiceStatus.Succeeded, new MfaFactorResponse(MapFactor(factor), CreatePolicyReadout()));
    }

    public async Task<MfaMutationResult> CancelTotpEnrollmentAsync(
        AuthenticatedActor actor,
        Guid totpEnrollmentId,
        CancellationToken cancellationToken)
    {
        var occurredAtUtc = timeProvider.GetUtcNow();
        var factor = await LoadOwnedTotpFactorAsync(actor.AuthAccountId, totpEnrollmentId, cancellationToken);
        if (factor is null || factor.Status != AuthMfaFactorStatuses.Pending)
        {
            return new MfaMutationResult(MfaServiceStatus.NotFound);
        }

        factor.Status = AuthMfaFactorStatuses.Revoked;
        factor.RevokedAtUtc = occurredAtUtc;
        factor.UpdatedAtUtc = occurredAtUtc;
        factor.StatusReason = "cancelled";
        await WriteAuditAsync("totp.enrollment_cancelled", AuthAuditOutcomes.Revoked, actor.AuthAccountId, actor.AuthAccountId, factor.Id, null, null, AuthChallengeFactorTypes.Totp, "cancelled", occurredAtUtc, cancellationToken);
        return await TrySaveAsync(cancellationToken)
            ? new MfaMutationResult(MfaServiceStatus.Succeeded)
            : new MfaMutationResult(MfaServiceStatus.PersistenceFailed);
    }

    public async Task<MfaFactorListResponse> ListFactorsAsync(AuthenticatedActor actor, CancellationToken cancellationToken)
    {
        var factors = await dbContext.Set<AuthMfaFactor>()
            .Where(factor => factor.AuthAccountId == actor.AuthAccountId)
            .OrderByDescending(factor => factor.CreatedAtUtc)
            .Take(50)
            .ToListAsync(cancellationToken);
        return new MfaFactorListResponse(factors.Select(MapFactor).ToArray(), CreatePolicyReadout());
    }

    public async Task<MfaFactorServiceResult> UpdateFactorAsync(
        AuthenticatedActor actor,
        Guid mfaFactorId,
        MfaFactorUpdateRequest request,
        CancellationToken cancellationToken)
    {
        var factor = await LoadOwnedFactorAsync(actor.AuthAccountId, mfaFactorId, cancellationToken);
        if (factor is null)
        {
            return new MfaFactorServiceResult(MfaServiceStatus.NotFound);
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        factor.DisplayLabel = BoundOptional(request.DisplayLabel, DisplayLabelMaxLength);
        factor.UpdatedAtUtc = occurredAtUtc;
        await WriteAuditAsync("mfa.factor_metadata_updated", AuthAuditOutcomes.Success, actor.AuthAccountId, actor.AuthAccountId, factor.Id, null, null, factor.FactorType, "metadata_updated", occurredAtUtc, cancellationToken);
        if (!await TrySaveAsync(cancellationToken))
        {
            return new MfaFactorServiceResult(MfaServiceStatus.PersistenceFailed);
        }

        return new MfaFactorServiceResult(MfaServiceStatus.Succeeded, new MfaFactorResponse(MapFactor(factor), CreatePolicyReadout()));
    }

    public async Task<MfaMutationResult> RevokeFactorAsync(
        AuthenticatedActor actor,
        Guid mfaFactorId,
        CancellationToken cancellationToken)
    {
        var factor = await LoadOwnedFactorAsync(actor.AuthAccountId, mfaFactorId, cancellationToken);
        if (factor is null)
        {
            return new MfaMutationResult(MfaServiceStatus.NotFound);
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        if (factor.Status == AuthMfaFactorStatuses.Revoked)
        {
            return new MfaMutationResult(MfaServiceStatus.Succeeded);
        }

        factor.Status = AuthMfaFactorStatuses.Revoked;
        factor.RevokedAtUtc = occurredAtUtc;
        factor.UpdatedAtUtc = occurredAtUtc;
        factor.StatusReason = "user_revoked";
        factor.LastStatusChangedByAuthAccountId = actor.AuthAccountId;
        factor.LastStatusChangeCorrelationId = Guid.NewGuid().ToString("N");
        await WriteAuditAsync("mfa.factor_revoked", AuthAuditOutcomes.Revoked, actor.AuthAccountId, actor.AuthAccountId, factor.Id, null, null, factor.FactorType, "user_revoked", occurredAtUtc, cancellationToken);
        return await TrySaveAsync(cancellationToken)
            ? new MfaMutationResult(MfaServiceStatus.Succeeded)
            : new MfaMutationResult(MfaServiceStatus.PersistenceFailed);
    }

    public async Task<MfaChallengeServiceResult> CreateChallengeAsync(
        AuthenticatedActor? actor,
        MfaChallengeCreateRequest request,
        CancellationToken cancellationToken)
    {
        if (actor is null)
        {
            return new MfaChallengeServiceResult(MfaServiceStatus.Denied);
        }

        var purpose = BoundOptional(request.Purpose, 32) ?? AuthChallengePurposes.StepUp;
        if (purpose is not AuthChallengePurposes.StepUp and not AuthChallengePurposes.SignIn)
        {
            return new MfaChallengeServiceResult(MfaServiceStatus.InvalidRequest);
        }

        var factors = await LoadActiveTotpFactorsAsync(actor.AuthAccountId, cancellationToken);
        var hasRecoveryCodes = await dbContext.Set<AuthRecoveryCodeBatch>()
            .AnyAsync(batch => batch.AuthAccountId == actor.AuthAccountId
                && batch.Status == AuthRecoveryCodeBatchStatuses.Active
                && batch.RemainingUnusedCount > 0,
                cancellationToken);
        if (factors.Count == 0 && !hasRecoveryCodes)
        {
            return new MfaChallengeServiceResult(MfaServiceStatus.Denied);
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        var expiresAtUtc = occurredAtUtc.AddSeconds(Math.Clamp(options.ChallengeExpirySeconds, 60, 900));
        var challenge = new AuthChallenge
        {
            Id = Guid.NewGuid(),
            AuthAccountId = actor.AuthAccountId,
            AuthSessionId = actor.AuthSessionId,
            Purpose = purpose,
            FactorType = AuthChallengeFactorTypes.Mfa,
            Status = AuthChallengeStatuses.Pending,
            ChallengeVerifierHash = $"mfa:{Guid.NewGuid():N}",
            ChallengeVerifierAlgorithm = "server_state",
            RequestContextHash = BoundOptional(request.OperationCategory, OperationCategoryMaxLength),
            CorrelationId = Guid.NewGuid().ToString("N"),
            MaxAttemptCount = Math.Clamp(options.ChallengeMaxAttemptCount, 1, 10),
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc,
            ExpiresAtUtc = expiresAtUtc
        };
        dbContext.Set<AuthChallenge>().Add(challenge);
        await WriteAuditAsync("mfa.challenge_created", AuthAuditOutcomes.Success, actor.AuthAccountId, actor.AuthAccountId, null, null, challenge.Id, AuthChallengeFactorTypes.Mfa, purpose, occurredAtUtc, cancellationToken);
        if (!await TrySaveAsync(cancellationToken))
        {
            return new MfaChallengeServiceResult(MfaServiceStatus.PersistenceFailed);
        }

        return new MfaChallengeServiceResult(MfaServiceStatus.Succeeded, MapChallenge(challenge, factors, hasRecoveryCodes));
    }

    public async Task<MfaChallengeVerifyServiceResult> VerifyTotpChallengeAsync(
        AuthenticatedActor? actor,
        Guid mfaChallengeId,
        MfaTotpVerifyRequest request,
        CancellationToken cancellationToken)
    {
        var occurredAtUtc = timeProvider.GetUtcNow();
        var challenge = await LoadChallengeForActorAsync(actor, mfaChallengeId, cancellationToken);
        if (!TryPrepareChallenge(challenge, occurredAtUtc, out var status))
        {
            return new MfaChallengeVerifyServiceResult(status);
        }

        var factors = await LoadActiveTotpFactorsAsync(challenge!.AuthAccountId!.Value, cancellationToken);
        var factor = factors.FirstOrDefault(candidate => VerifyTotpCode(candidate, request.Code, occurredAtUtc));
        if (factor is null)
        {
            await MarkChallengeFailedAsync(challenge, "totp_verification_failed", occurredAtUtc, cancellationToken);
            return new MfaChallengeVerifyServiceResult(MfaServiceStatus.VerificationFailed);
        }

        factor.LastUsedAtUtc = occurredAtUtc;
        factor.UpdatedAtUtc = occurredAtUtc;
        challenge.AuthMfaFactorId = factor.Id;
        ConsumeChallenge(challenge, occurredAtUtc);
        await WriteAuditAsync("mfa.totp_challenge_verified", AuthAuditOutcomes.Success, actor?.AuthAccountId, challenge.AuthAccountId, factor.Id, null, challenge.Id, AuthChallengeFactorTypes.Totp, challenge.Purpose, occurredAtUtc, cancellationToken);
        if (!await TrySaveAsync(cancellationToken))
        {
            return new MfaChallengeVerifyServiceResult(MfaServiceStatus.PersistenceFailed);
        }

        return new MfaChallengeVerifyServiceResult(MfaServiceStatus.Succeeded, CreateVerifyResponse(challenge, occurredAtUtc, null));
    }

    public async Task<MfaChallengeVerifyServiceResult> VerifyRecoveryCodeChallengeAsync(
        AuthenticatedActor? actor,
        Guid mfaChallengeId,
        MfaRecoveryCodeVerifyRequest request,
        CancellationToken cancellationToken)
    {
        var occurredAtUtc = timeProvider.GetUtcNow();
        var challenge = await LoadChallengeForActorAsync(actor, mfaChallengeId, cancellationToken);
        if (!TryPrepareChallenge(challenge, occurredAtUtc, out var status))
        {
            return new MfaChallengeVerifyServiceResult(status);
        }

        var batches = await dbContext.Set<AuthRecoveryCodeBatch>()
            .Include(batch => batch.Verifiers)
            .Where(batch => batch.AuthAccountId == challenge!.AuthAccountId
                && batch.Status == AuthRecoveryCodeBatchStatuses.Active
                && batch.RemainingUnusedCount > 0)
            .OrderByDescending(batch => batch.GeneratedAtUtc)
            .ToListAsync(cancellationToken);

        foreach (var batch in batches)
        {
            var verifier = batch.Verifiers.FirstOrDefault(candidate =>
                candidate.Status == AuthRecoveryCodeVerifierStatuses.Unused
                && recoveryCodeHasher.Verify(request.RecoveryCode, candidate.VerifierSalt, candidate.VerifierHash));
            if (verifier is null)
            {
                continue;
            }

            verifier.Status = AuthRecoveryCodeVerifierStatuses.Consumed;
            verifier.ConsumedAtUtc = occurredAtUtc;
            verifier.UpdatedAtUtc = occurredAtUtc;
            verifier.ConsumedByAuthChallengeId = challenge!.Id;
            verifier.UseCorrelationId = challenge.CorrelationId;
            batch.UsedCount++;
            batch.RemainingUnusedCount = Math.Max(0, batch.RemainingUnusedCount - 1);
            batch.LastUsedAtUtc = occurredAtUtc;
            batch.UpdatedAtUtc = occurredAtUtc;
            ConsumeChallenge(challenge, occurredAtUtc);
            await WriteAuditAsync("recovery_codes.used", AuthAuditOutcomes.Success, actor?.AuthAccountId, challenge.AuthAccountId, null, batch.Id, challenge.Id, AuthChallengeFactorTypes.RecoveryCode, "challenge_verified", occurredAtUtc, cancellationToken);
            if (!await TrySaveAsync(cancellationToken))
            {
                return new MfaChallengeVerifyServiceResult(MfaServiceStatus.PersistenceFailed);
            }

            return new MfaChallengeVerifyServiceResult(MfaServiceStatus.Succeeded, CreateVerifyResponse(challenge, occurredAtUtc, MapBatch(batch)));
        }

        await MarkChallengeFailedAsync(challenge!, "recovery_code_verification_failed", occurredAtUtc, cancellationToken);
        return new MfaChallengeVerifyServiceResult(MfaServiceStatus.VerificationFailed);
    }

    public async Task<RecoveryCodeBatchGenerateServiceResult> GenerateRecoveryCodesAsync(
        AuthenticatedActor actor,
        RecoveryCodeBatchGenerateRequest request,
        CancellationToken cancellationToken)
    {
        var occurredAtUtc = timeProvider.GetUtcNow();
        if (!await dbContext.Set<AuthMfaFactor>().AnyAsync(
                factor => factor.AuthAccountId == actor.AuthAccountId
                    && factor.Status == AuthMfaFactorStatuses.Enrolled
                    && factor.RevokedAtUtc == null
                    && factor.DisabledAtUtc == null,
                cancellationToken))
        {
            return new RecoveryCodeBatchGenerateServiceResult(MfaServiceStatus.Denied);
        }

        var existingActive = await dbContext.Set<AuthRecoveryCodeBatch>()
            .Include(batch => batch.Verifiers)
            .Where(batch => batch.AuthAccountId == actor.AuthAccountId
                && batch.Status == AuthRecoveryCodeBatchStatuses.Active)
            .ToListAsync(cancellationToken);
        if (existingActive.Count > 0 && request.ReplaceExisting != true)
        {
            return new RecoveryCodeBatchGenerateServiceResult(MfaServiceStatus.Conflict);
        }

        foreach (var batch in existingActive)
        {
            batch.Status = AuthRecoveryCodeBatchStatuses.Replaced;
            batch.ReplacedAtUtc = occurredAtUtc;
            batch.UpdatedAtUtc = occurredAtUtc;
            batch.StatusReason = "replaced";
            foreach (var verifier in batch.Verifiers.Where(verifier => verifier.Status == AuthRecoveryCodeVerifierStatuses.Unused))
            {
                verifier.Status = AuthRecoveryCodeVerifierStatuses.Replaced;
                verifier.ReplacedAtUtc = occurredAtUtc;
                verifier.UpdatedAtUtc = occurredAtUtc;
            }
        }

        var count = Math.Clamp(options.RecoveryCodeCount, 6, 20);
        var rawCodes = Enumerable.Range(0, count).Select(_ => GenerateRecoveryCode()).ToArray();
        var newBatch = new AuthRecoveryCodeBatch
        {
            Id = Guid.NewGuid(),
            AuthAccountId = actor.AuthAccountId,
            Status = AuthRecoveryCodeBatchStatuses.Active,
            PolicyVersion = PolicyVersion,
            TotalGeneratedCount = count,
            RemainingUnusedCount = count,
            UsedCount = 0,
            GeneratedAtUtc = occurredAtUtc,
            DisplayedAtUtc = occurredAtUtc,
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc,
            CreatedByAuthAccountId = actor.AuthAccountId,
            CreatedCorrelationId = Guid.NewGuid().ToString("N"),
            StatusReason = BoundOptional(request.ReasonCategory, 120)
        };
        foreach (var rawCode in rawCodes)
        {
            var hash = recoveryCodeHasher.Hash(rawCode);
            newBatch.Verifiers.Add(new AuthRecoveryCodeVerifier
            {
                Id = Guid.NewGuid(),
                AuthAccountId = actor.AuthAccountId,
                VerifierHash = hash.Hash,
                VerifierSalt = hash.Salt,
                VerifierAlgorithm = hash.Algorithm,
                VerifierParameters = hash.Parameters,
                Status = AuthRecoveryCodeVerifierStatuses.Unused,
                GeneratedAtUtc = occurredAtUtc,
                CreatedAtUtc = occurredAtUtc,
                UpdatedAtUtc = occurredAtUtc
            });
        }

        dbContext.Set<AuthRecoveryCodeBatch>().Add(newBatch);
        await WriteAuditAsync("recovery_codes.generated", AuthAuditOutcomes.Success, actor.AuthAccountId, actor.AuthAccountId, null, newBatch.Id, null, AuthChallengeFactorTypes.RecoveryCode, BoundOptional(request.ReasonCategory, 120) ?? "generated", occurredAtUtc, cancellationToken);
        if (!await TrySaveAsync(cancellationToken))
        {
            return new RecoveryCodeBatchGenerateServiceResult(MfaServiceStatus.PersistenceFailed);
        }

        return new RecoveryCodeBatchGenerateServiceResult(
            MfaServiceStatus.Succeeded,
            new RecoveryCodeBatchGenerateResponse(MapBatch(newBatch), rawCodes, DisplayOnce: true, CreatePolicyReadout()));
    }

    public async Task<RecoveryCodeBatchListResponse> ListRecoveryCodeBatchesAsync(
        AuthenticatedActor actor,
        CancellationToken cancellationToken)
    {
        var batches = await dbContext.Set<AuthRecoveryCodeBatch>()
            .Where(batch => batch.AuthAccountId == actor.AuthAccountId)
            .OrderByDescending(batch => batch.GeneratedAtUtc)
            .Take(20)
            .ToListAsync(cancellationToken);
        return new RecoveryCodeBatchListResponse(batches.Select(MapBatch).ToArray(), CreatePolicyReadout());
    }

    public async Task<MfaMutationResult> RevokeRecoveryCodeBatchAsync(
        AuthenticatedActor actor,
        Guid recoveryCodeBatchId,
        CancellationToken cancellationToken)
    {
        var batch = await dbContext.Set<AuthRecoveryCodeBatch>()
            .Include(candidate => candidate.Verifiers)
            .SingleOrDefaultAsync(candidate => candidate.Id == recoveryCodeBatchId
                && candidate.AuthAccountId == actor.AuthAccountId,
                cancellationToken);
        if (batch is null)
        {
            return new MfaMutationResult(MfaServiceStatus.NotFound);
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        batch.Status = AuthRecoveryCodeBatchStatuses.Revoked;
        batch.RevokedAtUtc = occurredAtUtc;
        batch.UpdatedAtUtc = occurredAtUtc;
        batch.StatusReason = "user_revoked";
        foreach (var verifier in batch.Verifiers.Where(verifier => verifier.Status == AuthRecoveryCodeVerifierStatuses.Unused))
        {
            verifier.Status = AuthRecoveryCodeVerifierStatuses.Revoked;
            verifier.RevokedAtUtc = occurredAtUtc;
            verifier.UpdatedAtUtc = occurredAtUtc;
        }

        await WriteAuditAsync("recovery_codes.revoked", AuthAuditOutcomes.Revoked, actor.AuthAccountId, actor.AuthAccountId, null, batch.Id, null, AuthChallengeFactorTypes.RecoveryCode, "user_revoked", occurredAtUtc, cancellationToken);
        return await TrySaveAsync(cancellationToken)
            ? new MfaMutationResult(MfaServiceStatus.Succeeded)
            : new MfaMutationResult(MfaServiceStatus.PersistenceFailed);
    }

    private async Task<AuthAccount?> LoadAvailableAccountAsync(Guid authAccountId, CancellationToken cancellationToken)
    {
        var account = await dbContext.Set<AuthAccount>()
            .Include(account => account.UserProfile)
            .SingleOrDefaultAsync(account => account.Id == authAccountId, cancellationToken);
        return account is not null
            && account.Status == AuthAccountStatuses.Active
            && account.DisabledAtUtc is null
            && account.DeletedAtUtc is null
            ? account
            : null;
    }

    private Task<AuthMfaFactor?> LoadOwnedFactorAsync(Guid authAccountId, Guid mfaFactorId, CancellationToken cancellationToken)
    {
        return dbContext.Set<AuthMfaFactor>().SingleOrDefaultAsync(
            factor => factor.Id == mfaFactorId && factor.AuthAccountId == authAccountId,
            cancellationToken);
    }

    private Task<AuthMfaFactor?> LoadOwnedTotpFactorAsync(Guid authAccountId, Guid mfaFactorId, CancellationToken cancellationToken)
    {
        return dbContext.Set<AuthMfaFactor>().SingleOrDefaultAsync(
            factor => factor.Id == mfaFactorId
                && factor.AuthAccountId == authAccountId
                && factor.FactorType == AuthMfaFactorTypes.Totp,
            cancellationToken);
    }

    private Task<List<AuthMfaFactor>> LoadActiveTotpFactorsAsync(Guid authAccountId, CancellationToken cancellationToken)
    {
        return dbContext.Set<AuthMfaFactor>()
            .Where(factor => factor.AuthAccountId == authAccountId
                && factor.FactorType == AuthMfaFactorTypes.Totp
                && factor.Status == AuthMfaFactorStatuses.Enrolled
                && factor.RevokedAtUtc == null
                && factor.DisabledAtUtc == null)
            .OrderByDescending(factor => factor.CreatedAtUtc)
            .ToListAsync(cancellationToken);
    }

    private Task<AuthChallenge?> LoadChallengeForActorAsync(AuthenticatedActor? actor, Guid challengeId, CancellationToken cancellationToken)
    {
        var query = dbContext.Set<AuthChallenge>()
            .Where(challenge => challenge.Id == challengeId
                && (challenge.FactorType == AuthChallengeFactorTypes.Mfa
                    || challenge.FactorType == AuthChallengeFactorTypes.Totp
                    || challenge.FactorType == AuthChallengeFactorTypes.RecoveryCode));
        if (actor is not null)
        {
            query = query.Where(challenge => challenge.AuthAccountId == actor.AuthAccountId
                && (challenge.AuthSessionId == null || challenge.AuthSessionId == actor.AuthSessionId));
        }

        return query.SingleOrDefaultAsync(cancellationToken);
    }

    private bool VerifyTotpCode(AuthMfaFactor factor, string code, DateTimeOffset occurredAtUtc)
    {
        if (factor.TotpSecretStorageKind != AuthTotpSecretStorageKinds.EncryptedPayload
            || string.IsNullOrWhiteSpace(factor.TotpEncryptedSecretPayload))
        {
            return false;
        }

        var secret = secretProtector.Unprotect(factor.TotpEncryptedSecretPayload);
        return totpCodeService.VerifyCode(
            secret,
            code,
            occurredAtUtc,
            factor.TotpDigits ?? 6,
            factor.TotpPeriodSeconds ?? 30,
            Math.Clamp(options.TotpAllowedDriftPeriods, 0, 2));
    }

    private bool TryPrepareChallenge(AuthChallenge? challenge, DateTimeOffset occurredAtUtc, out MfaServiceStatus status)
    {
        status = MfaServiceStatus.Succeeded;
        if (challenge?.AuthAccountId is null)
        {
            status = MfaServiceStatus.NotFound;
            return false;
        }

        if (challenge.Status != AuthChallengeStatuses.Pending)
        {
            status = MfaServiceStatus.Conflict;
            return false;
        }

        if (challenge.ExpiresAtUtc <= occurredAtUtc)
        {
            challenge.Status = AuthChallengeStatuses.Expired;
            challenge.FailedAtUtc = occurredAtUtc;
            challenge.UpdatedAtUtc = occurredAtUtc;
            status = MfaServiceStatus.Conflict;
            return false;
        }

        challenge.AttemptCount++;
        if (challenge.AttemptCount > Math.Max(1, challenge.MaxAttemptCount))
        {
            challenge.Status = AuthChallengeStatuses.Blocked;
            challenge.BlockedAtUtc = occurredAtUtc;
            challenge.UpdatedAtUtc = occurredAtUtc;
            status = MfaServiceStatus.Conflict;
            return false;
        }

        return true;
    }

    private async Task MarkChallengeFailedAsync(AuthChallenge challenge, string failureCategory, DateTimeOffset occurredAtUtc, CancellationToken cancellationToken)
    {
        challenge.FailureCategory = BoundOptional(failureCategory, 120);
        challenge.FailedAtUtc = occurredAtUtc;
        challenge.UpdatedAtUtc = occurredAtUtc;
        if (challenge.AttemptCount >= Math.Max(1, challenge.MaxAttemptCount))
        {
            challenge.Status = AuthChallengeStatuses.Blocked;
            challenge.BlockedAtUtc = occurredAtUtc;
        }

        await WriteAuditAsync("mfa.challenge_failed", AuthAuditOutcomes.Failure, null, challenge.AuthAccountId, challenge.AuthMfaFactorId, null, challenge.Id, challenge.FactorType, failureCategory, occurredAtUtc, cancellationToken);
        await TrySaveAsync(cancellationToken);
    }

    private static void ConsumeChallenge(AuthChallenge challenge, DateTimeOffset occurredAtUtc)
    {
        challenge.Status = AuthChallengeStatuses.Verified;
        challenge.ConsumedAtUtc = occurredAtUtc;
        challenge.UpdatedAtUtc = occurredAtUtc;
    }

    private MfaChallengeResponse MapChallenge(AuthChallenge challenge, IReadOnlyList<AuthMfaFactor> factors, bool hasRecoveryCodes)
    {
        var allowed = new List<string>();
        var choices = new List<MfaChallengeFactorChoice>();
        if (factors.Count > 0)
        {
            allowed.Add(AuthChallengeFactorTypes.Totp);
            choices.AddRange(factors.Select(factor => new MfaChallengeFactorChoice(
                AuthChallengeFactorTypes.Totp,
                factor.Id,
                factor.DisplayLabel,
                "Authenticator app")));
        }

        if (hasRecoveryCodes)
        {
            allowed.Add(AuthChallengeFactorTypes.RecoveryCode);
            choices.Add(new MfaChallengeFactorChoice(AuthChallengeFactorTypes.RecoveryCode, null, "Recovery code", "One-time recovery code"));
        }

        return new MfaChallengeResponse(
            challenge.Id,
            challenge.Purpose,
            challenge.Status,
            allowed,
            choices,
            challenge.ExpiresAtUtc,
            Math.Max(0, challenge.MaxAttemptCount - challenge.AttemptCount),
            challenge.RequestContextHash,
            CreatePolicyReadout(requiresFreshStepUp: challenge.Purpose == AuthChallengePurposes.StepUp));
    }

    private MfaChallengeVerifyResponse CreateVerifyResponse(
        AuthChallenge challenge,
        DateTimeOffset verifiedAtUtc,
        RecoveryCodeBatchSummary? recoveryCodeBatch)
    {
        return new MfaChallengeVerifyResponse(
            "verified",
            challenge.Id,
            verifiedAtUtc,
            verifiedAtUtc.AddSeconds(Math.Clamp(options.StepUpFreshnessSeconds, 60, 3600)),
            CurrentUser: null,
            recoveryCodeBatch);
    }

    private static MfaFactorSummary MapFactor(AuthMfaFactor factor)
    {
        return new MfaFactorSummary(
            factor.Id,
            factor.FactorType,
            factor.Status,
            factor.DisplayLabel,
            factor.CreatedAtUtc,
            factor.VerifiedAtUtc,
            factor.LastUsedAtUtc,
            factor.UpdatedAtUtc,
            factor.DisabledAtUtc,
            factor.RevokedAtUtc,
            factor.ExpiresAtUtc,
            factor.PolicyVersion,
            factor.FactorType == AuthMfaFactorTypes.Totp
                ? new TotpFactorMetadata(
                    factor.TotpIssuer ?? "Settleora",
                    factor.TotpAccountLabel ?? "Settleora account",
                    factor.TotpAlgorithm ?? "sha1",
                    factor.TotpDigits ?? 6,
                    factor.TotpPeriodSeconds ?? 30)
                : null);
    }

    private static RecoveryCodeBatchSummary MapBatch(AuthRecoveryCodeBatch batch)
    {
        return new RecoveryCodeBatchSummary(
            batch.Id,
            batch.Status,
            batch.TotalGeneratedCount,
            batch.RemainingUnusedCount,
            batch.UsedCount,
            batch.DisplayedAtUtc is not null,
            batch.GeneratedAtUtc,
            batch.LastUsedAtUtc,
            batch.ReplacedAtUtc,
            batch.RevokedAtUtc,
            ExpiresAtUtc: null,
            batch.PolicyVersion);
    }

    private static string GenerateRecoveryCode()
    {
        var bytes = RandomNumberGenerator.GetBytes(12);
        var value = WebEncoders.Base64UrlEncode(bytes).ToUpperInvariant();
        return $"{value[..5]}-{value[5..10]}-{value[10..15]}";
    }

    private static string CreateProvisioningUri(string issuer, string accountLabel, string secret, int digits, int periodSeconds)
    {
        var label = Uri.EscapeDataString($"{issuer}:{accountLabel}");
        return $"otpauth://totp/{label}?secret={secret}&issuer={Uri.EscapeDataString(issuer)}&algorithm=SHA1&digits={digits}&period={periodSeconds}";
    }

    private static string Base32Encode(byte[] bytes)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var output = new System.Text.StringBuilder((bytes.Length + 4) / 5 * 8);
        var bitBuffer = 0;
        var bitCount = 0;
        foreach (var value in bytes)
        {
            bitBuffer = (bitBuffer << 8) | value;
            bitCount += 8;
            while (bitCount >= 5)
            {
                output.Append(alphabet[(bitBuffer >> (bitCount - 5)) & 31]);
                bitCount -= 5;
            }
        }

        if (bitCount > 0)
        {
            output.Append(alphabet[(bitBuffer << (5 - bitCount)) & 31]);
        }

        return output.ToString();
    }

    private MfaPolicyReadout CreatePolicyReadout(bool requiresFreshStepUp = false)
    {
        return new MfaPolicyReadout(
            PolicyVersion,
            AuthSecurityPolicySupportModes.Optional,
            AuthSecurityPolicySupportModes.Optional,
            AuthSecurityPolicySupportModes.Optional,
            AuthSecurityPolicyEnforcementModes.Optional,
            "unknown",
            RequiresEnrollment: false,
            RequiresFreshStepUp: requiresFreshStepUp,
            RecoveryCodesLow: false,
            ServerAuthoritative: true);
    }

    private async Task WriteAuditAsync(
        string action,
        string outcome,
        Guid? actorAuthAccountId,
        Guid? subjectAuthAccountId,
        Guid? mfaFactorId,
        Guid? recoveryCodeBatchId,
        Guid? challengeId,
        string factorType,
        string reasonCategory,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        await auditWriter.WriteAsync(new MfaAuditEvent(
            action,
            outcome,
            actorAuthAccountId,
            subjectAuthAccountId,
            mfaFactorId,
            recoveryCodeBatchId,
            challengeId,
            factorType,
            reasonCategory,
            occurredAtUtc), cancellationToken);
    }

    private async Task<bool> TrySaveAsync(CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (DbUpdateException)
        {
            return false;
        }
    }

    private static string? BoundOptional(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }

    private static string? BoundRequired(string? value, int maxLength)
    {
        return BoundOptional(value, maxLength);
    }
}
