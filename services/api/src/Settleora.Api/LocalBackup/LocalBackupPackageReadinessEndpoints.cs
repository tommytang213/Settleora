using Settleora.Api.Auth.Authorization;
using Settleora.Api.RequestValidation;
using System.Collections.Concurrent;

namespace Settleora.Api.LocalBackup;

internal static class LocalBackupPackageReadinessEndpoints
{
    private static readonly TimeSpan ReadinessFreshnessWindow = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan PackageSessionLifetime = TimeSpan.FromMinutes(15);
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

    private static IResult PreparePackageSessionAsync(
        HttpRequest request,
        Guid packageSessionId,
        ICurrentActorAccessor currentActorAccessor,
        TimeProvider timeProvider)
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
        if (session.Status is "created")
        {
            session.Status = "cancelled";
            session.CancelledAtUtc = now;
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
        return Results.Ok(MapPackageDownloadActionResponse(session, now));
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
        if (session.Status is "created" && now >= session.ExpiresAtUtc)
        {
            session.Status = "expired";
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
            _ => "package_session_created"
        };

        return new LocalBackupPackageSessionResponse(
            session.PackageSessionId,
            session.Status,
            stableCode,
            "server_mode_copy_metadata_only",
            "server_authoritative",
            AvailableForPackageGeneration: false,
            SafeMessage: session.Status switch
            {
                "cancelled" => "This metadata-only package session has cancelled package generation. No package bytes were created or deleted.",
                "discarded" => "This metadata-only package session was discarded. No package bytes were created or deleted.",
                "expired" => "This metadata-only package session expired. Create a new session before any future package generation flow.",
                _ => "This metadata-only package session can be inspected or discarded. Backup package generation and download are not implemented."
            },
            Readiness: new LocalBackupPackageSessionReadinessResponse(
                CanPreparePackage: false,
                CanDownloadPackage: false,
                CanRestorePackage: false,
                StableCode: "package_generation_unsupported",
                SafeMessage: "Package preparation, download, restore preview, restore confirmation, and browser-local persistence remain unsupported."),
            ManifestPreview: new LocalBackupPackageSessionManifestPreviewResponse(
                ManifestAvailable: false,
                ManifestStableCode: "package_manifest_metadata_only",
                SafeDescription: "Manifest concepts are exposed as metadata only. No manifest file, package archive, package-local blob inventory, hashes, or payload sections are created."),
            ConfirmationCopy: "Creating this session does not create, download, upload, parse, or restore a backup package. Future package generation remains a separate reviewed data-egress action.",
            UnsupportedFeatures:
            [
                "package_generation",
                "package_download",
                "restore_preview",
                "restore_confirmation",
                "browser_local_persistence",
                "local_mode_authority"
            ],
            PrivacyBoundary: "Package session metadata excludes package bytes, storage paths, object keys, signed URLs, direct storage URLs, filesystem paths, local device paths, file bytes, raw OCR text, private notes, payment details, hidden records, auth tokens, and credential material.",
            DataEgressBoundary: "No backup package artifact is created, queued, stored, downloaded, parsed, uploaded, or restored by this package session metadata slice.",
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
        return new LocalBackupPackageGenerationStatusResponse(
            session.PackageSessionId,
            ArtifactStatus(session) is "metadata_only_no_artifact" ? "generation_unavailable" : ArtifactStatus(session),
            ArtifactStableCode(session) is "metadata_only_no_artifact" ? "package_generation_unsupported" : ArtifactStableCode(session),
            SafeArtifactMessage(session, "Package preparation/generation is unavailable in this metadata-only slice. No package artifact, package bytes, storage object, job, queue message, or download is created."),
            CanPreparePackage: false,
            ArtifactAvailable: false,
            CanDownloadPackage: false,
            DownloadAvailable: false,
            GeneratedAtUtc: null,
            ExpiresAtUtc: session.ExpiresAtUtc,
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
        return new LocalBackupPackageArtifactStatusResponse(
            session.PackageSessionId,
            ArtifactStatus(session),
            ArtifactStableCode(session),
            SafeArtifactMessage(session, "No local backup package artifact exists for this metadata-only package session."),
            CanPreparePackage: false,
            ArtifactAvailable: false,
            CanDownloadPackage: false,
            DownloadAvailable: false,
            GeneratedAtUtc: null,
            ExpiresAtUtc: session.ExpiresAtUtc,
            PrivacyBoundary: ArtifactPrivacyBoundary(),
            DataEgressBoundary: ArtifactDataEgressBoundary(),
            UnsupportedFeatures: UnsupportedPackageArtifactFeatures(),
            NextAllowedActions: NextAllowedArtifactActions(session),
            ResponseGeneratedAtUtc: now);
    }

    private static LocalBackupPackageDownloadActionResponse MapPackageDownloadActionResponse(
        LocalBackupPackageSessionMetadata session,
        DateTimeOffset now)
    {
        var stableCode = ArtifactStableCode(session);
        if (stableCode is "metadata_only_no_artifact" or "package_generation_unsupported")
        {
            stableCode = "package_download_unavailable";
        }

        return new LocalBackupPackageDownloadActionResponse(
            session.PackageSessionId,
            "download_unavailable",
            stableCode,
            SafeArtifactMessage(session, "Download is unavailable because this metadata-only slice creates no package artifact."),
            DownloadAvailable: false,
            CanDownloadPackage: false,
            ArtifactAvailable: false,
            ExpiresAtUtc: session.ExpiresAtUtc,
            PrivacyBoundary: ArtifactPrivacyBoundary(),
            DataEgressBoundary: ArtifactDataEgressBoundary(),
            UnsupportedFeatures: UnsupportedPackageArtifactFeatures(),
            NextAllowedActions: NextAllowedArtifactActions(session),
            ResponseGeneratedAtUtc: now);
    }

    private static string ArtifactStatus(LocalBackupPackageSessionMetadata session)
    {
        return session.Status switch
        {
            "cancelled" => "cancelled",
            "discarded" => "discarded",
            "expired" => "expired",
            _ => "metadata_only_no_artifact"
        };
    }

    private static string ArtifactStableCode(LocalBackupPackageSessionMetadata session)
    {
        return session.Status switch
        {
            "cancelled" => "package_generation_cancelled",
            "discarded" => "package_session_discarded",
            "expired" => "package_session_expired",
            _ => "metadata_only_no_artifact"
        };
    }

    private static string SafeArtifactMessage(LocalBackupPackageSessionMetadata session, string defaultMessage)
    {
        return session.Status switch
        {
            "cancelled" => "Package generation is cancelled for this metadata-only package session. No package artifact or source record was mutated.",
            "discarded" => "This package session is discarded. No package artifact, package bytes, or download action is available.",
            "expired" => "This package session is expired. Create a new package session before any future package generation flow.",
            _ => defaultMessage
        };
    }

    private static string ArtifactPrivacyBoundary()
    {
        return "This response returns safe package metadata only. It excludes package bytes, file bytes, artifact IDs, storage paths, object keys, signed URLs, direct storage URLs, filesystem paths, local device paths, raw OCR text, private notes, payment details, hidden records, auth tokens, and credential material.";
    }

    private static string ArtifactDataEgressBoundary()
    {
        return "No backup package artifact is generated, queued, stored, streamed, downloaded, parsed, uploaded, or restored by this metadata-only generation/download contract slice.";
    }

    private static IReadOnlyList<string> UnsupportedPackageArtifactFeatures()
    {
        return
        [
            "package_generation",
            "package_artifact",
            "package_download",
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
            _ => ["get_artifact_status", "cancel_package_generation", "discard_package_session"]
        };
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
    string PrivacyBoundary,
    string DataEgressBoundary,
    IReadOnlyList<string> UnsupportedFeatures,
    IReadOnlyList<string> NextAllowedActions,
    DateTimeOffset ResponseGeneratedAtUtc);
