using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Auth.CurrentUser;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.Passkeys;

internal sealed class PasskeyRuntimeService : IPasskeyRuntimeService
{
    private const int DisplayLabelMaxLength = 120;
    private const int OperationCategoryMaxLength = 120;
    private const string ChallengeHashAlgorithm = "sha256";
    private const string PolicyVersion = "runtime-default";

    private readonly SettleoraDbContext dbContext;
    private readonly IPasskeyWebAuthnProvider webAuthnProvider;
    private readonly IPasskeyAuditWriter auditWriter;
    private readonly IAuthSessionRuntimeService sessionRuntimeService;
    private readonly TimeProvider timeProvider;
    private readonly PasskeyWebAuthnOptions options;

    public PasskeyRuntimeService(
        SettleoraDbContext dbContext,
        IPasskeyWebAuthnProvider webAuthnProvider,
        IPasskeyAuditWriter auditWriter,
        IAuthSessionRuntimeService sessionRuntimeService,
        TimeProvider timeProvider,
        IOptions<PasskeyWebAuthnOptions> options)
    {
        this.dbContext = dbContext;
        this.webAuthnProvider = webAuthnProvider;
        this.auditWriter = auditWriter;
        this.sessionRuntimeService = sessionRuntimeService;
        this.timeProvider = timeProvider;
        this.options = options.Value;
    }

    public async Task<PasskeyEnrollmentOptionsServiceResult> CreateEnrollmentOptionsAsync(
        AuthenticatedActor actor,
        PasskeyEnrollmentOptionsRequest request,
        CancellationToken cancellationToken)
    {
        var occurredAtUtc = timeProvider.GetUtcNow();
        var account = await LoadAvailableAccountAsync(actor.AuthAccountId, cancellationToken);
        if (account is null)
        {
            return new PasskeyEnrollmentOptionsServiceResult(PasskeyServiceStatus.Denied);
        }

        var existingCredentials = await LoadAccountPasskeysAsync(actor.AuthAccountId, enrolledOnly: true, cancellationToken);
        var creationRequest = new PasskeyCreationOptionsRequest(
            actor.AuthAccountId,
            actor.UserProfileId,
            account.UserProfile.DisplayName,
            request.AttestationPreference,
            existingCredentials);
        var optionsResult = webAuthnProvider.CreateCredentialOptions(creationRequest);
        var expiresAtUtc = occurredAtUtc.AddSeconds(GetChallengeExpirySeconds());
        var challenge = new AuthChallenge
        {
            Id = Guid.NewGuid(),
            AuthAccountId = actor.AuthAccountId,
            AuthSessionId = actor.AuthSessionId,
            Purpose = AuthChallengePurposes.PasskeyEnrollment,
            FactorType = AuthChallengeFactorTypes.Passkey,
            Status = AuthChallengeStatuses.Pending,
            ChallengeVerifierHash = Fido2PasskeyWebAuthnProvider.HashChallenge(optionsResult.Challenge),
            ChallengeVerifierAlgorithm = ChallengeHashAlgorithm,
            BoundRpId = options.RelyingPartyId,
            BoundOrigin = string.Join(",", options.AllowedOrigins.Take(4)),
            CorrelationId = Guid.NewGuid().ToString("N"),
            AttemptCount = 0,
            MaxAttemptCount = GetChallengeMaxAttemptCount(),
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc,
            ExpiresAtUtc = expiresAtUtc
        };

        dbContext.Set<AuthChallenge>().Add(challenge);
        await WriteAuditAsync(
            "passkey.enrollment_started",
            AuthAuditOutcomes.Success,
            actor.AuthAccountId,
            actor.AuthAccountId,
            null,
            challenge.Id,
            "created",
            occurredAtUtc,
            cancellationToken);

        if (!await TrySaveAsync(cancellationToken))
        {
            return new PasskeyEnrollmentOptionsServiceResult(PasskeyServiceStatus.PersistenceFailed);
        }

        return new PasskeyEnrollmentOptionsServiceResult(
            PasskeyServiceStatus.Succeeded,
            new PasskeyEnrollmentOptionsResponse(
                challenge.Id,
                optionsResult.Options,
                expiresAtUtc,
                CreatePolicyReadout()));
    }

