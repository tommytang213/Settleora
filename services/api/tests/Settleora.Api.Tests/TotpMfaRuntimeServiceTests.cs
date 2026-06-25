using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Auth.Mfa;
using Settleora.Api.Auth.Policy;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class TotpMfaRuntimeServiceTests
{
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 6, 25, 13, 22, 0, TimeSpan.Zero);

    [Fact]
    public async Task TotpEnrollmentStoresProtectedSecretAndSafeAuditOnly()
    {
        await using var harness = CreateHarness();
        var actor = await SeedActorAsync(harness);

        var start = await harness.Service.StartTotpEnrollmentAsync(
            actor,
            new TotpEnrollmentStartRequest("Main authenticator"),
            CancellationToken.None);

        Assert.Equal(MfaServiceStatus.Succeeded, start.Status);
        var rawSecret = start.Response!.Setup.ManualEntryKey!;
        var factor = await harness.DbContext.Set<AuthMfaFactor>().SingleAsync();
        Assert.Equal(AuthTotpSecretStorageKinds.EncryptedPayload, factor.TotpSecretStorageKind);
        Assert.Null(factor.TotpProtectedSecretReference);
        Assert.NotNull(factor.TotpEncryptedSecretPayload);
        Assert.DoesNotContain(rawSecret, factor.TotpEncryptedSecretPayload, StringComparison.Ordinal);

        var auditJson = (await harness.DbContext.Set<AuthAuditEvent>().SingleAsync()).SafeMetadataJson;
        Assert.DoesNotContain(rawSecret, auditJson, StringComparison.Ordinal);
        Assert.DoesNotContain("otpauth", auditJson, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task TotpEnrollmentVerificationActivatesFactorAndRejectsRevokedFactorChallenges()
    {
        await using var harness = CreateHarness();
        var actor = await SeedActorAsync(harness);
        var start = await harness.Service.StartTotpEnrollmentAsync(
            actor,
            new TotpEnrollmentStartRequest("Main authenticator"),
            CancellationToken.None);
        var code = CodeForManualEntryKey(start.Response!.Setup.ManualEntryKey!, harness.TimeProvider.GetUtcNow());

        var verify = await harness.Service.VerifyTotpEnrollmentAsync(
            actor,
            start.Response.TotpEnrollmentId,
            new TotpEnrollmentVerifyRequest(code),
            CancellationToken.None);

        Assert.Equal(MfaServiceStatus.Succeeded, verify.Status);
        Assert.Equal(AuthMfaFactorStatuses.Enrolled, (await harness.DbContext.Set<AuthMfaFactor>().SingleAsync()).Status);

        var revoke = await harness.Service.RevokeFactorAsync(actor, start.Response.TotpEnrollmentId, CancellationToken.None);
        Assert.Equal(MfaServiceStatus.Succeeded, revoke.Status);

        var challenge = await harness.Service.CreateChallengeAsync(
            actor,
            new MfaChallengeCreateRequest(AuthChallengePurposes.StepUp, AuthChallengeFactorTypes.Totp, null, "security_settings"),
            CancellationToken.None);
        Assert.Equal(MfaServiceStatus.Denied, challenge.Status);
    }

    private static MfaRuntimeTestHarness CreateHarness()
    {
        var dbContext = new SettleoraDbContext(new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options);
        var timeProvider = new MfaTestTimeProvider(InitialTimestamp);
        var protector = new TestTotpSecretProtector();
        var options = Options.Create(new MfaRuntimeOptions
        {
            TotpIssuer = "Settleora Test",
            RecoveryCodeCount = 8,
            ChallengeMaxAttemptCount = 2
        });
        return new MfaRuntimeTestHarness(
            dbContext,
            timeProvider,
            protector,
            new MfaRuntimeService(
                dbContext,
                protector,
                new TotpCodeService(),
                new RecoveryCodeHasher(),
                new EfMfaAuditWriter(dbContext),
                new AuthSecurityPolicyService(dbContext, timeProvider),
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
            DisplayName = "TOTP User",
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
            Role = SystemRoles.User,
            AssignedAtUtc = InitialTimestamp
        });
        await harness.DbContext.SaveChangesAsync();
        return new AuthenticatedActor(authAccountId, userProfileId, authSessionId, InitialTimestamp.AddHours(1), [SystemRoles.User]);
    }

    private static string CodeForManualEntryKey(string manualEntryKey, DateTimeOffset timestamp)
    {
        var secret = Base32Decode(manualEntryKey);
        return TotpCodeService.GenerateCode(secret, timestamp.ToUnixTimeSeconds() / 30, 6);
    }

    private static byte[] Base32Decode(string value)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var bits = 0;
        var bitCount = 0;
        var bytes = new List<byte>();
        foreach (var character in value)
        {
            var index = alphabet.IndexOf(character);
            Assert.True(index >= 0);
            bits = (bits << 5) | index;
            bitCount += 5;
            if (bitCount >= 8)
            {
                bytes.Add((byte)((bits >> (bitCount - 8)) & 0xff));
                bitCount -= 8;
            }
        }

        return bytes.ToArray();
    }

    private sealed record MfaRuntimeTestHarness(
        SettleoraDbContext DbContext,
        MfaTestTimeProvider TimeProvider,
        TestTotpSecretProtector Protector,
        IMfaRuntimeService Service) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            await DbContext.DisposeAsync();
        }
    }

    private sealed class MfaTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public MfaTestTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow() => utcNow;

        public void SetUtcNow(DateTimeOffset value)
        {
            utcNow = value;
        }
    }

    private sealed class TestTotpSecretProtector : ITotpSecretProtector
    {
        private readonly Dictionary<string, byte[]> secrets = new(StringComparer.Ordinal);

        public string Protect(byte[] secret)
        {
            var handle = $"test-protected:{Guid.NewGuid():N}";
            secrets[handle] = secret.ToArray();
            return handle;
        }

        public byte[] Unprotect(string protectedPayload)
        {
            return secrets[protectedPayload].ToArray();
        }
    }
}
