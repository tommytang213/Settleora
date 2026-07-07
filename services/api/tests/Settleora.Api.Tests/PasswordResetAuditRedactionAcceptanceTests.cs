using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Settleora.Api.Auth.Credentials;
using Settleora.Api.Auth.PasswordHashing;
using Settleora.Api.Auth.PasswordReset;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class PasswordResetAuditRedactionAcceptanceTests
{
    private const string SubmittedIdentifier = "  Reset.User+Secret@Example.Invalid  ";
    private const string NormalizedIdentifier = "reset.user+secret@example.invalid";
    private const string MissingIdentifier = "missing-reset-user@example.invalid";
    private const string AccountUsername = "reset.user+secret";
    private const string DisplayName = "Reset Secret User";
    private const string CurrentPassword = "current-password-secret";
    private const string NewPassword = "new-password-secret";
    private const string ReplayPassword = "replay-password-secret";
    private const string UnknownMaterial = "unknown-reset-material-secret";
    private const string SourceBucket = "source.reset.safe";
    private const string CorrelationId = "corr.reset.safe";
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 7, 7, 3, 30, 0, TimeSpan.Zero);

    [Fact]
    public async Task PasswordResetAuditRowsUseOnlyBoundedCategoriesAcrossCurrentOutcomes()
    {
        using var dbContext = CreateDbContext();
        var seeded = await SeedLocalAccountAsync(dbContext, NormalizedIdentifier);
        await SeedCredentialAsync(dbContext, seeded.AuthAccountId, CurrentPassword);
        var service = CreateService(dbContext);

        await service.RequestResetAsync(new LocalPasswordResetRequest(
            SubmittedIdentifier,
            SourceBucket,
            CorrelationId));
        await service.RequestResetAsync(new LocalPasswordResetRequest(
            MissingIdentifier,
            SourceBucket,
            CorrelationId));

        var replaced = await service.IssueMaterialAsync(CreateIssueRequest());
        var issued = await service.IssueMaterialAsync(CreateIssueRequest());
        Assert.True(replaced.Succeeded);
        Assert.True(issued.Succeeded);

        var completed = await service.CompleteResetAsync(new LocalPasswordResetCompleteRequest(
            issued.RawResetMaterial,
            NewPassword,
            CorrelationId));
        var replayed = await service.CompleteResetAsync(new LocalPasswordResetCompleteRequest(
            issued.RawResetMaterial,
            ReplayPassword,
            CorrelationId));
        var unknown = await service.CompleteResetAsync(new LocalPasswordResetCompleteRequest(
            UnknownMaterial,
            NewPassword,
            CorrelationId));

        Assert.True(completed.Succeeded);
        Assert.False(replayed.Succeeded);
        Assert.False(unknown.Succeeded);

        var passwordResetAudits = await dbContext.Set<AuthAuditEvent>()
            .Where(audit => audit.Action.StartsWith("password_reset."))
            .OrderBy(audit => audit.OccurredAtUtc)
            .ToListAsync();

        Assert.Contains(passwordResetAudits, audit => audit.Action == "password_reset.requested");
        Assert.Contains(passwordResetAudits, audit => audit.Action == "password_reset.material_issued");
        Assert.Contains(passwordResetAudits, audit => audit.Action == "password_reset.replaced_or_revoked");
        Assert.Contains(passwordResetAudits, audit => audit.Action == "password_reset.consumed");
        Assert.Contains(passwordResetAudits, audit => audit.Action == "password_reset.sessions_revoked");
        Assert.Contains(passwordResetAudits, audit => audit.Action == "password_reset.replay_suspicious");
        Assert.Contains(passwordResetAudits, audit => audit.Action == "password_reset.denied");

        var resetRows = await dbContext.Set<AuthPasswordResetRequest>().ToListAsync();
        var persistedHashes = resetRows
            .Select(row => row.ResetMaterialHash)
            .Where(hash => !string.IsNullOrWhiteSpace(hash))
            .Cast<string>()
            .ToArray();
        var forbiddenFragments = new[]
        {
            SubmittedIdentifier.Trim(),
            NormalizedIdentifier,
            MissingIdentifier,
            AccountUsername,
            DisplayName,
            seeded.AuthAccountId.ToString(),
            seeded.UserProfileId.ToString(),
            replaced.RawResetMaterial!,
            issued.RawResetMaterial!,
            UnknownMaterial,
            CurrentPassword,
            NewPassword,
            ReplayPassword,
            AcceptancePasswordHashingService.HashFor(CurrentPassword),
            AcceptancePasswordHashingService.HashFor(NewPassword),
            "smtp-host-placeholder",
            "smtp-username-placeholder",
            "smtp-password-placeholder",
            "settleora.example.invalid",
            "raw provider diagnostic payload",
            "stack trace",
            "bucket-key-secret"
        }.Concat(persistedHashes).ToArray();

        Assert.All(passwordResetAudits, audit =>
        {
            Assert.Null(audit.ActorAuthAccountId);
            Assert.Null(audit.SubjectAuthAccountId);
            Assert.Null(audit.RequestId);
            Assert.Equal(CorrelationId, audit.CorrelationId);
            AssertSafeCategory(audit.Action);
            AssertSafeCategory(audit.Outcome);
            Assert.NotNull(audit.SafeMetadataJson);
            AssertSafeMetadataJson(audit.SafeMetadataJson);
            AssertNoForbiddenFragments(audit, forbiddenFragments);
        });
    }

    [Fact]
    public void PasswordResetResultAndDecisionReadbacksUseOnlyBoundedCategories()
    {
        var rawMaterial = "raw-reset-material-secret";
        var resetMaterial = new PasswordResetMaterial(
            rawMaterial,
            "pwd-reset-sha256:v1:lookup-hash-secret",
            "sha256-v1");
        var issueResult = LocalPasswordResetMaterialIssueResult.Issued(
            Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
            rawMaterial);
        var throttleRequest = new PasswordResetThrottleRequest(
            SubmittedIdentifier,
            "bucket-key-secret",
            "recoverable-correlation-placeholder");
        var throttleDecision = PasswordResetThrottleDecision.Block(
            PasswordResetThrottleCategories.ProviderSend,
            PasswordResetThrottleScopes.ProviderSend);
        var deliveryResult = PasswordResetEmailDeliveryResult.ProviderFailedRedacted(
            CreateComposition(rawMaterial),
            PasswordResetSmtpEmailSendResult.FailedTransient(
                PasswordResetSmtpEmailSendResultCategories.ProviderUnavailable));
        var publicDecision = new PasswordResetPublicResponsePolicy().DecideForRequest(deliveryResult);

        var combined = string.Join(
            " ",
            resetMaterial.ToString(),
            issueResult.ToString(),
            throttleRequest.ToString(),
            throttleDecision.ToString(),
            deliveryResult.ToString(),
            deliveryResult.RedactedPreview?.ToString(),
            deliveryResult.RedactedPreview?.TextBody,
            publicDecision.ToString());

        Assert.DoesNotContain(rawMaterial, combined, StringComparison.Ordinal);
        Assert.DoesNotContain("lookup-hash-secret", combined, StringComparison.Ordinal);
        Assert.DoesNotContain("resetMaterial=", combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(SubmittedIdentifier.Trim(), combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(NormalizedIdentifier, combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("bucket-key-secret", combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("recoverable-correlation-placeholder", combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("settleora.example.invalid", combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("smtp-password-placeholder", combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("raw provider diagnostic payload", combined, StringComparison.OrdinalIgnoreCase);
    }

    private static PasswordResetEmailTemplateCompositionResult CreateComposition(string rawMaterial)
    {
        return new PasswordResetEmailTemplateCompositionResult(
            Available: true,
            PasswordResetEmailTemplateCompositionStatuses.Available,
            PasswordResetEmailTemplateCompositionCategories.ProductionSmtpReady,
            PasswordResetEmailDeliveryModes.ProductionSmtp,
            60,
            new PasswordResetEmailSendReadyMessage(
                PasswordResetEmailTemplateComposer.TemplateSubject,
                $"Reset link: https://settleora.example.invalid/auth/password-reset#resetMaterial={rawMaterial}",
                new Uri($"https://settleora.example.invalid/auth/password-reset#resetMaterial={rawMaterial}"),
                PasswordResetEmailDeliveryModes.ProductionSmtp,
                60),
            new PasswordResetEmailTemplateRedactedPreview(
                PasswordResetEmailTemplateComposer.TemplateSubject,
                "Reset link: [redacted]",
                PasswordResetEmailTemplateCompositionCategories.ProductionSmtpReady,
                60),
            []);
    }

    private static LocalPasswordResetMaterialIssueRequest CreateIssueRequest()
    {
        return new LocalPasswordResetMaterialIssueRequest(
            SubmittedIdentifier,
            AuthPasswordResetMaterialScopes.EmailLink,
            TimeSpan.FromMinutes(60),
            SourceBucket,
            CorrelationId);
    }

    private static LocalPasswordResetService CreateService(SettleoraDbContext dbContext)
    {
        var timeProvider = new AcceptanceTimeProvider(InitialTimestamp);
        var credentialWorkflow = new AuthCredentialWorkflowService(
            dbContext,
            new AcceptancePasswordHashingService(),
            new EfAuthCredentialAuditWriter(dbContext),
            timeProvider);
        var sessionRuntime = new AuthSessionRuntimeService(
            dbContext,
            new EfAuthSessionAuditWriter(dbContext),
            timeProvider,
            Options.Create(new AuthSessionPolicyOptions()));

        return new LocalPasswordResetService(
            dbContext,
            new PasswordResetMaterialService(),
            credentialWorkflow,
            sessionRuntime,
            new EfPasswordResetAuditWriter(dbContext),
            timeProvider);
    }

    private static SettleoraDbContext CreateDbContext()
    {
        return new SettleoraDbContext(
            new DbContextOptionsBuilder<SettleoraDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .Options);
    }

    private static async Task<SeededAccount> SeedLocalAccountAsync(
        SettleoraDbContext dbContext,
        string normalizedIdentifier)
    {
        var profileId = Guid.NewGuid();
        var accountId = Guid.NewGuid();
        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = profileId,
            DisplayName = DisplayName,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<AuthAccount>().Add(new AuthAccount
        {
            Id = accountId,
            UserProfileId = profileId,
            Status = AuthAccountStatuses.Active,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<AuthIdentity>().Add(new AuthIdentity
        {
            Id = Guid.NewGuid(),
            AuthAccountId = accountId,
            ProviderType = AuthIdentityProviderTypes.Local,
            ProviderName = AuthIdentityProviderTypes.Local,
            ProviderSubject = normalizedIdentifier,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        await dbContext.SaveChangesAsync();
        return new SeededAccount(accountId, profileId);
    }

    private static async Task SeedCredentialAsync(
        SettleoraDbContext dbContext,
        Guid authAccountId,
        string password)
    {
        dbContext.Set<LocalPasswordCredential>().Add(new LocalPasswordCredential
        {
            Id = Guid.NewGuid(),
            AuthAccountId = authAccountId,
            PasswordHash = AcceptancePasswordHashingService.HashFor(password),
            PasswordHashAlgorithm = AcceptancePasswordHashingService.Algorithm,
            PasswordHashAlgorithmVersion = AcceptancePasswordHashingService.PolicyVersion,
            PasswordHashParameters = AcceptancePasswordHashingService.ParametersJson,
            Status = LocalPasswordCredentialStatuses.Active,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        await dbContext.SaveChangesAsync();
    }

    private static void AssertSafeMetadataJson(string safeMetadataJson)
    {
        using var document = JsonDocument.Parse(safeMetadataJson);
        var root = document.RootElement;
        Assert.Equal(2, root.EnumerateObject().Count());
        Assert.Equal("local_password_reset", root.GetProperty("workflowName").GetString());
        AssertSafeCategory(root.GetProperty("statusCategory").GetString());
    }

    private static void AssertNoForbiddenFragments(AuthAuditEvent audit, IReadOnlyList<string> forbiddenFragments)
    {
        var combined = string.Join(
            " ",
            audit.Action,
            audit.Outcome,
            audit.ActorAuthAccountId,
            audit.SubjectAuthAccountId,
            audit.CorrelationId,
            audit.RequestId,
            audit.SafeMetadataJson);

        foreach (var fragment in forbiddenFragments.Where(fragment => !string.IsNullOrWhiteSpace(fragment)))
        {
            Assert.DoesNotContain(fragment, combined, StringComparison.OrdinalIgnoreCase);
        }
    }

    private static void AssertSafeCategory(string? value)
    {
        Assert.False(string.IsNullOrWhiteSpace(value));
        Assert.InRange(value!.Length, 1, 120);
        Assert.All(value, character =>
        {
            Assert.True(
                char.IsAsciiLetterOrDigit(character) || character is '_' or '-' or '.',
                $"Unsafe category character '{character}' in '{value}'.");
        });
    }

    private sealed record SeededAccount(Guid AuthAccountId, Guid UserProfileId);

    private sealed class AcceptanceTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset utcNow;

        public AcceptanceTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow()
        {
            return utcNow;
        }
    }

    private sealed class AcceptancePasswordHashingService : IPasswordHashingService
    {
        public const string Algorithm = "fake";
        public const string PolicyVersion = "test-v1";
        public const string ParametersJson = "{\"profile\":\"test\"}";

        public static string HashFor(string password)
        {
            return $"fake-hash:{password}";
        }

        public PasswordHashResult HashPassword(string plaintextPassword)
        {
            return PasswordHashResult.Success(
                HashFor(plaintextPassword),
                Algorithm,
                PolicyVersion,
                ParametersJson);
        }

        public PasswordVerificationResult VerifyPassword(
            string submittedPassword,
            StoredPasswordHash storedHash)
        {
            return StringComparer.Ordinal.Equals(storedHash.Verifier, HashFor(submittedPassword))
                ? PasswordVerificationResult.Verified(PasswordRehashDecision.NotRequired)
                : PasswordVerificationResult.Failure(PasswordVerificationStatus.WrongPassword);
        }

        public PasswordRehashDecision CheckRehashRequired(StoredPasswordHash storedHash)
        {
            return PasswordRehashDecision.NotRequired;
        }
    }
}