    public async Task<PasskeyCredentialServiceResult> CompleteEnrollmentAsync(
        AuthenticatedActor actor,
        PasskeyEnrollmentCompleteRequest request,
        CancellationToken cancellationToken)
    {
        var occurredAtUtc = timeProvider.GetUtcNow();
        var challenge = await LoadChallengeAsync(
            request.PasskeyChallengeId,
            AuthChallengePurposes.PasskeyEnrollment,
            actor.AuthAccountId,
            actor.AuthSessionId,
            cancellationToken);
        if (!TryPrepareChallengeForVerification(challenge, occurredAtUtc, out var challengeStatus))
        {
            return new PasskeyCredentialServiceResult(challengeStatus);
        }

        if (!webAuthnProvider.TryExtractChallenge(request.Credential, out var verifiedChallenge)
            || !ChallengeMatches(challenge!, verifiedChallenge))
        {
            await MarkChallengeFailedAsync(challenge!, "challenge_mismatch", occurredAtUtc, cancellationToken);
            return new PasskeyCredentialServiceResult(PasskeyServiceStatus.Conflict);
        }

        var account = await LoadAvailableAccountAsync(actor.AuthAccountId, cancellationToken);
        if (account is null)
        {
            await MarkChallengeFailedAsync(challenge!, "account_unavailable", occurredAtUtc, cancellationToken);
            return new PasskeyCredentialServiceResult(PasskeyServiceStatus.Denied);
        }

        var existingCredentials = await LoadAccountPasskeysAsync(actor.AuthAccountId, enrolledOnly: true, cancellationToken);
        PasskeyCredentialVerificationResult verificationResult;
        try
        {
            verificationResult = await webAuthnProvider.VerifyCredentialAsync(
                new PasskeyCredentialVerificationRequest(
                    request.Credential,
                    verifiedChallenge,
                    new PasskeyCreationOptionsRequest(
                        actor.AuthAccountId,
                        actor.UserProfileId,
                        account.UserProfile.DisplayName,
                        null,
                        existingCredentials),
                    existingCredentials),
                cancellationToken);
        }
        catch (Exception)
        {
            await MarkChallengeFailedAsync(challenge!, "verification_failed", occurredAtUtc, cancellationToken);
            return new PasskeyCredentialServiceResult(PasskeyServiceStatus.VerificationFailed);
        }

        var credentialIdHash = Fido2PasskeyWebAuthnProvider.HashCredentialId(verificationResult.CredentialId);
        if (await dbContext.Set<AuthPasskeyCredential>().AnyAsync(
                credential => credential.CredentialIdHash == credentialIdHash
                    && credential.Status != AuthPasskeyCredentialStatuses.Revoked,
                cancellationToken))
        {
            await MarkChallengeFailedAsync(challenge!, "credential_already_exists", occurredAtUtc, cancellationToken);
            return new PasskeyCredentialServiceResult(PasskeyServiceStatus.Conflict);
        }

        var credential = new AuthPasskeyCredential
        {
            Id = Guid.NewGuid(),
            AuthAccountId = actor.AuthAccountId,
            CredentialIdHash = credentialIdHash,
            PublicKeyCose = Microsoft.AspNetCore.WebUtilities.WebEncoders.Base64UrlEncode(verificationResult.PublicKeyCose),
            UserHandleHash = Fido2PasskeyWebAuthnProvider.HashUserHandle(actor.AuthAccountId),
            SignatureCounter = verificationResult.SignatureCounter,
            BackupEligible = verificationResult.BackupEligible,
            BackupState = verificationResult.BackupState,
            Transports = string.Join(",", verificationResult.Transports.Select(BoundTransport).Where(static value => value.Length > 0).Take(8)),
            AttestationPolicyResult = BoundOptional(verificationResult.AttestationPolicyResult, 64),
            DisplayLabel = BoundOptional(request.DisplayLabel, DisplayLabelMaxLength),
            Status = AuthPasskeyCredentialStatuses.Enrolled,
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc,
            EnrolledAtUtc = occurredAtUtc,
            LastStatusChangedByAuthAccountId = actor.AuthAccountId,
            LastStatusChangeCorrelationId = challenge!.CorrelationId
        };

        challenge!.AuthPasskeyCredentialId = credential.Id;
        challenge.Status = AuthChallengeStatuses.Consumed;
        challenge.ConsumedAtUtc = occurredAtUtc;
        challenge.UpdatedAtUtc = occurredAtUtc;
        dbContext.Set<AuthPasskeyCredential>().Add(credential);
        await WriteAuditAsync(
            "passkey.enrollment_completed",
            AuthAuditOutcomes.Success,
            actor.AuthAccountId,
            actor.AuthAccountId,
            credential.Id,
            challenge.Id,
            "verified",
            occurredAtUtc,
            cancellationToken);

        if (!await TrySaveAsync(cancellationToken))
        {
            return new PasskeyCredentialServiceResult(PasskeyServiceStatus.PersistenceFailed);
        }

        return new PasskeyCredentialServiceResult(
            PasskeyServiceStatus.Succeeded,
            new PasskeyCredentialResponse(MapCredential(credential), CreatePolicyReadout()));
    }

