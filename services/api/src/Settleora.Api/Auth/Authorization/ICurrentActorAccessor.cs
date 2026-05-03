namespace Settleora.Api.Auth.Authorization;

internal interface ICurrentActorAccessor
{
    bool TryGetCurrentActor(out AuthenticatedActor actor);
}
