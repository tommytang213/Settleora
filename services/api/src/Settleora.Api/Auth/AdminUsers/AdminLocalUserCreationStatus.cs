namespace Settleora.Api.Auth.AdminUsers;

internal enum AdminLocalUserCreationStatus
{
    Created,
    DuplicateLocalIdentifier,
    CredentialCreationFailed,
    PersistenceFailed
}
