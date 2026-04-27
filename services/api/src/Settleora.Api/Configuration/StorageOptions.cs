namespace Settleora.Api.Configuration;

public sealed class StorageOptions
{
    public const string SectionName = "Settleora:Storage";

    public string Provider { get; init; } = "Local";

    public string RootPath { get; init; } = string.Empty;
}
