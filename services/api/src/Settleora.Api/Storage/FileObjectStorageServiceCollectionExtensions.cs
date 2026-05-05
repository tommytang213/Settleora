using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Storage;

internal static class FileObjectStorageServiceCollectionExtensions
{
    public static IServiceCollection AddFileObjectStorage(this IServiceCollection services)
    {
        services.TryAddSingleton(TimeProvider.System);
        services.TryAddScoped<IFileObjectStorageProvider, LocalFileObjectStorageProvider>();
        services.TryAddScoped<IFileObjectLifecycleAuditWriter, EfFileObjectLifecycleAuditWriter>();
        services.TryAddScoped<IFileObjectLifecycleService, EfFileObjectLifecycleService>();

        return services;
    }
}
