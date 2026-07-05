using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Settleora.Api.Auth.Credentials;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.PasswordChange;

internal sealed class CurrentAccountPasswordChangeService : ICurrentAccountPasswordChangeService
{
    private const string PasswordChangedRevocationReason = "password_changed";

    private readonly SettleoraDbContext dbContext;
    private readonly IAuthCredentialWorkflowService credentialWorkflowService;
    private readonly IAuthSessionRuntimeService sessionRuntimeService;

    public CurrentAccountPasswordChangeService(
        SettleoraDbContext dbContext,
        IAuthCredentialWorkflowService credentialWorkflowService,
        IAuthSessionRuntimeService sessionRuntimeService)
    {
        this.dbContext = dbContext;
        this.credentialWorkflowService = credentialWorkflowService;
        this.sessionRuntimeService = sessionRuntimeService;
    }

    public async Task<CurrentAccountPasswordChangeResult> ChangePasswordAsync(
        CurrentAccountPasswordChangeRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        IDbContextTransaction? transaction = null;

        try
        {
            if (dbContext.Database.IsRelational())
            {
                transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
            }

            var credentialResult = await credentialWorkflowService.ChangeLocalPasswordAsync(
                request.Actor.AuthAccountId,
                request.CurrentPassword,
                request.NewPassword,
                cancellationToken);

            if (!credentialResult.Succeeded)
            {
                if (transaction is not null)
                {
                    await transaction.CommitAsync(cancellationToken);
                }

                return CurrentAccountPasswordChangeResult.Failure(
                    credentialResult.Status switch
                    {
                        PasswordCredentialChangeStatus.CurrentPasswordInvalid => CurrentAccountPasswordChangeStatus.InvalidCurrentPassword,
                        PasswordCredentialChangeStatus.SamePassword => CurrentAccountPasswordChangeStatus.SamePassword,
                        PasswordCredentialChangeStatus.HashingFailed => CurrentAccountPasswordChangeStatus.InvalidNewPassword,
                        PasswordCredentialChangeStatus.PersistenceFailed => CurrentAccountPasswordChangeStatus.PersistenceFailed,
                        PasswordCredentialChangeStatus.AccountUnavailable => CurrentAccountPasswordChangeStatus.Unavailable,
                        PasswordCredentialChangeStatus.CredentialUnavailable => CurrentAccountPasswordChangeStatus.Unavailable,
                        PasswordCredentialChangeStatus.CredentialDisabled => CurrentAccountPasswordChangeStatus.Unavailable,
                        PasswordCredentialChangeStatus.CredentialRevoked => CurrentAccountPasswordChangeStatus.Unavailable,
                        _ => CurrentAccountPasswordChangeStatus.InvalidCurrentPassword
                    });
            }

            var revocationResult = await sessionRuntimeService.RevokeActiveSessionsForAccountAsync(
                new AuthAccountSessionRevocationRequest(
                    request.Actor.AuthAccountId,
                    PasswordChangedRevocationReason,
                    request.Actor.AuthSessionId),
                cancellationToken);

            var result = revocationResult.Status switch
            {
                AuthAccountSessionRevocationStatus.Revoked => CurrentAccountPasswordChangeResult.Changed(),
                AuthAccountSessionRevocationStatus.PersistenceFailed => CurrentAccountPasswordChangeResult.Failure(CurrentAccountPasswordChangeStatus.PersistenceFailed),
                _ => CurrentAccountPasswordChangeResult.Failure(CurrentAccountPasswordChangeStatus.Unavailable)
            };

            if (!result.Succeeded)
            {
                await RollbackAsync(transaction, cancellationToken);
                return result;
            }

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken);
            }

            return result;
        }
        finally
        {
            if (transaction is not null)
            {
                await transaction.DisposeAsync();
            }
        }
    }

    private static async Task RollbackAsync(
        IDbContextTransaction? transaction,
        CancellationToken cancellationToken)
    {
        if (transaction is not null)
        {
            await transaction.RollbackAsync(cancellationToken);
        }
    }
}
