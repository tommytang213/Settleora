using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Auth;

public sealed class AuthAccount
{
    public Guid Id { get; set; }

    public Guid UserProfileId { get; set; }

    public UserProfile UserProfile { get; set; } = null!;

    public string Status { get; set; } = AuthAccountStatuses.Active;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? DisabledAtUtc { get; set; }

    public DateTimeOffset? DeletedAtUtc { get; set; }

    public ICollection<AuthIdentity> Identities { get; } = new List<AuthIdentity>();

    public ICollection<SystemRoleAssignment> RoleAssignments { get; } = new List<SystemRoleAssignment>();

    public ICollection<SystemRoleAssignment> AssignedRoleAssignments { get; } = new List<SystemRoleAssignment>();

    public ICollection<LocalPasswordCredential> LocalPasswordCredentials { get; } = new List<LocalPasswordCredential>();

    public ICollection<AuthPasswordResetRequest> PasswordResetRequests { get; } =
        new List<AuthPasswordResetRequest>();

    public ICollection<AuthInvitation> CreatedInvitations { get; } = new List<AuthInvitation>();

    public ICollection<AuthInvitation> RevokedInvitations { get; } = new List<AuthInvitation>();

    public ICollection<AuthSession> Sessions { get; } = new List<AuthSession>();

    public ICollection<AuthSessionFamily> SessionFamilies { get; } = new List<AuthSessionFamily>();

    public ICollection<AuthAuditEvent> ActorAuditEvents { get; } = new List<AuthAuditEvent>();

    public ICollection<AuthAuditEvent> SubjectAuditEvents { get; } = new List<AuthAuditEvent>();

    public ICollection<AuthPasskeyCredential> PasskeyCredentials { get; } = new List<AuthPasskeyCredential>();

    public ICollection<AuthPasskeyCredential> ChangedPasskeyCredentialStatuses { get; } = new List<AuthPasskeyCredential>();

    public ICollection<AuthMfaFactor> MfaFactors { get; } = new List<AuthMfaFactor>();

    public ICollection<AuthMfaFactor> ChangedMfaFactorStatuses { get; } = new List<AuthMfaFactor>();

    public ICollection<AuthRecoveryCodeBatch> RecoveryCodeBatches { get; } = new List<AuthRecoveryCodeBatch>();

    public ICollection<AuthRecoveryCodeBatch> CreatedRecoveryCodeBatches { get; } = new List<AuthRecoveryCodeBatch>();

    public ICollection<AuthRecoveryCodeVerifier> RecoveryCodeVerifiers { get; } = new List<AuthRecoveryCodeVerifier>();

    public ICollection<AuthChallenge> Challenges { get; } = new List<AuthChallenge>();

    public ICollection<AuthSecurityPolicy> ChangedSecurityPolicies { get; } = new List<AuthSecurityPolicy>();

    public ICollection<AuthInvitationPolicy> ChangedInvitationPolicies { get; } = new List<AuthInvitationPolicy>();
}
