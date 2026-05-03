namespace Settleora.Api.Auth.Sessions;

internal sealed record RefreshSessionResponse(
    RefreshSessionAccessSessionResponse Session,
    RefreshSessionCredentialResponse RefreshCredential);
