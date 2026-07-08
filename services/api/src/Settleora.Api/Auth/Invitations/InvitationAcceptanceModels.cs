using System.Text.Json.Serialization;

namespace Settleora.Api.Auth.Invitations;

internal sealed record InvitationAcceptEndpointRequest(
    [property: JsonPropertyName("invitationSecret")] string? InvitationSecret,
    [property: JsonPropertyName("displayName")] string? DisplayName,
    [property: JsonPropertyName("localPassword")] string? LocalPassword);

internal sealed record InvitationAcceptRequest(
    string InvitationSecret,
    string DisplayName,
    string LocalPassword);

internal sealed record InvitationAcceptResponse(
    string Result,
    bool SignInRequired);

internal enum InvitationAcceptanceStatus
{
    Accepted,
    InvalidRequest,
    InvalidInvitation,
    Throttled,
    PersistenceFailed
}

internal sealed record InvitationAcceptanceResult(
    InvitationAcceptanceStatus Status)
{
    public static InvitationAcceptanceResult Accepted()
    {
        return new InvitationAcceptanceResult(InvitationAcceptanceStatus.Accepted);
    }

    public static InvitationAcceptanceResult Failure(InvitationAcceptanceStatus status)
    {
        return new InvitationAcceptanceResult(status);
    }
}
