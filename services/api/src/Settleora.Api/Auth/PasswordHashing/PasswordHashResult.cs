namespace Settleora.Api.Auth.PasswordHashing;

internal sealed class PasswordHashResult
{
    private PasswordHashResult(
        string verifier,
        string algorithm,
        string algorithmVersion,
        string parametersJson,
        PasswordHashFailureReason? failureReason)
    {
        Verifier = verifier;
        Algorithm = algorithm;
        AlgorithmVersion = algorithmVersion;
        ParametersJson = parametersJson;
        FailureReason = failureReason;
    }

    public bool Succeeded => FailureReason is null;

    public string Verifier { get; }

    public string Algorithm { get; }

    public string AlgorithmVersion { get; }

    public string ParametersJson { get; }

    public PasswordHashFailureReason? FailureReason { get; }

    public static PasswordHashResult Success(
        string verifier,
        string algorithm,
        string algorithmVersion,
        string parametersJson)
    {
        return new PasswordHashResult(verifier, algorithm, algorithmVersion, parametersJson, null);
    }

    public static PasswordHashResult Failure(PasswordHashFailureReason failureReason)
    {
        return new PasswordHashResult(string.Empty, string.Empty, string.Empty, string.Empty, failureReason);
    }

    public StoredPasswordHash ToStoredHash(bool requiresRehash = false)
    {
        if (!Succeeded)
        {
            throw new InvalidOperationException("Cannot create stored password hash metadata from a failed hash result.");
        }

        return new StoredPasswordHash(Verifier, Algorithm, AlgorithmVersion, ParametersJson, requiresRehash);
    }

    public override string ToString()
    {
        return $"PasswordHashResult {{ Succeeded = {Succeeded}, Algorithm = {Algorithm}, AlgorithmVersion = {AlgorithmVersion}, FailureReason = {FailureReason?.ToString() ?? "None"} }}";
    }
}
