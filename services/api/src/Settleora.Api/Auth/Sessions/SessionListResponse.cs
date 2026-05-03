namespace Settleora.Api.Auth.Sessions;

internal sealed record SessionListResponse(
    IReadOnlyList<SessionSummaryResponse> Sessions);
