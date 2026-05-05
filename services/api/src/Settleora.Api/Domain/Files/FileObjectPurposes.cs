namespace Settleora.Api.Domain.Files;

public static class FileObjectPurposes
{
    public const string ReceiptImage = "receipt_image";
    public const string OcrSource = "ocr_source";
    public const string SettlementProof = "settlement_proof";
    public const string PaymentQr = "payment_qr";
    public const string StatementUpload = "statement_upload";
    public const string ExportFile = "export_file";
    public const string SupportingAttachment = "supporting_attachment";

    public static bool IsSupported(string purpose)
    {
        return purpose is ReceiptImage
            or OcrSource
            or SettlementProof
            or PaymentQr
            or StatementUpload
            or ExportFile
            or SupportingAttachment;
    }
}
