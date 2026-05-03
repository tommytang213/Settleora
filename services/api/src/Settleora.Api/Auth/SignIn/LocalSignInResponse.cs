namespace Settleora.Api.Auth.SignIn;

internal sealed record LocalSignInResponse(
    Guid AuthAccountId,
    Guid UserProfileId,
    LocalSignInSessionResponse Session);
