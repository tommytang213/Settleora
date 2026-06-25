using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Auth.Mfa;
using Settleora.Api.Auth.Passkeys;
using Settleora.Api.Auth.Policy;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class AuthMfaPasskeySecurityRegressionTests
{
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 6, 25, 15, 40, 0, TimeSpan.Zero);
    private static readonly byte[] PasskeyEnrollmentChallenge = Encoding.UTF8.GetBytes("passkey-enrollment-challenge-506");
    private static readonly byte[] PasskeyAssertionChallenge = Encoding.UTF8.GetBytes("passkey-assertion-challenge-506");
    private static readonly byte[] PasskeyCredentialId = Encoding.UTF8.GetBytes("credential-id-506-sensitive");
    private static readonly byte[] PasskeyPublicKey = Encoding.UTF8.GetBytes("public-key-cose-506-sensitive");

    [Fact]
    public async Task PasskeyRegressionRejectsMismatchedChallengeWithoutAuditOrStoragePayloadLeak()
    {
        await using var harness = CreateHarness();
        var actor = await SeedActorAsync(harness);
        var options = await harness.PasskeyService.CreateEnrollmentOptionsAsync(
            actor,
            new PasskeyEnrollmentOptionsRequest("Primary passkey", "none"),
            CancellationToken.None);

        var wrongChallenge = Encoding.UTF8.GetBytes("wrong-operation-challenge-506");
        var complete = await harness.PasskeyService.CompleteEnrollmentAsync(
            actor,
            new PasskeyEnrollmentCompleteRequest(
                options.Response!.PasskeyChallengeId,
                CreateCredentialJson(wrongChallenge, PasskeyCredentialId),
                "Primary passkey"),
            CancellationToken.None);

        Assert.Equal(PasskeyServiceStatus.Conflict, complete.Status);
        Assert.Empty(await harness.DbContext.Set<AuthPasskeyCredential>().ToListAsync());
        var challenge = await harness.DbContext.Set<AuthChallenge>().SingleAsync();
        Assert.Equal("challenge_mismatch", challenge.FailureCategory);
        Assert.DoesNotContain(WebEncoders.Base64UrlEncode(PasskeyEnrollmentChallenge), challenge.ChallengeVerifierHash);
        Assert.DoesNotContain(WebEncoders.Base64UrlEncode(wrongChallenge), challenge.ChallengeVerifierHash);

        await AssertAuditFreeOfSensitiveValuesAsync(
            harness.DbContext,
            WebEncoders.Base64UrlEncode(PasskeyEnrollmentChallenge),
            WebEncoders.Base64UrlEncode(wrongChallenge),
            WebEncoders.Base64UrlEncode(PasskeyCredentialId),
            WebEncoders.Base64UrlEncode(PasskeyPublicKey),
            "credential-id-506-sensitive",
            "public-key-cose-506-sensitive");
    }

    [Fact]
    public async Task TotpRegressionHidesProvisioningMaterialAfterEnrollmentBeginAndFailedOtpAudit()
    {
        await using var harness = CreateHarness();
        var actor = await SeedActorAsync(harness);
        var start = await harness.MfaService.StartTotpEnrollmentAsync(
            actor,
            new TotpEnrollmentStartRequest("Main authenticator"),
            CancellationToken.None);
        var rawManualEntryKey = start.Response!.Setup.ManualEntryKey!;
        var provisioningUri = start.Response.Setup.ProvisioningUri!;

        var wrongOtp = "123456";
        var failedVerify = await harness.MfaService.VerifyTotpEnrollmentAsync(
            actor,
            start.Response.TotpEnrollmentId,
            new TotpEnrollmentVerifyRequest(wrongOtp),
            CancellationToken.None);
        var list = await harness.MfaService.ListFactorsAsync(actor, CancellationToken.None);

        Assert.Equal(MfaServiceStatus.VerificationFailed, failedVerify.Status);
        var factor = await harness.DbContext.Set<AuthMfaFactor>().SingleAsync();
        Assert.DoesNotContain(rawManualEntryKey, factor.TotpEncryptedSecretPayload!, StringComparison.Ordinal);

        var listedJson = JsonSerializer.Serialize(list, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        AssertNoSensitiveText(listedJson, rawManualEntryKey, provisioningUri, wrongOtp, "otpauth://");
        await AssertAuditFreeOfSensitiveValuesAsync(harness.DbContext, rawManualEntryKey, provisioningUri, wrongOtp, "otpauth://");
    }

    [Fact]
    public async Task RecoveryRegressionShowsCodesOnceThenHidesRawCodesVerifierMaterialAndReplayDetails()
    {
        await using var harness = CreateHarness();
        var actor = await SeedActorAsync(harness);
        await SeedEnrolledTotpFactorAsync(harness, actor.AuthAccountId);

        var generate = await harness.MfaService.GenerateRecoveryCodesAsync(
            actor,
            new RecoveryCodeBatchGenerateRequest("initial_setup", ReplaceExisting: false),
            CancellationToken.None);
        var rawCode = generate.Response!.RecoveryCodes[0];
        var metadata = await harness.MfaService.ListRecoveryCodeBatchesAsync(actor, CancellationToken.None);
        var verifier = await harness.DbContext.Set<AuthRecoveryCodeVerifier>().FirstAsync();

        Assert.True(generate.Response.DisplayOnce);
        var metadataJson = JsonSerializer.Serialize(metadata, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        AssertNoSensitiveText(metadataJson, rawCode, verifier.VerifierHash, verifier.VerifierSalt);
        AssertNoSensitiveText(verifier.VerifierHash, rawCode);
        AssertNoSensitiveText(verifier.VerifierSalt, rawCode);

        var challenge = await harness.MfaService.CreateChallengeAsync(
            actor,
            new MfaChallengeCreateRequest(AuthChallengePurposes.StepUp, AuthChallengeFactorTypes.RecoveryCode, null, "security_settings"),
            CancellationToken.None);
        var firstUse = await harness.MfaService.VerifyRecoveryCodeChallengeAsync(
            actor,
            challenge.Response!.MfaChallengeId,
            new MfaRecoveryCodeVerifyRequest(rawCode),
            CancellationToken.None);
        var replayChallenge = await harness.MfaService.CreateChallengeAsync(
            actor,
            new MfaChallengeCreateRequest(AuthChallengePurposes.StepUp, AuthChallengeFactorTypes.RecoveryCode, null, "security_settings"),
            CancellationToken.None);
        var replay = await harness.MfaService.VerifyRecoveryCodeChallengeAsync(
            actor,
            replayChallenge.Response!.MfaChallengeId,
            new MfaRecoveryCodeVerifyRequest(rawCode),
            CancellationToken.None);

        Assert.Equal(MfaServiceStatus.Succeeded, firstUse.Status);
        Assert.Equal(MfaServiceStatus.VerificationFailed, replay.Status);
        await AssertAuditFreeOfSensitiveValuesAsync(harness.DbContext, rawCode, verifier.VerifierHash, verifier.VerifierSalt);
    }

    [Fact]
    public async Task PolicyStepUpRegressionDeniesWrongSessionFreshnessWithoutSensitiveAuditLeak()
    {
        await using var harness = CreateHarness();
        var actor = await SeedActorAsync(harness, role: SystemRoles.Owner);
        var credential = await SeedPasskeyCredentialAsync(harness, actor.AuthAccountId);
        var wrongSessionId = Guid.NewGuid();
        harness.DbContext.Set<AuthChallenge>().Add(new AuthChallenge
        {
            Id = Guid.NewGuid(),
            AuthAccountId = actor.AuthAccountId,
            AuthSessionId = wrongSessionId,
            AuthPasskeyCredentialId = credential.Id,
            Purpose = AuthChallengePurposes.PasskeyStepUp,
            FactorType = AuthChallengeFactorTypes.Passkey,
            Status = AuthChallengeStatuses.Consumed,
            ChallengeVerifierHash = "sha256:not-a-raw-challenge",
            ChallengeVerifierAlgorithm = "sha256",
            RequestContextHash = AuthSecurityPolicyOperations.PasskeyCredentialManagement,
            CorrelationId = "step-up-correlation-506",
            AttemptCount = 1,
            MaxAttemptCount = 2,
            CreatedAtUtc = InitialTimestamp.AddMinutes(-2),
            UpdatedAtUtc = InitialTimestamp.AddMinutes(-1),
            ExpiresAtUtc = InitialTimestamp.AddMinutes(3),
            ConsumedAtUtc = InitialTimestamp.AddMinutes(-1)
        });
        await harness.DbContext.SaveChangesAsync();

        var update = await harness.PasskeyService.UpdateCredentialAsync(
            actor,
            credential.Id,
            new PasskeyCredentialUpdateRequest("Updated label"),
            CancellationToken.None);

        Assert.Equal(PasskeyServiceStatus.Denied, update.Status);
        Assert.Equal("Seeded passkey", (await harness.DbContext.Set<AuthPasskeyCredential>().SingleAsync()).DisplayLabel);
        await AssertAuditFreeOfSensitiveValuesAsync(
            harness.DbContext,
            wrongSessionId.ToString(),
            WebEncoders.Base64UrlEncode(PasskeyAssertionChallenge),
            WebEncoders.Base64UrlEncode(PasskeyCredentialId));
    }

    private static AuthRegressionHarness CreateHarness()
    {
        var dbContext = new SettleoraDbContext(new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options);
        var timeProvider = new RegressionTimeProvider(InitialTimestamp);
        var policyService = new AuthSecurityPolicyService(dbContext, timeProvider);
        var mfaService = new MfaRuntimeService(
            dbContext,
            new RegressionTotpSecretProtector(),
            new TotpCodeService(),
            new RecoveryCodeHasher(),
            new EfMfaAuditWriter(dbContext),
            policyService,
            timeProvider,
            Options.Create(new MfaRuntimeOptions
            {
                TotpIssuer = "Settleora Regression",
                RecoveryCodeCount = 8,
                ChallengeMaxAttemptCount = 2
            }));
        var passkeyService = new PasskeyRuntimeService(
            dbContext,
            new RegressionPasskeyWebAuthnProvider(),
            new EfPasskeyAuditWriter(dbContext),
            new RegressionAuthSessionRuntimeService(),
            policyService,
            timeProvider,
            Options.Create(new PasskeyWebAuthnOptions
            {
                ChallengeExpirySeconds = 300,
                ChallengeMaxAttemptCount = 2
            }));

        return new AuthRegressionHarness(dbContext, timeProvider, mfaService, passkeyService);
    }

    private static async Task<AuthenticatedActor> SeedActorAsync(
        AuthRegressionHarness harness,
        string role = SystemRoles.User)
    {
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();
        var authSessionId = Guid.NewGuid();
        harness.DbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = "Auth Regression User",
            DefaultCurrency = "USD",
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        harness.DbContext.Set<AuthAccount>().Add(new AuthAccount
        {
            Id = authAccountId,
            UserProfileId = userProfileId,
            Status = AuthAccountStatuses.Active,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        harness.DbContext.Set<SystemRoleAssignment>().Add(new SystemRoleAssignment
        {
            AuthAccountId = authAccountId,
            Role = role,
            AssignedAtUtc = InitialTimestamp
        });
        await harness.DbContext.SaveChangesAsync();
        return new AuthenticatedActor(authAccountId, userProfileId, authSessionId, InitialTimestamp.AddHours(1), [role]);
    }

    private static async Task SeedEnrolledTotpFactorAsync(AuthRegressionHarness harness, Guid authAccountId)
    {
        harness.DbContext.Set<AuthMfaFactor>().Add(new AuthMfaFactor
        {
            Id = Guid.NewGuid(),
            AuthAccountId = authAccountId,
            FactorType = AuthMfaFactorTypes.Totp,
            Status = AuthMfaFactorStatuses.Enrolled,
            DisplayLabel = "Authenticator",
            TotpSecretStorageKind = AuthTotpSecretStorageKinds.EncryptedPayload,
            TotpEncryptedSecretPayload = Convert.ToBase64String(Encoding.UTF8.GetBytes("totp-secret-506-in-protector")),
            TotpIssuer = "Settleora",
            TotpAccountLabel = "Auth Regression User",
            TotpAlgorithm = "sha1",
            TotpDigits = 6,
            TotpPeriodSeconds = 30,
            PolicyVersion = "runtime-default",
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            VerifiedAtUtc = InitialTimestamp
        });
        await harness.DbContext.SaveChangesAsync();
    }

    private static async Task<AuthPasskeyCredential> SeedPasskeyCredentialAsync(
        AuthRegressionHarness harness,
        Guid authAccountId)
    {
        var credential = new AuthPasskeyCredential
        {
            Id = Guid.NewGuid(),
            AuthAccountId = authAccountId,
            CredentialIdHash = Fido2PasskeyWebAuthnProvider.HashCredentialId(PasskeyCredentialId),
            PublicKeyCose = WebEncoders.Base64UrlEncode(PasskeyPublicKey),
            UserHandleHash = Fido2PasskeyWebAuthnProvider.HashUserHandle(authAccountId),
            SignatureCounter = 1,
            BackupEligible = true,
            BackupState = false,
            DisplayLabel = "Seeded passkey",
            Status = AuthPasskeyCredentialStatuses.Enrolled,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            EnrolledAtUtc = InitialTimestamp
        };
        harness.DbContext.Set<AuthPasskeyCredential>().Add(credential);
        await harness.DbContext.SaveChangesAsync();
        return credential;
    }

    private static JsonElement CreateCredentialJson(byte[] challenge, byte[] credentialId)
    {
        var clientData = JsonSerializer.SerializeToUtf8Bytes(new
        {
            type = "webauthn.get",
            challenge = WebEncoders.Base64UrlEncode(challenge),
            origin = "http://localhost"
        });
        var credential = new
        {
            id = WebEncoders.Base64UrlEncode(credentialId),
            rawId = WebEncoders.Base64UrlEncode(credentialId),
            type = "public-key",
            response = new
            {
                clientDataJSON = WebEncoders.Base64UrlEncode(clientData)
            }
        };
        return JsonSerializer.SerializeToElement(credential, new JsonSerializerOptions(JsonSerializerDefaults.Web));
    }

    private static async Task AssertAuditFreeOfSensitiveValuesAsync(
        SettleoraDbContext dbContext,
        params string[] sensitiveValues)
    {
        var auditEvents = await dbContext.Set<AuthAuditEvent>()
            .OrderBy(audit => audit.OccurredAtUtc)
            .ToListAsync();
        var auditText = string.Join(
            "\n",
            auditEvents.Select(audit => string.Join("|", audit.Action, audit.Outcome, audit.SafeMetadataJson ?? string.Empty)));
        AssertNoSensitiveText(auditText, sensitiveValues);
    }

    private static void AssertNoSensitiveText(string text, params string[] sensitiveValues)
    {
        foreach (var sensitiveValue in sensitiveValues.Where(value => !string.IsNullOrWhiteSpace(value)))
        {
            Assert.DoesNotContain(sensitiveValue, text, StringComparison.Ordinal);
        }
    }

    private sealed record AuthRegressionHarness(
        SettleoraDbContext DbContext,
        RegressionTimeProvider TimeProvider,
        IMfaRuntimeService MfaService,
        IPasskeyRuntimeService PasskeyService) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            await DbContext.DisposeAsync();
        }
    }

    private sealed class RegressionTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset utcNow;

        public RegressionTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    private sealed class RegressionTotpSecretProtector : ITotpSecretProtector
    {
        public string Protect(byte[] secret)
        {
            return Convert.ToBase64String(secret);
        }

        public byte[] Unprotect(string protectedPayload)
        {
            return Convert.FromBase64String(protectedPayload);
        }
    }

    private sealed class RegressionPasskeyWebAuthnProvider : IPasskeyWebAuthnProvider
    {
        public PasskeyCreationOptionsResult CreateCredentialOptions(PasskeyCreationOptionsRequest request)
        {
            return new PasskeyCreationOptionsResult(
                new { challenge = WebEncoders.Base64UrlEncode(PasskeyEnrollmentChallenge) },
                PasskeyEnrollmentChallenge);
        }

        public PasskeyAssertionOptionsResult CreateAssertionOptions(PasskeyAssertionOptionsRequest request)
        {
            return new PasskeyAssertionOptionsResult(
                new { challenge = WebEncoders.Base64UrlEncode(PasskeyAssertionChallenge) },
                PasskeyAssertionChallenge);
        }

        public Task<PasskeyCredentialVerificationResult> VerifyCredentialAsync(
            PasskeyCredentialVerificationRequest request,
            CancellationToken cancellationToken)
        {
            return Task.FromResult(new PasskeyCredentialVerificationResult(
                PasskeyCredentialId,
                PasskeyPublicKey,
                1,
                BackupEligible: true,
                BackupState: false,
                ["internal"],
                "none"));
        }

        public Task<PasskeyAssertionVerificationResult> VerifyAssertionAsync(
            PasskeyAssertionVerificationRequest request,
            CancellationToken cancellationToken)
        {
            return Task.FromResult(new PasskeyAssertionVerificationResult(2, BackupState: true));
        }

        public bool TryExtractChallenge(JsonElement credential, out byte[] challenge)
        {
            challenge = [];
            if (!credential.TryGetProperty("response", out var response)
                || !response.TryGetProperty("clientDataJSON", out var clientDataJson)
                || clientDataJson.GetString() is not { } encodedClientData)
            {
                return false;
            }

            using var clientData = JsonDocument.Parse(WebEncoders.Base64UrlDecode(encodedClientData));
            challenge = WebEncoders.Base64UrlDecode(clientData.RootElement.GetProperty("challenge").GetString()!);
            return true;
        }

        public bool TryExtractCredentialId(JsonElement credential, out byte[] credentialId)
        {
            credentialId = WebEncoders.Base64UrlDecode(credential.GetProperty("rawId").GetString()!);
            return true;
        }
    }

    private sealed class RegressionAuthSessionRuntimeService : IAuthSessionRuntimeService
    {
        public Task<AuthSessionCreationResult> CreateSessionAsync(
            AuthSessionCreationRequest request,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(AuthSessionCreationResult.Created(
                Guid.NewGuid(),
                "raw-session-token-506-not-returned",
                InitialTimestamp.AddHours(1)));
        }

        public Task<AuthSessionValidationResult> ValidateSessionAsync(
            string? rawSessionToken,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(AuthSessionValidationResult.Failure(AuthSessionValidationStatus.SessionUnavailable));
        }

        public Task<AuthSessionRevocationResult> RevokeSessionAsync(
            AuthSessionRevocationRequest request,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(AuthSessionRevocationResult.Failure(AuthSessionRevocationStatus.NotFound));
        }

        public Task<AuthAccountSessionRevocationResult> RevokeActiveSessionsForAccountAsync(
            AuthAccountSessionRevocationRequest request,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(AuthAccountSessionRevocationResult.Revoked());
        }
    }
}
