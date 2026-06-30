using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Users;
using Settleora.Api.Expenses.BillSearch;
using Settleora.Api.Persistence;
using Settleora.Api.RequestValidation;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace Settleora.Api.LocalBackup;

internal static class LocalBackupPackageReadinessEndpoints
{
    private static readonly TimeSpan ReadinessFreshnessWindow = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan PackageSessionLifetime = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan PackageArtifactLifetime = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan DownloadActionLifetime = TimeSpan.FromMinutes(3);
    private static readonly TimeSpan RestorePreviewLifetime = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan RestoreConfirmationSessionLifetime = TimeSpan.FromMinutes(5);
    private const int MaxRestorePreviewRequestBytes = 1_100_000;
    private const int MaxRestorePreviewPackageBytes = 1_048_576;
    private const int MaxRestorePreviewSections = 64;
    private const string PackageContentType = "application/vnd.settleora.local-backup+json";
    private const string PackageFormatName = "settleora.local-backup.data-only";
    private const string PackageVersion = "2026-06-30.data-only.v1";
    private const string ManifestVersion = "2026-06-30.manifest.v1";
    private static readonly ConcurrentDictionary<Guid, LocalBackupPackageSessionMetadata> PackageSessions = new();
    private static readonly ConcurrentDictionary<Guid, LocalBackupRestorePreviewMetadata> RestorePreviews = new();
    private static readonly ConcurrentDictionary<Guid, LocalBackupRestoreConfirmationSessionMetadata> RestoreConfirmationSessions = new();

