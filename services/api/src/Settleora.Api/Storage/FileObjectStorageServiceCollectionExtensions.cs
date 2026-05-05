using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Storage;

internal static class FileObjectStorageServiceCollectionExtensions
{
    public static IServiceCollection AddFileObjectStorage(this IServiceCollection services)
    {
        services.TryAddScoped<IFileObjectStorageProvider, LocalFileObjectStorageProvider>();

        return services;
    }
}
