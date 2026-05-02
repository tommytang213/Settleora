namespace Settleora.Api.Auth.SignIn;

internal interface ILocalSignInService
{
    Task<LocalSignInResult> SignInAsync(
        LocalSignInRequest request,
        CancellationToken cancellationToken = default);
}