    public static WebApplication MapLocalBackupPackageReadinessEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/local-backup/package-readiness", GetPackageReadinessAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapPost("/api/v1/local-backup/package-sessions", CreatePackageSessionAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapGet("/api/v1/local-backup/package-sessions/{packageSessionId:guid}", GetPackageSessionAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapPost("/api/v1/local-backup/package-sessions/{packageSessionId:guid}/discard", DiscardPackageSessionAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapPost("/api/v1/local-backup/package-sessions/{packageSessionId:guid}/prepare", PreparePackageSessionAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapGet("/api/v1/local-backup/package-sessions/{packageSessionId:guid}/artifact-status", GetPackageArtifactStatusAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapPost("/api/v1/local-backup/package-sessions/{packageSessionId:guid}/cancel", CancelPackageGenerationAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapPost("/api/v1/local-backup/package-sessions/{packageSessionId:guid}/download-actions", CreatePackageDownloadActionAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapGet("/api/v1/local-backup/package-sessions/{packageSessionId:guid}/download-actions/{downloadActionId:guid}/content", DownloadPackageContentAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapPost("/api/v1/local-backup/restore-previews", CreateRestorePreviewAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapGet("/api/v1/local-backup/restore-previews/{restorePreviewId:guid}", GetRestorePreviewAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapPost("/api/v1/local-backup/restore-previews/{restorePreviewId:guid}/discard", DiscardRestorePreviewAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapPost("/api/v1/local-backup/restore-previews/{restorePreviewId:guid}/confirmation-sessions", CreateRestoreConfirmationSessionAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapGet("/api/v1/local-backup/restore-confirmation-sessions/{restoreConfirmationSessionId:guid}", GetRestoreConfirmationSessionAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        app.MapPost("/api/v1/local-backup/restore-confirmation-sessions/{restoreConfirmationSessionId:guid}/discard", DiscardRestoreConfirmationSessionAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        return app;
    }

    private static IResult GetPackageReadinessAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        TimeProvider timeProvider)
    {
        if (UnsupportedRequestFieldGuards.TryRejectNoBodyReadEnvelope(
                request,
                "Invalid local backup package readiness request",
                "The submitted local backup package readiness request is invalid.",
                "Local backup package readiness requests do not accept a body.",
                out var invalidReadEnvelope))
        {
            return invalidReadEnvelope;
        }

        if (!currentActorAccessor.TryGetCurrentActor(out _))
        {
            return Results.Problem(
                title: "Unauthenticated",
                detail: "Authentication is required to access this resource.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        var generatedAtUtc = timeProvider.GetUtcNow();
        return Results.Ok(new LocalBackupPackageReadinessResponse(
            Available: false,
            StableCode: "backup_package_unsupported",
            SafeMessage: "Local backup package creation, download, restore preview, restore confirmation, and browser local authority are not supported in this web build.",
            ServerModePosture: "server_authoritative",
            BrowserLocalPersistence: Feature("unsupported", "browser_local_persistence_unsupported", "Browser persistence is not approved for Settleora financial truth in this web build."),
            PackageGeneration: Feature("unsupported", "package_generation_unsupported", "Backup package generation is not implemented by this readiness slice."),
            PackageDownload: Feature("unsupported", "package_download_unsupported", "Backup package download is not implemented by this readiness slice."),
            RestorePreview: Feature("unsupported", "restore_preview_unsupported", "Backup restore preview is not implemented by this readiness slice."),
            RestoreConfirmation: Feature("unsupported", "restore_confirmation_unsupported", "Backup restore confirmation is not implemented by this readiness slice."),
            LocalModeAuthority: Feature("unsupported", "local_mode_authority_unsupported", "User web does not have an approved browser-local authority boundary."),
            KnownPackageConcepts:
            [
                new LocalBackupPackageConceptResponse(
                    "package_manifest",
                    "Versioned package metadata and compatibility markers are planned but not created by this endpoint."),
                new LocalBackupPackageConceptResponse(
                    "encrypted_file_sections",
                    "Encrypted package-local file sections are planned but no file bytes are read or written by this endpoint."),
                new LocalBackupPackageConceptResponse(
                    "restore_preview",
                    "Restore preview remains a separate future contract and is not performed by this endpoint.")
            ],
            UnsupportedFeatures:
            [
                "browser_local_persistence",
                "package_generation",
                "package_download",
                "restore_preview",
                "restore_confirmation",
                "local_mode_authority"
            ],
            PrivacyBoundary: "This readiness response returns metadata only. It excludes package bytes, storage paths, object keys, signed URLs, direct storage URLs, filesystem paths, local device paths, file bytes, raw OCR text, private notes, payment details, hidden records, auth tokens, and credential material.",
            DataEgressBoundary: "No backup package is created, downloaded, parsed, uploaded, or restored by this endpoint. Future package generation remains a separate reviewed data-egress contract.",
            GeneratedAtUtc: generatedAtUtc,
            ExpiresAtUtc: generatedAtUtc.Add(ReadinessFreshnessWindow)));
    }

    private static IResult CreatePackageSessionAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        TimeProvider timeProvider)
    {
        if (UnsupportedRequestFieldGuards.TryRejectNoBodyReadEnvelope(
                request,
                "Invalid local backup package session request",
                "The submitted local backup package session request is invalid.",
                "Local backup package session creation does not accept a body in this metadata-only slice.",
                out var invalidReadEnvelope))
        {
            return invalidReadEnvelope;
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Results.Problem(
                title: "Unauthenticated",
                detail: "Authentication is required to access this resource.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        var now = timeProvider.GetUtcNow();
        var session = new LocalBackupPackageSessionMetadata(
            Guid.NewGuid(),
            actor.UserProfileId,
            actor.AuthSessionId,
            "created",
            now,
            now.Add(PackageSessionLifetime),
            null,
            null);
        PackageSessions[session.PackageSessionId] = session;

        return Results.Created(
            $"/api/v1/local-backup/package-sessions/{session.PackageSessionId:D}",
            MapPackageSessionResponse(session, now));
    }

    private static IResult GetPackageSessionAsync(
        HttpRequest request,
        Guid packageSessionId,
        ICurrentActorAccessor currentActorAccessor,
        TimeProvider timeProvider)
    {
        if (UnsupportedRequestFieldGuards.TryRejectNoBodyReadEnvelope(
                request,
                "Invalid local backup package session request",
                "The submitted local backup package session request is invalid.",
                "Local backup package session reads do not accept a body.",
                out var invalidReadEnvelope))
        {
            return invalidReadEnvelope;
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Results.Problem(
                title: "Unauthenticated",
                detail: "Authentication is required to access this resource.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        if (!TryLoadActorPackageSession(packageSessionId, actor, out var session))
        {
            return PackageSessionUnavailableProblem();
        }

        var now = timeProvider.GetUtcNow();
        ExpirePackageSessionIfNeeded(session, now);
        return Results.Ok(MapPackageSessionResponse(session, now));
    }

    private static async Task<IResult> PreparePackageSessionAsync(
        HttpRequest request,
        Guid packageSessionId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (UnsupportedRequestFieldGuards.TryRejectNoBodyReadEnvelope(
                request,
                "Invalid local backup package preparation request",
                "The submitted local backup package preparation request is invalid.",
                "Local backup package preparation requests do not accept a body in this metadata-only slice.",
                out var invalidReadEnvelope))
        {
            return invalidReadEnvelope;
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Results.Problem(
                title: "Unauthenticated",
                detail: "Authentication is required to access this resource.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        if (!TryLoadActorPackageSession(packageSessionId, actor, out var session))
        {
            return PackageSessionUnavailableProblem();
        }

        var now = timeProvider.GetUtcNow();
        ExpirePackageSessionIfNeeded(session, now);
        if (session.Status is not "created" and not "ready_to_download")
        {
            return Results.Ok(MapPackageGenerationResponse(session, now));
        }

        var authorization = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorization.Allowed)
        {
            session.Status = "blocked";
            session.StableFailureCode = "policy_disabled";
            return Results.Ok(MapPackageGenerationResponse(session, now));
        }

        var artifact = await BuildPackageArtifactAsync(session, actor, dbContext, now, cancellationToken);
        session.Artifact = artifact;
        session.Status = "ready_to_download";
        return Results.Ok(MapPackageGenerationResponse(session, now));
    }

    private static IResult GetPackageArtifactStatusAsync(
        HttpRequest request,
        Guid packageSessionId,
        ICurrentActorAccessor currentActorAccessor,
        TimeProvider timeProvider)
    {
        if (UnsupportedRequestFieldGuards.TryRejectNoBodyReadEnvelope(
                request,
                "Invalid local backup package artifact status request",
                "The submitted local backup package artifact status request is invalid.",
                "Local backup package artifact status reads do not accept a body.",
                out var invalidReadEnvelope))
        {
            return invalidReadEnvelope;
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Results.Problem(
                title: "Unauthenticated",
                detail: "Authentication is required to access this resource.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        if (!TryLoadActorPackageSession(packageSessionId, actor, out var session))
        {
            return PackageSessionUnavailableProblem();
        }

        var now = timeProvider.GetUtcNow();
        ExpirePackageSessionIfNeeded(session, now);
        ExpireArtifactAndDownloadActionsIfNeeded(session, now);
        return Results.Ok(MapPackageArtifactStatusResponse(session, now));
    }

    private static IResult CancelPackageGenerationAsync(
        HttpRequest request,
        Guid packageSessionId,
        ICurrentActorAccessor currentActorAccessor,
        TimeProvider timeProvider)
    {
        if (UnsupportedRequestFieldGuards.TryRejectNoBodyReadEnvelope(
                request,
                "Invalid local backup package generation cancellation request",
                "The submitted local backup package generation cancellation request is invalid.",
                "Local backup package generation cancellation requests do not accept a body.",
                out var invalidReadEnvelope))
        {
            return invalidReadEnvelope;
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Results.Problem(
                title: "Unauthenticated",
                detail: "Authentication is required to access this resource.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        if (!TryLoadActorPackageSession(packageSessionId, actor, out var session))
        {
            return PackageSessionUnavailableProblem();
        }

        var now = timeProvider.GetUtcNow();
        ExpirePackageSessionIfNeeded(session, now);
        if (session.Status is "created" or "ready_to_download")
        {
            session.Status = "cancelled";
            session.CancelledAtUtc = now;
            session.Artifact = null;
            session.DownloadActions.Clear();
        }

        return Results.Ok(MapPackageGenerationResponse(session, now));
    }

    private static IResult CreatePackageDownloadActionAsync(
        HttpRequest request,
        Guid packageSessionId,
        ICurrentActorAccessor currentActorAccessor,
        TimeProvider timeProvider)
    {
        if (UnsupportedRequestFieldGuards.TryRejectNoBodyReadEnvelope(
                request,
                "Invalid local backup package download action request",
                "The submitted local backup package download action request is invalid.",
                "Local backup package download action requests do not accept a body in this metadata-only slice.",
                out var invalidReadEnvelope))
        {
            return invalidReadEnvelope;
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Results.Problem(
                title: "Unauthenticated",
                detail: "Authentication is required to access this resource.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        if (!TryLoadActorPackageSession(packageSessionId, actor, out var session))
        {
            return PackageSessionUnavailableProblem();
        }

        var now = timeProvider.GetUtcNow();
        ExpirePackageSessionIfNeeded(session, now);
        ExpireArtifactAndDownloadActionsIfNeeded(session, now);
        if (session.Status is "ready_to_download" && session.Artifact is { } artifact)
        {
            var action = new LocalBackupPackageDownloadActionMetadata(
                Guid.NewGuid(),
                now,
                Min(now.Add(DownloadActionLifetime), artifact.ExpiresAtUtc),
                false);
            session.DownloadActions[action.DownloadActionId] = action;
            return Results.Ok(MapPackageDownloadActionResponse(session, now, action));
        }

        return Results.Ok(MapPackageDownloadActionResponse(session, now));
    }

    private static IResult DownloadPackageContentAsync(
        HttpRequest request,
        Guid packageSessionId,
        Guid downloadActionId,
        ICurrentActorAccessor currentActorAccessor,
        TimeProvider timeProvider)
    {
        if (UnsupportedRequestFieldGuards.TryRejectNoBodyReadEnvelope(
                request,
                "Invalid local backup package content request",
                "The submitted local backup package content request is invalid.",
                "Local backup package content requests do not accept a body.",
                out var invalidReadEnvelope))
        {
            return invalidReadEnvelope;
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Results.Problem(
                title: "Unauthenticated",
                detail: "Authentication is required to access this resource.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        if (!TryLoadActorPackageSession(packageSessionId, actor, out var session))
        {
            return PackageSessionUnavailableProblem();
        }

        var now = timeProvider.GetUtcNow();
        ExpirePackageSessionIfNeeded(session, now);
        ExpireArtifactAndDownloadActionsIfNeeded(session, now);
        if (session.Status is not "ready_to_download"
            || session.Artifact is not { } artifact
            || !session.DownloadActions.TryGetValue(downloadActionId, out var action)
            || action.Consumed
            || now >= action.ExpiresAtUtc
            || now >= artifact.ExpiresAtUtc)
        {
            return Results.Problem(
                title: "Local backup package download unavailable",
                detail: "The local backup package download action is unavailable for this authenticated actor.",
                statusCode: StatusCodes.Status404NotFound);
        }

        action.Consumed = true;
        return Results.File(
            artifact.Content,
            PackageContentType,
            artifact.SafeFilename,
            lastModified: artifact.GeneratedAtUtc);
    }

    private static IResult DiscardPackageSessionAsync(
        HttpRequest request,
        Guid packageSessionId,
        ICurrentActorAccessor currentActorAccessor,
        TimeProvider timeProvider)
    {
        if (UnsupportedRequestFieldGuards.TryRejectNoBodyReadEnvelope(
                request,
                "Invalid local backup package session request",
                "The submitted local backup package session request is invalid.",
                "Local backup package session discard requests do not accept a body.",
                out var invalidReadEnvelope))
        {
            return invalidReadEnvelope;
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Results.Problem(
                title: "Unauthenticated",
                detail: "Authentication is required to access this resource.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        if (!TryLoadActorPackageSession(packageSessionId, actor, out var session))
        {
            return PackageSessionUnavailableProblem();
        }

        var now = timeProvider.GetUtcNow();
        ExpirePackageSessionIfNeeded(session, now);
        if (session.Status is "created")
        {
            session.Status = "discarded";
            session.DiscardedAtUtc = now;
            session.Artifact = null;
            session.DownloadActions.Clear();
        }

        return Results.Ok(MapPackageSessionResponse(session, now));
    }

    private static async Task<IResult> CreateRestorePreviewAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Results.Problem(
                title: "Unauthenticated",
                detail: "Authentication is required to access this resource.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        if (UnsupportedRequestFieldGuards.TryRejectQueryFields(
                request,
                "Invalid local backup restore preview request",
                "The submitted local backup restore preview request is invalid.",
                out var invalidQueryEnvelope))
        {
            return invalidQueryEnvelope;
        }

        if (request.ContentLength is null or <= 0)
        {
            return InvalidRestorePreviewPackageProblem("missing_package_content");
        }

        if (request.ContentLength > MaxRestorePreviewRequestBytes)
        {
            return InvalidRestorePreviewPackageProblem("backup_package_too_large");
        }

        string requestBody;
        using (var reader = new StreamReader(
            request.Body,
            Encoding.UTF8,
            detectEncodingFromByteOrderMarks: false,
            bufferSize: 8192,
            leaveOpen: false))
        {
            requestBody = await reader.ReadToEndAsync(cancellationToken);
        }

        if (Encoding.UTF8.GetByteCount(requestBody) > MaxRestorePreviewRequestBytes)
        {
            return InvalidRestorePreviewPackageProblem("backup_package_too_large");
        }

        string? packageContent;
        string? submittedSha256;
        try
        {
            using var requestPayload = JsonDocument.Parse(requestBody);
            var root = requestPayload.RootElement;
            if (root.ValueKind is not JsonValueKind.Object
                || !root.TryGetProperty("packageContent", out var packageContentElement)
                || packageContentElement.ValueKind is not JsonValueKind.String)
            {
                return InvalidRestorePreviewPackageProblem("missing_package_content");
            }

            packageContent = packageContentElement.GetString();
            submittedSha256 = root.TryGetProperty("packageSha256", out var shaElement)
                && shaElement.ValueKind is JsonValueKind.String
                ? shaElement.GetString()
                : null;
        }
        catch (JsonException)
        {
            return InvalidRestorePreviewPackageProblem("invalid_json");
        }

        if (string.IsNullOrWhiteSpace(packageContent))
        {
            return InvalidRestorePreviewPackageProblem("missing_package_content");
        }

        var packageBytes = Encoding.UTF8.GetBytes(packageContent);
        if (packageBytes.Length > MaxRestorePreviewPackageBytes)
        {
            return InvalidRestorePreviewPackageProblem("backup_package_too_large");
        }

        var actualSha256 = Sha256Hex(packageBytes);
        if (!string.IsNullOrWhiteSpace(submittedSha256)
            && (submittedSha256.Trim().Length != 64
                || !CryptographicOperations.FixedTimeEquals(
                Encoding.ASCII.GetBytes(actualSha256),
                Encoding.ASCII.GetBytes(submittedSha256.Trim().ToLowerInvariant()))))
        {
            return InvalidRestorePreviewPackageProblem("package_integrity_failed");
        }

        LocalBackupRestorePreviewPackageSummary summary;
        try
        {
            summary = ParseRestorePreviewPackage(packageContent, actualSha256, timeProvider.GetUtcNow());
        }
        catch (LocalBackupRestorePreviewValidationException ex)
        {
            return InvalidRestorePreviewPackageProblem(ex.StableCode);
        }
        catch (JsonException)
        {
            return InvalidRestorePreviewPackageProblem("invalid_json");
        }

        var now = timeProvider.GetUtcNow();
        var preview = new LocalBackupRestorePreviewMetadata(
            Guid.NewGuid(),
            actor.UserProfileId,
            actor.AuthSessionId,
            "ready",
            "restore_preview_ready",
            now,
            Min(now.Add(RestorePreviewLifetime), summary.PackageExpiresAtUtc),
            null,
            summary);
        RestorePreviews[preview.RestorePreviewId] = preview;

        return Results.Created(
            $"/api/v1/local-backup/restore-previews/{preview.RestorePreviewId:D}",
            MapRestorePreviewResponse(preview, now));
    }

    private static IResult GetRestorePreviewAsync(
        HttpRequest request,
        Guid restorePreviewId,
        ICurrentActorAccessor currentActorAccessor,
        TimeProvider timeProvider)
    {
        if (UnsupportedRequestFieldGuards.TryRejectNoBodyReadEnvelope(
                request,
                "Invalid local backup restore preview request",
                "The submitted local backup restore preview request is invalid.",
                "Local backup restore preview reads do not accept a body.",
                out var invalidReadEnvelope))
        {
            return invalidReadEnvelope;
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Results.Problem(
                title: "Unauthenticated",
                detail: "Authentication is required to access this resource.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        if (!TryLoadActorRestorePreview(restorePreviewId, actor, out var preview))
        {
            return RestorePreviewUnavailableProblem();
        }

        var now = timeProvider.GetUtcNow();
        ExpireRestorePreviewIfNeeded(preview, now);
        return Results.Ok(MapRestorePreviewResponse(preview, now));
    }

    private static IResult DiscardRestorePreviewAsync(
        HttpRequest request,
        Guid restorePreviewId,
        ICurrentActorAccessor currentActorAccessor,
        TimeProvider timeProvider)
    {
        if (UnsupportedRequestFieldGuards.TryRejectNoBodyReadEnvelope(
                request,
                "Invalid local backup restore preview discard request",
                "The submitted local backup restore preview discard request is invalid.",
                "Local backup restore preview discard requests do not accept a body.",
                out var invalidReadEnvelope))
        {
            return invalidReadEnvelope;
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Results.Problem(
                title: "Unauthenticated",
                detail: "Authentication is required to access this resource.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        if (!TryLoadActorRestorePreview(restorePreviewId, actor, out var preview))
        {
            return RestorePreviewUnavailableProblem();
        }

        var now = timeProvider.GetUtcNow();
        ExpireRestorePreviewIfNeeded(preview, now);
        if (preview.Status is not "ready")
        {
            return RestorePreviewUnavailableProblem();
        }

        preview.Status = "discarded";
        preview.StableCode = "restore_preview_discarded";
        preview.DiscardedAtUtc = now;
        return Results.Ok(MapRestorePreviewResponse(preview, now));
    }

    private static IResult CreateRestoreConfirmationSessionAsync(
        HttpRequest request,
        Guid restorePreviewId,
        LocalBackupRestoreConfirmationSessionCreateRequest requestBody,
        ICurrentActorAccessor currentActorAccessor,
        TimeProvider timeProvider)
    {
        if (UnsupportedRequestFieldGuards.TryRejectQueryFields(
                request,
                "Invalid local backup restore confirmation session request",
                "The submitted local backup restore confirmation session request is invalid.",
                out var invalidQueryEnvelope))
        {
            return invalidQueryEnvelope;
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Results.Problem(
                title: "Unauthenticated",
                detail: "Authentication is required to access this resource.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        if (!TryLoadActorRestorePreview(restorePreviewId, actor, out var preview))
        {
            return RestorePreviewUnavailableProblem();
        }

        var now = timeProvider.GetUtcNow();
        ExpireRestorePreviewIfNeeded(preview, now);
        if (preview.Status is not "ready")
        {
            return RestorePreviewUnavailableProblem();
        }

        var selectedScope = (requestBody.SelectedRestoreScope ?? string.Empty).Trim();
        if (selectedScope is not "server_mode_copy_data_only")
        {
            return InvalidRestoreConfirmationSessionProblem("restore_scope_unsupported");
        }

        var confirmationLabel = (requestBody.ConfirmationLabel ?? string.Empty).Trim();
        if (confirmationLabel is not "Restore selected records")
        {
            return InvalidRestoreConfirmationSessionProblem("restore_confirmation_required");
        }

        if (requestBody.ExpectedRestorePreviewId.HasValue
            && requestBody.ExpectedRestorePreviewId.Value != restorePreviewId)
        {
            return InvalidRestoreConfirmationSessionProblem("restore_preview_stale");
        }

        if (!string.IsNullOrWhiteSpace(requestBody.ExpectedPreviewStableCode)
            && requestBody.ExpectedPreviewStableCode.Trim() != preview.StableCode)
        {
            return InvalidRestoreConfirmationSessionProblem("restore_preview_stale");
        }

        if (!string.IsNullOrWhiteSpace(requestBody.ExpectedPackageSha256)
            && !string.Equals(
                requestBody.ExpectedPackageSha256.Trim(),
                preview.PackageSummary.PackageSha256,
                StringComparison.OrdinalIgnoreCase))
        {
            return InvalidRestoreConfirmationSessionProblem("restore_package_integrity_failed");
        }

        var requestDigest = BuildRestoreConfirmationRequestDigest(restorePreviewId, preview, selectedScope, confirmationLabel);
        if (!string.IsNullOrWhiteSpace(requestBody.ExpectedRequestDigest)
            && !string.Equals(requestBody.ExpectedRequestDigest.Trim(), requestDigest, StringComparison.OrdinalIgnoreCase))
        {
            return InvalidRestoreConfirmationSessionProblem("restore_package_source_mismatch");
        }

        var idempotencyKey = NormalizeOptional(requestBody.IdempotencyKey);
        if (idempotencyKey is not null)
        {
            foreach (var existing in RestoreConfirmationSessions.Values)
            {
                if (existing.ActorUserProfileId != actor.UserProfileId
                    || existing.AuthSessionId != actor.AuthSessionId
                    || existing.IdempotencyKey != idempotencyKey)
                {
                    continue;
                }

                ExpireRestoreConfirmationSessionIfNeeded(existing, now);
                if (existing.RequestDigest != requestDigest
                    || existing.RestorePreviewId != restorePreviewId
                    || existing.SelectedRestoreScope != selectedScope)
                {
                    return InvalidRestoreConfirmationSessionProblem("restore_confirmation_idempotency_conflict", StatusCodes.Status409Conflict);
                }

                return Results.Ok(MapRestoreConfirmationSessionResponse(existing, now));
            }
        }

        var session = new LocalBackupRestoreConfirmationSessionMetadata(
            Guid.NewGuid(),
            restorePreviewId,
            actor.UserProfileId,
            actor.AuthSessionId,
            "metadata_only",
            "restore_confirmation_metadata_only",
            selectedScope,
            confirmationLabel,
            idempotencyKey,
            requestDigest,
            now,
            Min(now.Add(RestoreConfirmationSessionLifetime), preview.ExpiresAtUtc),
            null,
            preview.PackageSummary);
        RestoreConfirmationSessions[session.RestoreConfirmationSessionId] = session;

        return Results.Created(
            $"/api/v1/local-backup/restore-confirmation-sessions/{session.RestoreConfirmationSessionId:D}",
            MapRestoreConfirmationSessionResponse(session, now));
    }

    private static IResult GetRestoreConfirmationSessionAsync(
        HttpRequest request,
        Guid restoreConfirmationSessionId,
        ICurrentActorAccessor currentActorAccessor,
        TimeProvider timeProvider)
    {
        if (UnsupportedRequestFieldGuards.TryRejectNoBodyReadEnvelope(
                request,
                "Invalid local backup restore confirmation session request",
                "The submitted local backup restore confirmation session request is invalid.",
                "Local backup restore confirmation session reads do not accept a body.",
                out var invalidReadEnvelope))
        {
            return invalidReadEnvelope;
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Results.Problem(
                title: "Unauthenticated",
                detail: "Authentication is required to access this resource.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        if (!TryLoadActorRestoreConfirmationSession(restoreConfirmationSessionId, actor, out var session))
        {
            return RestoreConfirmationSessionUnavailableProblem();
        }

        var now = timeProvider.GetUtcNow();
        ExpireRestoreConfirmationSessionIfNeeded(session, now);
        return Results.Ok(MapRestoreConfirmationSessionResponse(session, now));
    }

    private static IResult DiscardRestoreConfirmationSessionAsync(
        HttpRequest request,
        Guid restoreConfirmationSessionId,
        ICurrentActorAccessor currentActorAccessor,
        TimeProvider timeProvider)
    {
        if (UnsupportedRequestFieldGuards.TryRejectNoBodyReadEnvelope(
                request,
                "Invalid local backup restore confirmation session discard request",
                "The submitted local backup restore confirmation session discard request is invalid.",
                "Local backup restore confirmation session discard requests do not accept a body.",
                out var invalidReadEnvelope))
        {
            return invalidReadEnvelope;
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Results.Problem(
                title: "Unauthenticated",
                detail: "Authentication is required to access this resource.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        if (!TryLoadActorRestoreConfirmationSession(restoreConfirmationSessionId, actor, out var session))
        {
            return RestoreConfirmationSessionUnavailableProblem();
        }

        var now = timeProvider.GetUtcNow();
        ExpireRestoreConfirmationSessionIfNeeded(session, now);
        if (session.Status is "metadata_only")
        {
            session.Status = "discarded";
            session.StableCode = "restore_confirmation_discarded";
            session.DiscardedAtUtc = now;
        }

        return Results.Ok(MapRestoreConfirmationSessionResponse(session, now));
    }

    private static LocalBackupPackageFeatureStatusResponse Feature(
        string state,
        string stableCode,
        string safeMessage)
    {
        return new LocalBackupPackageFeatureStatusResponse(state, stableCode, safeMessage);
    }

    private static bool TryLoadActorPackageSession(
        Guid packageSessionId,
        AuthenticatedActor actor,
        out LocalBackupPackageSessionMetadata session)
    {
        if (PackageSessions.TryGetValue(packageSessionId, out session!)
            && session.ActorUserProfileId == actor.UserProfileId
            && session.AuthSessionId == actor.AuthSessionId)
        {
            return true;
        }

        session = null!;
        return false;
    }

    private static IResult PackageSessionUnavailableProblem()
    {
        return Results.Problem(
            title: "Local backup package session unavailable",
            detail: "The local backup package session is unavailable for this authenticated actor.",
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult RestorePreviewUnavailableProblem()
    {
        return Results.Problem(
            title: "Local backup restore preview unavailable",
            detail: "The local backup restore preview is unavailable for this authenticated actor.",
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult InvalidRestorePreviewPackageProblem(string stableCode)
    {
        return Results.Problem(
            title: "Invalid local backup restore preview package",
            detail: $"The submitted local backup package cannot be previewed. Stable code: {stableCode}.",
            statusCode: stableCode is "backup_package_too_large"
                ? StatusCodes.Status413PayloadTooLarge
                : StatusCodes.Status400BadRequest);
    }

    private static IResult RestoreConfirmationSessionUnavailableProblem()
    {
        return Results.Problem(
            title: "Local backup restore confirmation session unavailable",
            detail: "The local backup restore confirmation session is unavailable for this authenticated actor.",
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult InvalidRestoreConfirmationSessionProblem(
        string stableCode,
        int statusCode = StatusCodes.Status400BadRequest)
    {
        return Results.Problem(
            title: "Invalid local backup restore confirmation session",
            detail: $"The local backup restore confirmation session cannot be created. Stable code: {stableCode}.",
            statusCode: statusCode);
    }

    private static void ExpirePackageSessionIfNeeded(LocalBackupPackageSessionMetadata session, DateTimeOffset now)
    {
        if ((session.Status is "created" or "ready_to_download") && now >= session.ExpiresAtUtc)
        {
            session.Status = "expired";
            session.Artifact = null;
            session.DownloadActions.Clear();
        }
    }

    private static void ExpireArtifactAndDownloadActionsIfNeeded(LocalBackupPackageSessionMetadata session, DateTimeOffset now)
    {
        if (session.Artifact is not null && now >= session.Artifact.ExpiresAtUtc)
        {
            session.Artifact = null;
            if (session.Status is "ready_to_download")
            {
                session.Status = "expired";
            }
        }

        foreach (var expiredActionId in session.DownloadActions
            .Where(pair => pair.Value.Consumed || now >= pair.Value.ExpiresAtUtc)
            .Select(pair => pair.Key)
            .ToArray())
        {
            session.DownloadActions.Remove(expiredActionId);
        }
    }

    private static void ExpireRestorePreviewIfNeeded(LocalBackupRestorePreviewMetadata preview, DateTimeOffset now)
    {
        if (preview.Status is "ready" && now >= preview.ExpiresAtUtc)
        {
            preview.Status = "expired";
            preview.StableCode = "restore_preview_expired";
        }
    }

    private static void ExpireRestoreConfirmationSessionIfNeeded(
        LocalBackupRestoreConfirmationSessionMetadata session,
        DateTimeOffset now)
    {
        if (session.Status is "metadata_only" && now >= session.ExpiresAtUtc)
        {
            session.Status = "expired";
            session.StableCode = "restore_confirmation_expired";
        }
    }

    private static LocalBackupPackageSessionResponse MapPackageSessionResponse(
        LocalBackupPackageSessionMetadata session,
        DateTimeOffset now)
    {
        var stableCode = session.Status switch
        {
            "cancelled" => "package_session_cancelled",
            "discarded" => "package_session_discarded",
            "expired" => "package_session_expired",
            "blocked" => session.StableFailureCode ?? "temporarily_unavailable",
            "ready_to_download" => "package_ready_to_download",
            _ => "package_session_created"
        };

        return new LocalBackupPackageSessionResponse(
            session.PackageSessionId,
            session.Status,
            stableCode,
            "server_mode_copy_data_only",
            "server_authoritative",
            AvailableForPackageGeneration: session.Status is "created" or "ready_to_download",
            SafeMessage: session.Status switch
            {
                "ready_to_download" => "A short-lived data-only backup package artifact is ready for this authenticated session.",
                "blocked" => "This package session is blocked by current policy or eligibility checks. Create a new session after rechecking readiness.",
                "cancelled" => "This metadata-only package session has cancelled package generation. No package bytes were created or deleted.",
                "discarded" => "This metadata-only package session was discarded. No package bytes were created or deleted.",
                "expired" => "This metadata-only package session expired. Create a new session before any future package generation flow.",
                _ => "This package session can prepare a short-lived data-only package artifact or be discarded."
            },
            Readiness: new LocalBackupPackageSessionReadinessResponse(
                CanPreparePackage: session.Status is "created",
                CanDownloadPackage: session.Status is "ready_to_download" && session.Artifact is not null,
                CanRestorePackage: false,
                StableCode: session.Status is "ready_to_download" ? "package_ready_to_download" : "package_session_created",
                SafeMessage: "Package preparation and API-mediated download are available only for short-lived data-only artifacts. Restore preview, restore confirmation, file bytes, and browser-local persistence remain unsupported."),
            ManifestPreview: new LocalBackupPackageSessionManifestPreviewResponse(
                ManifestAvailable: session.Artifact is not null,
                ManifestStableCode: session.Artifact is null ? "package_manifest_metadata_only" : "package_ready_to_download",
                SafeDescription: session.Artifact is null
                    ? "Manifest concepts are exposed as metadata before preparation. No file-byte sections, restore payloads, or storage references are created."
                    : "A versioned data-only package manifest is available in the short-lived artifact. Unsupported sections are explicitly marked omitted or unsupported."),
            ConfirmationCopy: "Generate backup package creates a short-lived API-mediated data-only copy for the current authenticated profile/session. It excludes file bytes, storage internals, restore behavior, browser-local persistence, raw OCR text, private notes, payment details, and credentials.",
            UnsupportedFeatures:
            [
                "restore_preview",
                "restore_confirmation",
                "browser_local_persistence",
                "local_mode_authority"
            ],
            PrivacyBoundary: "Package session metadata and artifacts exclude storage paths, object keys, signed URLs, direct storage URLs, filesystem paths, local device paths, file bytes, raw OCR text, private notes, payment details, hidden records, auth tokens, and credential material.",
            DataEgressBoundary: "Package generation creates only a short-lived process-local data-only artifact for API-mediated download. Restore, upload, browser persistence, source-record mutation, storage objects, and file-byte inclusion remain unsupported.",
            CreatedAtUtc: session.CreatedAtUtc,
            ExpiresAtUtc: session.ExpiresAtUtc,
            DiscardedAtUtc: session.DiscardedAtUtc,
            CancelledAtUtc: session.CancelledAtUtc,
            GeneratedAtUtc: now);
    }

    private static LocalBackupPackageGenerationStatusResponse MapPackageGenerationResponse(
        LocalBackupPackageSessionMetadata session,
        DateTimeOffset now)
    {
        var artifact = session.Artifact;
        return new LocalBackupPackageGenerationStatusResponse(
            session.PackageSessionId,
            ArtifactStatus(session) is "metadata_only_no_artifact" ? "ready" : ArtifactStatus(session),
            ArtifactStableCode(session) is "metadata_only_no_artifact" ? "package_ready_to_download" : ArtifactStableCode(session),
            SafeArtifactMessage(session, "A short-lived data-only package artifact was generated for API-mediated download."),
            CanPreparePackage: session.Status is "created",
            ArtifactAvailable: artifact is not null,
            CanDownloadPackage: artifact is not null && session.Status is "ready_to_download",
            DownloadAvailable: artifact is not null && session.Status is "ready_to_download",
            GeneratedAtUtc: artifact?.GeneratedAtUtc,
            ExpiresAtUtc: session.ExpiresAtUtc,
            ArtifactExpiresAtUtc: artifact?.ExpiresAtUtc,
            SafeFilename: artifact?.SafeFilename,
            ContentType: artifact?.ContentType,
            ContentLengthBytes: artifact?.Content.Length,
            PackageSha256: artifact?.PackageSha256,
            PrivacyBoundary: ArtifactPrivacyBoundary(),
            DataEgressBoundary: ArtifactDataEgressBoundary(),
            UnsupportedFeatures: UnsupportedPackageArtifactFeatures(),
            NextAllowedActions: NextAllowedArtifactActions(session),
            ResponseGeneratedAtUtc: now);
    }

    private static LocalBackupPackageArtifactStatusResponse MapPackageArtifactStatusResponse(
        LocalBackupPackageSessionMetadata session,
        DateTimeOffset now)
    {
        var artifact = session.Artifact;
        return new LocalBackupPackageArtifactStatusResponse(
            session.PackageSessionId,
            ArtifactStatus(session),
            ArtifactStableCode(session),
            SafeArtifactMessage(session, artifact is null ? "No local backup package artifact is ready for this package session." : "A short-lived data-only backup package artifact is ready for API-mediated download."),
            CanPreparePackage: session.Status is "created",
            ArtifactAvailable: artifact is not null,
            CanDownloadPackage: artifact is not null && session.Status is "ready_to_download",
            DownloadAvailable: artifact is not null && session.Status is "ready_to_download",
            GeneratedAtUtc: artifact?.GeneratedAtUtc,
            ExpiresAtUtc: session.ExpiresAtUtc,
            ArtifactExpiresAtUtc: artifact?.ExpiresAtUtc,
            SafeFilename: artifact?.SafeFilename,
            ContentType: artifact?.ContentType,
            ContentLengthBytes: artifact?.Content.Length,
            PackageSha256: artifact?.PackageSha256,
            PrivacyBoundary: ArtifactPrivacyBoundary(),
            DataEgressBoundary: ArtifactDataEgressBoundary(),
            UnsupportedFeatures: UnsupportedPackageArtifactFeatures(),
            NextAllowedActions: NextAllowedArtifactActions(session),
            ResponseGeneratedAtUtc: now);
    }

    private static LocalBackupPackageDownloadActionResponse MapPackageDownloadActionResponse(
        LocalBackupPackageSessionMetadata session,
        DateTimeOffset now,
        LocalBackupPackageDownloadActionMetadata? action = null)
    {
        var stableCode = ArtifactStableCode(session);
        if (stableCode is "metadata_only_no_artifact" or "package_generation_unsupported")
        {
            stableCode = "package_download_unavailable";
        }

        var artifact = session.Artifact;
        var downloadAvailable = artifact is not null && action is not null && session.Status is "ready_to_download";
        return new LocalBackupPackageDownloadActionResponse(
            session.PackageSessionId,
            downloadAvailable ? "download_action_ready" : "download_unavailable",
            downloadAvailable ? "package_download_action_ready" : stableCode,
            SafeArtifactMessage(session, downloadAvailable ? "A short-lived API-mediated download action is ready." : "Download is unavailable because no package artifact is ready."),
            DownloadAvailable: downloadAvailable,
            CanDownloadPackage: downloadAvailable,
            ArtifactAvailable: artifact is not null,
            ExpiresAtUtc: session.ExpiresAtUtc,
            DownloadActionId: action?.DownloadActionId,
            DownloadActionExpiresAtUtc: action?.ExpiresAtUtc,
            ContentPath: action is null ? null : $"/api/v1/local-backup/package-sessions/{session.PackageSessionId:D}/download-actions/{action.DownloadActionId:D}/content",
            SafeFilename: artifact?.SafeFilename,
            ContentType: artifact?.ContentType,
            ContentLengthBytes: artifact?.Content.Length,
            PackageSha256: artifact?.PackageSha256,
            PrivacyBoundary: ArtifactPrivacyBoundary(),
            DataEgressBoundary: ArtifactDataEgressBoundary(),
            UnsupportedFeatures: UnsupportedPackageArtifactFeatures(),
            NextAllowedActions: NextAllowedArtifactActions(session),
            ResponseGeneratedAtUtc: now);
    }

    private static LocalBackupRestorePreviewResponse MapRestorePreviewResponse(
        LocalBackupRestorePreviewMetadata preview,
        DateTimeOffset now)
    {
        var summary = preview.PackageSummary;
        return new LocalBackupRestorePreviewResponse(
            preview.RestorePreviewId,
            preview.Status,
            preview.StableCode,
            "Restore preview parsed and validated the data-only package without restoring anything. Restore confirmation remains a separate future mutation gate.",
            preview.CreatedAtUtc,
            preview.ExpiresAtUtc,
            preview.DiscardedAtUtc,
            summary.SourceAuthorityBoundary,
            summary.PackageFormatName,
            summary.PackageVersion,
            summary.ManifestVersion,
            summary.PackageId,
            summary.ManifestId,
            summary.PackageSessionId,
            summary.GeneratedAtUtc,
            summary.PackageExpiresAtUtc,
            summary.PackageSha256,
            summary.TotalSectionCount,
            summary.IncludedSectionCategories,
            summary.OmittedSectionCategories,
            summary.UnsupportedSectionCategories,
            summary.BlockedSectionCategories,
            summary.RecordSummaries,
            summary.Warnings,
            summary.BlockedReasons,
            RestoreConfirmationAvailable: false,
            RestoreConfirmationState: "unsupported",
            RestoreConfirmationCopy: "Restore confirmation is not available from this preview. Any future restore remains a separate explicit mutation gate with revalidation before writes.",
            NextAllowedActions: preview.Status switch
            {
                "ready" => ["get_restore_preview", "discard_restore_preview"],
                _ => ["create_restore_preview"]
            },
            PrivacyBoundary: "Restore preview responses return bounded safe metadata only. They exclude raw package payloads, file bytes, storage paths, object keys, signed URLs, filesystem/local/temp paths, provider internals, raw OCR text, private notes, payment details, hidden records, security material, auth material, and local Codex state.",
            ResponseGeneratedAtUtc: now);
    }

    private static LocalBackupRestoreConfirmationSessionResponse MapRestoreConfirmationSessionResponse(
        LocalBackupRestoreConfirmationSessionMetadata session,
        DateTimeOffset now)
    {
        var summary = session.PackageSummary;
        return new LocalBackupRestoreConfirmationSessionResponse(
            session.RestoreConfirmationSessionId,
            session.RestorePreviewId,
            session.Status,
            session.StableCode,
            SafeMessage: session.Status switch
            {
                "discarded" => "This restore confirmation session metadata was discarded. No records, files, bills, settlements, sync conflicts, or accounts were changed.",
                "expired" => "This restore confirmation session metadata expired. Create a new restore preview and confirmation session before any future restore gate.",
                _ => "This restore confirmation session is metadata-only. Restore mutation remains unavailable and requires a separate future gate."
            },
            SelectedScope: session.SelectedRestoreScope,
            SelectedScopeSummary: "Server-mode data-only copy metadata for current-actor safe profile and personal bill count categories. No restore write is available.",
            CanApplyRestore: false,
            RestoreConfirmationState: session.Status switch
            {
                "discarded" => "discarded",
                "expired" => "expired",
                _ => "future_gate_required"
            },
            MutationAvailability: "unavailable",
            SourceAuthorityBoundary: summary.SourceAuthorityBoundary,
            PackageFormatName: summary.PackageFormatName,
            PackageVersion: summary.PackageVersion,
            ManifestVersion: summary.ManifestVersion,
            PackageId: summary.PackageId,
            ManifestId: summary.ManifestId,
            PackageSessionId: summary.PackageSessionId,
            PackageSha256: summary.PackageSha256,
            TotalSectionCount: summary.TotalSectionCount,
            IncludedSectionCategories: summary.IncludedSectionCategories,
            OmittedSectionCategories: summary.OmittedSectionCategories,
            UnsupportedSectionCategories: summary.UnsupportedSectionCategories,
            BlockedSectionCategories: summary.BlockedSectionCategories,
            RecordSummaries: summary.RecordSummaries,
            WarningCodes: summary.Warnings,
            BlockedCodes: MergeBlockedCodes(summary.BlockedReasons),
            IdempotencyKeyAccepted: session.IdempotencyKey is not null,
            RequestDigest: session.RequestDigest,
            NextAllowedActions: session.Status switch
            {
                "metadata_only" => ["get_restore_confirmation_session", "discard_restore_confirmation_session"],
                _ => ["create_restore_preview"]
            },
            PrivacyBoundary: "Restore confirmation session responses return bounded safe metadata only. They exclude raw package payloads, file bytes, storage paths, object keys, signed URLs, filesystem/local/temp paths, provider internals, raw OCR text, private notes, payment details, hidden records, security material, auth material, and local Codex state.",
            DataBoundary: "This metadata-only confirmation session does not apply restored records, import data, mutate money/bills/settlements, write storage/file bytes, create browser-local authority, or change source package/preview data.",
            CreatedAtUtc: session.CreatedAtUtc,
            ExpiresAtUtc: session.ExpiresAtUtc,
            DiscardedAtUtc: session.DiscardedAtUtc,
            PackageGeneratedAtUtc: summary.GeneratedAtUtc,
            PackageExpiresAtUtc: summary.PackageExpiresAtUtc,
            ResponseGeneratedAtUtc: now);
    }

    private static IReadOnlyList<string> MergeBlockedCodes(IReadOnlyList<string> previewBlockedReasons)
    {
        return previewBlockedReasons
            .Concat(
            [
                "restore_confirmation_future_gate_required",
                "restore_money_policy_blocked",
                "restore_file_section_blocked",
                "restore_partial_selection_unsupported"
            ])
            .Distinct(StringComparer.Ordinal)
            .ToArray();
    }

    private static LocalBackupRestorePreviewPackageSummary ParseRestorePreviewPackage(
        string packageContent,
        string packageSha256,
        DateTimeOffset now)
    {
        using var packagePayload = JsonDocument.Parse(packageContent);
        var root = packagePayload.RootElement;
        if (root.ValueKind is not JsonValueKind.Object)
        {
            throw new LocalBackupRestorePreviewValidationException("invalid_json");
        }

        var packageFormatName = RequiredString(root, "packageFormatName", "unsupported_package_format");
        if (packageFormatName != PackageFormatName)
        {
            throw new LocalBackupRestorePreviewValidationException("unsupported_package_format");
        }

        var packageVersion = RequiredString(root, "packageVersion", "unsupported_package_version");
        if (packageVersion != PackageVersion)
        {
            throw new LocalBackupRestorePreviewValidationException("unsupported_package_version");
        }

        var manifestVersion = RequiredString(root, "manifestVersion", "unsupported_manifest_version");
        if (manifestVersion != ManifestVersion)
        {
            throw new LocalBackupRestorePreviewValidationException("unsupported_manifest_version");
        }

        var sourceAuthorityBoundary = RequiredString(root, "sourceAuthorityBoundary", "unsupported_source_authority_boundary");
        if (sourceAuthorityBoundary != "server_authoritative_copy")
        {
            throw new LocalBackupRestorePreviewValidationException("unsupported_source_authority_boundary");
        }

        var sourceServerModePosture = RequiredString(root, "sourceServerModePosture", "unsupported_source_server_mode_posture");
        if (sourceServerModePosture != "server_authoritative")
        {
            throw new LocalBackupRestorePreviewValidationException("unsupported_source_server_mode_posture");
        }

        var packageId = RequiredGuid(root, "packageId", "invalid_package_identity");
        var manifestId = RequiredGuid(root, "manifestId", "invalid_manifest_identity");
        var packageSessionId = RequiredGuid(root, "packageSessionId", "invalid_package_session_identity");
        var generatedAtUtc = RequiredDateTimeOffset(root, "generatedAtUtc", "invalid_package_timestamp");
        var packageExpiresAtUtc = RequiredDateTimeOffset(root, "expiresAtUtc", "invalid_package_timestamp");
        if (packageExpiresAtUtc <= now || packageExpiresAtUtc <= generatedAtUtc)
        {
            throw new LocalBackupRestorePreviewValidationException("backup_package_expired");
        }

        if (root.TryGetProperty("requiredFeatures", out var requiredFeatures)
            && requiredFeatures.ValueKind is JsonValueKind.Array
            && requiredFeatures.GetArrayLength() > 0)
        {
            throw new LocalBackupRestorePreviewValidationException("unsupported_required_feature");
        }

        if (!root.TryGetProperty("sections", out var sections) || sections.ValueKind is not JsonValueKind.Array)
        {
            throw new LocalBackupRestorePreviewValidationException("missing_section_inventory");
        }

        if (sections.GetArrayLength() is 0 or > MaxRestorePreviewSections)
        {
            throw new LocalBackupRestorePreviewValidationException("unsupported_section_inventory");
        }

        var included = new List<string>();
        var omitted = new List<string>();
        var unsupported = new List<string>();
        var blocked = new List<string>();
        var warnings = new List<string>();
        foreach (var section in sections.EnumerateArray())
        {
            var name = RequiredString(section, "name", "invalid_section_inventory");
            var state = RequiredString(section, "state", "invalid_section_inventory");
            var count = RequiredInt(section, "count", "invalid_section_inventory");
            if (count < 0 || count > 1_000_000)
            {
                throw new LocalBackupRestorePreviewValidationException("unsupported_section_inventory");
            }

            if (state is "encrypted" or "included_encrypted")
            {
                throw new LocalBackupRestorePreviewValidationException("unsupported_encrypted_section");
            }

            if ((name.Contains("_files", StringComparison.OrdinalIgnoreCase)
                    || name.Contains("file_section", StringComparison.OrdinalIgnoreCase)
                    || name.Contains("blob", StringComparison.OrdinalIgnoreCase))
                && state is "included")
            {
                throw new LocalBackupRestorePreviewValidationException("unsupported_file_section");
            }

            switch (state)
            {
                case "included":
                    included.Add(name);
                    break;
                case "omitted" or "omitted_unsupported":
                    omitted.Add(name);
                    break;
                case "unsupported":
                    unsupported.Add(name);
                    break;
                case "blocked":
                    blocked.Add(name);
                    break;
                default:
                    throw new LocalBackupRestorePreviewValidationException("unsupported_section_state");
            }
        }

        var recordSummaries = BuildRestorePreviewRecordSummaries(root);
        if (unsupported.Count > 0)
        {
            warnings.Add("unsupported_sections_omitted");
        }

        warnings.Add("restore_confirmation_separate_gate");
        warnings.Add("browser_local_persistence_unsupported");

        return new LocalBackupRestorePreviewPackageSummary(
            packageFormatName,
            packageVersion,
            manifestVersion,
            packageId,
            manifestId,
            packageSessionId,
            sourceAuthorityBoundary,
            generatedAtUtc,
            packageExpiresAtUtc,
            packageSha256,
            sections.GetArrayLength(),
            included,
            omitted,
            unsupported,
            blocked,
            recordSummaries,
            warnings,
            blocked);
    }

    private static IReadOnlyList<LocalBackupRestorePreviewRecordSummary> BuildRestorePreviewRecordSummaries(JsonElement root)
    {
        if (!root.TryGetProperty("data", out var data)
            || data.ValueKind is not JsonValueKind.Object
            || !data.TryGetProperty("personalBillSafeSummary", out var billSummary)
            || billSummary.ValueKind is not JsonValueKind.Object)
        {
            return [];
        }

        return
        [
            new(
                "personal_bill_safe_summary",
                SafeIntOrZero(billSummary, "totalVisiblePersonalBills"),
                SafeIntOrZero(billSummary, "activeVisiblePersonalBills"),
                SafeIntOrZero(billSummary, "archivedVisiblePersonalBills"),
                SafeIntOrZero(billSummary, "itemCount"),
                SafeIntOrZero(billSummary, "participantCount"),
                SafeIntOrZero(billSummary, "payerCount"),
                SafeIntOrZero(billSummary, "adjustmentCount"))
        ];
    }

    private static string RequiredString(JsonElement root, string propertyName, string stableCode)
    {
        if (!root.TryGetProperty(propertyName, out var value) || value.ValueKind is not JsonValueKind.String)
        {
            throw new LocalBackupRestorePreviewValidationException(stableCode);
        }

        return value.GetString() ?? throw new LocalBackupRestorePreviewValidationException(stableCode);
    }

    private static Guid RequiredGuid(JsonElement root, string propertyName, string stableCode)
    {
        var value = RequiredString(root, propertyName, stableCode);
        return Guid.TryParse(value, out var parsed)
            ? parsed
            : throw new LocalBackupRestorePreviewValidationException(stableCode);
    }

    private static DateTimeOffset RequiredDateTimeOffset(JsonElement root, string propertyName, string stableCode)
    {
        if (!root.TryGetProperty(propertyName, out var value)
            || !value.TryGetDateTimeOffset(out var parsed))
        {
            throw new LocalBackupRestorePreviewValidationException(stableCode);
        }

        return parsed;
    }

    private static int RequiredInt(JsonElement root, string propertyName, string stableCode)
    {
        if (!root.TryGetProperty(propertyName, out var value) || !value.TryGetInt32(out var parsed))
        {
            throw new LocalBackupRestorePreviewValidationException(stableCode);
        }

        return parsed;
    }

    private static int SafeIntOrZero(JsonElement root, string propertyName)
    {
        return root.TryGetProperty(propertyName, out var value) && value.TryGetInt32(out var parsed)
            ? Math.Clamp(parsed, 0, 1_000_000)
            : 0;
    }

    private static bool TryLoadActorRestorePreview(
        Guid restorePreviewId,
        AuthenticatedActor actor,
        out LocalBackupRestorePreviewMetadata preview)
    {
        if (RestorePreviews.TryGetValue(restorePreviewId, out preview!)
            && preview.ActorUserProfileId == actor.UserProfileId
            && preview.AuthSessionId == actor.AuthSessionId)
        {
            return true;
        }

        preview = null!;
        return false;
    }

    private static bool TryLoadActorRestoreConfirmationSession(
        Guid restoreConfirmationSessionId,
        AuthenticatedActor actor,
        out LocalBackupRestoreConfirmationSessionMetadata session)
    {
        if (RestoreConfirmationSessions.TryGetValue(restoreConfirmationSessionId, out session!)
            && session.ActorUserProfileId == actor.UserProfileId
            && session.AuthSessionId == actor.AuthSessionId)
        {
            return true;
        }

        session = null!;
        return false;
    }

    private static string BuildRestoreConfirmationRequestDigest(
        Guid restorePreviewId,
        LocalBackupRestorePreviewMetadata preview,
        string selectedScope,
        string confirmationLabel)
    {
        return HashJson(new
        {
            restorePreviewId,
            preview.StableCode,
            preview.PackageSummary.PackageSha256,
            selectedScope,
            confirmationLabel
        });
    }

    private static string? NormalizeOptional(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static string ArtifactStatus(LocalBackupPackageSessionMetadata session)
    {
        if (session.Status is "ready_to_download" && session.Artifact is not null)
        {
            return "ready";
        }

        return session.Status switch
        {
            "cancelled" => "cancelled",
            "discarded" => "discarded",
            "expired" => "expired",
            "blocked" => "blocked",
            _ => "metadata_only_no_artifact"
        };
    }

    private static string ArtifactStableCode(LocalBackupPackageSessionMetadata session)
    {
        if (session.Status is "ready_to_download" && session.Artifact is not null)
        {
            return "package_ready_to_download";
        }

        return session.Status switch
        {
            "cancelled" => "package_generation_cancelled",
            "discarded" => "package_session_discarded",
            "expired" => "package_session_expired",
            "blocked" => session.StableFailureCode ?? "temporarily_unavailable",
            _ => "metadata_only_no_artifact"
        };
    }

    private static string SafeArtifactMessage(LocalBackupPackageSessionMetadata session, string defaultMessage)
    {
        return session.Status switch
        {
            "ready_to_download" when session.Artifact is not null => "A short-lived data-only package artifact is ready for API-mediated download. It excludes file bytes, storage internals, raw OCR text, private notes, hidden records, and credentials.",
            "blocked" => "Package generation is blocked by current policy or eligibility checks. No source records were mutated.",
            "cancelled" => "Package generation is cancelled for this metadata-only package session. No package artifact or source record was mutated.",
            "discarded" => "This package session is discarded. No package artifact, package bytes, or download action is available.",
            "expired" => "This package session is expired. Create a new package session before any future package generation flow.",
            _ => defaultMessage
        };
    }

    private static string ArtifactPrivacyBoundary()
    {
        return "This response returns safe package metadata only. It excludes file bytes, storage paths, object keys, signed URLs, direct storage URLs, filesystem paths, local device paths, raw OCR text, private notes, payment details, hidden records, auth tokens, and credential material.";
    }

    private static string ArtifactDataEgressBoundary()
    {
        return "Backup package artifacts are short-lived, process-local, data-only JSON bytes served only through this authenticated API. Restore, upload, browser persistence, storage objects, file-byte inclusion, source-record mutation, and direct storage downloads remain unsupported.";
    }

    private static IReadOnlyList<string> UnsupportedPackageArtifactFeatures()
    {
        return
        [
            "restore_preview",
            "restore_confirmation",
            "browser_local_persistence",
            "local_mode_authority"
        ];
    }

    private static IReadOnlyList<string> NextAllowedArtifactActions(LocalBackupPackageSessionMetadata session)
    {
        return session.Status switch
        {
            "cancelled" or "discarded" or "expired" => ["create_new_package_session"],
            "ready_to_download" => ["get_artifact_status", "create_download_action", "cancel_package_generation", "discard_package_session"],
            _ => ["prepare_package", "get_artifact_status", "cancel_package_generation", "discard_package_session"]
        };
    }

    private static async Task<LocalBackupPackageArtifactMetadata> BuildPackageArtifactAsync(
        LocalBackupPackageSessionMetadata session,
        AuthenticatedActor actor,
        SettleoraDbContext dbContext,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var profile = await dbContext.Set<UserProfile>()
            .AsNoTracking()
            .Where(candidate => candidate.Id == actor.UserProfileId && candidate.DeletedAtUtc == null)
            .Select(candidate => new
            {
                candidate.DisplayName,
                candidate.DefaultCurrency,
                candidate.CreatedAtUtc,
                candidate.UpdatedAtUtc
            })
            .SingleAsync(cancellationToken);

        var visiblePersonalBills = ExpenseBillSearchQueries.VisiblePersonalBillsIncludingArchived(
            dbContext,
            actor.UserProfileId);
        var personalBillSummaryRows = await visiblePersonalBills
            .GroupBy(bill => new
            {
                bill.Status,
                bill.TotalCurrency,
                Archived = bill.ArchivedAtUtc != null
            })
            .Select(group => new
            {
                group.Key.Status,
                Currency = group.Key.TotalCurrency,
                group.Key.Archived,
                Count = group.Count()
            })
            .OrderBy(row => row.Status)
            .ThenBy(row => row.Currency)
            .ThenBy(row => row.Archived)
            .ToListAsync(cancellationToken);
        var personalBillSummary = personalBillSummaryRows
            .Select(row => new LocalBackupPackageBillSummaryRow(
                row.Status,
                row.Currency,
                row.Archived,
                row.Count))
            .ToArray();
        var visiblePersonalBillCount = personalBillSummary.Sum(row => row.Count);
        var personalBillItemCount = await visiblePersonalBills
            .SelectMany(bill => bill.Items)
            .Where(item => item.DeletedAtUtc == null)
            .CountAsync(cancellationToken);
        var personalBillParticipantCount = await visiblePersonalBills
            .SelectMany(bill => bill.Participants)
            .CountAsync(cancellationToken);
        var personalBillPayerCount = await visiblePersonalBills
            .SelectMany(bill => bill.Payers)
            .CountAsync(cancellationToken);
        var personalBillAdjustmentCount = await visiblePersonalBills
            .SelectMany(bill => bill.Adjustments)
            .CountAsync(cancellationToken);

        var sections = new List<LocalBackupPackageSection>
        {
            new(
                "current_actor_profile_summary",
                "included",
                1,
                "Current profile display label, default currency, and profile timestamps only.",
                HashJson(new
                {
                    profile.DisplayName,
                    profile.DefaultCurrency,
                    profile.CreatedAtUtc,
                    profile.UpdatedAtUtc
                })),
            new(
                "personal_bill_safe_summary",
                "included",
                visiblePersonalBillCount,
                "Current-actor visible personal bill counts only. Merchant names, item names, notes, payment labels, and bill IDs are excluded.",
                HashJson(new
                {
                    visiblePersonalBillCount,
                    personalBillItemCount,
                    personalBillParticipantCount,
                    personalBillPayerCount,
                    personalBillAdjustmentCount,
                    personalBillSummary
                })),
            new(
                "receipt_and_supporting_files",
                "unsupported",
                0,
                "File bytes and package-local blob sections are unsupported in this runtime slice.",
                null),
            new(
                "raw_ocr_text",
                "omitted_unsupported",
                0,
                "Raw OCR text is omitted because no approved backup content contract allows it.",
                null),
            new(
                "private_notes_and_payment_details",
                "omitted_unsupported",
                0,
                "Private notes and payment details are omitted from this data-only package slice.",
                null),
            new(
                "restore_preview_and_confirmation",
                "unsupported",
                0,
                "Restore preview and restore confirmation are separate future gates.",
                null)
        };

        var manifestId = Guid.NewGuid();
        var packageId = Guid.NewGuid();
        var artifactExpiresAt = Min(now.Add(PackageArtifactLifetime), session.ExpiresAtUtc);
        var safeFilename = $"settleora-local-backup-{now:yyyyMMdd-HHmmss}-data-only.json";
        var envelope = new
        {
            packageFormatName = PackageFormatName,
            packageVersion = PackageVersion,
            manifestVersion = ManifestVersion,
            packageId,
            manifestId,
            packageSessionId = session.PackageSessionId,
            correlationId = session.PackageSessionId,
            sourceAuthorityBoundary = "server_authoritative_copy",
            sourceProfileMode = "server_mode_copy",
            sourceServerModePosture = "server_authoritative",
            producer = "settleora.api.local-backup.process-local-runtime",
            generatedAtUtc = now,
            expiresAtUtc = artifactExpiresAt,
            sections,
            data = new
            {
                currentActorProfileSummary = new
                {
                    displayName = profile.DisplayName,
                    defaultCurrency = profile.DefaultCurrency,
                    createdAtUtc = profile.CreatedAtUtc,
                    updatedAtUtc = profile.UpdatedAtUtc
                },
                personalBillSafeSummary = new
                {
                    totalVisiblePersonalBills = visiblePersonalBillCount,
                    activeVisiblePersonalBills = personalBillSummary.Where(row => !row.Archived).Sum(row => row.Count),
                    archivedVisiblePersonalBills = personalBillSummary.Where(row => row.Archived).Sum(row => row.Count),
                    itemCount = personalBillItemCount,
                    participantCount = personalBillParticipantCount,
                    payerCount = personalBillPayerCount,
                    adjustmentCount = personalBillAdjustmentCount,
                    byStatusCurrencyArchive = personalBillSummary
                }
            },
            omittedAndUnsupported = sections
                .Where(section => section.State is not "included")
                .Select(section => new { section.Name, section.State, section.SafeSummary })
                .ToArray(),
            integrity = new
            {
                sectionHashAlgorithm = "sha256",
                packageHashAlgorithm = "sha256",
                packageHashScope = "canonical utf-8 json response bytes"
            },
            privacyBoundary = "Data-only package. Excludes file bytes, storage paths, object keys, bucket names, signed URLs, direct download URLs, provider internals, filesystem/local/temp/mounted paths, raw OCR text, private notes, payment details, hidden records, auth material, and sensitive security material.",
            restoreBoundary = "This package is not restore approval. Restore preview, restore confirmation, upload, parsing, browser-local persistence, and server/local mutation remain unsupported."
        };

        var content = JsonSerializer.SerializeToUtf8Bytes(
            envelope,
            new JsonSerializerOptions(JsonSerializerDefaults.Web)
            {
                WriteIndented = true
            });
        var packageSha256 = Sha256Hex(content);

        return new LocalBackupPackageArtifactMetadata(
            now,
            artifactExpiresAt,
            safeFilename,
            PackageContentType,
            content,
            packageSha256);
    }

    private static string HashJson<T>(T value)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(
            value,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        return Sha256Hex(bytes);
    }

    private static string Sha256Hex(byte[] bytes)
    {
        return Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    }

    private static DateTimeOffset Min(DateTimeOffset left, DateTimeOffset right)
    {
        return left <= right ? left : right;
    }
}

internal sealed record LocalBackupPackageReadinessResponse(
    bool Available,
    string StableCode,
    string SafeMessage,
    string ServerModePosture,
    LocalBackupPackageFeatureStatusResponse BrowserLocalPersistence,
    LocalBackupPackageFeatureStatusResponse PackageGeneration,
    LocalBackupPackageFeatureStatusResponse PackageDownload,
    LocalBackupPackageFeatureStatusResponse RestorePreview,
    LocalBackupPackageFeatureStatusResponse RestoreConfirmation,
    LocalBackupPackageFeatureStatusResponse LocalModeAuthority,
    IReadOnlyList<LocalBackupPackageConceptResponse> KnownPackageConcepts,
    IReadOnlyList<string> UnsupportedFeatures,
    string PrivacyBoundary,
    string DataEgressBoundary,
    DateTimeOffset GeneratedAtUtc,
    DateTimeOffset ExpiresAtUtc);

internal sealed record LocalBackupPackageFeatureStatusResponse(
    string State,
    string StableCode,
    string SafeMessage);

internal sealed record LocalBackupPackageConceptResponse(
    string Concept,
    string SafeDescription);

internal sealed class LocalBackupPackageSessionMetadata(
    Guid packageSessionId,
    Guid actorUserProfileId,
    Guid authSessionId,
    string status,
    DateTimeOffset createdAtUtc,
    DateTimeOffset expiresAtUtc,
    DateTimeOffset? discardedAtUtc,
    DateTimeOffset? cancelledAtUtc)
{
    public Guid PackageSessionId { get; } = packageSessionId;
    public Guid ActorUserProfileId { get; } = actorUserProfileId;
    public Guid AuthSessionId { get; } = authSessionId;
    public string Status { get; set; } = status;
    public DateTimeOffset CreatedAtUtc { get; } = createdAtUtc;
    public DateTimeOffset ExpiresAtUtc { get; } = expiresAtUtc;
    public DateTimeOffset? DiscardedAtUtc { get; set; } = discardedAtUtc;
    public DateTimeOffset? CancelledAtUtc { get; set; } = cancelledAtUtc;
    public string? StableFailureCode { get; set; }
    public LocalBackupPackageArtifactMetadata? Artifact { get; set; }
    public Dictionary<Guid, LocalBackupPackageDownloadActionMetadata> DownloadActions { get; } = [];
}

internal sealed record LocalBackupPackageArtifactMetadata(
    DateTimeOffset GeneratedAtUtc,
    DateTimeOffset ExpiresAtUtc,
    string SafeFilename,
    string ContentType,
    byte[] Content,
    string PackageSha256);

internal sealed record LocalBackupPackageDownloadActionMetadata(
    Guid DownloadActionId,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset ExpiresAtUtc,
    bool Consumed)
{
    public bool Consumed { get; set; } = Consumed;
}

internal sealed record LocalBackupPackageBillSummaryRow(
    string Status,
    string Currency,
    bool Archived,
    int Count);

internal sealed record LocalBackupPackageSection(
    string Name,
    string State,
    int Count,
    string SafeSummary,
    string? Sha256);

internal sealed class LocalBackupRestorePreviewMetadata(
    Guid restorePreviewId,
    Guid actorUserProfileId,
    Guid authSessionId,
    string status,
    string stableCode,
    DateTimeOffset createdAtUtc,
    DateTimeOffset expiresAtUtc,
    DateTimeOffset? discardedAtUtc,
    LocalBackupRestorePreviewPackageSummary packageSummary)
{
    public Guid RestorePreviewId { get; } = restorePreviewId;
    public Guid ActorUserProfileId { get; } = actorUserProfileId;
    public Guid AuthSessionId { get; } = authSessionId;
    public string Status { get; set; } = status;
    public string StableCode { get; set; } = stableCode;
    public DateTimeOffset CreatedAtUtc { get; } = createdAtUtc;
    public DateTimeOffset ExpiresAtUtc { get; } = expiresAtUtc;
    public DateTimeOffset? DiscardedAtUtc { get; set; } = discardedAtUtc;
    public LocalBackupRestorePreviewPackageSummary PackageSummary { get; } = packageSummary;
}

internal sealed record LocalBackupRestorePreviewPackageSummary(
    string PackageFormatName,
    string PackageVersion,
    string ManifestVersion,
    Guid PackageId,
    Guid ManifestId,
    Guid PackageSessionId,
    string SourceAuthorityBoundary,
    DateTimeOffset GeneratedAtUtc,
    DateTimeOffset PackageExpiresAtUtc,
    string PackageSha256,
    int TotalSectionCount,
    IReadOnlyList<string> IncludedSectionCategories,
    IReadOnlyList<string> OmittedSectionCategories,
    IReadOnlyList<string> UnsupportedSectionCategories,
    IReadOnlyList<string> BlockedSectionCategories,
    IReadOnlyList<LocalBackupRestorePreviewRecordSummary> RecordSummaries,
    IReadOnlyList<string> Warnings,
    IReadOnlyList<string> BlockedReasons);

internal sealed record LocalBackupRestorePreviewRecordSummary(
    string Category,
    int TotalCount,
    int ActiveCount,
    int ArchivedCount,
    int ItemCount,
    int ParticipantCount,
    int PayerCount,
    int AdjustmentCount);

internal sealed record LocalBackupRestorePreviewResponse(
    Guid RestorePreviewId,
    string Status,
    string StableCode,
    string SafeMessage,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset ExpiresAtUtc,
    DateTimeOffset? DiscardedAtUtc,
    string SourceAuthorityBoundary,
    string PackageFormatName,
    string PackageVersion,
    string ManifestVersion,
    Guid PackageId,
    Guid ManifestId,
    Guid PackageSessionId,
    DateTimeOffset PackageGeneratedAtUtc,
    DateTimeOffset PackageExpiresAtUtc,
    string PackageSha256,
    int TotalSectionCount,
    IReadOnlyList<string> IncludedSectionCategories,
    IReadOnlyList<string> OmittedSectionCategories,
    IReadOnlyList<string> UnsupportedSectionCategories,
    IReadOnlyList<string> BlockedSectionCategories,
    IReadOnlyList<LocalBackupRestorePreviewRecordSummary> RecordSummaries,
    IReadOnlyList<string> Warnings,
    IReadOnlyList<string> BlockedReasons,
    bool RestoreConfirmationAvailable,
    string RestoreConfirmationState,
    string RestoreConfirmationCopy,
    IReadOnlyList<string> NextAllowedActions,
    string PrivacyBoundary,
    DateTimeOffset ResponseGeneratedAtUtc);

internal sealed record LocalBackupRestoreConfirmationSessionCreateRequest(
    string ConfirmationLabel,
    string SelectedRestoreScope,
    string? IdempotencyKey,
    Guid? ExpectedRestorePreviewId,
    string? ExpectedPackageSha256,
    string? ExpectedRequestDigest,
    string? ExpectedPreviewStableCode);

internal sealed class LocalBackupRestoreConfirmationSessionMetadata(
    Guid restoreConfirmationSessionId,
    Guid restorePreviewId,
    Guid actorUserProfileId,
    Guid authSessionId,
    string status,
    string stableCode,
    string selectedRestoreScope,
    string confirmationLabel,
    string? idempotencyKey,
    string requestDigest,
    DateTimeOffset createdAtUtc,
    DateTimeOffset expiresAtUtc,
    DateTimeOffset? discardedAtUtc,
    LocalBackupRestorePreviewPackageSummary packageSummary)
{
    public Guid RestoreConfirmationSessionId { get; } = restoreConfirmationSessionId;
    public Guid RestorePreviewId { get; } = restorePreviewId;
    public Guid ActorUserProfileId { get; } = actorUserProfileId;
    public Guid AuthSessionId { get; } = authSessionId;
    public string Status { get; set; } = status;
    public string StableCode { get; set; } = stableCode;
    public string SelectedRestoreScope { get; } = selectedRestoreScope;
    public string ConfirmationLabel { get; } = confirmationLabel;
    public string? IdempotencyKey { get; } = idempotencyKey;
    public string RequestDigest { get; } = requestDigest;
    public DateTimeOffset CreatedAtUtc { get; } = createdAtUtc;
    public DateTimeOffset ExpiresAtUtc { get; } = expiresAtUtc;
    public DateTimeOffset? DiscardedAtUtc { get; set; } = discardedAtUtc;
    public LocalBackupRestorePreviewPackageSummary PackageSummary { get; } = packageSummary;
}

internal sealed record LocalBackupRestoreConfirmationSessionResponse(
    Guid RestoreConfirmationSessionId,
    Guid RestorePreviewId,
    string Status,
    string StableCode,
    string SafeMessage,
    string SelectedScope,
    string SelectedScopeSummary,
    bool CanApplyRestore,
    string RestoreConfirmationState,
    string MutationAvailability,
    string SourceAuthorityBoundary,
    string PackageFormatName,
    string PackageVersion,
    string ManifestVersion,
    Guid PackageId,
    Guid ManifestId,
    Guid PackageSessionId,
    string PackageSha256,
    int TotalSectionCount,
    IReadOnlyList<string> IncludedSectionCategories,
    IReadOnlyList<string> OmittedSectionCategories,
    IReadOnlyList<string> UnsupportedSectionCategories,
    IReadOnlyList<string> BlockedSectionCategories,
    IReadOnlyList<LocalBackupRestorePreviewRecordSummary> RecordSummaries,
    IReadOnlyList<string> WarningCodes,
    IReadOnlyList<string> BlockedCodes,
    bool IdempotencyKeyAccepted,
    string RequestDigest,
    IReadOnlyList<string> NextAllowedActions,
    string PrivacyBoundary,
    string DataBoundary,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset ExpiresAtUtc,
    DateTimeOffset? DiscardedAtUtc,
    DateTimeOffset PackageGeneratedAtUtc,
    DateTimeOffset PackageExpiresAtUtc,
    DateTimeOffset ResponseGeneratedAtUtc);

internal sealed class LocalBackupRestorePreviewValidationException(string stableCode) : Exception
{
    public string StableCode { get; } = stableCode;
}

internal sealed record LocalBackupPackageSessionResponse(
    Guid PackageSessionId,
    string Status,
    string StableCode,
    string Scope,
    string ServerModePosture,
    bool AvailableForPackageGeneration,
    string SafeMessage,
    LocalBackupPackageSessionReadinessResponse Readiness,
    LocalBackupPackageSessionManifestPreviewResponse ManifestPreview,
    string ConfirmationCopy,
    IReadOnlyList<string> UnsupportedFeatures,
    string PrivacyBoundary,
    string DataEgressBoundary,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset ExpiresAtUtc,
    DateTimeOffset? DiscardedAtUtc,
    DateTimeOffset? CancelledAtUtc,
    DateTimeOffset GeneratedAtUtc);

internal sealed record LocalBackupPackageSessionReadinessResponse(
    bool CanPreparePackage,
    bool CanDownloadPackage,
    bool CanRestorePackage,
    string StableCode,
    string SafeMessage);

internal sealed record LocalBackupPackageSessionManifestPreviewResponse(
    bool ManifestAvailable,
    string ManifestStableCode,
    string SafeDescription);

internal sealed record LocalBackupPackageGenerationStatusResponse(
    Guid PackageSessionId,
    string Status,
    string StableCode,
    string SafeMessage,
    bool CanPreparePackage,
    bool ArtifactAvailable,
    bool CanDownloadPackage,
    bool DownloadAvailable,
    DateTimeOffset? GeneratedAtUtc,
    DateTimeOffset ExpiresAtUtc,
    DateTimeOffset? ArtifactExpiresAtUtc,
    string? SafeFilename,
    string? ContentType,
    int? ContentLengthBytes,
    string? PackageSha256,
    string PrivacyBoundary,
    string DataEgressBoundary,
    IReadOnlyList<string> UnsupportedFeatures,
    IReadOnlyList<string> NextAllowedActions,
    DateTimeOffset ResponseGeneratedAtUtc);

internal sealed record LocalBackupPackageArtifactStatusResponse(
    Guid PackageSessionId,
    string Status,
    string StableCode,
    string SafeMessage,
    bool CanPreparePackage,
    bool ArtifactAvailable,
    bool CanDownloadPackage,
    bool DownloadAvailable,
    DateTimeOffset? GeneratedAtUtc,
    DateTimeOffset ExpiresAtUtc,
    DateTimeOffset? ArtifactExpiresAtUtc,
    string? SafeFilename,
    string? ContentType,
    int? ContentLengthBytes,
    string? PackageSha256,
    string PrivacyBoundary,
    string DataEgressBoundary,
    IReadOnlyList<string> UnsupportedFeatures,
    IReadOnlyList<string> NextAllowedActions,
    DateTimeOffset ResponseGeneratedAtUtc);

internal sealed record LocalBackupPackageDownloadActionResponse(
    Guid PackageSessionId,
    string Status,
    string StableCode,
    string SafeMessage,
    bool DownloadAvailable,
    bool CanDownloadPackage,
    bool ArtifactAvailable,
    DateTimeOffset ExpiresAtUtc,
    Guid? DownloadActionId,
    DateTimeOffset? DownloadActionExpiresAtUtc,
    string? ContentPath,
    string? SafeFilename,
    string? ContentType,
    int? ContentLengthBytes,
    string? PackageSha256,
    string PrivacyBoundary,
    string DataEgressBoundary,
    IReadOnlyList<string> UnsupportedFeatures,
    IReadOnlyList<string> NextAllowedActions,
    DateTimeOffset ResponseGeneratedAtUtc);
