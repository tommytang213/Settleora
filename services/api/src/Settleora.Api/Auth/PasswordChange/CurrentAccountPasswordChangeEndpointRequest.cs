namespace Settleora.Api.Auth.PasswordChange;

internal sealed class CurrentAccountPasswordChangeEndpointRequest
{
    public string? CurrentPassword { get; init; }

    public string? NewPassword { get; init; }

    public override string ToString()
    {
        return $"CurrentAccountPasswordChangeEndpointRequest {{ HasCurrentPassword = {CurrentPassword is not null}, HasNewPassword = {NewPassword is not null} }}";
    }
}
