using System.Text.Json.Serialization;

namespace Settleora.Api.Auth.Invitations;

internal sealed record AdminInvitationListResponse(
    IReadOnlyList<AdminInvitationSummary> Invitations);

internal sealed record AdminInvitationResponse(
    AdminInvitationSummary Invitation);

internal sealed record AdminInvitationSummary(
    Guid Id,
    string Status,
    string ContactIdentifierKind,
    string? ContactDisplay,
    string TargetSystemRole,
    string DeliveryState,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    DateTimeOffset ExpiresAtUtc,
    DateTimeOffset? AcceptedAtUtc,
    DateTimeOffset? RevokedAtUtc,
    DateTimeOffset? ExpiredAtUtc,
    DateTimeOffset? CleanupEligibleAtUtc,
    Guid? InvitedByAuthAccountId,
    Guid? InvitedByUserProfileId,
    Guid? RevokedByAuthAccountId);

internal sealed record AdminInvitationCreateRequest(
    [property: JsonPropertyName("contactIdentifierKind")] string ContactIdentifierKind,
    [property: JsonPropertyName("contactIdentifier")] string ContactIdentifier,
    [property: JsonPropertyName("targetSystemRole")] string TargetSystemRole,
    [property: JsonPropertyName("idempotencyKey")] string? IdempotencyKey,
    [property: JsonPropertyName("deliveryRequested")] bool DeliveryRequested);

internal sealed record AdminInvitationRevokeRequest(
    [property: JsonPropertyName("reason")] string? Reason);

internal sealed record AdminInvitationResendRequest(
    [property: JsonPropertyName("deliveryRequested")] bool DeliveryRequested);

internal sealed record InvitationListFilters(
    string? Status,
    string? ContactIdentifierKind,
    string? ContactSearch,
    DateTimeOffset? CreatedFromUtc,
    DateTimeOffset? CreatedToUtc,
    DateTimeOffset? ExpiresBeforeUtc,
    int Limit);

internal enum InvitationManagementResultStatus
{
    Succeeded,
    InvalidRequest,
    CapabilityDisabled,
    DuplicatePendingInvitation,
    Throttled,
    NotFound,
    TerminalState,
    UnsupportedContactIdentifierKind,
    UnsupportedTargetSystemRole
}

internal sealed record InvitationManagementResult(
    InvitationManagementResultStatus Status,
    AdminInvitationSummary? Invitation = null)
{
    public static InvitationManagementResult Succeeded(AdminInvitationSummary invitation)
    {
        return new InvitationManagementResult(InvitationManagementResultStatus.Succeeded, invitation);
    }

    public static InvitationManagementResult Failure(InvitationManagementResultStatus status)
    {
        return new InvitationManagementResult(status);
    }
}