    public async Task<PasskeyCredentialListResponse> ListCredentialsAsync(
        AuthenticatedActor actor,
        CancellationToken cancellationToken)
    {
        var credentials = await dbContext.Set<AuthPasskeyCredential>()
            .Where(credential => credential.AuthAccountId == actor.AuthAccountId)
            .OrderByDescending(credential => credential.CreatedAtUtc)
            .Take(50)
            .ToListAsync(cancellationToken);

        return new PasskeyCredentialListResponse(credentials.Select(MapCredential).ToArray(), CreatePolicyReadout());
    }

    public async Task<PasskeyCredentialServiceResult> UpdateCredentialAsync(
        AuthenticatedActor actor,
        Guid passkeyCredentialId,
        PasskeyCredentialUpdateRequest request,
        CancellationToken cancellationToken)
    {
        var credential = await LoadOwnedCredentialAsync(actor.AuthAccountId, passkeyCredentialId, cancellationToken);
        if (credential is null)
        {
            return new PasskeyCredentialServiceResult(PasskeyServiceStatus.NotFound);
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        credential.DisplayLabel = BoundOptional(request.DisplayLabel, DisplayLabelMaxLength);
        credential.UpdatedAtUtc = occurredAtUtc;
        await WriteAuditAsync(
            "passkey.renamed",
            AuthAuditOutcomes.Success,
            actor.AuthAccountId,
            actor.AuthAccountId,
            credential.Id,
            null,
            "metadata_updated",
            occurredAtUtc,
            cancellationToken);

        if (!await TrySaveAsync(cancellationToken))
        {
            return new PasskeyCredentialServiceResult(PasskeyServiceStatus.PersistenceFailed);
        }

        return new PasskeyCredentialServiceResult(
            PasskeyServiceStatus.Succeeded,
            new PasskeyCredentialResponse(MapCredential(credential), CreatePolicyReadout()));
    }

    public async Task<PasskeyCredentialMutationResult> RevokeCredentialAsync(
        AuthenticatedActor actor,
        Guid passkeyCredentialId,
        CancellationToken cancellationToken)
    {
        var credential = await LoadOwnedCredentialAsync(actor.AuthAccountId, passkeyCredentialId, cancellationToken);
        if (credential is null)
        {
            return new PasskeyCredentialMutationResult(PasskeyServiceStatus.NotFound);
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        if (credential.Status == AuthPasskeyCredentialStatuses.Revoked)
        {
            return new PasskeyCredentialMutationResult(PasskeyServiceStatus.Succeeded);
        }

        credential.Status = AuthPasskeyCredentialStatuses.Revoked;
        credential.RevokedAtUtc = occurredAtUtc;
        credential.UpdatedAtUtc = occurredAtUtc;
        credential.StatusReason = "user_revoked";
        credential.LastStatusChangedByAuthAccountId = actor.AuthAccountId;
        credential.LastStatusChangeCorrelationId = Guid.NewGuid().ToString("N");
        await WriteAuditAsync(
            "passkey.revoked",
            AuthAuditOutcomes.Revoked,
            actor.AuthAccountId,
            actor.AuthAccountId,
            credential.Id,
            null,
            "user_revoked",
            occurredAtUtc,
            cancellationToken);

        return await TrySaveAsync(cancellationToken)
            ? new PasskeyCredentialMutationResult(PasskeyServiceStatus.Succeeded)
            : new PasskeyCredentialMutationResult(PasskeyServiceStatus.PersistenceFailed);
    }

    public async Task<PasskeySignInOptionsServiceResult> CreateSignInOptionsAsync(
        PasskeySignInOptionsRequest request,
        CancellationToken cancellationToken)
    {
        var occurredAtUtc = timeProvider.GetUtcNow();
        var credentials = await LoadSignInCandidateCredentialsAsync(request.IdentifierHint, cancellationToken);
        var optionsResult = webAuthnProvider.CreateAssertionOptions(new PasskeyAssertionOptionsRequest(
            credentials,
            request.UserVerification));
        var expiresAtUtc = occurredAtUtc.AddSeconds(GetChallengeExpirySeconds());
        var accountId = credentials.Select(credential => credential.AuthAccountId).Distinct().Count() == 1
            ? credentials[0].AuthAccountId
            : (Guid?)null;
        var challenge = new AuthChallenge
        {
            Id = Guid.NewGuid(),
            AuthAccountId = accountId,
            Purpose = AuthChallengePurposes.PasskeySignIn,
            FactorType = AuthChallengeFactorTypes.Passkey,
            Status = AuthChallengeStatuses.Pending,
            ChallengeVerifierHash = Fido2PasskeyWebAuthnProvider.HashChallenge(optionsResult.Challenge),
            ChallengeVerifierAlgorithm = ChallengeHashAlgorithm,
            BoundRpId = options.RelyingPartyId,
            BoundOrigin = string.Join(",", options.AllowedOrigins.Take(4)),
            CorrelationId = Guid.NewGuid().ToString("N"),
            MaxAttemptCount = GetChallengeMaxAttemptCount(),
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc,
            ExpiresAtUtc = expiresAtUtc
        };
        dbContext.Set<AuthChallenge>().Add(challenge);

        if (!await TrySaveAsync(cancellationToken))
        {
            return new PasskeySignInOptionsServiceResult(PasskeyServiceStatus.PersistenceFailed);
        }

        return new PasskeySignInOptionsServiceResult(
            PasskeyServiceStatus.Succeeded,
            new PasskeySignInOptionsResponse(challenge.Id, optionsResult.Options, expiresAtUtc));
    }

    public async Task<PasskeySignInCompleteServiceResult> CompleteSignInAsync(
        PasskeySignInCompleteRequest request,
        CancellationToken cancellationToken)
    {
        var occurredAtUtc = timeProvider.GetUtcNow();
        var challenge = await LoadChallengeAsync(
            request.PasskeyChallengeId,
            AuthChallengePurposes.PasskeySignIn,
            authAccountId: null,
            authSessionId: null,
            cancellationToken);
        if (!TryPrepareChallengeForVerification(challenge, occurredAtUtc, out var challengeStatus))
        {
            return new PasskeySignInCompleteServiceResult(challengeStatus);
        }

        if (!webAuthnProvider.TryExtractChallenge(request.Credential, out var verifiedChallenge)
            || !ChallengeMatches(challenge!, verifiedChallenge)
            || !webAuthnProvider.TryExtractCredentialId(request.Credential, out var credentialId))
        {
            await MarkChallengeFailedAsync(challenge!, "challenge_mismatch", occurredAtUtc, cancellationToken);
            return new PasskeySignInCompleteServiceResult(PasskeyServiceStatus.Conflict);
        }

        var credentialIdHash = Fido2PasskeyWebAuthnProvider.HashCredentialId(credentialId);
        var credential = await dbContext.Set<AuthPasskeyCredential>()
            .Include(passkey => passkey.AuthAccount)
            .ThenInclude(account => account.UserProfile)
            .SingleOrDefaultAsync(
                passkey => passkey.CredentialIdHash == credentialIdHash
                    && passkey.Status == AuthPasskeyCredentialStatuses.Enrolled,
                cancellationToken);
        if (credential?.AuthAccount is null || !IsAccountAvailable(credential.AuthAccount))
        {
            await MarkChallengeFailedAsync(challenge!, "credential_unavailable", occurredAtUtc, cancellationToken);
            return new PasskeySignInCompleteServiceResult(PasskeyServiceStatus.Denied);
        }

        var accountCredentials = await LoadAccountPasskeysAsync(credential.AuthAccountId, enrolledOnly: true, cancellationToken);
        PasskeyAssertionVerificationResult verificationResult;
        try
        {
            verificationResult = await webAuthnProvider.VerifyAssertionAsync(
                new PasskeyAssertionVerificationRequest(
                    request.Credential,
                    verifiedChallenge,
                    credential,
                    accountCredentials,
                    null),
                cancellationToken);
        }
        catch (Exception)
        {
            await MarkChallengeFailedAsync(challenge!, "verification_failed", occurredAtUtc, cancellationToken);
            return new PasskeySignInCompleteServiceResult(PasskeyServiceStatus.VerificationFailed);
        }

        UpdateCredentialAfterAssertion(credential, verificationResult, occurredAtUtc);
        challenge!.AuthAccountId = credential.AuthAccountId;
        challenge.AuthPasskeyCredentialId = credential.Id;
        challenge.Status = AuthChallengeStatuses.Consumed;
        challenge.ConsumedAtUtc = occurredAtUtc;
        challenge.UpdatedAtUtc = occurredAtUtc;

        var sessionResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                credential.AuthAccountId,
                DeviceLabel: BoundOptional(request.DeviceLabel, DisplayLabelMaxLength),
                UserAgentSummary: null,
                NetworkAddressHash: null),
            cancellationToken);
        if (!sessionResult.Succeeded
            || sessionResult.AuthSessionId is not { } sessionId
            || sessionResult.SessionExpiresAtUtc is not { } sessionExpiresAtUtc)
        {
            return new PasskeySignInCompleteServiceResult(PasskeyServiceStatus.Denied);
        }

        await WriteAuditAsync(
            "passkey.challenge_succeeded",
            AuthAuditOutcomes.Success,
            credential.AuthAccountId,
            credential.AuthAccountId,
            credential.Id,
            challenge.Id,
            "sign_in",
            occurredAtUtc,
            cancellationToken);
        if (!await TrySaveAsync(cancellationToken))
        {
            return new PasskeySignInCompleteServiceResult(PasskeyServiceStatus.PersistenceFailed);
        }

        var roles = await LoadSystemRolesAsync(credential.AuthAccountId, cancellationToken);
        return new PasskeySignInCompleteServiceResult(
            PasskeyServiceStatus.Succeeded,
            new PasskeySignInCompleteResponse(
                "signed_in",
                new CurrentUserResponse(
                    credential.AuthAccountId,
                    new CurrentUserProfileResponse(
                        credential.AuthAccount.UserProfileId,
                        credential.AuthAccount.UserProfile.DisplayName,
                        credential.AuthAccount.UserProfile.DefaultCurrency),
                    new CurrentUserSessionResponse(sessionId, sessionExpiresAtUtc),
                    roles),
                null));
    }

