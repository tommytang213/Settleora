using System.Text.Json.Serialization;

namespace Settleora.Api.Auth.Invitations;

internal sealed record InvitationCapabilityReadoutResponse(
    InvitationCapabilityReadout Capability);

internal sealed record AdminInvitationPolicyReadoutResponse(
    InvitationCapabilityReadout Capability,
    string PolicyVersion,
    DateTimeOffset? UpdatedAtUtc);

internal sealed record InvitationCapabilityReadout(
    string CapabilityState,
    string DefaultState,
    bool CanCurrentActorManageInvitations,
    bool CanCurrentActorCreateInvitations,
    bool CanCurrentActorMutatePolicy,
    bool PublicAcceptEnabled,
    bool PendingInviteGraceWhenDisabled,
    IReadOnlyList<string> SupportedContactIdentifierKinds,
    IReadOnlyList<string> SupportedTargetSystemRoles,
    string DeliveryReadiness,
    string ReadoutCategory);

internal sealed record AdminInvitationPolicyUpdateRequest(
    [property: JsonPropertyName("capabilityState")] string? CapabilityState,
    [property: JsonPropertyName("pendingInviteGraceWhenDisabled")] bool? PendingInviteGraceWhenDisabled);

internal sealed record InvitationPolicyUpdateResult(
    AdminInvitationPolicyReadoutResponse Readout,
    bool AuditWritten);
