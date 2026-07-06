namespace Settleora.Api.Auth.PasswordReset;

internal sealed record LocalPasswordResetCompleteRequest(
    string? SubmittedResetMaterial,
    string? NewPassword,
    string? RequestCorrelationId = null);
