using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Notifications;

public sealed class PushDeviceToken
{
    public Guid Id { get; set; }

    public Guid AuthAccountId { get; set; }

    public AuthAccount AuthAccount { get; set; } = null!;

    public Guid UserProfileId { get; set; }

    public UserProfile UserProfile { get; set; } = null!;

    public Guid AuthSessionId { get; set; }

    public AuthSession AuthSession { get; set; } = null!;

    public string DeviceInstallationHash { get; set; } = string.Empty;

    public string Platform { get; set; } = string.Empty;

    public string Provider { get; set; } = string.Empty;

    public string AppBuildEnvironment { get; set; } = string.Empty;

    public string TokenFingerprint { get; set; } = string.Empty;

    public string ProtectedTokenBlob { get; set; } = string.Empty;

    public string ProtectionKeyId { get; set; } = string.Empty;

    public string ProtectionPurpose { get; set; } = string.Empty;

    public int TokenVersion { get; set; }

    public string PermissionState { get; set; } = string.Empty;

    public string Status { get; set; } = PushDeviceTokenStatuses.Active;

    public string? StatusReason { get; set; }

    public DateTimeOffset LastSeenAtUtc { get; set; }

    public DateTimeOffset RegisteredAtUtc { get; set; }

    public DateTimeOffset? RotatedAtUtc { get; set; }

    public DateTimeOffset? RevokedAtUtc { get; set; }

    public DateTimeOffset? SupersededAtUtc { get; set; }

    public DateTimeOffset? StaleAtUtc { get; set; }

    public string? ProviderFeedbackCategory { get; set; }

    public int FailureCount { get; set; }

    public DateTimeOffset? LastFailureAtUtc { get; set; }

    public DateTimeOffset? ClientObservedAtUtc { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }
}
