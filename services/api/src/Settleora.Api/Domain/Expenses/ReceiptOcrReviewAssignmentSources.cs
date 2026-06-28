namespace Settleora.Api.Domain.Expenses;

public static class ReceiptOcrReviewAssignmentSources
{
    public const string ServerOcrWorker = "server_ocr_worker";
    public const string ServerModeUploadHandoff = "server_mode_upload_handoff";
    public const string ManualAssignment = "manual_assignment";
    public const string SystemReassignment = "system_reassignment";

    private static readonly HashSet<string> SupportedValues =
    [
        ServerOcrWorker,
        ServerModeUploadHandoff,
        ManualAssignment,
        SystemReassignment
    ];

    public static bool IsSupported(string? value)
    {
        return value is not null && SupportedValues.Contains(value);
    }
}
