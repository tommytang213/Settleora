using Settleora.Api.Domain.Auth;

namespace Settleora.Api.Auth.PasswordReset;

internal sealed class PasswordResetEmailDeliveryOrchestrator
    : IPasswordResetEmailDeliveryOrchestrator
{
    private readonly IPasswordResetEmailDeliveryReadinessService readinessService;
    private readonly ILocalPasswordResetService localPasswordResetService;
    private readonly IPasswordResetEmailTemplateComposer templateComposer;
    private readonly IPasswordResetSmtpEmailSender smtpEmailSender;

    public PasswordResetEmailDeliveryOrchestrator(
        IPasswordResetEmailDeliveryReadinessService readinessService,
        ILocalPasswordResetService localPasswordResetService,
        IPasswordResetEmailTemplateComposer templateComposer,
        IPasswordResetSmtpEmailSender smtpEmailSender)
    {
        this.readinessService = readinessService;
        this.localPasswordResetService = localPasswordResetService;
        this.templateComposer = templateComposer;
        this.smtpEmailSender = smtpEmailSender;
    }

    public async Task<PasswordResetEmailDeliveryResult> DeliverAsync(
        PasswordResetEmailDeliveryRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var readiness = readinessService.GetReadiness();
        if (!readiness.Ready)
        {
            return PasswordResetEmailDeliveryResult.DisabledOrNotReady(readiness);
        }

        var materialResult = await localPasswordResetService.IssueMaterialAsync(
            new LocalPasswordResetMaterialIssueRequest(
                request.SubmittedIdentifier,
                AuthPasswordResetMaterialScopes.EmailLink,
                TimeSpan.FromMinutes(readiness.ResetLinkLifetimeMinutes),
                request.SourceBucketRef,
                request.RequestCorrelationId),
            cancellationToken);

        if (!materialResult.Succeeded
            || string.IsNullOrWhiteSpace(materialResult.RawResetMaterial))
        {
            return PasswordResetEmailDeliveryResult.BlockedDecisionRequired(
                readiness,
                PasswordResetEmailDeliveryFailureCategories.MaterialNotIssued);
        }

        var composition = templateComposer.Compose(
            new PasswordResetEmailTemplateCompositionRequest(materialResult.RawResetMaterial));
        if (!composition.Available
            || composition.SendReadyMessage is null)
        {
            return PasswordResetEmailDeliveryResult.InvalidPolicy(
                readiness,
                composition.FailureCategories.Count is > 0
                    ? composition.FailureCategories
                    : [composition.Category]);
        }

        if (PasswordResetEmailDeliveryModes.IsSinkMode(composition.DeliveryMode))
        {
            return PasswordResetEmailDeliveryResult.SinkRecorded(composition);
        }

        if (string.IsNullOrWhiteSpace(request.RecipientEmailAddress))
        {
            return PasswordResetEmailDeliveryResult.InvalidPolicy(
                readiness,
                [PasswordResetEmailDeliveryFailureCategories.RecipientUnavailable]);
        }

        var sendResult = await smtpEmailSender.SendAsync(
            new PasswordResetSmtpEmailSendRequest(
                request.RecipientEmailAddress,
                composition.SendReadyMessage),
            cancellationToken);

        return sendResult.Accepted
            ? PasswordResetEmailDeliveryResult.ProviderAccepted(composition, sendResult)
            : PasswordResetEmailDeliveryResult.ProviderFailedRedacted(composition, sendResult);
    }
}
