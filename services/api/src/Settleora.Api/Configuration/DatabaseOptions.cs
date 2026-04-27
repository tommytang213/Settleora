namespace Settleora.Api.Configuration;

public sealed class DatabaseOptions
{
    public const string SectionName = "Settleora:Database";

    public string ConnectionString { get; init; } = string.Empty;
}
