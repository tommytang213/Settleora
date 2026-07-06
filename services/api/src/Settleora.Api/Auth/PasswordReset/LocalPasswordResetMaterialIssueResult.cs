namespace Settleora.Api.Auth.PasswordReset;

internal sealed record LocalPasswordResetMaterialIssueResult(
    LocalPasswordResetMaterialIssueStatus Status,
    Guid? ResetRequestId = null,
    string? RawResetMaterial = null)
{
    public bool Succeeded => Status == LocalPasswordResetMaterialIssueStatus.Issued;

    public static LocalPasswordResetMaterialIssueResult Issued(
        Guid resetRequestId,
        string rawResetMaterial)
    {
        return new LocalPasswordResetMaterialIssueResult(
            LocalPasswordResetMaterialIssueStatus.Issued,
            resetRequestId,
            rawResetMaterial);
    }

    public static LocalPasswordResetMaterialIssueResult NotIssued()
    {
        return new LocalPasswordResetMaterialIssueResult(LocalPasswordResetMaterialIssueStatus.NotIssued);
    }

    public override string ToString()
    {
        return $"LocalPasswordResetMaterialIssueResult {{ Status = {Status}, HasRawResetMaterial = {RawResetMaterial is not null} }}";
    }
}
