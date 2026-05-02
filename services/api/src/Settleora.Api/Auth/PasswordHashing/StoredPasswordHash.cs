namespace Settleora.Api.Auth.PasswordHashing;

internal sealed class StoredPasswordHash
{
    public StoredPasswordHash(
        string verifier,
        string algorithm,
        string algorithmVersion,
        string parametersJson,
        bool requiresRehash = false)
    {
        Verifier = verifier;
        Algorithm = algorithm;
        AlgorithmVersion = algorithmVersion;
        ParametersJson = parametersJson;
        RequiresRehash = requiresRehash;
    }

    public string Verifier { get; }

    public string Algorithm { get; }

    public string AlgorithmVersion { get; }

    public string ParametersJson { get; }

    public bool RequiresRehash { get; }

    public override string ToString()
    {
        return $"StoredPasswordHash {{ Algorithm = {Algorithm}, AlgorithmVersion = {AlgorithmVersion}, RequiresRehash = {RequiresRehash} }}";
    }
}
