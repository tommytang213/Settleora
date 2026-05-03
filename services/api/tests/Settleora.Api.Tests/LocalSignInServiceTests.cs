using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Settleora.Api.Auth.Credentials;
using Settleora.Api.Auth.PasswordHashing;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Auth.SignIn;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class LocalSignInServiceTests
{
    private const string SubmittedIdentifier = "  LOCAL.User@Example.COM  ";
    private const string NormalizedIdentifier = "local.user@example.com";
    private const string MissingIdentifier = "missing.user@example.com";
    private const string SubmittedPassword = "visible-local-sign-in-password";
    private const string WrongPassword = "visible-wrong-local-sign-in-password";
    private const string SourceKey = "src:test-source";
    private const string RawSessionTokenFragment = "visible-session-token";
    private const string SessionTokenHashFragment = "visible-session-token-hash";
    private const string VerifierFragment = "visible-password-verifier";
    private const string SignInSucceededAction = "sign_in.succeeded";
    private const string SignInFailedAction = "sign_in.failed";
    private const string SignInThrottledAction = "sign_in.throttled";
    private const string SignInSessionCreationFailedAction = "sign_in.session_creation_failed";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 3, 10, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset SignInTimestamp = new(2026, 5, 3, 10, 15, 0, TimeSpan.Zero);

    [Fact]
    public async Task ValidLocalIdentityActiveAccountAndCredentialSignsInAndCreatesSession()
    {
        using var dbContext = CreateDbContext();
        var seededAccount = await SeedLocalIdentityAsync(dbContext);
        await SeedCredentialAsync(dbContext, seededAccount.AuthAccountId);
        var policyService = new RecordingSignInAbusePolicyService();
        var passwordHashingService = new FakePasswordHashingService();
        var service = CreateService(
            dbContext,
            policyService,
            CreateCredentialWorkflowService(dbContext, passwordHashingService),
            CreateSessionRuntimeService(dbContext));

        var result = await service.SignInAsync(CreateRequest());

        Assert.True(result.Succeeded);
        Assert.Equal(LocalSignInStatus.SignedIn, result.Status);
        Assert.Equal(seededAccount.AuthAccountId, result.AuthAccountId);
        Assert.Equal(seededAccount.UserProfileId, result.UserProfileId);
        Assert.NotNull(result.AuthSessionId);
        Assert.NotNull(result.RawSessionToken);
        Assert.NotEqual(string.Empty, result.RawSessionToken);
        Assert.Equal(SignInTimestamp.AddMinutes(45), result.SessionExpiresAtUtc);
        Assert.Equal(1, passwordHashingService.VerifyPasswordCallCount);

        var attempt = Assert.Single(policyService.Attempts);
        Assert.Equal(SignInAttemptOutcome.Succeeded, attempt.Outcome);
        Assert.StartsWith("local-id-sha256:", attempt.IdentifierKey, StringComparison.Ordinal);
        Assert.DoesNotContain(NormalizedIdentifier, attempt.IdentifierKey);
        Assert.Equal(SourceKey, attempt.SourceKey);

        var session = await dbContext.Set<AuthSession>().SingleAsync();
        var auditEvent = await AssertSingleSignInAuditEventAsync(
            dbContext,
            SignInSucceededAction,
            AuthAuditOutcomes.Success,
            expectedActorAuthAccountId: seededAccount.AuthAccountId,
            expectedSubjectAuthAccountId: seededAccount.AuthAccountId,
            SignInTimestamp,
            LocalSignInStatus.SignedIn,
            SignInAbusePreCheckStatus.Allowed);
        AssertNoSensitiveAuditText(
            auditEvent,
            result.RawSessionToken,
            session.SessionTokenHash,
            attempt.IdentifierKey);
    }

    [Fact]
    public async Task SuccessfulResultReturnsRawSessionTokenWithoutLeakingItInStrings()
    {
        using var dbContext = CreateDbContext();
        var seededAccount = await SeedLocalIdentityAsync(dbContext);
        await SeedCredentialAsync(dbContext, seededAccount.AuthAccountId);
        var policyService = new RecordingSignInAbusePolicyService();
        var service = CreateService(
            dbContext,
            policyService,
            CreateCredentialWorkflowService(dbContext),
            CreateSessionRuntimeService(dbContext));

        var result = await service.SignInAsync(CreateRequest());

        Assert.True(result.Succeeded);
        Assert.NotNull(result.RawSessionToken);
        Assert.DoesNotContain(result.RawSessionToken!, result.ToString());
        Assert.DoesNotContain(SubmittedPassword, result.ToString());
        Assert.DoesNotContain(SubmittedIdentifier.Trim(), result.ToString());
        Assert.DoesNotContain(NormalizedIdentifier, result.ToString());
        Assert.DoesNotContain(SourceKey, result.ToString());
    }

    [Fact]
    public async Task SuccessfulSignInRecordsSucceededAttemptAndStoresOnlyHashedSessionToken()
    {
        using var dbContext = CreateDbContext();
        var seededAccount = await SeedLocalIdentityAsync(dbContext);
        await SeedCredentialAsync(dbContext, seededAccount.AuthAccountId);
        var policyService = new RecordingSignInAbusePolicyService();
        var service = CreateService(
            dbContext,
            policyService,
            CreateCredentialWorkflowService(dbContext),
            CreateSessionRuntimeService(dbContext));

        var result = await service.SignInAsync(CreateRequest());

        Assert.True(result.Succeeded);
        var session = await dbContext.Set<AuthSession>().SingleAsync();
        Assert.Equal(result.AuthSessionId, session.Id);
        Assert.StartsWith("sha256:", session.SessionTokenHash, StringComparison.Ordinal);
        Assert.NotEqual(result.RawSessionToken, session.SessionTokenHash);
        Assert.DoesNotContain(result.RawSessionToken!, session.SessionTokenHash);
        Assert.Null(session.RefreshTokenHash);
        Assert.Single(policyService.Attempts, attempt => attempt.Outcome is SignInAttemptOutcome.Succeeded);
    }

    [Fact]
    public async Task WrongPasswordReturnsUniformInvalidCredentialsAndRecordsFailedAttempt()
    {
        using var dbContext = CreateDbContext();
        var seededAccount = await SeedLocalIdentityAsync(dbContext);
        await SeedCredentialAsync(dbContext, seededAccount.AuthAccountId);
        var policyService = new RecordingSignInAbusePolicyService();
        var service = CreateService(
            dbContext,
            policyService,
            CreateCredentialWorkflowService(dbContext),
            CreateSessionRuntimeService(dbContext));

        var result = await service.SignInAsync(CreateRequest(password: WrongPassword));

        Assert.False(result.Succeeded);
        Assert.Equal(LocalSignInStatus.InvalidCredentials, result.Status);
        Assert.Null(result.RawSessionToken);
        Assert.Empty(await dbContext.Set<AuthSession>().ToListAsync());
        AssertSingleAttempt(policyService, SignInAttemptOutcome.Failed);

        var attempt = Assert.Single(policyService.Attempts);
        var auditEvent = await AssertSingleSignInAuditEventAsync(
            dbContext,
            SignInFailedAction,
            AuthAuditOutcomes.Failure,
            expectedActorAuthAccountId: null,
            expectedSubjectAuthAccountId: seededAccount.AuthAccountId,
            SignInTimestamp,
            LocalSignInStatus.InvalidCredentials,
            SignInAbusePreCheckStatus.Allowed);
        AssertNoSensitiveAuditText(auditEvent, identifierKey: attempt.IdentifierKey);
    }

    [Fact]
    public async Task MissingIdentityReturnsUniformInvalidCredentialsAndRecordsFailedAttempt()
    {
        using var dbContext = CreateDbContext();
        var policyService = new RecordingSignInAbusePolicyService();
        var credentialService = new FakeCredentialWorkflowService();
        var sessionService = new FakeSessionRuntimeService();
        var service = CreateService(dbContext, policyService, credentialService, sessionService);

        var result = await service.SignInAsync(CreateRequest(identifier: MissingIdentifier));

        Assert.False(result.Succeeded);
        Assert.Equal(LocalSignInStatus.InvalidCredentials, result.Status);
        Assert.Equal(0, credentialService.VerifyCallCount);
        Assert.Equal(0, sessionService.CreateCallCount);
        AssertSingleAttempt(policyService, SignInAttemptOutcome.Failed);

        var attempt = Assert.Single(policyService.Attempts);
        var auditEvent = await AssertSingleSignInAuditEventAsync(
            dbContext,
            SignInFailedAction,
            AuthAuditOutcomes.Failure,
            expectedActorAuthAccountId: null,
            expectedSubjectAuthAccountId: null,
            SignInTimestamp,
            LocalSignInStatus.InvalidCredentials,
            SignInAbusePreCheckStatus.Allowed);
        AssertNoSensitiveAuditText(auditEvent, identifierKey: attempt.IdentifierKey);
    }

    [Fact]
    public async Task DisabledLocalIdentityReturnsUniformInvalidCredentialsAndRecordsFailedAttempt()
    {
        using var dbContext = CreateDbContext();
        await SeedLocalIdentityAsync(dbContext, identityDisabledAtUtc: InitialTimestamp);
        var policyService = new RecordingSignInAbusePolicyService();
        var credentialService = new FakeCredentialWorkflowService();
        var service = CreateService(
            dbContext,
            policyService,
            credentialService,
            new FakeSessionRuntimeService());

        var result = await service.SignInAsync(CreateRequest());

        Assert.False(result.Succeeded);
        Assert.Equal(LocalSignInStatus.InvalidCredentials, result.Status);
        Assert.Equal(0, credentialService.VerifyCallCount);
        AssertSingleAttempt(policyService, SignInAttemptOutcome.Failed);
    }

    [Theory]
    [InlineData("disabled")]
    [InlineData("deleted")]
    public async Task DisabledOrDeletedAccountReturnsUniformInvalidCredentialsAndRecordsFailedAttempt(
        string accountState)
    {
        using var dbContext = CreateDbContext();
        var seededAccount = await SeedLocalIdentityAsync(
            dbContext,
            accountStatus: accountState == "disabled" ? AuthAccountStatuses.Disabled : AuthAccountStatuses.Active,
            accountDisabledAtUtc: accountState == "disabled" ? InitialTimestamp : null,
            accountDeletedAtUtc: accountState == "deleted" ? InitialTimestamp : null);
        var policyService = new RecordingSignInAbusePolicyService();
        var credentialService = new FakeCredentialWorkflowService();
        var service = CreateService(
            dbContext,
            policyService,
            credentialService,
            new FakeSessionRuntimeService());

        var result = await service.SignInAsync(CreateRequest());

        Assert.False(result.Succeeded);
        Assert.Equal(LocalSignInStatus.InvalidCredentials, result.Status);
        Assert.Equal(0, credentialService.VerifyCallCount);
        AssertSingleAttempt(policyService, SignInAttemptOutcome.Failed);

        var attempt = Assert.Single(policyService.Attempts);
        var auditEvent = await AssertSingleSignInAuditEventAsync(
            dbContext,
            SignInFailedAction,
            AuthAuditOutcomes.Failure,
            expectedActorAuthAccountId: null,
            expectedSubjectAuthAccountId: seededAccount.AuthAccountId,
            SignInTimestamp,
            LocalSignInStatus.InvalidCredentials,
            SignInAbusePreCheckStatus.Allowed);
        AssertNoSensitiveAuditText(auditEvent, identifierKey: attempt.IdentifierKey);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData(LocalPasswordCredentialStatuses.Disabled)]
    [InlineData(LocalPasswordCredentialStatuses.Revoked)]
    public async Task MissingDisabledOrRevokedCredentialReturnsUniformInvalidCredentialsAndRecordsFailedAttempt(
        string credentialState)
    {
        using var dbContext = CreateDbContext();
        var seededAccount = await SeedLocalIdentityAsync(dbContext);
        if (credentialState != "missing")
        {
            await SeedCredentialAsync(
                dbContext,
                seededAccount.AuthAccountId,
                status: credentialState,
                revokedAtUtc: credentialState == LocalPasswordCredentialStatuses.Revoked
                    ? InitialTimestamp
                    : null);
        }

        var policyService = new RecordingSignInAbusePolicyService();
        var service = CreateService(
            dbContext,
            policyService,
            CreateCredentialWorkflowService(dbContext),
            CreateSessionRuntimeService(dbContext));

        var result = await service.SignInAsync(CreateRequest());

        Assert.False(result.Succeeded);
        Assert.Equal(LocalSignInStatus.InvalidCredentials, result.Status);
        Assert.Empty(await dbContext.Set<AuthSession>().ToListAsync());
        AssertSingleAttempt(policyService, SignInAttemptOutcome.Failed);
    }

    [Fact]
    public async Task PreVerificationThrottledRequestDoesNotVerifyCredentialOrCreateSession()
    {
        using var dbContext = CreateDbContext();
        await SeedLocalIdentityAsync(dbContext);
        var policyService = new RecordingSignInAbusePolicyService(
            SignInAbusePreCheckResult.Throttled(SignInAbusePreCheckStatus.ThrottledByIdentifier));
        var credentialService = new FakeCredentialWorkflowService();
        var sessionService = new FakeSessionRuntimeService();
        var service = CreateService(dbContext, policyService, credentialService, sessionService);

        var result = await service.SignInAsync(CreateRequest());

        Assert.False(result.Succeeded);
        Assert.Equal(LocalSignInStatus.Throttled, result.Status);
        Assert.Equal(SignInAbusePreCheckStatus.ThrottledByIdentifier, result.PolicyStatus);
        Assert.Equal(0, credentialService.VerifyCallCount);
        Assert.Equal(0, sessionService.CreateCallCount);
        AssertSingleAttempt(policyService, SignInAttemptOutcome.Throttled);

        var attempt = Assert.Single(policyService.Attempts);
        var auditEvent = await AssertSingleSignInAuditEventAsync(
            dbContext,
            SignInThrottledAction,
            AuthAuditOutcomes.BlockedByPolicy,
            expectedActorAuthAccountId: null,
            expectedSubjectAuthAccountId: null,
            SignInTimestamp,
            LocalSignInStatus.Throttled,
            SignInAbusePreCheckStatus.ThrottledByIdentifier);
        AssertNoSensitiveAuditText(auditEvent, identifierKey: attempt.IdentifierKey);
    }

    [Fact]
    public async Task SessionCreationFailureReturnsSafeStatusWithoutLeakingRequestOrTokenMaterial()
    {
        using var dbContext = CreateDbContext();
        var seededAccount = await SeedLocalIdentityAsync(dbContext);
        var policyService = new RecordingSignInAbusePolicyService();
        var credentialService = new FakeCredentialWorkflowService();
        var sessionService = new FakeSessionRuntimeService
        {
            NextCreationResult = AuthSessionCreationResult.Failure(AuthSessionCreationStatus.PersistenceFailed)
        };
        var service = CreateService(dbContext, policyService, credentialService, sessionService);

        var result = await service.SignInAsync(CreateRequest());

        Assert.False(result.Succeeded);
        Assert.Equal(LocalSignInStatus.SessionCreationFailed, result.Status);
        Assert.Null(result.RawSessionToken);
        Assert.Equal(seededAccount.AuthAccountId, credentialService.LastAuthAccountId);
        AssertNoSensitiveText(result.ToString());
        AssertSingleAttempt(policyService, SignInAttemptOutcome.Failed);

        var attempt = Assert.Single(policyService.Attempts);
        var auditEvent = await AssertSingleSignInAuditEventAsync(
            dbContext,
            SignInSessionCreationFailedAction,
            AuthAuditOutcomes.Failure,
            expectedActorAuthAccountId: null,
            expectedSubjectAuthAccountId: seededAccount.AuthAccountId,
            SignInTimestamp,
            LocalSignInStatus.SessionCreationFailed,
            SignInAbusePreCheckStatus.Allowed);
        AssertNoSensitiveAuditText(auditEvent, identifierKey: attempt.IdentifierKey);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task BlankIdentifierReturnsInvalidRequestWithoutThrowing(string identifier)
    {
        using var dbContext = CreateDbContext();
        var policyService = new RecordingSignInAbusePolicyService();
        var service = CreateService(
            dbContext,
            policyService,
            new FakeCredentialWorkflowService(),
            new FakeSessionRuntimeService());

        var result = await service.SignInAsync(CreateRequest(identifier: identifier));

        Assert.Equal(LocalSignInStatus.InvalidRequest, result.Status);
        Assert.Empty(policyService.CheckRequests);
        Assert.Empty(policyService.Attempts);
    }

    [Fact]
    public async Task OverlongIdentifierReturnsInvalidRequestWithoutThrowing()
    {
        using var dbContext = CreateDbContext();
        var policyService = new RecordingSignInAbusePolicyService();
        var service = CreateService(
            dbContext,
            policyService,
            new FakeCredentialWorkflowService(),
            new FakeSessionRuntimeService());

        var result = await service.SignInAsync(CreateRequest(identifier: new string('a', 321)));

        Assert.Equal(LocalSignInStatus.InvalidRequest, result.Status);
        Assert.Empty(policyService.CheckRequests);
        Assert.Empty(policyService.Attempts);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("src/unsafe")]
    public async Task InvalidSourceKeyReturnsInvalidRequestWithoutThrowing(string sourceKey)
    {
        using var dbContext = CreateDbContext();
        var policyService = new RecordingSignInAbusePolicyService();
        var service = CreateService(
            dbContext,
            policyService,
            new FakeCredentialWorkflowService(),
            new FakeSessionRuntimeService());

        var result = await service.SignInAsync(CreateRequest(sourceKey: sourceKey));

        Assert.Equal(LocalSignInStatus.InvalidRequest, result.Status);
        Assert.Empty(policyService.CheckRequests);
        Assert.Empty(policyService.Attempts);
    }

    [Fact]
    public void RequestAndResultStringsDoNotExposeSensitiveSignInMaterial()
    {
        var request = new LocalSignInRequest(
            SubmittedIdentifier,
            SubmittedPassword,
            SourceKey,
            DeviceLabel: "visible-device-label",
            UserAgentSummary: "visible-user-agent-summary",
            NetworkAddressHash: "visible-network-address-hash",
            RequestedSessionLifetime: TimeSpan.FromMinutes(45));
        var result = LocalSignInResult.SignedIn(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            RawSessionTokenFragment,
            SignInTimestamp.AddHours(1));

        AssertNoSensitiveText(request.ToString());
        AssertNoSensitiveText(result.ToString());
    }

    [Fact]
    public void DiRegistrationResolvesLocalSignInService()
    {
        var services = new ServiceCollection();
        services.AddDbContext<SettleoraDbContext>(options =>
        {
            options.UseInMemoryDatabase(Guid.NewGuid().ToString());
        });
        services.AddScoped<IAuthCredentialWorkflowService, FakeCredentialWorkflowService>();
        services.AddScoped<IAuthSessionRuntimeService, FakeSessionRuntimeService>();
        services.AddSignInAbusePolicy();

        using var serviceProvider = services.BuildServiceProvider();
        using var scope = serviceProvider.CreateScope();

        var service = scope.ServiceProvider.GetRequiredService<ILocalSignInService>();
        var auditWriter = scope.ServiceProvider.GetRequiredService<ILocalSignInAuditWriter>();

        Assert.IsType<LocalSignInService>(service);
        Assert.IsType<EfLocalSignInAuditWriter>(auditWriter);
    }

    private static LocalSignInRequest CreateRequest(
        string? identifier = SubmittedIdentifier,
        string? password = SubmittedPassword,
        string? sourceKey = SourceKey)
    {
        return new LocalSignInRequest(
            identifier,
            password,
            sourceKey,
            DeviceLabel: "Local sign-in test device",
            UserAgentSummary: "Local sign-in test user agent",
            NetworkAddressHash: "network:test-hash",
            RequestedSessionLifetime: TimeSpan.FromMinutes(45));
    }

    private static LocalSignInService CreateService(
        SettleoraDbContext dbContext,
        ISignInAbusePolicyService policyService,
        IAuthCredentialWorkflowService credentialWorkflowService,
        IAuthSessionRuntimeService sessionRuntimeService)
    {
        return new LocalSignInService(
            dbContext,
            policyService,
            credentialWorkflowService,
            sessionRuntimeService,
            new EfLocalSignInAuditWriter(dbContext),
            new FixedTimeProvider(SignInTimestamp));
    }

    private static AuthCredentialWorkflowService CreateCredentialWorkflowService(
        SettleoraDbContext dbContext,
        FakePasswordHashingService? passwordHashingService = null)
    {
        return new AuthCredentialWorkflowService(
            dbContext,
            passwordHashingService ?? new FakePasswordHashingService(),
            new EfAuthCredentialAuditWriter(dbContext),
            new FixedTimeProvider(SignInTimestamp));
    }

    private static AuthSessionRuntimeService CreateSessionRuntimeService(SettleoraDbContext dbContext)
    {
        return new AuthSessionRuntimeService(
            dbContext,
            new EfAuthSessionAuditWriter(dbContext),
            new FixedTimeProvider(SignInTimestamp),
            Options.Create(new AuthSessionPolicyOptions()));
    }

    private static SettleoraDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new SettleoraDbContext(options);
    }

    private static async Task<SeededSignInAccount> SeedLocalIdentityAsync(
        SettleoraDbContext dbContext,
        string normalizedIdentifier = NormalizedIdentifier,
        DateTimeOffset? identityDisabledAtUtc = null,
        string accountStatus = AuthAccountStatuses.Active,
        DateTimeOffset? accountDisabledAtUtc = null,
        DateTimeOffset? accountDeletedAtUtc = null)
    {
        var userProfileId = Guid.NewGuid();
        var authAccountId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = "Local Sign-In Test User",
            DefaultCurrency = "USD",
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<AuthAccount>().Add(new AuthAccount
        {
            Id = authAccountId,
            UserProfileId = userProfileId,
            Status = accountStatus,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            DisabledAtUtc = accountDisabledAtUtc,
            DeletedAtUtc = accountDeletedAtUtc
        });
        dbContext.Set<AuthIdentity>().Add(new AuthIdentity
        {
            Id = Guid.NewGuid(),
            AuthAccountId = authAccountId,
            ProviderType = AuthIdentityProviderTypes.Local,
            ProviderName = LocalSignInService.LocalProviderName,
            ProviderSubject = normalizedIdentifier,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            DisabledAtUtc = identityDisabledAtUtc
        });

        await dbContext.SaveChangesAsync();
        return new SeededSignInAccount(authAccountId, userProfileId);
    }

    private static async Task SeedCredentialAsync(
        SettleoraDbContext dbContext,
        Guid authAccountId,
        string status = LocalPasswordCredentialStatuses.Active,
        DateTimeOffset? revokedAtUtc = null)
    {
        dbContext.Set<LocalPasswordCredential>().Add(new LocalPasswordCredential
        {
            Id = Guid.NewGuid(),
            AuthAccountId = authAccountId,
            PasswordHash = FakePasswordHashingService.CurrentVerifier,
            PasswordHashAlgorithm = PasswordHashingAlgorithms.Argon2id,
            PasswordHashAlgorithmVersion = FakePasswordHashingService.CurrentPolicyVersion,
            PasswordHashParameters = FakePasswordHashingService.CurrentParametersJson,
            Status = status,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            RevokedAtUtc = revokedAtUtc,
            RequiresRehash = false
        });

        await dbContext.SaveChangesAsync();
    }

    private static void AssertSingleAttempt(
        RecordingSignInAbusePolicyService policyService,
        SignInAttemptOutcome expectedOutcome)
    {
        var attempt = Assert.Single(policyService.Attempts);

        Assert.Equal(expectedOutcome, attempt.Outcome);
        Assert.StartsWith("local-id-sha256:", attempt.IdentifierKey, StringComparison.Ordinal);
        Assert.DoesNotContain(NormalizedIdentifier, attempt.IdentifierKey);
        Assert.Equal(SourceKey, attempt.SourceKey);
    }

    private static void AssertNoSensitiveText(string value)
    {
        Assert.DoesNotContain(SubmittedIdentifier.Trim(), value);
        Assert.DoesNotContain(NormalizedIdentifier, value);
        Assert.DoesNotContain(SubmittedPassword, value);
        Assert.DoesNotContain(SourceKey, value);
        Assert.DoesNotContain(RawSessionTokenFragment, value);
        Assert.DoesNotContain(SessionTokenHashFragment, value);
        Assert.DoesNotContain(VerifierFragment, value);
        Assert.DoesNotContain("visible-device-label", value);
        Assert.DoesNotContain("visible-user-agent-summary", value);
        Assert.DoesNotContain("visible-network-address-hash", value);
    }

    private static async Task<AuthAuditEvent> AssertSingleSignInAuditEventAsync(
        SettleoraDbContext dbContext,
        string expectedAction,
        string expectedOutcome,
        Guid? expectedActorAuthAccountId,
        Guid? expectedSubjectAuthAccountId,
        DateTimeOffset expectedOccurredAtUtc,
        LocalSignInStatus expectedStatusCategory,
        SignInAbusePreCheckStatus expectedPolicyStatus)
    {
        var auditEvent = await dbContext.Set<AuthAuditEvent>()
            .Where(auditEvent => auditEvent.Action.StartsWith("sign_in."))
            .SingleAsync();

        Assert.Equal(expectedActorAuthAccountId, auditEvent.ActorAuthAccountId);
        Assert.Equal(expectedSubjectAuthAccountId, auditEvent.SubjectAuthAccountId);
        Assert.Equal(expectedAction, auditEvent.Action);
        Assert.Equal(expectedOutcome, auditEvent.Outcome);
        Assert.Equal(expectedOccurredAtUtc, auditEvent.OccurredAtUtc);
        Assert.Null(auditEvent.CorrelationId);
        Assert.Null(auditEvent.RequestId);
        AssertSafeSignInAuditMetadata(
            auditEvent.SafeMetadataJson,
            expectedStatusCategory,
            expectedPolicyStatus);

        return auditEvent;
    }

    private static void AssertSafeSignInAuditMetadata(
        string? safeMetadataJson,
        LocalSignInStatus expectedStatusCategory,
        SignInAbusePreCheckStatus expectedPolicyStatus)
    {
        Assert.NotNull(safeMetadataJson);
        Assert.True(safeMetadataJson!.Length <= 4096);

        using var metadata = JsonDocument.Parse(safeMetadataJson);
        var propertyNames = metadata.RootElement
            .EnumerateObject()
            .Select(property => property.Name)
            .Order()
            .ToArray();

        Assert.Equal(["policyStatus", "statusCategory", "workflowName"], propertyNames);
        Assert.Equal(
            "local_sign_in",
            metadata.RootElement.GetProperty("workflowName").GetString());
        Assert.Equal(
            expectedStatusCategory.ToString(),
            metadata.RootElement.GetProperty("statusCategory").GetString());
        Assert.Equal(
            expectedPolicyStatus.ToString(),
            metadata.RootElement.GetProperty("policyStatus").GetString());

        foreach (var property in metadata.RootElement.EnumerateObject())
        {
            var value = property.Value.GetString();
            Assert.NotNull(value);
            Assert.InRange(value!.Length, 1, 120);
        }
    }

    private static void AssertNoSensitiveAuditText(
        AuthAuditEvent auditEvent,
        string? rawSessionToken = null,
        string? sessionTokenHash = null,
        string? identifierKey = null)
    {
        AssertNoSensitiveAuditValue(auditEvent.Action);
        AssertNoSensitiveAuditValue(auditEvent.Outcome);
        AssertNoSensitiveAuditValue(auditEvent.SafeMetadataJson!);

        if (rawSessionToken is not null)
        {
            Assert.DoesNotContain(rawSessionToken, auditEvent.SafeMetadataJson!);
        }

        if (sessionTokenHash is not null)
        {
            Assert.DoesNotContain(sessionTokenHash, auditEvent.SafeMetadataJson!);
        }

        if (identifierKey is not null)
        {
            Assert.DoesNotContain(identifierKey, auditEvent.SafeMetadataJson!);
        }
    }

    private static void AssertNoSensitiveAuditValue(string value)
    {
        Assert.DoesNotContain(SubmittedIdentifier.Trim(), value);
        Assert.DoesNotContain(NormalizedIdentifier, value);
        Assert.DoesNotContain("local-id-sha256:", value);
        Assert.DoesNotContain(SourceKey, value);
        Assert.DoesNotContain(SubmittedPassword, value);
        Assert.DoesNotContain(WrongPassword, value);
        Assert.DoesNotContain(RawSessionTokenFragment, value);
        Assert.DoesNotContain(SessionTokenHashFragment, value);
        Assert.DoesNotContain(VerifierFragment, value);
        Assert.DoesNotContain("visible-device-label", value);
        Assert.DoesNotContain("visible-user-agent-summary", value);
        Assert.DoesNotContain("visible-network-address-hash", value);
    }

    private sealed record SeededSignInAccount(
        Guid AuthAccountId,
        Guid UserProfileId);

    private sealed class RecordingSignInAbusePolicyService : ISignInAbusePolicyService
    {
        private readonly SignInAbusePreCheckResult preCheckResult;

        public RecordingSignInAbusePolicyService(SignInAbusePreCheckResult? preCheckResult = null)
        {
            this.preCheckResult = preCheckResult ?? SignInAbusePreCheckResult.Allowed();
        }

        public List<SignInAbusePolicyRequest> CheckRequests { get; } = [];

        public List<SignInAttemptRecord> Attempts { get; } = [];

        public SignInAbusePreCheckResult CheckPreVerification(SignInAbusePolicyRequest request)
        {
            CheckRequests.Add(request);
            return preCheckResult;
        }

        public void RecordAttempt(SignInAttemptRecord attempt)
        {
            Attempts.Add(attempt);
        }
    }

    private sealed class FakeCredentialWorkflowService : IAuthCredentialWorkflowService
    {
        public PasswordCredentialVerificationResult NextVerificationResult { get; init; } =
            PasswordCredentialVerificationResult.Verified();

        public int VerifyCallCount { get; private set; }

        public Guid? LastAuthAccountId { get; private set; }

        public Task<CredentialCreationResult> CreateLocalPasswordCredentialAsync(
            Guid authAccountId,
            string plaintextPassword,
            CancellationToken cancellationToken = default)
        {
            throw new NotSupportedException();
        }

        public Task<PasswordCredentialVerificationResult> VerifyLocalPasswordAsync(
            Guid authAccountId,
            string submittedPassword,
            CancellationToken cancellationToken = default)
        {
            VerifyCallCount++;
            LastAuthAccountId = authAccountId;
            return Task.FromResult(NextVerificationResult);
        }
    }

    private sealed class FakeSessionRuntimeService : IAuthSessionRuntimeService
    {
        public AuthSessionCreationResult NextCreationResult { get; init; } =
            AuthSessionCreationResult.Created(
                Guid.NewGuid(),
                "fake-raw-session-token",
                SignInTimestamp.AddHours(1));

        public int CreateCallCount { get; private set; }

        public Task<AuthSessionCreationResult> CreateSessionAsync(
            AuthSessionCreationRequest request,
            CancellationToken cancellationToken = default)
        {
            CreateCallCount++;
            return Task.FromResult(NextCreationResult);
        }

        public Task<AuthSessionValidationResult> ValidateSessionAsync(
            string? rawSessionToken,
            CancellationToken cancellationToken = default)
        {
            throw new NotSupportedException();
        }

        public Task<AuthSessionRevocationResult> RevokeSessionAsync(
            AuthSessionRevocationRequest request,
            CancellationToken cancellationToken = default)
        {
            throw new NotSupportedException();
        }

        public Task<AuthAccountSessionRevocationResult> RevokeActiveSessionsForAccountAsync(
            AuthAccountSessionRevocationRequest request,
            CancellationToken cancellationToken = default)
        {
            throw new NotSupportedException();
        }
    }

    private sealed class FakePasswordHashingService : IPasswordHashingService
    {
        public const string CurrentVerifier = VerifierFragment;
        public const string CurrentPolicyVersion = "argon2id-test-v1";
        public const string CurrentParametersJson = """{"format":"fake-current"}""";

        public int VerifyPasswordCallCount { get; private set; }

        public PasswordHashResult HashPassword(string plaintextPassword)
        {
            return PasswordHashResult.Success(
                CurrentVerifier,
                PasswordHashingAlgorithms.Argon2id,
                CurrentPolicyVersion,
                CurrentParametersJson);
        }

        public PasswordVerificationResult VerifyPassword(
            string submittedPassword,
            StoredPasswordHash storedHash)
        {
            VerifyPasswordCallCount++;

            if (!StringComparer.Ordinal.Equals(storedHash.Algorithm, PasswordHashingAlgorithms.Argon2id))
            {
                return PasswordVerificationResult.Failure(PasswordVerificationStatus.UnsupportedAlgorithm);
            }

            return StringComparer.Ordinal.Equals(submittedPassword, SubmittedPassword)
                ? PasswordVerificationResult.Verified(PasswordRehashDecision.NotRequired)
                : PasswordVerificationResult.Failure(PasswordVerificationStatus.WrongPassword);
        }

        public PasswordRehashDecision CheckRehashRequired(StoredPasswordHash storedHash)
        {
            return PasswordRehashDecision.NotRequired;
        }
    }

    private sealed class FixedTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset utcNow;

        public FixedTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow()
        {
            return utcNow;
        }
    }
}
