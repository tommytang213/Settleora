namespace Settleora.Api.Persistence.MigrationRunner;

internal sealed record MigrationSafetyAssessment(
    bool IsSafe,
    IReadOnlyList<string> Reasons)
{
    public static MigrationSafetyAssessment Safe { get; } =
        new(true, Array.Empty<string>());
}
