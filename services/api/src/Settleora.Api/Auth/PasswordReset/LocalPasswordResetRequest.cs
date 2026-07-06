namespace Settleora.Api.Auth.PasswordReset;

internal sealed record LocalPasswordResetRequest(
    string? SubmittedIdentifier,
    string? SourceBucketRef = null,
    string? RequestCorrelationId = null);
