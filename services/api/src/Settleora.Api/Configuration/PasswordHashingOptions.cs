namespace Settleora.Api.Configuration;

public sealed class PasswordHashingOptions
{
    public const string SectionName = "Settleora:Auth:PasswordHashing";

    public string Algorithm { get; init; } = "argon2id";

    public string PolicyVersion { get; init; } = "argon2id-v1";

    public int Argon2idIterations { get; init; } = 3;

    public int Argon2idMemorySizeBytes { get; init; } = 67_108_864;

    public int VerifierMaxLength { get; init; } = 512;

    public int ParametersMaxLength { get; init; } = 1024;
}
