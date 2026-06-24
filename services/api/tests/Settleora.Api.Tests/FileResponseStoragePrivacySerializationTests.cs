using System.Text.Json;
using Settleora.Api.Expenses.BillAttachments;
using Settleora.Api.Settlements;
using Settleora.Api.Users.PaymentDetails;

namespace Settleora.Api.Tests;

public sealed class FileResponseStoragePrivacySerializationTests
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static readonly string[] ForbiddenStorageInternalFieldNames =
    [
        "path",
        "filePath",
        "localPath",
        "objectKey",
        "storageObjectKey",
        "bucket",
        "container",
        "provider",
        "providerPath",
        "storagePath",
        "directory",
        "absolutePath",
        "providerInternal"
    ];

    private static readonly Guid StableFileId = Guid.Parse("11111111-1111-4111-8111-111111111111");
    private static readonly Guid StableBillId = Guid.Parse("22222222-2222-4222-8222-222222222222");
    private static readonly Guid StablePaymentId = Guid.Parse("33333333-3333-4333-8333-333333333333");
    private static readonly Guid StableProfileId = Guid.Parse("44444444-4444-4444-8444-444444444444");
    private static readonly DateTimeOffset Timestamp = new(2026, 6, 24, 8, 43, 0, TimeSpan.Zero);

    [Fact]
    public void BillAttachmentResponsesSerializeOnlyStableFileIdsAndSafeMetadata()
    {
        var attachment = new BillAttachmentResponse(
            StableFileId,
            StableBillId,
            "receipt",
            "image/png",
            128,
            Timestamp,
            Timestamp);
        var list = new BillAttachmentListResponse([attachment]);

        AssertJsonFieldSet(
            attachment,
            "billId",
            "contentType",
            "fileId",
            "purpose",
            "sizeBytes",
            "updatedAtUtc",
            "uploadedAtUtc");
        AssertJsonFieldSet(list, "attachments");
        AssertSafeFileResponseJson(attachment, StableFileId, StableBillId);
        AssertSafeFileResponseJson(list, StableFileId, StableBillId);
    }

    [Fact]
    public void SettlementProofResponsesSerializeOnlyStableFileIdsAndSafeMetadata()
    {
        var proof = new SettlementPaymentProofResponse(
            StableFileId,
            StablePaymentId,
            "application/pdf",
            256,
            Timestamp,
            Timestamp);
        var list = new SettlementPaymentProofListResponse([proof]);

        AssertJsonFieldSet(
            proof,
            "contentType",
            "fileId",
            "settlementPaymentId",
            "sizeBytes",
            "updatedAtUtc",
            "uploadedAtUtc");
        AssertJsonFieldSet(list, "proofs");
        AssertSafeFileResponseJson(proof, StableFileId, StablePaymentId);
        AssertSafeFileResponseJson(list, StableFileId, StablePaymentId);
    }

    [Fact]
    public void SelfPaymentQrResponsesSerializeOnlyStableFileIdsAndSafeMetadata()
    {
        var qrFile = new SelfPaymentDetailsQrFileResponse(
            StableFileId,
            "image/png",
            512,
            Timestamp);
        var response = new SelfPaymentDetailsResponse(
            IsConfigured: true,
            StableProfileId,
            PreferredMethodLabel: "FPS",
            PaymentHandle: "safe-handle",
            PaymentNote: "safe note",
            Visibility: "settlement_counterparties_only",
            qrFile,
            CreatedAtUtc: Timestamp,
            UpdatedAtUtc: Timestamp);

        AssertJsonFieldSet(qrFile, "contentType", "id", "sizeBytes", "updatedAtUtc");
        AssertJsonFieldSet(
            response,
            "createdAtUtc",
            "id",
            "isConfigured",
            "paymentHandle",
            "paymentNote",
            "preferredMethodLabel",
            "qrFile",
            "updatedAtUtc",
            "visibility");
        AssertSafeFileResponseJson(qrFile, StableFileId);
        AssertSafeFileResponseJson(response, StableFileId, StableProfileId);
    }

    [Fact]
    public void SettlementCounterpartyPaymentQrResponsesSerializeOnlyStableFileIdsAndSafeMetadata()
    {
        var qrFile = new SettlementCounterpartyPaymentDetailsQrFileResponse(
            StableFileId,
            "image/png",
            512,
            Timestamp);
        var response = new SettlementCounterpartyPaymentDetailsResponse(
            StableProfileId,
            IsConfigured: true,
            PreferredMethodLabel: "FPS",
            PaymentHandle: "safe-handle",
            PaymentNote: "safe note",
            VisibilityApplied: "settlement_counterparties_only",
            qrFile);

        AssertJsonFieldSet(qrFile, "contentType", "id", "sizeBytes", "updatedAtUtc");
        AssertJsonFieldSet(
            response,
            "isConfigured",
            "paymentHandle",
            "paymentNote",
            "preferredMethodLabel",
            "qrFile",
            "userProfileId",
            "visibilityApplied");
        AssertSafeFileResponseJson(qrFile, StableFileId);
        AssertSafeFileResponseJson(response, StableFileId, StableProfileId);
    }

    private static void AssertJsonFieldSet<T>(T value, params string[] expectedFieldNames)
    {
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(value, JsonOptions));

        Assert.Equal(
            expectedFieldNames.Order(StringComparer.Ordinal).ToArray(),
            document.RootElement.EnumerateObject()
                .Select(property => property.Name)
                .Order(StringComparer.Ordinal)
                .ToArray());
    }

    private static void AssertSafeFileResponseJson<T>(T value, params Guid[] expectedStableIds)
    {
        var json = JsonSerializer.Serialize(value, JsonOptions);
        using var document = JsonDocument.Parse(json);

        foreach (var expectedStableId in expectedStableIds)
        {
            Assert.Contains(expectedStableId.ToString("D"), json, StringComparison.OrdinalIgnoreCase);
        }

        AssertNoForbiddenStorageInternalFields(document.RootElement);
        Assert.DoesNotContain("storage-root", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("object-key", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("bucket-name", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("container-name", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("provider-internal", json, StringComparison.OrdinalIgnoreCase);
    }

    private static void AssertNoForbiddenStorageInternalFields(JsonElement value)
    {
        switch (value.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var property in value.EnumerateObject())
                {
                    Assert.DoesNotContain(
                        ForbiddenStorageInternalFieldNames,
                        forbidden => string.Equals(property.Name, forbidden, StringComparison.OrdinalIgnoreCase));
                    AssertNoForbiddenStorageInternalFields(property.Value);
                }
                break;

            case JsonValueKind.Array:
                foreach (var element in value.EnumerateArray())
                {
                    AssertNoForbiddenStorageInternalFields(element);
                }

                break;
        }
    }
}
