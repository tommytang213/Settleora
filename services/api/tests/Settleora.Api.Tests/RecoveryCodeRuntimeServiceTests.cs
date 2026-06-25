using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Auth.Mfa;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class RecoveryCodeRuntimeServiceTests
{
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 6, 25, 13, 22, 0, TimeSpan.Zero);

    [Fact]
    public async Task RecoveryCodesDisplayOnceAndPersistVerifierOnlyMaterial()
    {
        await using var harness = CreateHarness();
        var actor = await SeedActorAsync(harness);
        await SeedTotpFactorAsync(harness, actor.AuthAccountId);

        var generate = await harness.Service.GenerateRecoveryCodesAsync(
            actor,
            new RecoveryCodeBatchGenerateRequest("initial_setup", ReplaceExisting: false),
            CancellationToken.None);

        Assert.Equal(MfaServiceStatus.Succeeded, generate.Status);
        Assert.True(generate.Response!.DisplayOnce);
        Assert.Equal(8, generate.Response.RecoveryCodes.Count);
        var rawCode = generate.Response.RecoveryCodes[0];
        var metadata = await harness.Service.ListRecoveryCodeBatchesAsync(actor, CancellationToken.None);
        Assert.Single(metadata.Batches);

        var verifier = await harness.DbContext.Set<AuthRecoveryCodeVerifier>().FirstAsync();
        Assert.NotEqual(rawCode, verifier.VerifierHash);
        Assert.DoesNotContain(rawCode, verifier.VerifierHash, StringComparison.Ordinal);
        Assert.DoesNotContain(rawCode, verifier.VerifierSalt, StringComparison.Ordinal);
        Assert.DoesNotContain(rawCode, (await harness.DbContext.Set<AuthAuditEvent>().SingleAsync()).SafeMetadataJson, StringComparison.Ordinal);
    }

    [Fact]
    public async Task RecoveryCodeVerificationConsumesCodeAndRejectsReplay()
    {
        await using var harness = CreateHarness();
        var actor = await SeedActorAsync(harness);
        await SeedTotpFactorAsync(harness, actor.AuthAccountId);
        var generate = await harness.Service.GenerateRecoveryCodesAsync(
            actor,
            new RecoveryCodeBatchGenerateRequest("initial_setup", ReplaceExisting: false),
            CancellationToken.None);
        var challenge = await harness.Service.CreateChallengeAsync(
            actor,
            new MfaChallengeCreateRequest(AuthChallengePurposes.StepUp, AuthChallengeFactorTypes.RecoveryCode, null, "security_settings"),
            CancellationToken.None);

        var first = await harness.Service.VerifyRecoveryCodeChallengeAsync(
            actor,
            challenge.Response!.MfaChallengeId,
            new MfaRecoveryCodeVerifyRequest(generate.Response!.RecoveryCodes[0]),
            CancellationToken.None);
        var replayChallenge = await harness.Service.CreateChallengeAsync(
            actor,
            new MfaChallengeCreateRequest(AuthChallengePurposes.StepUp, AuthChallengeFactorTypes.RecoveryCode, null, "security_settings"),
            CancellationToken.None);
        var replay = await harness.Service.VerifyRecoveryCodeChallengeAsync(
            actor,
            replayChallenge.Response!.MfaChallengeId,
            new MfaRecoveryCodeVerifyRequest(generate.Response.RecoveryCodes[0]),
            CancellationToken.None);

        Assert.Equal(MfaServiceStatus.Succeeded, first.Status);
        Assert.Equal(MfaServiceStatus.VerificationFailed, replay.Status);
        var batch = await harness.DbContext.Set<AuthRecoveryCodeBatch>().SingleAsync();
        Assert.Equal(1, batch.UsedCount);
        Assert.Equal(7, batch.RemainingUnusedCount);
        Assert.Equal(AuthRecoveryCodeVerifierStatuses.Consumed, await harness.DbContext.Set<AuthRecoveryCodeVerifier>().Where(verifier => verifier.ConsumedAtUtc != null).Select(verifier => verifier.Status).SingleAsync());
    }

    private static MfaRuntimeTestHarness CreateHarness()
    {
        var dbContext = new SettleoraDbContext(new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options);
        var timeProvider = new MfaTestTimeProvider(InitialTimestamp);
        var options = Options.Create(new MfaRuntimeOptions { RecoveryCodeCount = 8 });
        return new MfaRuntimeTestHarness(
            dbContext,
            timeProvider,
            new MfaRuntimeService(
                dbContext,
                new TestTotpSecretProtector(),
                new TotpCodeService(),
                new RecoveryCodeHasher(),
                new EfMfaAuditWriter(dbContext),
                timeProvider,
                options));
    }

    private static async Task<AuthenticatedActor> SeedActorAsync(MfaRuntimeTestHarness harness)
    {
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();
        var authSessionId = Guid.NewGuid();
        harness.DbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = "Recovery User",
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
        await harness.DbContext.SaveChangesAsync();
        return new AuthenticatedActor(authAccountId, userProfileId, authSessionId, InitialTimestamp.AddHours(1), [SystemRoles.User]);
    }

    private static async Task SeedTotpFactorAsync(MfaRuntimeTestHarness harness, Guid authAccountId)
    {
        harness.DbContext.Set<AuthMfaFactor>().Add(new AuthMfaFactor
        {
            Id = Guid.NewGuid(),
            AuthAccountId = authAccountId,
            FactorType = AuthMfaFactorTypes.Totp,
            Status = AuthMfaFactorStatuses.Enrolled,
            DisplayLabel = "Authenticator",
            TotpSecretStorageKind = AuthTotpSecretStorageKinds.EncryptedPayload,
            TotpEncryptedSecretPayload = "not-used-by-recovery-test",
            TotpIssuer = "Settleora",
            TotpAccountLabel = "Recovery User",
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

    private sealed record MfaRuntimeTestHarness(
        SettleoraDbContext DbContext,
        MfaTestTimeProvider TimeProvider,
        IMfaRuntimeService Service) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            await DbContext.DisposeAsync();
        }
    }

    private sealed class MfaTestTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset utcNow;

        public MfaTestTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    private sealed class TestTotpSecretProtector : ITotpSecretProtector
    {
        public string Protect(byte[] secret) => Convert.ToBase64String(secret);

        public byte[] Unprotect(string protectedPayload) => Convert.FromBase64String(protectedPayload);
    }
}
