using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;

namespace Settleora.Api.Auth.Invitations;

internal interface IInvitationAbusePolicyService
{
    InvitationAbusePolicyDecision CheckAttempt(InvitationAbusePolicyRequest request);

    void RecordAttempt(InvitationAbusePolicyRequest request, InvitationAbusePolicyOutcome outcome);
}

internal sealed record InvitationAbusePolicyRequest(
    string OperationCategory,
    string? ActorBucketRef,
    string? SubjectBucketRef,
    string? SourceBucketRef)
{
    private const int SafeKeyMaxLength = 128;

    public string OperationKey => CreateSafeCategoryKey("invite-op", OperationCategory);

    public string ActorKey => CreateSafeRefKey(OperationKey, "actor", ActorBucketRef ?? "anonymous");

    public string SubjectKey => CreateSafeRefKey(OperationKey, "subject", SubjectBucketRef ?? "unknown");

    public string SourceKey => CreateSafeSourceKey(SourceBucketRef);

    public override string ToString()
    {
        return string.Join(
            " ",
            nameof(InvitationAbusePolicyRequest),
            $"OperationCategory={OperationKey}",
            $"HasActorBucketRef={!string.IsNullOrWhiteSpace(ActorBucketRef)}",
            $"HasSubjectBucketRef={!string.IsNullOrWhiteSpace(SubjectBucketRef)}",
            $"HasSourceBucketRef={!string.IsNullOrWhiteSpace(SourceBucketRef)}");
    }

    private static string CreateSafeCategoryKey(string prefix, string value)
    {
        var trimmed = value.Trim();
        if (trimmed.Length is > 0 and <= SafeKeyMaxLength && trimmed.All(IsSafeKeyCharacter))
        {
            return $"{prefix}:{trimmed}";
        }

        return CreateHashKey(prefix, trimmed);
    }

    private static string CreateSafeRefKey(string operationKey, string prefix, string value)
    {
        var normalized = string.IsNullOrWhiteSpace(value) ? "unknown" : value.Trim().ToLowerInvariant();
        return CreateHashKey($"invite-{prefix}-sha256", $"{operationKey}:{prefix}:{normalized}");
    }

    private static string CreateSafeSourceKey(string? sourceBucketRef)
    {
        if (string.IsNullOrWhiteSpace(sourceBucketRef))
        {
            return "invite-source:local-single-node";
        }

        var trimmed = sourceBucketRef.Trim();
        if (trimmed.Length <= SafeKeyMaxLength && trimmed.All(IsSafeKeyCharacter))
        {
            return trimmed;
        }

        return CreateHashKey("invite-source-sha256", trimmed);
    }

    private static string CreateHashKey(string prefix, string value)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return $"{prefix}:{WebEncoders.Base64UrlEncode(hash)}";
    }

    private static bool IsSafeKeyCharacter(char character)
    {
        return char.IsAsciiLetterOrDigit(character)
            || character is ':' or '-' or '_' or '.';
    }
}

internal sealed record InvitationAbusePolicyDecision(
    bool Allowed,
    string Status,
    string Scope)
{
    public static InvitationAbusePolicyDecision Allow()
    {
        return new InvitationAbusePolicyDecision(
            Allowed: true,
            InvitationAbusePolicyStatuses.Allowed,
            InvitationAbusePolicyScopes.None);
    }

    public static InvitationAbusePolicyDecision Throttle(string scope)
    {
        return new InvitationAbusePolicyDecision(
            Allowed: false,
            InvitationAbusePolicyStatuses.Throttled,
            scope);
    }

    public override string ToString()
    {
        return string.Join(
            " ",
            nameof(InvitationAbusePolicyDecision),
            $"Allowed={Allowed}",
            $"Status={Status}",
            $"Scope={Scope}");
    }
}

internal enum InvitationAbusePolicyOutcome
{
    Succeeded,
    Failed,
    BlockedByPolicy,
    Throttled
}

internal static class InvitationAbusePolicyOperations
{
    public const string Create = "create";
    public const string Resend = "resend";
    public const string Accept = "accept";
}

internal static class InvitationAbusePolicyStatuses
{
    public const string Allowed = "allowed";
    public const string Throttled = "throttled";
}

internal static class InvitationAbusePolicyScopes
{
    public const string None = "none";
    public const string Source = "source";
    public const string Actor = "actor";
    public const string Subject = "subject";
    public const string ActorSubject = "actor_subject";
    public const string Global = "global";
}
