namespace Settleora.Api.Auth.SignIn;

internal sealed record LocalSignInResponse(
    LocalSignInSessionResponse Session,
    LocalSignInRefreshCredentialResponse RefreshCredential);
