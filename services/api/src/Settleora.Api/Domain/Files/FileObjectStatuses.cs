namespace Settleora.Api.Domain.Files;

public static class FileObjectStatuses
{
    public const string Pending = "pending";
    public const string Active = "active";
    public const string Quarantined = "quarantined";
    public const string Deleted = "deleted";
    public const string Purged = "purged";
    public const string UploadFailed = "upload_failed";

    public static bool IsSupported(string status)
    {
        return status is Pending
            or Active
            or Quarantined
            or Deleted
            or Purged
            or UploadFailed;
    }
}
