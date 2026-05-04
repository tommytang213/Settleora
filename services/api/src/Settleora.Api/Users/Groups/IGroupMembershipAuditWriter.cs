namespace Settleora.Api.Users.Groups;

internal interface IGroupMembershipAuditWriter
{
    ValueTask WriteAsync(
        GroupMembershipAuditEvent auditEvent,
        CancellationToken cancellationToken);
}
