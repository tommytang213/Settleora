using Settleora.Api.Auth.Authorization;

namespace Settleora.Api.Auth.Policy;

internal interface IAuthSecurityPolicyService
{
    Task<AuthSecurityPolicyDecision> GetCurrentPolicyAsync(CancellationToken cancellationToken);

    Task<AuthSecurityPolicyReadout> CreateReadoutAsync(
        AuthenticatedActor actor,
        bool requiresFreshStepUp,
        CancellationToken cancellationToken);

    Task<bool> IsPasskeySupportedAsync(AuthenticatedActor? actor, CancellationToken cancellationToken);

    Task<bool> IsTotpSupportedAsync(AuthenticatedActor actor, CancellationToken cancellationToken);

    Task<bool> IsRecoveryCodeSupportedAsync(AuthenticatedActor actor, CancellationToken cancellationToken);

    Task<bool> RequiresFreshStepUpAsync(
        AuthenticatedActor actor,
        string operationCategory,
        CancellationToken cancellationToken);

    Task<StepUpFreshnessResult> EvaluateFreshnessAsync(
        StepUpFreshnessRequest request,
        CancellationToken cancellationToken);
}
