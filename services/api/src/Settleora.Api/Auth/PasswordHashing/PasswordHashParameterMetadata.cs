namespace Settleora.Api.Auth.PasswordHashing;

internal sealed record PasswordHashParameterMetadata(
    string Format,
    string Library,
    string LibraryVersion,
    int Iterations,
    int MemorySizeBytes,
    int Parallelism,
    int SaltLengthBytes,
    int EncodedVerifierMaxLength,
    string UnicodeNormalization);
