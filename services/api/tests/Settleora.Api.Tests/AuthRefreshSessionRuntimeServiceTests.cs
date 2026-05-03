using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class AuthRefreshSessionRuntimeServiceTests
{
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 3, 10, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset RotationTimestamp = new(2026, 5, 3, 10, 10, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ReplayTimestamp = new(2026, 5, 3, 10, 20, 0, TimeSpan.Zero);

    [Fact]
    public async Task CreateRefreshSessionForActiveAccountStoresOnlyHashesAndReturnsRawValues()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var service = CreateService(dbContext, InitialTimestamp);
        var longUserAgentSummary = new string('u', 400);

        var result = await service.CreateRefreshSessionAsync(new AuthRefreshSessionCreationRequest(
            authAccountId,
            DeviceLabel: "  Refresh device  ",
            UserAgentSummary: $"  {longUserAgentSummary}  ",
            NetworkAddressHash: "  network-hash  "));

        Assert.True(result.Succeeded);
        Assert.Equal(AuthRefreshSessionCreationStatus.Created, result.Status);
        Assert.NotNull(result.AuthSessionId);
        Assert.NotNull(result.AuthSessionFamilyId);
        Assert.NotNull(result.AuthRefreshCredentialId);
        Assert.NotNull(result.RawAccessSessionToken);
        Assert.NotNull(result.RawRefreshCredential);
        Assert.NotEqual(string.Empty, result.RawAccessSessionToken);
        Assert.NotEqual(string.Empty, result.RawRefreshCredential);
        Assert.NotEqual(result.RawAccessSessionToken, result.RawRefreshCredential);
        Assert.Equal(InitialTimestamp.AddMinutes(15), result.AccessSessionExpiresAtUtc);
        Assert.Equal(InitialTimestamp.AddDays(7), result.RefreshCredentialIdleExpiresAtUtc);
        Assert.Equal(InitialTimestamp.AddDays(30), result.RefreshCredentialAbsoluteExpiresAtUtc);
        Assert.Equal(InitialTimestamp.AddDays(30), result.SessionFamilyAbsoluteExpiresAtUtc);

        var session = await dbContext.Set<AuthSession>().SingleAsync();
        Assert.Equal(result.AuthSessionId, session.Id);
        Assert.Equal(authAccountId, session.AuthAccountId);
        Assert.StartsWith("sha256:", session.SessionTokenHash, StringComparison.Ordinal);
        Assert.NotEqual(result.RawAccessSessionToken, session.SessionTokenHash);
        Assert.DoesNotContain(result.RawAccessSessionToken!, session.SessionTokenHash);
        Assert.Null(session.RefreshTokenHash);
        Assert.Equal(AuthSessionStatuses.Active, session.Status);
        Assert.Equal(InitialTimestamp.AddMinutes(15), session.ExpiresAtUtc);
        Assert.Equal("Refresh device", session.DeviceLabel);
        Assert.Equal(new string('u', 320), session.UserAgentSummary);
        Assert.Equal("network-hash", session.NetworkAddressHash);

        var sessionFamily = await dbContext.Set<AuthSessionFamily>().SingleAsync();
        Assert.Equal(result.AuthSessionFamilyId, sessionFamily.Id);
        Assert.Equal(authAccountId, sessionFamily.AuthAccountId);
        Assert.Equal(AuthSessionFamilyStatuses.Active, sessionFamily.Status);
        Assert.Equal(InitialTimestamp.AddDays(30), sessionFamily.AbsoluteExpiresAtUtc);
        Assert.Null(sessionFamily.LastRotatedAtUtc);
        Assert.Null(sessionFamily.RevokedAtUtc);

        var refreshCredential = await dbContext.Set<AuthRefreshCredential>().SingleAsync();
        Assert.Equal(result.AuthRefreshCredentialId, refreshCredential.Id);
        Assert.Equal(sessionFamily.Id, refreshCredential.AuthSessionFamilyId);
        Assert.Equal(session.Id, refreshCredential.AuthSessionId);
        Assert.StartsWith("refresh-sha256:", refreshCredential.RefreshTokenHash, StringComparison.Ordinal);
        Assert.NotEqual(result.RawRefreshCredential, refreshCredential.RefreshTokenHash);
        Assert.DoesNotContain(result.RawRefreshCredential!, refreshCredential.RefreshTokenHash);
        Assert.Equal(AuthRefreshCredentialStatuses.Active, refreshCredential.Status);
        Assert.Equal(InitialTimestamp.AddDays(7), refreshCredential.IdleExpiresAtUtc);
        Assert.Equal(InitialTimestamp.AddDays(30), refreshCredential.AbsoluteExpiresAtUtc);
        Assert.Null(refreshCredential.ConsumedAtUtc);
        Assert.Null(refreshCredential.RevokedAtUtc);
        Assert.Null(refreshCredential.ReplacedByRefreshCredentialId);

        Assert.DoesNotContain(result.RawAccessSessionToken!, result.ToString());
        Assert.DoesNotContain(result.RawRefreshCredential!, result.ToString());
        Assert.DoesNotContain(session.SessionTokenHash, result.ToString());
        Assert.DoesNotContain(refreshCredential.RefreshTokenHash, result.ToString());

        var auditEvent = await AssertSingleAuditEventAsync(
            dbContext,
            "refresh_session.created",
            AuthAuditOutcomes.Success,
            expectedActorAuthAccountId: null,
            expectedSubjectAuthAccountId: authAccountId,
            InitialTimestamp,
            AuthRefreshSessionCreationStatus.Created.ToString());
        Assert.DoesNotContain(result.RawAccessSessionToken!, auditEvent.SafeMetadataJson!);
        Assert.DoesNotContain(result.RawRefreshCredential!, auditEvent.SafeMetadataJson!);
        Assert.DoesNotContain(session.SessionTokenHash, auditEvent.SafeMetadataJson!);
        Assert.DoesNotContain(refreshCredential.RefreshTokenHash, auditEvent.SafeMetadataJson!);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("disabled")]
    [InlineData("deleted")]
    public async Task CreateRefreshSessionForUnavailableAccountFailsWithoutCreatingRows(string accountState)
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

        var result = await service.CreateRefreshSessionAsync(
            new AuthRefreshSessionCreationRequest(authAccountId));

        Assert.False(result.Succeeded);
        Assert.Equal(AuthRefreshSessionCreationStatus.AccountUnavailable, result.Status);
        Assert.Null(result.RawAccessSessionToken);
        Assert.Null(result.RawRefreshCredential);
        Assert.Empty(await dbContext.Set<AuthSession>().ToListAsync());
        Assert.Empty(await dbContext.Set<AuthSessionFamily>().ToListAsync());
        Assert.Empty(await dbContext.Set<AuthRefreshCredential>().ToListAsync());

        await AssertSingleAuditEventAsync(
            dbContext,
            "refresh_session.created",
            AuthAuditOutcomes.Denied,
            expectedActorAuthAccountId: null,
            expectedSubjectAuthAccountId: accountState == "missing" ? null : authAccountId,
            InitialTimestamp,
            AuthRefreshSessionCreationStatus.AccountUnavailable.ToString());
    }

    [Fact]
    public async Task RotateActiveCredentialConsumesOldCredentialCreatesReplacementAndUpdatesFamily()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var createResult = await CreateInitialRefreshSessionAsync(dbContext, authAccountId);
        var service = CreateService(dbContext, RotationTimestamp);

        var rotationResult = await service.RotateRefreshCredentialAsync(
            new AuthRefreshSessionRotationRequest(
                createResult.RawRefreshCredential,
                DeviceLabel: "  Replacement device  ",
                UserAgentSummary: "  replacement user agent  ",
                NetworkAddressHash: "  replacement-network  "));

        Assert.True(rotationResult.Succeeded);
        Assert.Equal(AuthRefreshSessionRotationStatus.Rotated, rotationResult.Status);
        Assert.NotNull(rotationResult.RawAccessSessionToken);
        Assert.NotNull(rotationResult.RawRefreshCredential);
        Assert.NotEqual(createResult.RawAccessSessionToken, rotationResult.RawAccessSessionToken);
        Assert.NotEqual(createResult.RawRefreshCredential, rotationResult.RawRefreshCredential);
        Assert.Equal(createResult.AuthSessionFamilyId, rotationResult.AuthSessionFamilyId);
        Assert.Equal(createResult.AuthRefreshCredentialId, rotationResult.ConsumedAuthRefreshCredentialId);
        Assert.Equal(RotationTimestamp.AddMinutes(15), rotationResult.AccessSessionExpiresAtUtc);
        Assert.Equal(RotationTimestamp.AddDays(7), rotationResult.RefreshCredentialIdleExpiresAtUtc);
        Assert.Equal(InitialTimestamp.AddDays(30), rotationResult.RefreshCredentialAbsoluteExpiresAtUtc);
        Assert.Equal(InitialTimestamp.AddDays(30), rotationResult.SessionFamilyAbsoluteExpiresAtUtc);

        var sessionFamily = await dbContext.Set<AuthSessionFamily>().SingleAsync();
        Assert.Equal(AuthSessionFamilyStatuses.Active, sessionFamily.Status);
        Assert.Equal(RotationTimestamp, sessionFamily.LastRotatedAtUtc);
        Assert.Equal(RotationTimestamp, sessionFamily.UpdatedAtUtc);

        var oldCredential = await dbContext.Set<AuthRefreshCredential>().SingleAsync(
            credential => credential.Id == createResult.AuthRefreshCredentialId);
        var replacementCredential = await dbContext.Set<AuthRefreshCredential>().SingleAsync(
            credential => credential.Id == rotationResult.ReplacementAuthRefreshCredentialId);
        Assert.Equal(AuthRefreshCredentialStatuses.Rotated, oldCredential.Status);
        Assert.Equal(RotationTimestamp, oldCredential.ConsumedAtUtc);
        Assert.Equal(replacementCredential.Id, oldCredential.ReplacedByRefreshCredentialId);
        Assert.Equal("refresh_rotated", oldCredential.RevocationReason);
        Assert.Equal(AuthRefreshCredentialStatuses.Active, replacementCredential.Status);
        Assert.Equal(sessionFamily.Id, replacementCredential.AuthSessionFamilyId);
        Assert.Equal(rotationResult.AuthSessionId, replacementCredential.AuthSessionId);
        Assert.Equal(RotationTimestamp.AddDays(7), replacementCredential.IdleExpiresAtUtc);
        Assert.Equal(InitialTimestamp.AddDays(30), replacementCredential.AbsoluteExpiresAtUtc);
        Assert.NotEqual(oldCredential.RefreshTokenHash, replacementCredential.RefreshTokenHash);
        Assert.Single(await dbContext.Set<AuthRefreshCredential>()
            .Where(candidate => candidate.AuthSessionFamilyId == sessionFamily.Id
                && candidate.Status == AuthRefreshCredentialStatuses.Active)
            .ToListAsync());

        var replacementSession = await dbContext.Set<AuthSession>().SingleAsync(
            session => session.Id == rotationResult.AuthSessionId);
        Assert.Equal(AuthSessionStatuses.Active, replacementSession.Status);
        Assert.Equal(RotationTimestamp.AddMinutes(15), replacementSession.ExpiresAtUtc);
        Assert.Equal("Replacement device", replacementSession.DeviceLabel);
        Assert.Equal("replacement user agent", replacementSession.UserAgentSummary);
        Assert.Equal("replacement-network", replacementSession.NetworkAddressHash);

        var auditEvent = await AssertSingleAuditEventAsync(
            dbContext,
            "refresh.rotated",
            AuthAuditOutcomes.Success,
            expectedActorAuthAccountId: authAccountId,
            expectedSubjectAuthAccountId: authAccountId,
            RotationTimestamp,
            AuthRefreshSessionRotationStatus.Rotated.ToString());
        Assert.DoesNotContain(rotationResult.RawAccessSessionToken!, auditEvent.SafeMetadataJson!);
        Assert.DoesNotContain(rotationResult.RawRefreshCredential!, auditEvent.SafeMetadataJson!);
    }

    [Fact]
    public async Task RotationDoesNotExposeOrPersistRawTokenMaterialOutsideResult()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var createResult = await CreateInitialRefreshSessionAsync(dbContext, authAccountId);
        var service = CreateService(dbContext, RotationTimestamp);

        var rotationResult = await service.RotateRefreshCredentialAsync(
            new AuthRefreshSessionRotationRequest(createResult.RawRefreshCredential));

        Assert.True(rotationResult.Succeeded);
        var sessions = await dbContext.Set<AuthSession>().ToListAsync();
        var refreshCredentials = await dbContext.Set<AuthRefreshCredential>().ToListAsync();
        var auditEvents = await dbContext.Set<AuthAuditEvent>().ToListAsync();
        var persistedText = string.Join(
            Environment.NewLine,
            sessions.Select(session => string.Join('|',
                session.SessionTokenHash,
                session.RefreshTokenHash,
                session.DeviceLabel,
                session.UserAgentSummary,
                session.NetworkAddressHash,
                session.RevocationReason))
            .Concat(refreshCredentials.Select(credential => string.Join('|',
                credential.RefreshTokenHash,
                credential.Status,
                credential.RevocationReason)))
            .Concat(auditEvents.Select(auditEvent => string.Join('|',
                auditEvent.Action,
                auditEvent.Outcome,
                auditEvent.SafeMetadataJson))));

        Assert.DoesNotContain(createResult.RawAccessSessionToken!, persistedText);
        Assert.DoesNotContain(createResult.RawRefreshCredential!, persistedText);
        Assert.DoesNotContain(rotationResult.RawAccessSessionToken!, persistedText);
        Assert.DoesNotContain(rotationResult.RawRefreshCredential!, persistedText);

        foreach (var session in sessions)
        {
            Assert.DoesNotContain(session.SessionTokenHash, rotationResult.ToString());
        }

        foreach (var credential in refreshCredentials)
        {
            Assert.DoesNotContain(credential.RefreshTokenHash, rotationResult.ToString());
            foreach (var auditEvent in auditEvents)
            {
                Assert.DoesNotContain(credential.RefreshTokenHash, auditEvent.SafeMetadataJson!);
            }
        }
    }

    [Fact]
    public async Task ExpiredRefreshCredentialFailsSafelyAndExpiresLinkedFamily()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var createResult = await CreateInitialRefreshSessionAsync(dbContext, authAccountId);
        var credential = await dbContext.Set<AuthRefreshCredential>().SingleAsync();
        credential.IdleExpiresAtUtc = InitialTimestamp.AddMinutes(10);
        credential.UpdatedAtUtc = InitialTimestamp;
        await dbContext.SaveChangesAsync();
        await ClearAuditEventsAsync(dbContext);
        var service = CreateService(dbContext, InitialTimestamp.AddMinutes(13));

        var result = await service.RotateRefreshCredentialAsync(
            new AuthRefreshSessionRotationRequest(createResult.RawRefreshCredential));

        Assert.False(result.Succeeded);
        Assert.Equal(AuthRefreshSessionRotationStatus.CredentialExpired, result.Status);
        Assert.Null(result.RawAccessSessionToken);
        Assert.Null(result.RawRefreshCredential);
        Assert.Single(await dbContext.Set<AuthSession>().ToListAsync());
        Assert.Single(await dbContext.Set<AuthRefreshCredential>().ToListAsync());

        var sessionFamily = await dbContext.Set<AuthSessionFamily>().SingleAsync();
        Assert.Equal(AuthSessionFamilyStatuses.Expired, sessionFamily.Status);
        Assert.Equal(InitialTimestamp.AddMinutes(13), sessionFamily.RevokedAtUtc);
        Assert.Equal("refresh_expired", sessionFamily.RevocationReason);

        var expiredCredential = await dbContext.Set<AuthRefreshCredential>().SingleAsync();
        Assert.Equal(AuthRefreshCredentialStatuses.Expired, expiredCredential.Status);
        Assert.Equal(InitialTimestamp.AddMinutes(13), expiredCredential.RevokedAtUtc);
        Assert.Equal("refresh_expired", expiredCredential.RevocationReason);

        var linkedSession = await dbContext.Set<AuthSession>().SingleAsync();
        Assert.Equal(AuthSessionStatuses.Revoked, linkedSession.Status);
        Assert.Equal("refresh_expired", linkedSession.RevocationReason);

        await AssertAuditActionsAsync(
            dbContext,
            ("refresh.failed", AuthAuditOutcomes.Expired, AuthRefreshSessionRotationStatus.CredentialExpired.ToString()),
            ("session_family.revoked", AuthAuditOutcomes.Revoked, AuthRefreshSessionRotationStatus.CredentialExpired.ToString()));
    }

    [Fact]
    public async Task RotatedCredentialReuseTriggersReplayClassificationAndFamilyRevocation()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var createResult = await CreateInitialRefreshSessionAsync(dbContext, authAccountId);
        var rotationService = CreateService(dbContext, RotationTimestamp);
        var rotationResult = await rotationService.RotateRefreshCredentialAsync(
            new AuthRefreshSessionRotationRequest(createResult.RawRefreshCredential));
        Assert.True(rotationResult.Succeeded);
        await ClearAuditEventsAsync(dbContext);
        var replayService = CreateService(dbContext, ReplayTimestamp);

        var replayResult = await replayService.RotateRefreshCredentialAsync(
            new AuthRefreshSessionRotationRequest(createResult.RawRefreshCredential));

        Assert.False(replayResult.Succeeded);
        Assert.Equal(AuthRefreshSessionRotationStatus.CredentialReplayed, replayResult.Status);
        Assert.Null(replayResult.RawAccessSessionToken);
        Assert.Null(replayResult.RawRefreshCredential);

        var sessionFamily = await dbContext.Set<AuthSessionFamily>().SingleAsync();
        Assert.Equal(AuthSessionFamilyStatuses.Replayed, sessionFamily.Status);
        Assert.Equal(ReplayTimestamp, sessionFamily.RevokedAtUtc);
        Assert.Equal("refresh_replay_detected", sessionFamily.RevocationReason);

        var replacementCredential = await dbContext.Set<AuthRefreshCredential>().SingleAsync(
            credential => credential.Id == rotationResult.ReplacementAuthRefreshCredentialId);
        Assert.Equal(AuthRefreshCredentialStatuses.Replayed, replacementCredential.Status);
        Assert.Equal(ReplayTimestamp, replacementCredential.RevokedAtUtc);
        Assert.Equal("refresh_replay_detected", replacementCredential.RevocationReason);

        var activeSessions = await dbContext.Set<AuthSession>()
            .Where(session => session.Status == AuthSessionStatuses.Active)
            .ToListAsync();
        Assert.Empty(activeSessions);

        await AssertAuditActionsAsync(
            dbContext,
            ("refresh.replay_detected", AuthAuditOutcomes.Revoked, AuthRefreshSessionRotationStatus.CredentialReplayed.ToString()),
            ("session_family.revoked", AuthAuditOutcomes.Revoked, AuthRefreshSessionRotationStatus.CredentialReplayed.ToString()));
    }

    [Fact]
    public async Task RevokedFamilyBlocksRotationWithoutCreatingReplacement()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var createResult = await CreateInitialRefreshSessionAsync(dbContext, authAccountId);
        var sessionFamily = await dbContext.Set<AuthSessionFamily>().SingleAsync();
        sessionFamily.Status = AuthSessionFamilyStatuses.Revoked;
        sessionFamily.RevokedAtUtc = InitialTimestamp.AddMinutes(2);
        sessionFamily.RevocationReason = "seeded_family_revocation";
        sessionFamily.UpdatedAtUtc = InitialTimestamp.AddMinutes(2);
        await dbContext.SaveChangesAsync();
        await ClearAuditEventsAsync(dbContext);
        var service = CreateService(dbContext, RotationTimestamp);

        var result = await service.RotateRefreshCredentialAsync(
            new AuthRefreshSessionRotationRequest(createResult.RawRefreshCredential));

        Assert.False(result.Succeeded);
        Assert.Equal(AuthRefreshSessionRotationStatus.SessionFamilyRevoked, result.Status);
        Assert.Null(result.RawAccessSessionToken);
        Assert.Null(result.RawRefreshCredential);
        Assert.Single(await dbContext.Set<AuthSession>().ToListAsync());
        Assert.Single(await dbContext.Set<AuthRefreshCredential>().ToListAsync());

        sessionFamily = await dbContext.Set<AuthSessionFamily>().SingleAsync();
        Assert.Equal(AuthSessionFamilyStatuses.Revoked, sessionFamily.Status);
        Assert.Equal("seeded_family_revocation", sessionFamily.RevocationReason);

        await AssertSingleAuditEventAsync(
            dbContext,
            "refresh.failed",
            AuthAuditOutcomes.Revoked,
            expectedActorAuthAccountId: null,
            expectedSubjectAuthAccountId: authAccountId,
            RotationTimestamp,
            AuthRefreshSessionRotationStatus.SessionFamilyRevoked.ToString());
    }

    [Theory]
    [InlineData("disabled")]
    [InlineData("deleted")]
    public async Task UnavailableAccountBlocksRotationAndRevokesLinkedFamily(string accountState)
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var createResult = await CreateInitialRefreshSessionAsync(dbContext, authAccountId);
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
        await ClearAuditEventsAsync(dbContext);
        var service = CreateService(dbContext, RotationTimestamp);

        var result = await service.RotateRefreshCredentialAsync(
            new AuthRefreshSessionRotationRequest(createResult.RawRefreshCredential));

        Assert.False(result.Succeeded);
        Assert.Equal(AuthRefreshSessionRotationStatus.AccountUnavailable, result.Status);

        var sessionFamily = await dbContext.Set<AuthSessionFamily>().SingleAsync();
        Assert.Equal(AuthSessionFamilyStatuses.Revoked, sessionFamily.Status);
        Assert.Equal("account_unavailable", sessionFamily.RevocationReason);

        var credential = await dbContext.Set<AuthRefreshCredential>().SingleAsync();
        Assert.Equal(AuthRefreshCredentialStatuses.Revoked, credential.Status);
        Assert.Equal("account_unavailable", credential.RevocationReason);

        var session = await dbContext.Set<AuthSession>().SingleAsync();
        Assert.Equal(AuthSessionStatuses.Revoked, session.Status);
        Assert.Equal("account_unavailable", session.RevocationReason);

        await AssertAuditActionsAsync(
            dbContext,
            ("refresh.failed", AuthAuditOutcomes.Denied, AuthRefreshSessionRotationStatus.AccountUnavailable.ToString()),
            ("session_family.revoked", AuthAuditOutcomes.Revoked, AuthRefreshSessionRotationStatus.AccountUnavailable.ToString()));
    }

    [Fact]
    public async Task RotationPersistenceFailureMapsToSafeStatus()
    {
        var databaseName = Guid.NewGuid().ToString();
        var databaseRoot = new InMemoryDatabaseRoot();
        string rawRefreshCredential;
        await using (var seedContext = CreateDbContext(databaseName, databaseRoot))
        {
            var authAccountId = await SeedAuthAccountAsync(seedContext);
            var createResult = await CreateInitialRefreshSessionAsync(seedContext, authAccountId);
            rawRefreshCredential = createResult.RawRefreshCredential!;
        }

        await using var dbContext = CreateDbContext(
            databaseName,
            databaseRoot,
            new ThrowingSaveChangesInterceptor());
        var credential = await dbContext.Set<AuthRefreshCredential>().SingleAsync();
        var service = CreateService(dbContext, RotationTimestamp);

        var result = await service.RotateRefreshCredentialAsync(
            new AuthRefreshSessionRotationRequest(rawRefreshCredential));

        Assert.False(result.Succeeded);
        Assert.Equal(AuthRefreshSessionRotationStatus.PersistenceFailed, result.Status);
        Assert.Null(result.RawAccessSessionToken);
        Assert.Null(result.RawRefreshCredential);
        Assert.DoesNotContain(rawRefreshCredential, result.ToString());
        Assert.DoesNotContain(credential.RefreshTokenHash, result.ToString());
    }

    [Fact]
    public async Task AuditMetadataExcludesRawHashesPasswordProviderSecretsAndUnboundedDetails()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var createResult = await CreateInitialRefreshSessionAsync(dbContext, authAccountId);
        var service = CreateService(dbContext, RotationTimestamp);

        var result = await service.RotateRefreshCredentialAsync(
            new AuthRefreshSessionRotationRequest(createResult.RawRefreshCredential));

        Assert.True(result.Succeeded);
        var sessionHashes = await dbContext.Set<AuthSession>()
            .Select(session => session.SessionTokenHash)
            .ToListAsync();
        var refreshHashes = await dbContext.Set<AuthRefreshCredential>()
            .Select(credential => credential.RefreshTokenHash)
            .ToListAsync();
        var auditEvent = await dbContext.Set<AuthAuditEvent>().SingleAsync();

        AssertSafeAuditMetadata(
            auditEvent.SafeMetadataJson,
            AuthRefreshSessionRotationStatus.Rotated.ToString());
        Assert.DoesNotContain(createResult.RawAccessSessionToken!, auditEvent.SafeMetadataJson!);
        Assert.DoesNotContain(createResult.RawRefreshCredential!, auditEvent.SafeMetadataJson!);
        Assert.DoesNotContain(result.RawAccessSessionToken!, auditEvent.SafeMetadataJson!);
        Assert.DoesNotContain(result.RawRefreshCredential!, auditEvent.SafeMetadataJson!);

        foreach (var hash in sessionHashes.Concat(refreshHashes))
        {
            Assert.DoesNotContain(hash, auditEvent.SafeMetadataJson!);
        }

        var lowercaseMetadata = auditEvent.SafeMetadataJson!.ToLowerInvariant();
        Assert.DoesNotContain("password", lowercaseMetadata);
        Assert.DoesNotContain("provider", lowercaseMetadata);
        Assert.DoesNotContain("secret", lowercaseMetadata);
        Assert.DoesNotContain("token", lowercaseMetadata);
    }

    [Fact]
    public void AuthRefreshSessionRuntimeRegistersEfRuntimeService()
    {
        var services = new ServiceCollection();
        services.AddDbContext<SettleoraDbContext>(options =>
        {
            options.UseInMemoryDatabase(Guid.NewGuid().ToString());
        });
        services.AddAuthSessionRuntime(new ConfigurationBuilder().Build());

        using var serviceProvider = services.BuildServiceProvider();
        using var scope = serviceProvider.CreateScope();

        var runtimeService = scope.ServiceProvider.GetRequiredService<IAuthRefreshSessionRuntimeService>();
        var timeProvider = scope.ServiceProvider.GetRequiredService<TimeProvider>();
        var sessionPolicyOptions = scope.ServiceProvider.GetRequiredService<IOptions<AuthSessionPolicyOptions>>();

        Assert.IsType<AuthRefreshSessionRuntimeService>(runtimeService);
        Assert.Same(TimeProvider.System, timeProvider);
        Assert.Equal(TimeSpan.FromMinutes(15), sessionPolicyOptions.Value.RefreshAccessSessionDefaultLifetime);
    }

    private static async Task<AuthRefreshSessionCreationResult> CreateInitialRefreshSessionAsync(
        SettleoraDbContext dbContext,
        Guid authAccountId)
    {
        var createService = CreateService(dbContext, InitialTimestamp);
        var createResult = await createService.CreateRefreshSessionAsync(
            new AuthRefreshSessionCreationRequest(authAccountId));

        Assert.True(createResult.Succeeded);
        Assert.NotNull(createResult.RawAccessSessionToken);
        Assert.NotNull(createResult.RawRefreshCredential);

        await ClearAuditEventsAsync(dbContext);
        return createResult;
    }

    private static AuthRefreshSessionRuntimeService CreateService(
        SettleoraDbContext dbContext,
        DateTimeOffset utcNow,
        AuthSessionPolicyOptions? sessionPolicyOptions = null)
    {
        return new AuthRefreshSessionRuntimeService(
            dbContext,
            new EfAuthSessionAuditWriter(dbContext),
            new FixedTimeProvider(utcNow),
            Options.Create(sessionPolicyOptions ?? new AuthSessionPolicyOptions()));
    }

    private static SettleoraDbContext CreateDbContext(
        string? databaseName = null,
        InMemoryDatabaseRoot? databaseRoot = null,
        SaveChangesInterceptor? saveChangesInterceptor = null)
    {
        var optionsBuilder = new DbContextOptionsBuilder<SettleoraDbContext>();
        if (databaseRoot is null)
        {
            optionsBuilder.UseInMemoryDatabase(databaseName ?? Guid.NewGuid().ToString());
        }
        else
        {
            optionsBuilder.UseInMemoryDatabase(databaseName!, databaseRoot);
        }

        if (saveChangesInterceptor is not null)
        {
            optionsBuilder.AddInterceptors(saveChangesInterceptor);
        }

        return new SettleoraDbContext(optionsBuilder.Options);
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
            DisplayName = "Refresh Runtime Test User",
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

    private static async Task AssertAuditActionsAsync(
        SettleoraDbContext dbContext,
        params (string Action, string Outcome, string StatusCategory)[] expectedEvents)
    {
        var auditEvents = await dbContext.Set<AuthAuditEvent>()
            .OrderBy(auditEvent => auditEvent.Action)
            .ToListAsync();
        var sortedExpectedEvents = expectedEvents
            .OrderBy(expectedEvent => expectedEvent.Action)
            .ToArray();

        Assert.Equal(sortedExpectedEvents.Length, auditEvents.Count);
        for (var index = 0; index < sortedExpectedEvents.Length; index++)
        {
            Assert.Equal(sortedExpectedEvents[index].Action, auditEvents[index].Action);
            Assert.Equal(sortedExpectedEvents[index].Outcome, auditEvents[index].Outcome);
            AssertSafeAuditMetadata(
                auditEvents[index].SafeMetadataJson,
                sortedExpectedEvents[index].StatusCategory);
        }
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
            "auth_refresh_session_runtime",
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

    private sealed class ThrowingSaveChangesInterceptor : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            throw new DbUpdateException("Simulated persistence failure.", (Exception?)null);
        }
    }
}
