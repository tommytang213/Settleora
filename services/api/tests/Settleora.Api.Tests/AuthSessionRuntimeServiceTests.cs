using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class AuthSessionRuntimeServiceTests
{
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 2, 11, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 2, 11, 15, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset RevocationTimestamp = new(2026, 5, 2, 11, 30, 0, TimeSpan.Zero);

    [Fact]
    public async Task CreateSessionForActiveAccountStoresOnlyTokenHashAndReturnsRawToken()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var service = CreateService(dbContext, InitialTimestamp);
        var longUserAgentSummary = new string('u', 400);

        var result = await service.CreateSessionAsync(new AuthSessionCreationRequest(
            authAccountId,
            DeviceLabel: "  Test device  ",
            UserAgentSummary: $"  {longUserAgentSummary}  ",
            NetworkAddressHash: "  network-hash  ",
            RequestedLifetime: TimeSpan.FromMinutes(45)));

        Assert.True(result.Succeeded);
        Assert.Equal(AuthSessionCreationStatus.Created, result.Status);
        Assert.NotNull(result.RawSessionToken);
        Assert.NotEqual(string.Empty, result.RawSessionToken);
        Assert.NotNull(result.AuthSessionId);
        Assert.Equal(InitialTimestamp.AddMinutes(45), result.SessionExpiresAtUtc);

        var session = await dbContext.Set<AuthSession>().SingleAsync();
        Assert.Equal(authAccountId, session.AuthAccountId);
        Assert.Equal(result.AuthSessionId, session.Id);
        Assert.StartsWith("sha256:", session.SessionTokenHash, StringComparison.Ordinal);
        Assert.NotEqual(result.RawSessionToken, session.SessionTokenHash);
        Assert.DoesNotContain(result.RawSessionToken!, session.SessionTokenHash);
        // TODO: Refresh-token generation, rotation, and replay detection are intentionally deferred.
        Assert.Null(session.RefreshTokenHash);
        Assert.Equal(AuthSessionStatuses.Active, session.Status);
        Assert.Equal(InitialTimestamp, session.IssuedAtUtc);
        Assert.Equal(InitialTimestamp.AddMinutes(45), session.ExpiresAtUtc);
        Assert.Equal(InitialTimestamp, session.CreatedAtUtc);
        Assert.Equal(InitialTimestamp, session.UpdatedAtUtc);
        Assert.Null(session.LastSeenAtUtc);
        Assert.Null(session.RevokedAtUtc);
        Assert.Null(session.RevocationReason);
        Assert.Equal("Test device", session.DeviceLabel);
        Assert.Equal(new string('u', 320), session.UserAgentSummary);
        Assert.Equal("network-hash", session.NetworkAddressHash);

        Assert.DoesNotContain(result.RawSessionToken!, result.ToString());
        Assert.DoesNotContain(session.SessionTokenHash, result.ToString());

        var auditEvent = await AssertSingleAuditEventAsync(
            dbContext,
            "session.created",
            AuthAuditOutcomes.Success,
            expectedActorAuthAccountId: null,
            expectedSubjectAuthAccountId: authAccountId,
            InitialTimestamp,
            AuthSessionCreationStatus.Created.ToString());
        Assert.DoesNotContain(result.RawSessionToken!, auditEvent.SafeMetadataJson!);
        Assert.DoesNotContain(session.SessionTokenHash, auditEvent.SafeMetadataJson!);
    }

    [Fact]
    public async Task CreateSessionWithMissingRequestedLifetimeUsesConfiguredCurrentDefault()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var options = new AuthSessionPolicyOptions
        {
            CurrentAccessSessionDefaultLifetime = TimeSpan.FromHours(6),
            CurrentAccessSessionMaxLifetime = TimeSpan.FromDays(3)
        };
        var service = CreateService(dbContext, InitialTimestamp, options);

        var result = await service.CreateSessionAsync(new AuthSessionCreationRequest(authAccountId));

        Assert.True(result.Succeeded);
        Assert.Equal(InitialTimestamp.AddHours(6), result.SessionExpiresAtUtc);

        var session = await dbContext.Set<AuthSession>().SingleAsync();
        Assert.Equal(InitialTimestamp.AddHours(6), session.ExpiresAtUtc);
    }

    [Theory]
    [InlineData(-5)]
    [InlineData(0)]
    public async Task CreateSessionWithInvalidRequestedLifetimeUsesConfiguredCurrentDefault(int requestedMinutes)
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var options = new AuthSessionPolicyOptions
        {
            CurrentAccessSessionDefaultLifetime = TimeSpan.FromHours(5),
            CurrentAccessSessionMaxLifetime = TimeSpan.FromDays(3)
        };
        var service = CreateService(dbContext, InitialTimestamp, options);

        var result = await service.CreateSessionAsync(new AuthSessionCreationRequest(
            authAccountId,
            RequestedLifetime: TimeSpan.FromMinutes(requestedMinutes)));

        Assert.True(result.Succeeded);
        Assert.Equal(InitialTimestamp.AddHours(5), result.SessionExpiresAtUtc);

        var session = await dbContext.Set<AuthSession>().SingleAsync();
        Assert.Equal(InitialTimestamp.AddHours(5), session.ExpiresAtUtc);
    }

    [Fact]
    public async Task CreateSessionWithRequestedLifetimeAboveConfiguredMaximumIsCapped()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var options = new AuthSessionPolicyOptions
        {
            CurrentAccessSessionDefaultLifetime = TimeSpan.FromHours(5),
            CurrentAccessSessionMaxLifetime = TimeSpan.FromHours(12)
        };
        var service = CreateService(dbContext, InitialTimestamp, options);

        var result = await service.CreateSessionAsync(new AuthSessionCreationRequest(
            authAccountId,
            RequestedLifetime: TimeSpan.FromHours(20)));

        Assert.True(result.Succeeded);
        Assert.Equal(InitialTimestamp.AddHours(12), result.SessionExpiresAtUtc);

        var session = await dbContext.Set<AuthSession>().SingleAsync();
        Assert.Equal(InitialTimestamp.AddHours(12), session.ExpiresAtUtc);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("disabled")]
    [InlineData("deleted")]
    public async Task CreateSessionForUnavailableAccountFailsWithoutCreatingSession(string accountState)
    {
        using var dbContext = CreateDbContext();
        var authAccountId = accountState switch
        {
            "disabled" => await SeedAuthAccountAsync(
                dbContext,
                status: AuthAccountStatuses.Disabled,
                disabledAtUtc: InitialTimestamp),
            "deleted" => await SeedAuthAccountAsync(
                dbContext,
                deletedAtUtc: InitialTimestamp),
            _ => Guid.NewGuid()
        };
        var service = CreateService(dbContext, InitialTimestamp);

        var result = await service.CreateSessionAsync(new AuthSessionCreationRequest(authAccountId));

        Assert.False(result.Succeeded);
        Assert.Equal(AuthSessionCreationStatus.AccountUnavailable, result.Status);
        Assert.Null(result.RawSessionToken);
        Assert.Null(result.AuthSessionId);
        Assert.Empty(await dbContext.Set<AuthSession>().ToListAsync());

        await AssertSingleAuditEventAsync(
            dbContext,
            "session.created",
            AuthAuditOutcomes.Denied,
            expectedActorAuthAccountId: null,
            expectedSubjectAuthAccountId: accountState == "missing" ? null : authAccountId,
            InitialTimestamp,
            AuthSessionCreationStatus.AccountUnavailable.ToString());
    }

    [Fact]
    public async Task ValidateCorrectRawTokenSucceedsAndUpdatesLastSeen()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var createResult = await CreateSessionForValidationAsync(dbContext, authAccountId);
        var service = CreateService(dbContext, ValidationTimestamp);

        var result = await service.ValidateSessionAsync(createResult.RawSessionToken);

        Assert.True(result.Succeeded);
        Assert.Equal(AuthSessionValidationStatus.Validated, result.Status);
        Assert.NotNull(result.Actor);
        Assert.Equal(authAccountId, result.Actor!.AuthAccountId);
        Assert.Equal(createResult.AuthSessionId, result.Actor.AuthSessionId);
        Assert.Equal(createResult.SessionExpiresAtUtc, result.Actor.SessionExpiresAtUtc);

        var account = await dbContext.Set<AuthAccount>().SingleAsync();
        Assert.Equal(account.UserProfileId, result.Actor.UserProfileId);

        var session = await dbContext.Set<AuthSession>().SingleAsync();
        Assert.Equal(ValidationTimestamp, session.LastSeenAtUtc);
        Assert.Equal(ValidationTimestamp, session.UpdatedAtUtc);
        Assert.DoesNotContain(createResult.RawSessionToken!, result.ToString());
        Assert.DoesNotContain(session.SessionTokenHash, result.ToString());

        var auditEvent = await AssertSingleAuditEventAsync(
            dbContext,
            "session.validated",
            AuthAuditOutcomes.Success,
            expectedActorAuthAccountId: authAccountId,
            expectedSubjectAuthAccountId: authAccountId,
            ValidationTimestamp,
            AuthSessionValidationStatus.Validated.ToString());
        Assert.DoesNotContain(createResult.RawSessionToken!, auditEvent.SafeMetadataJson!);
        Assert.DoesNotContain(session.SessionTokenHash, auditEvent.SafeMetadataJson!);
    }

    [Fact]
    public async Task ValidateWrongTokenFailsWithoutMutatingSessionOrWritingAudit()
    {
        const string wrongRawToken = "visible-wrong-session-token";
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        await CreateSessionForValidationAsync(dbContext, authAccountId);
        var sessionBeforeValidation = await dbContext.Set<AuthSession>().SingleAsync();
        var service = CreateService(dbContext, ValidationTimestamp);

        var result = await service.ValidateSessionAsync(wrongRawToken);

        Assert.False(result.Succeeded);
        Assert.Equal(AuthSessionValidationStatus.SessionUnavailable, result.Status);
        Assert.Null(result.Actor);

        var session = await dbContext.Set<AuthSession>().SingleAsync();
        Assert.Null(session.LastSeenAtUtc);
        Assert.Equal(sessionBeforeValidation.UpdatedAtUtc, session.UpdatedAtUtc);
        Assert.Empty(await dbContext.Set<AuthAuditEvent>().ToListAsync());
        Assert.DoesNotContain(wrongRawToken, result.ToString());
        Assert.DoesNotContain(session.SessionTokenHash, result.ToString());
    }

    [Fact]
    public async Task ValidateMissingTokenFailsWithoutWritingAudit()
    {
        using var dbContext = CreateDbContext();
        var service = CreateService(dbContext, ValidationTimestamp);

        var result = await service.ValidateSessionAsync("   ");

        Assert.False(result.Succeeded);
        Assert.Equal(AuthSessionValidationStatus.SessionUnavailable, result.Status);
        Assert.Null(result.Actor);
        Assert.Empty(await dbContext.Set<AuthAuditEvent>().ToListAsync());
    }

    [Fact]
    public async Task ValidateExpiredSessionFailsWithoutUpdatingLastSeen()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var createResult = await CreateSessionForValidationAsync(
            dbContext,
            authAccountId,
            TimeSpan.FromMinutes(5));
        var service = CreateService(dbContext, InitialTimestamp.AddMinutes(6));

        var result = await service.ValidateSessionAsync(createResult.RawSessionToken);

        Assert.False(result.Succeeded);
        Assert.Equal(AuthSessionValidationStatus.SessionExpired, result.Status);

        var session = await dbContext.Set<AuthSession>().SingleAsync();
        Assert.Null(session.LastSeenAtUtc);
        Assert.Equal(InitialTimestamp, session.UpdatedAtUtc);

        await AssertSingleAuditEventAsync(
            dbContext,
            "session.validation_failed",
            AuthAuditOutcomes.Expired,
            expectedActorAuthAccountId: null,
            expectedSubjectAuthAccountId: authAccountId,
            InitialTimestamp.AddMinutes(6),
            AuthSessionValidationStatus.SessionExpired.ToString());
    }

    [Fact]
    public async Task ValidateRevokedSessionFailsWithoutUpdatingLastSeen()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var createResult = await CreateSessionForValidationAsync(dbContext, authAccountId);
        var revokedAtUtc = InitialTimestamp.AddMinutes(2);
        var session = await dbContext.Set<AuthSession>().SingleAsync();
        session.Status = AuthSessionStatuses.Revoked;
        session.RevokedAtUtc = revokedAtUtc;
        session.RevocationReason = "seeded_revocation";
        session.UpdatedAtUtc = revokedAtUtc;
        await dbContext.SaveChangesAsync();
        var service = CreateService(dbContext, ValidationTimestamp);

        var result = await service.ValidateSessionAsync(createResult.RawSessionToken);

        Assert.False(result.Succeeded);
        Assert.Equal(AuthSessionValidationStatus.SessionRevoked, result.Status);

        session = await dbContext.Set<AuthSession>().SingleAsync();
        Assert.Null(session.LastSeenAtUtc);
        Assert.Equal(revokedAtUtc, session.UpdatedAtUtc);

        await AssertSingleAuditEventAsync(
            dbContext,
            "session.validation_failed",
            AuthAuditOutcomes.Revoked,
            expectedActorAuthAccountId: null,
            expectedSubjectAuthAccountId: authAccountId,
            ValidationTimestamp,
            AuthSessionValidationStatus.SessionRevoked.ToString());
    }

    [Theory]
    [InlineData("disabled")]
    [InlineData("deleted")]
    public async Task ValidateSessionForUnavailableAccountFailsSafely(string accountState)
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var createResult = await CreateSessionForValidationAsync(dbContext, authAccountId);
        var account = await dbContext.Set<AuthAccount>().SingleAsync();
        if (accountState == "disabled")
        {
            account.Status = AuthAccountStatuses.Disabled;
            account.DisabledAtUtc = InitialTimestamp.AddMinutes(3);
        }
        else
        {
            account.DeletedAtUtc = InitialTimestamp.AddMinutes(3);
        }

        account.UpdatedAtUtc = InitialTimestamp.AddMinutes(3);
        await dbContext.SaveChangesAsync();
        var service = CreateService(dbContext, ValidationTimestamp);

        var result = await service.ValidateSessionAsync(createResult.RawSessionToken);

        Assert.False(result.Succeeded);
        Assert.Equal(AuthSessionValidationStatus.AccountUnavailable, result.Status);

        var session = await dbContext.Set<AuthSession>().SingleAsync();
        Assert.Null(session.LastSeenAtUtc);
        Assert.Equal(InitialTimestamp, session.UpdatedAtUtc);

        await AssertSingleAuditEventAsync(
            dbContext,
            "session.validation_failed",
            AuthAuditOutcomes.Denied,
            expectedActorAuthAccountId: null,
            expectedSubjectAuthAccountId: authAccountId,
            ValidationTimestamp,
            AuthSessionValidationStatus.AccountUnavailable.ToString());
    }

    [Fact]
    public async Task RevokeActiveSessionMarksRevokedAndWritesSafeAuditMetadata()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var createResult = await CreateSessionForValidationAsync(dbContext, authAccountId);
        var sessionHash = (await dbContext.Set<AuthSession>().SingleAsync()).SessionTokenHash;
        var service = CreateService(dbContext, RevocationTimestamp);

        var result = await service.RevokeSessionAsync(new AuthSessionRevocationRequest(
            authAccountId,
            createResult.AuthSessionId!.Value,
            "user_sign_out"));

        Assert.True(result.Succeeded);
        Assert.Equal(AuthSessionRevocationStatus.Revoked, result.Status);
        Assert.Equal(createResult.AuthSessionId, result.AuthSessionId);
        Assert.DoesNotContain(createResult.RawSessionToken!, result.ToString());
        Assert.DoesNotContain(sessionHash, result.ToString());

        var session = await dbContext.Set<AuthSession>().SingleAsync();
        Assert.Equal(AuthSessionStatuses.Revoked, session.Status);
        Assert.Equal(RevocationTimestamp, session.RevokedAtUtc);
        Assert.Equal(RevocationTimestamp, session.UpdatedAtUtc);
        Assert.Equal("user_sign_out", session.RevocationReason);

        var auditEvent = await AssertSingleAuditEventAsync(
            dbContext,
            "session.revoked",
            AuthAuditOutcomes.Revoked,
            expectedActorAuthAccountId: authAccountId,
            expectedSubjectAuthAccountId: authAccountId,
            RevocationTimestamp,
            AuthSessionRevocationStatus.Revoked.ToString());
        Assert.DoesNotContain(createResult.RawSessionToken!, auditEvent.SafeMetadataJson!);
        Assert.DoesNotContain(session.SessionTokenHash, auditEvent.SafeMetadataJson!);
    }

    [Fact]
    public async Task RevokeActiveSessionsForAccountRevokesOnlyActiveOwnedSessionsAndWritesSafeAuditMetadata()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var otherAuthAccountId = await SeedAuthAccountAsync(dbContext);
        var currentSession = await CreateSessionForValidationAsync(dbContext, authAccountId);
        var otherOwnedSession = await CreateSessionForValidationAsync(dbContext, authAccountId);
        var expiredOwnedSession = await CreateSessionForValidationAsync(
            dbContext,
            authAccountId,
            TimeSpan.FromMinutes(5));
        var otherAccountSession = await CreateSessionForValidationAsync(dbContext, otherAuthAccountId);
        var service = CreateService(dbContext, RevocationTimestamp);

        var result = await service.RevokeActiveSessionsForAccountAsync(
            new AuthAccountSessionRevocationRequest(authAccountId, "user_sign_out_all"));

        Assert.True(result.Succeeded);
        Assert.Equal(AuthAccountSessionRevocationStatus.Revoked, result.Status);

        var current = await dbContext.Set<AuthSession>().SingleAsync(
            session => session.Id == currentSession.AuthSessionId);
        var otherOwned = await dbContext.Set<AuthSession>().SingleAsync(
            session => session.Id == otherOwnedSession.AuthSessionId);
        var expiredOwned = await dbContext.Set<AuthSession>().SingleAsync(
            session => session.Id == expiredOwnedSession.AuthSessionId);
        var otherAccount = await dbContext.Set<AuthSession>().SingleAsync(
            session => session.Id == otherAccountSession.AuthSessionId);

        Assert.Equal(AuthSessionStatuses.Revoked, current.Status);
        Assert.Equal(RevocationTimestamp, current.RevokedAtUtc);
        Assert.Equal("user_sign_out_all", current.RevocationReason);
        Assert.Equal(AuthSessionStatuses.Revoked, otherOwned.Status);
        Assert.Equal(RevocationTimestamp, otherOwned.RevokedAtUtc);
        Assert.Equal("user_sign_out_all", otherOwned.RevocationReason);
        Assert.Equal(AuthSessionStatuses.Active, expiredOwned.Status);
        Assert.Null(expiredOwned.RevokedAtUtc);
        Assert.Null(expiredOwned.RevocationReason);
        Assert.Equal(AuthSessionStatuses.Active, otherAccount.Status);
        Assert.Null(otherAccount.RevokedAtUtc);
        Assert.Null(otherAccount.RevocationReason);

        var auditEvent = await AssertSingleAuditEventAsync(
            dbContext,
            "session.revoked",
            AuthAuditOutcomes.Revoked,
            expectedActorAuthAccountId: authAccountId,
            expectedSubjectAuthAccountId: authAccountId,
            RevocationTimestamp,
            AuthAccountSessionRevocationStatus.Revoked.ToString());
        Assert.DoesNotContain(currentSession.RawSessionToken!, auditEvent.SafeMetadataJson!);
        Assert.DoesNotContain(current.SessionTokenHash, auditEvent.SafeMetadataJson!);
    }

    [Fact]
    public async Task RevokeActiveSessionsForUnavailableAccountFailsWithoutCreatingSessionMutation()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(
            dbContext,
            status: AuthAccountStatuses.Disabled,
            disabledAtUtc: InitialTimestamp);
        var service = CreateService(dbContext, RevocationTimestamp);

        var result = await service.RevokeActiveSessionsForAccountAsync(
            new AuthAccountSessionRevocationRequest(authAccountId, "user_sign_out_all"));

        Assert.False(result.Succeeded);
        Assert.Equal(AuthAccountSessionRevocationStatus.AccountUnavailable, result.Status);
        Assert.Empty(await dbContext.Set<AuthSession>().ToListAsync());

        await AssertSingleAuditEventAsync(
            dbContext,
            "session.revoked",
            AuthAuditOutcomes.Denied,
            expectedActorAuthAccountId: authAccountId,
            expectedSubjectAuthAccountId: authAccountId,
            RevocationTimestamp,
            AuthAccountSessionRevocationStatus.AccountUnavailable.ToString());
    }

    [Fact]
    public async Task RevokeAlreadyRevokedSessionReturnsSafeStatusWithoutMutatingSession()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var createResult = await CreateSessionForValidationAsync(dbContext, authAccountId);
        var previousRevokedAtUtc = InitialTimestamp.AddMinutes(4);
        var session = await dbContext.Set<AuthSession>().SingleAsync();
        session.Status = AuthSessionStatuses.Revoked;
        session.RevokedAtUtc = previousRevokedAtUtc;
        session.RevocationReason = "prior_revocation";
        session.UpdatedAtUtc = previousRevokedAtUtc;
        await dbContext.SaveChangesAsync();
        var service = CreateService(dbContext, RevocationTimestamp);

        var result = await service.RevokeSessionAsync(new AuthSessionRevocationRequest(
            authAccountId,
            createResult.AuthSessionId!.Value,
            "new_reason"));

        Assert.False(result.Succeeded);
        Assert.Equal(AuthSessionRevocationStatus.AlreadyRevoked, result.Status);
        Assert.Equal(createResult.AuthSessionId, result.AuthSessionId);

        session = await dbContext.Set<AuthSession>().SingleAsync();
        Assert.Equal(previousRevokedAtUtc, session.RevokedAtUtc);
        Assert.Equal(previousRevokedAtUtc, session.UpdatedAtUtc);
        Assert.Equal("prior_revocation", session.RevocationReason);

        await AssertSingleAuditEventAsync(
            dbContext,
            "session.revoked",
            AuthAuditOutcomes.Revoked,
            expectedActorAuthAccountId: authAccountId,
            expectedSubjectAuthAccountId: authAccountId,
            RevocationTimestamp,
            AuthSessionRevocationStatus.AlreadyRevoked.ToString());
    }

    [Fact]
    public void AuthSessionRuntimeRegistersEfRuntimeServiceAndAuditWriter()
    {
        var services = new ServiceCollection();
        services.AddDbContext<SettleoraDbContext>(options =>
        {
            options.UseInMemoryDatabase(Guid.NewGuid().ToString());
        });
        services.AddAuthSessionRuntime(new ConfigurationBuilder().Build());

        using var serviceProvider = services.BuildServiceProvider();
        using var scope = serviceProvider.CreateScope();

        var runtimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var auditWriter = scope.ServiceProvider.GetRequiredService<IAuthSessionAuditWriter>();
        var timeProvider = scope.ServiceProvider.GetRequiredService<TimeProvider>();
        var sessionPolicyOptions = scope.ServiceProvider.GetRequiredService<IOptions<AuthSessionPolicyOptions>>();

        Assert.IsType<AuthSessionRuntimeService>(runtimeService);
        Assert.IsType<EfAuthSessionAuditWriter>(auditWriter);
        Assert.Same(TimeProvider.System, timeProvider);
        Assert.Equal(TimeSpan.FromHours(8), sessionPolicyOptions.Value.CurrentAccessSessionDefaultLifetime);
    }

    private static AuthSessionRuntimeService CreateService(
        SettleoraDbContext dbContext,
        DateTimeOffset utcNow,
        AuthSessionPolicyOptions? sessionPolicyOptions = null)
    {
        return new AuthSessionRuntimeService(
            dbContext,
            new EfAuthSessionAuditWriter(dbContext),
            new FixedTimeProvider(utcNow),
            Options.Create(sessionPolicyOptions ?? new AuthSessionPolicyOptions()));
    }

    private static SettleoraDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new SettleoraDbContext(options);
    }

    private static async Task<Guid> SeedAuthAccountAsync(
        SettleoraDbContext dbContext,
        string status = AuthAccountStatuses.Active,
        DateTimeOffset? disabledAtUtc = null,
        DateTimeOffset? deletedAtUtc = null)
    {
        var userProfileId = Guid.NewGuid();
        var authAccountId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = "Session Runtime Test User",
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });

        dbContext.Set<AuthAccount>().Add(new AuthAccount
        {
            Id = authAccountId,
            UserProfileId = userProfileId,
            Status = status,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            DisabledAtUtc = disabledAtUtc,
            DeletedAtUtc = deletedAtUtc
        });

        await dbContext.SaveChangesAsync();
        return authAccountId;
    }

    private static async Task<AuthSessionCreationResult> CreateSessionForValidationAsync(
        SettleoraDbContext dbContext,
        Guid authAccountId,
        TimeSpan? lifetime = null)
    {
        var createService = CreateService(dbContext, InitialTimestamp);
        var createResult = await createService.CreateSessionAsync(new AuthSessionCreationRequest(
            authAccountId,
            RequestedLifetime: lifetime ?? TimeSpan.FromHours(1)));

        Assert.True(createResult.Succeeded);
        Assert.NotNull(createResult.RawSessionToken);

        await ClearAuditEventsAsync(dbContext);
        return createResult;
    }

    private static async Task ClearAuditEventsAsync(SettleoraDbContext dbContext)
    {
        var auditEvents = await dbContext.Set<AuthAuditEvent>().ToListAsync();
        dbContext.Set<AuthAuditEvent>().RemoveRange(auditEvents);
        await dbContext.SaveChangesAsync();
    }

    private static async Task<AuthAuditEvent> AssertSingleAuditEventAsync(
        SettleoraDbContext dbContext,
        string expectedAction,
        string expectedOutcome,
        Guid? expectedActorAuthAccountId,
        Guid? expectedSubjectAuthAccountId,
        DateTimeOffset expectedOccurredAtUtc,
        string expectedStatusCategory)
    {
        var auditEvent = await dbContext.Set<AuthAuditEvent>().SingleAsync();

        Assert.Equal(expectedActorAuthAccountId, auditEvent.ActorAuthAccountId);
        Assert.Equal(expectedSubjectAuthAccountId, auditEvent.SubjectAuthAccountId);
        Assert.Equal(expectedAction, auditEvent.Action);
        Assert.Equal(expectedOutcome, auditEvent.Outcome);
        Assert.Equal(expectedOccurredAtUtc, auditEvent.OccurredAtUtc);
        Assert.Null(auditEvent.CorrelationId);
        Assert.Null(auditEvent.RequestId);
        AssertSafeAuditMetadata(auditEvent.SafeMetadataJson, expectedStatusCategory);

        return auditEvent;
    }

    private static void AssertSafeAuditMetadata(string? safeMetadataJson, string expectedStatusCategory)
    {
        Assert.NotNull(safeMetadataJson);
        Assert.True(safeMetadataJson!.Length <= 4096);

        using var metadata = JsonDocument.Parse(safeMetadataJson);
        var propertyNames = metadata.RootElement
            .EnumerateObject()
            .Select(property => property.Name)
            .Order()
            .ToArray();

        Assert.Equal(["statusCategory", "workflowName"], propertyNames);
        Assert.Equal(
            "auth_session_runtime",
            metadata.RootElement.GetProperty("workflowName").GetString());
        Assert.Equal(
            expectedStatusCategory,
            metadata.RootElement.GetProperty("statusCategory").GetString());

        foreach (var property in metadata.RootElement.EnumerateObject())
        {
            var value = property.Value.GetString();
            Assert.NotNull(value);
            Assert.InRange(value!.Length, 1, 120);
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
