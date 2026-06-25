using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Auth.Passkeys;
using Settleora.Api.Auth.Policy;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class PasskeyRuntimeServiceTests
{
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 6, 24, 16, 15, 0, TimeSpan.Zero);
    private static readonly byte[] EnrollmentChallenge = Encoding.UTF8.GetBytes("passkey-enrollment-challenge");
    private static readonly byte[] AssertionChallenge = Encoding.UTF8.GetBytes("passkey-assertion-challenge");
    private static readonly byte[] CredentialId = Encoding.UTF8.GetBytes("credential-id-503");
    private static readonly byte[] PublicKey = Encoding.UTF8.GetBytes("public-key-cose-503");

    [Fact]
    public async Task EnrollmentOptionsPersistHashOnlyChallengeAndSafeAudit()
    {
        await using var harness = CreateHarness();
        var actor = await SeedActorAsync(harness);

        var result = await harness.Service.CreateEnrollmentOptionsAsync(
            actor,
            new PasskeyEnrollmentOptionsRequest("Laptop", "none"),
            CancellationToken.None);

        Assert.Equal(PasskeyServiceStatus.Succeeded, result.Status);
        Assert.NotNull(result.Response);
        var challenge = await harness.DbContext.Set<AuthChallenge>().SingleAsync();
        Assert.Equal(AuthChallengePurposes.PasskeyEnrollment, challenge.Purpose);
        Assert.Equal(AuthChallengeStatuses.Pending, challenge.Status);
        Assert.StartsWith("sha256:", challenge.ChallengeVerifierHash, StringComparison.Ordinal);
        Assert.DoesNotContain(
            WebEncoders.Base64UrlEncode(EnrollmentChallenge),
            challenge.ChallengeVerifierHash,
            StringComparison.Ordinal);

        var audit = await harness.DbContext.Set<AuthAuditEvent>().SingleAsync();
        Assert.Equal("passkey.enrollment_started", audit.Action);
        Assert.DoesNotContain(WebEncoders.Base64UrlEncode(EnrollmentChallenge), audit.SafeMetadataJson);
        Assert.DoesNotContain(WebEncoders.Base64UrlEncode(CredentialId), audit.SafeMetadataJson);
        Assert.DoesNotContain(WebEncoders.Base64UrlEncode(PublicKey), audit.SafeMetadataJson);
    }

    [Fact]
    public async Task CompleteEnrollmentCreatesCredentialConsumesChallengeAndDoesNotStoreRawCredentialId()
    {
        await using var harness = CreateHarness();
        var actor = await SeedActorAsync(harness);
        var optionsResult = await harness.Service.CreateEnrollmentOptionsAsync(
            actor,
            new PasskeyEnrollmentOptionsRequest("Laptop", "none"),
            CancellationToken.None);

        var result = await harness.Service.CompleteEnrollmentAsync(
            actor,
            new PasskeyEnrollmentCompleteRequest(
                optionsResult.Response!.PasskeyChallengeId,
                CreateCredentialJson(EnrollmentChallenge, CredentialId),
                "Work laptop"),
            CancellationToken.None);

        Assert.Equal(PasskeyServiceStatus.Succeeded, result.Status);
        Assert.NotNull(result.Response);
        Assert.Equal("Work laptop", result.Response.Passkey.DisplayLabel);
        Assert.Equal(AuthPasskeyCredentialStatuses.Enrolled, result.Response.Passkey.Status);

        var credential = await harness.DbContext.Set<AuthPasskeyCredential>().SingleAsync();
        Assert.Equal(Fido2PasskeyWebAuthnProvider.HashCredentialId(CredentialId), credential.CredentialIdHash);
        Assert.DoesNotContain(WebEncoders.Base64UrlEncode(CredentialId), credential.CredentialIdHash);
        Assert.Equal(WebEncoders.Base64UrlEncode(PublicKey), credential.PublicKeyCose);
        Assert.Equal(Fido2PasskeyWebAuthnProvider.HashUserHandle(actor.AuthAccountId), credential.UserHandleHash);

        var challenge = await harness.DbContext.Set<AuthChallenge>().SingleAsync();
        Assert.Equal(AuthChallengeStatuses.Consumed, challenge.Status);
        Assert.NotNull(challenge.ConsumedAtUtc);
        Assert.Equal(credential.Id, challenge.AuthPasskeyCredentialId);
    }

    [Fact]
    public async Task CompleteEnrollmentRejectsReplayedConsumedChallenge()
    {
        await using var harness = CreateHarness();
        var actor = await SeedActorAsync(harness);
        var optionsResult = await harness.Service.CreateEnrollmentOptionsAsync(
            actor,
            new PasskeyEnrollmentOptionsRequest("Laptop", "none"),
            CancellationToken.None);
        var request = new PasskeyEnrollmentCompleteRequest(
            optionsResult.Response!.PasskeyChallengeId,
            CreateCredentialJson(EnrollmentChallenge, CredentialId),
            "Laptop");

        var first = await harness.Service.CompleteEnrollmentAsync(actor, request, CancellationToken.None);
        var second = await harness.Service.CompleteEnrollmentAsync(actor, request, CancellationToken.None);

        Assert.Equal(PasskeyServiceStatus.Succeeded, first.Status);
        Assert.Equal(PasskeyServiceStatus.Conflict, second.Status);
        Assert.Single(await harness.DbContext.Set<AuthPasskeyCredential>().ToListAsync());
    }

    [Fact]
    public async Task CompleteEnrollmentRejectsExpiredChallengeWithoutCreatingCredential()
    {
        await using var harness = CreateHarness();
        var actor = await SeedActorAsync(harness);
        var optionsResult = await harness.Service.CreateEnrollmentOptionsAsync(
            actor,
            new PasskeyEnrollmentOptionsRequest("Laptop", "none"),
            CancellationToken.None);
        harness.TimeProvider.SetUtcNow(InitialTimestamp.AddMinutes(10));

        var result = await harness.Service.CompleteEnrollmentAsync(
            actor,
            new PasskeyEnrollmentCompleteRequest(
                optionsResult.Response!.PasskeyChallengeId,
                CreateCredentialJson(EnrollmentChallenge, CredentialId),
                "Laptop"),
            CancellationToken.None);

        Assert.Equal(PasskeyServiceStatus.Conflict, result.Status);
        Assert.Empty(await harness.DbContext.Set<AuthPasskeyCredential>().ToListAsync());
        Assert.Equal(AuthChallengeStatuses.Expired, (await harness.DbContext.Set<AuthChallenge>().SingleAsync()).Status);
    }

    [Fact]
    public async Task CredentialManagementIsCurrentAccountScopedAndRevocationBlocksStepUpAssertion()
    {
        await using var harness = CreateHarness();
        var actor = await SeedActorAsync(harness);
        var otherActor = await SeedActorAsync(harness, displayName: "Other User");
        var credential = await SeedCredentialAsync(harness, actor.AuthAccountId);

        var wrongAccountUpdate = await harness.Service.UpdateCredentialAsync(
            otherActor,
            credential.Id,
            new PasskeyCredentialUpdateRequest("Stolen label"),
            CancellationToken.None);
        Assert.Equal(PasskeyServiceStatus.NotFound, wrongAccountUpdate.Status);

        var revoke = await harness.Service.RevokeCredentialAsync(actor, credential.Id, CancellationToken.None);
        Assert.Equal(PasskeyServiceStatus.Succeeded, revoke.Status);
        var stepUp = await harness.Service.CreateStepUpOptionsAsync(
            actor,
            new PasskeyStepUpOptionsRequest("security_settings"),
            CancellationToken.None);
        Assert.Equal(PasskeyServiceStatus.Denied, stepUp.Status);
    }

    [Fact]
    public async Task SignInAssertionUpdatesCounterAndReturnsTokenFreeCurrentUserSummary()
    {
        await using var harness = CreateHarness();
        var actor = await SeedActorAsync(harness);
        await SeedCredentialAsync(harness, actor.AuthAccountId);
        var options = await harness.Service.CreateSignInOptionsAsync(
            new PasskeySignInOptionsRequest(null, "preferred"),
            CancellationToken.None);

        var result = await harness.Service.CompleteSignInAsync(
            new PasskeySignInCompleteRequest(
                options.Response!.PasskeyChallengeId,
                CreateCredentialJson(AssertionChallenge, CredentialId),
                "Passkey device"),
            CancellationToken.None);

        Assert.Equal(PasskeyServiceStatus.Succeeded, result.Status);
        Assert.NotNull(result.Response);
        Assert.Equal("signed_in", result.Response.Status);
        Assert.NotNull(result.Response.CurrentUser);
        Assert.Equal(actor.AuthAccountId, result.Response.CurrentUser.AuthAccountId);
        Assert.Null(result.Response.MfaChallenge);

        var serialized = JsonSerializer.Serialize(result.Response, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.DoesNotContain("token", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("refresh", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(WebEncoders.Base64UrlEncode(CredentialId), serialized);
        Assert.Equal(2, (await harness.DbContext.Set<AuthPasskeyCredential>().SingleAsync()).SignatureCounter);
    }

    private static PasskeyTestHarness CreateHarness()
    {
        var dbContext = new SettleoraDbContext(new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options);
        var timeProvider = new PasskeyTestTimeProvider(InitialTimestamp);
        var webAuthnProvider = new FakePasskeyWebAuthnProvider();
        var auditWriter = new EfPasskeyAuditWriter(dbContext);
        var sessionRuntimeService = new FakeAuthSessionRuntimeService();
        var options = Options.Create(new PasskeyWebAuthnOptions
        {
            ChallengeExpirySeconds = 300,
            ChallengeMaxAttemptCount = 2
        });

        return new PasskeyTestHarness(
            dbContext,
            timeProvider,
            new PasskeyRuntimeService(
                dbContext,
                webAuthnProvider,
                auditWriter,
                sessionRuntimeService,
                new AuthSecurityPolicyService(dbContext, timeProvider),
                timeProvider,
                options));
    }

    private static async Task<AuthenticatedActor> SeedActorAsync(
        PasskeyTestHarness harness,
        string displayName = "Passkey Test User")
    {
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();
        var authSessionId = Guid.NewGuid();
        harness.DbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = displayName,
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
        return new AuthenticatedActor(
            authAccountId,
            userProfileId,
            authSessionId,
            InitialTimestamp.AddHours(1),
            [SystemRoles.User]);
    }

    private static async Task<AuthPasskeyCredential> SeedCredentialAsync(
        PasskeyTestHarness harness,
        Guid authAccountId,
        string status = AuthPasskeyCredentialStatuses.Enrolled)
    {
        var credential = new AuthPasskeyCredential
        {
            Id = Guid.NewGuid(),
            AuthAccountId = authAccountId,
            CredentialIdHash = Fido2PasskeyWebAuthnProvider.HashCredentialId(CredentialId),
            PublicKeyCose = WebEncoders.Base64UrlEncode(PublicKey),
            UserHandleHash = Fido2PasskeyWebAuthnProvider.HashUserHandle(authAccountId),
            SignatureCounter = 1,
            BackupEligible = true,
            BackupState = false,
            DisplayLabel = "Seeded passkey",
            Status = status,
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

    private sealed class FakePasskeyWebAuthnProvider : IPasskeyWebAuthnProvider
    {
        public PasskeyCreationOptionsResult CreateCredentialOptions(PasskeyCreationOptionsRequest request)
        {
            return new PasskeyCreationOptionsResult(new { challenge = WebEncoders.Base64UrlEncode(EnrollmentChallenge) }, EnrollmentChallenge);
        }

        public PasskeyAssertionOptionsResult CreateAssertionOptions(PasskeyAssertionOptionsRequest request)
        {
            return new PasskeyAssertionOptionsResult(new { challenge = WebEncoders.Base64UrlEncode(AssertionChallenge) }, AssertionChallenge);
        }

        public Task<PasskeyCredentialVerificationResult> VerifyCredentialAsync(
            PasskeyCredentialVerificationRequest request,
            CancellationToken cancellationToken)
        {
            return Task.FromResult(new PasskeyCredentialVerificationResult(
                CredentialId,
                PublicKey,
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
            var encodedClientData = credential.GetProperty("response").GetProperty("clientDataJSON").GetString();
            if (encodedClientData is null)
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

    private sealed class FakeAuthSessionRuntimeService : IAuthSessionRuntimeService
    {
        public Task<AuthSessionCreationResult> CreateSessionAsync(
            AuthSessionCreationRequest request,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(AuthSessionCreationResult.Created(
                Guid.NewGuid(),
                "raw-session-token-not-returned",
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

    private sealed class PasskeyTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public PasskeyTestTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow()
        {
            return utcNow;
        }

        public void SetUtcNow(DateTimeOffset value)
        {
            utcNow = value;
        }
    }

    private sealed record PasskeyTestHarness(
        SettleoraDbContext DbContext,
        PasskeyTestTimeProvider TimeProvider,
        IPasskeyRuntimeService Service) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            await DbContext.DisposeAsync();
        }
    }
}