    public async Task<PasskeyStepUpOptionsServiceResult> CreateStepUpOptionsAsync(
        AuthenticatedActor actor,
        PasskeyStepUpOptionsRequest request,
        CancellationToken cancellationToken)
    {
        var operationCategory = BoundRequired(request.OperationCategory, OperationCategoryMaxLength);
        if (operationCategory is null)
        {
            return new PasskeyStepUpOptionsServiceResult(PasskeyServiceStatus.InvalidRequest);
        }

        var credentials = await LoadAccountPasskeysAsync(actor.AuthAccountId, enrolledOnly: true, cancellationToken);
        if (credentials.Count == 0)
        {
            return new PasskeyStepUpOptionsServiceResult(PasskeyServiceStatus.Denied);
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        var optionsResult = webAuthnProvider.CreateAssertionOptions(new PasskeyAssertionOptionsRequest(credentials, "preferred"));
        var expiresAtUtc = occurredAtUtc.AddSeconds(GetChallengeExpirySeconds());
        var challenge = new AuthChallenge
        {
            Id = Guid.NewGuid(),
            AuthAccountId = actor.AuthAccountId,
            AuthSessionId = actor.AuthSessionId,
            Purpose = AuthChallengePurposes.PasskeyStepUp,
            FactorType = AuthChallengeFactorTypes.Passkey,
            Status = AuthChallengeStatuses.Pending,
            ChallengeVerifierHash = Fido2PasskeyWebAuthnProvider.HashChallenge(optionsResult.Challenge),
            ChallengeVerifierAlgorithm = ChallengeHashAlgorithm,
            BoundRpId = options.RelyingPartyId,
            RequestContextHash = operationCategory,
            CorrelationId = Guid.NewGuid().ToString("N"),
            MaxAttemptCount = GetChallengeMaxAttemptCount(),
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc,
            ExpiresAtUtc = expiresAtUtc
        };
        dbContext.Set<AuthChallenge>().Add(challenge);
        if (!await TrySaveAsync(cancellationToken))
        {
            return new PasskeyStepUpOptionsServiceResult(PasskeyServiceStatus.PersistenceFailed);
        }

        return new PasskeyStepUpOptionsServiceResult(
            PasskeyServiceStatus.Succeeded,
            new PasskeyStepUpOptionsResponse(
                challenge.Id,
                operationCategory,
                optionsResult.Options,
                expiresAtUtc,
                CreatePolicyReadout(requiresFreshStepUp: true)));
    }

    public async Task<PasskeyStepUpCompleteServiceResult> CompleteStepUpAsync(
        AuthenticatedActor actor,
        PasskeyStepUpCompleteRequest request,
        CancellationToken cancellationToken)
    {
        var occurredAtUtc = timeProvider.GetUtcNow();
        var challenge = await LoadChallengeAsync(
            request.PasskeyChallengeId,
            AuthChallengePurposes.PasskeyStepUp,
            actor.AuthAccountId,
            actor.AuthSessionId,
            cancellationToken);
        if (!TryPrepareChallengeForVerification(challenge, occurredAtUtc, out var challengeStatus))
        {
            return new PasskeyStepUpCompleteServiceResult(challengeStatus);
        }

        if (!webAuthnProvider.TryExtractChallenge(request.Credential, out var verifiedChallenge)
            || !ChallengeMatches(challenge!, verifiedChallenge)
            || !webAuthnProvider.TryExtractCredentialId(request.Credential, out var credentialId))
        {
            await MarkChallengeFailedAsync(challenge!, "challenge_mismatch", occurredAtUtc, cancellationToken);
            return new PasskeyStepUpCompleteServiceResult(PasskeyServiceStatus.Conflict);
        }

        var credentialIdHash = Fido2PasskeyWebAuthnProvider.HashCredentialId(credentialId);
        var credential = await dbContext.Set<AuthPasskeyCredential>()
            .SingleOrDefaultAsync(
                passkey => passkey.AuthAccountId == actor.AuthAccountId
                    && passkey.CredentialIdHash == credentialIdHash
                    && passkey.Status == AuthPasskeyCredentialStatuses.Enrolled,
                cancellationToken);
        if (credential is null)
        {
            await MarkChallengeFailedAsync(challenge!, "credential_unavailable", occurredAtUtc, cancellationToken);
            return new PasskeyStepUpCompleteServiceResult(PasskeyServiceStatus.Denied);
        }

        var credentials = await LoadAccountPasskeysAsync(actor.AuthAccountId, enrolledOnly: true, cancellationToken);
        try
        {
            var verificationResult = await webAuthnProvider.VerifyAssertionAsync(
                new PasskeyAssertionVerificationRequest(
                    request.Credential,
                    verifiedChallenge,
                    credential,
                    credentials,
                    "preferred"),
                cancellationToken);
            UpdateCredentialAfterAssertion(credential, verificationResult, occurredAtUtc);
        }
        catch (Exception)
        {
            await MarkChallengeFailedAsync(challenge!, "verification_failed", occurredAtUtc, cancellationToken);
            return new PasskeyStepUpCompleteServiceResult(PasskeyServiceStatus.VerificationFailed);
        }

        challenge!.AuthPasskeyCredentialId = credential.Id;
        challenge.Status = AuthChallengeStatuses.Consumed;
        challenge.ConsumedAtUtc = occurredAtUtc;
        challenge.UpdatedAtUtc = occurredAtUtc;
        await WriteAuditAsync(
            "step_up.satisfied",
            AuthAuditOutcomes.Success,
            actor.AuthAccountId,
            actor.AuthAccountId,
            credential.Id,
            challenge.Id,
            "passkey",
            occurredAtUtc,
            cancellationToken);

        if (!await TrySaveAsync(cancellationToken))
        {
            return new PasskeyStepUpCompleteServiceResult(PasskeyServiceStatus.PersistenceFailed);
        }

        return new PasskeyStepUpCompleteServiceResult(
            PasskeyServiceStatus.Succeeded,
            new PasskeyStepUpCompleteResponse(
                "satisfied",
                challenge.RequestContextHash ?? "unspecified",
                occurredAtUtc,
                occurredAtUtc.AddSeconds(Math.Max(60, options.StepUpFreshnessSeconds)),
                PolicyVersion));
    }

    private async Task<AuthAccount?> LoadAvailableAccountAsync(Guid authAccountId, CancellationToken cancellationToken)
    {
        var account = await dbContext.Set<AuthAccount>()
            .Include(account => account.UserProfile)
            .SingleOrDefaultAsync(account => account.Id == authAccountId, cancellationToken);
        return IsAccountAvailable(account) ? account : null;
    }

    private static bool IsAccountAvailable(AuthAccount? account)
    {
        return account is not null
            && account.Status == AuthAccountStatuses.Active
            && account.DisabledAtUtc is null
            && account.DeletedAtUtc is null;
    }

    private async Task<List<AuthPasskeyCredential>> LoadAccountPasskeysAsync(
        Guid authAccountId,
        bool enrolledOnly,
        CancellationToken cancellationToken)
    {
        var query = dbContext.Set<AuthPasskeyCredential>()
            .Where(credential => credential.AuthAccountId == authAccountId);
        if (enrolledOnly)
        {
            query = query.Where(credential => credential.Status == AuthPasskeyCredentialStatuses.Enrolled);
        }

        return await query.OrderByDescending(credential => credential.CreatedAtUtc).ToListAsync(cancellationToken);
    }

    private async Task<List<AuthPasskeyCredential>> LoadSignInCandidateCredentialsAsync(
        string? identifierHint,
        CancellationToken cancellationToken)
    {
        var query = dbContext.Set<AuthPasskeyCredential>()
            .Include(credential => credential.AuthAccount)
            .Where(credential => credential.Status == AuthPasskeyCredentialStatuses.Enrolled);

        if (!string.IsNullOrWhiteSpace(identifierHint))
        {
            var normalizedHint = identifierHint.Trim();
            query = query.Where(credential => credential.AuthAccount.Identities.Any(identity =>
                identity.ProviderType == AuthIdentityProviderTypes.Local
                && identity.DisabledAtUtc == null
                && identity.ProviderSubject == normalizedHint));
        }

        return await query.Take(50).ToListAsync(cancellationToken);
    }

    private Task<AuthChallenge?> LoadChallengeAsync(
        Guid challengeId,
        string purpose,
        Guid? authAccountId,
        Guid? authSessionId,
        CancellationToken cancellationToken)
    {
        return dbContext.Set<AuthChallenge>()
            .SingleOrDefaultAsync(
                challenge => challenge.Id == challengeId
                    && challenge.Purpose == purpose
                    && (authAccountId == null || challenge.AuthAccountId == authAccountId)
                    && (authSessionId == null || challenge.AuthSessionId == authSessionId),
                cancellationToken);
    }

    private async Task<AuthPasskeyCredential?> LoadOwnedCredentialAsync(
        Guid authAccountId,
        Guid passkeyCredentialId,
        CancellationToken cancellationToken)
    {
        return await dbContext.Set<AuthPasskeyCredential>()
            .SingleOrDefaultAsync(
                credential => credential.Id == passkeyCredentialId
                    && credential.AuthAccountId == authAccountId,
                cancellationToken);
    }

    private bool TryPrepareChallengeForVerification(
        AuthChallenge? challenge,
        DateTimeOffset occurredAtUtc,
        out PasskeyServiceStatus status)
    {
        status = PasskeyServiceStatus.Succeeded;
        if (challenge is null)
        {
            status = PasskeyServiceStatus.NotFound;
            return false;
        }

        if (challenge.Status != AuthChallengeStatuses.Pending)
        {
            status = PasskeyServiceStatus.Conflict;
            return false;
        }

        if (challenge.ExpiresAtUtc <= occurredAtUtc)
        {
            challenge.Status = AuthChallengeStatuses.Expired;
            challenge.FailedAtUtc = occurredAtUtc;
            challenge.UpdatedAtUtc = occurredAtUtc;
            status = PasskeyServiceStatus.Conflict;
            return false;
        }

        challenge.AttemptCount++;
        if (challenge.AttemptCount > Math.Max(1, challenge.MaxAttemptCount))
        {
            challenge.Status = AuthChallengeStatuses.Blocked;
            challenge.BlockedAtUtc = occurredAtUtc;
            challenge.UpdatedAtUtc = occurredAtUtc;
            status = PasskeyServiceStatus.Conflict;
            return false;
        }

        return true;
    }

    private async Task MarkChallengeFailedAsync(
        AuthChallenge challenge,
        string failureCategory,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        challenge.FailureCategory = BoundOptional(failureCategory, 120);
        challenge.FailedAtUtc = occurredAtUtc;
        challenge.UpdatedAtUtc = occurredAtUtc;
        if (challenge.AttemptCount >= Math.Max(1, challenge.MaxAttemptCount))
        {
            challenge.Status = AuthChallengeStatuses.Blocked;
            challenge.BlockedAtUtc = occurredAtUtc;
        }

        await WriteAuditAsync(
            "passkey.challenge_failed",
            AuthAuditOutcomes.Failure,
            null,
            challenge.AuthAccountId,
            challenge.AuthPasskeyCredentialId,
            challenge.Id,
            failureCategory,
            occurredAtUtc,
            cancellationToken);
        await TrySaveAsync(cancellationToken);
    }

    private static bool ChallengeMatches(AuthChallenge challenge, byte[] verifiedChallenge)
    {
        return string.Equals(
            challenge.ChallengeVerifierHash,
            Fido2PasskeyWebAuthnProvider.HashChallenge(verifiedChallenge),
            StringComparison.Ordinal);
    }

    private static void UpdateCredentialAfterAssertion(
        AuthPasskeyCredential credential,
        PasskeyAssertionVerificationResult verificationResult,
        DateTimeOffset occurredAtUtc)
    {
        if (credential.SignatureCounter is not null
            && verificationResult.SignatureCounter > 0
            && credential.SignatureCounter > verificationResult.SignatureCounter)
        {
            credential.LastReplaySuspectedAtUtc = occurredAtUtc;
        }

        credential.SignatureCounter = verificationResult.SignatureCounter;
        credential.BackupState = verificationResult.BackupState;
        credential.LastUsedAtUtc = occurredAtUtc;
        credential.UpdatedAtUtc = occurredAtUtc;
    }

    private async Task<IReadOnlyList<string>> LoadSystemRolesAsync(
        Guid authAccountId,
        CancellationToken cancellationToken)
    {
        var roles = await dbContext.Set<SystemRoleAssignment>()
            .Where(role => role.AuthAccountId == authAccountId)
            .Select(role => role.Role)
            .Distinct()
            .ToListAsync(cancellationToken);
        roles.Sort(SettleoraAuthorizationPolicies.CompareSystemRoles);
        return roles;
    }

    private PasskeyPolicyReadout CreatePolicyReadout(bool requiresFreshStepUp = false)
    {
        return new PasskeyPolicyReadout(
            PolicyVersion,
            AuthSecurityPolicySupportModes.Optional,
            AuthSecurityPolicySupportModes.Disabled,
            AuthSecurityPolicySupportModes.Disabled,
            AuthSecurityPolicyEnforcementModes.Optional,
            "unknown",
            RequiresEnrollment: false,
            RequiresFreshStepUp: requiresFreshStepUp,
            RecoveryCodesLow: false,
            ServerAuthoritative: true);
    }

    private static PasskeyCredentialSummary MapCredential(AuthPasskeyCredential credential)
    {
        return new PasskeyCredentialSummary(
            credential.Id,
            credential.DisplayLabel,
            credential.Status,
            credential.BackupEligible,
            credential.BackupState,
            SplitCsv(credential.Transports),
            credential.AttestationPolicyResult,
            credential.CreatedAtUtc,
            credential.EnrolledAtUtc,
            credential.LastUsedAtUtc,
            credential.UpdatedAtUtc,
            credential.DisabledAtUtc,
            credential.RevokedAtUtc);
    }

    private static IReadOnlyList<string> SplitCsv(string? csv)
    {
        return string.IsNullOrWhiteSpace(csv)
            ? []
            : csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Take(8)
                .ToArray();
    }

    private static string BoundTransport(string value)
    {
        return BoundOptional(value, 32) ?? string.Empty;
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

    private int GetChallengeExpirySeconds()
    {
        return Math.Clamp(options.ChallengeExpirySeconds, 60, 900);
    }

    private int GetChallengeMaxAttemptCount()
    {
        return Math.Clamp(options.ChallengeMaxAttemptCount, 1, 10);
    }

    private async Task WriteAuditAsync(
        string action,
        string outcome,
        Guid? actorAuthAccountId,
        Guid? subjectAuthAccountId,
        Guid? credentialId,
        Guid? challengeId,
        string reasonCategory,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        await auditWriter.WriteAsync(
            new PasskeyAuditEvent(
                action,
                outcome,
                actorAuthAccountId,
                subjectAuthAccountId,
                credentialId,
                challengeId,
                reasonCategory,
                occurredAtUtc),
            cancellationToken);
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
            dbContext.ChangeTracker.Clear();
            return false;
        }
    }
}
