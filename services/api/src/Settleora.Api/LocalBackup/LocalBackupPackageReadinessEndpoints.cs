using Settleora.Api.Auth.Authorization;
using Settleora.Api.RequestValidation;

namespace Settleora.Api.LocalBackup;

internal static class LocalBackupPackageReadinessEndpoints
{
    private static readonly TimeSpan ReadinessFreshnessWindow = TimeSpan.FromMinutes(5);

    public static WebApplication MapLocalBackupPackageReadinessEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/local-backup/package-readiness", GetPackageReadinessAsync)
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

    private static LocalBackupPackageFeatureStatusResponse Feature(
        string state,
        string stableCode,
        string safeMessage)
    {
        return new LocalBackupPackageFeatureStatusResponse(state, stableCode, safeMessage);
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
