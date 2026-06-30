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
    private const string PackageContentType = "application/vnd.settleora.local-backup+json";
    private const string PackageFormatName = "settleora.local-backup.data-only";
    private const string PackageVersion = "2026-06-30.data-only.v1";
    private const string ManifestVersion = "2026-06-30.manifest.v1";
    private static readonly ConcurrentDictionary<Guid, LocalBackupPackageSessionMetadata> PackageSessions = new();

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
