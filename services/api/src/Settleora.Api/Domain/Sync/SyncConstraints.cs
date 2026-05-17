namespace Settleora.Api.Domain.Sync;

public static class SyncConstraints
{
    public const int IdempotencyKeyMaxLength = 128;
    public const int OperationTypeMaxLength = 64;
    public const int ResourceTypeMaxLength = 64;
    public const int OperationStatusMaxLength = 32;
    public const int ChangeKindMaxLength = 32;
    public const int SafeErrorCodeMaxLength = 120;
    public const int RequestPayloadHashMaxLength = 64;
}
