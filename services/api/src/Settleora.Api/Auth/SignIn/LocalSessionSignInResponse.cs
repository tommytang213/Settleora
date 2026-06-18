using Settleora.Api.Auth.CurrentUser;

namespace Settleora.Api.Auth.SignIn;

internal sealed record LocalSessionSignInResponse(
    LocalSignInSessionResponse Session,
    LocalSignInRefreshCredentialResponse RefreshCredential,
    CurrentUserResponse CurrentUser);
