namespace Settleora.Api.Auth.PasswordReset;

internal sealed record LocalPasswordResetMaterialIssueRequest(
    string? SubmittedIdentifier,
    string MaterialScope,
    TimeSpan Lifetime,
    string? SourceBucketRef = null,
    string? RequestCorrelationId = null);
