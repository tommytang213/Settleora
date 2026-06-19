using System.Text.Json;

namespace Settleora.Api.Auth;

internal enum AuthJsonRequestStatus
{
    Valid,
    Malformed,
    UnsupportedFields
}

internal sealed record AuthJsonRequestResult<TRequest>(
    AuthJsonRequestStatus Status,
    TRequest? Request);

internal static class AuthEndpointRequestValidation
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static bool RequestHasBody(HttpRequest request)
    {
        return request.ContentLength.GetValueOrDefault() > 0
            || request.Headers.TryGetValue("Transfer-Encoding", out var transferEncoding)
            && transferEncoding.Count > 0;
    }

    public static async Task<AuthJsonRequestResult<TRequest>> ReadLimitedJsonObjectAsync<TRequest>(
        HttpRequest request,
        ISet<string> allowedPropertyNames,
        CancellationToken cancellationToken)
        where TRequest : class
    {
        try
        {
            using var document = await JsonDocument.ParseAsync(
                request.Body,
                cancellationToken: cancellationToken);

            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return new AuthJsonRequestResult<TRequest>(AuthJsonRequestStatus.Malformed, null);
            }

            foreach (var property in document.RootElement.EnumerateObject())
            {
                if (!allowedPropertyNames.Contains(property.Name))
                {
                    return new AuthJsonRequestResult<TRequest>(AuthJsonRequestStatus.UnsupportedFields, null);
                }
            }

            var endpointRequest = document.RootElement.Deserialize<TRequest>(JsonOptions);
            return endpointRequest is null
                ? new AuthJsonRequestResult<TRequest>(AuthJsonRequestStatus.Malformed, null)
                : new AuthJsonRequestResult<TRequest>(AuthJsonRequestStatus.Valid, endpointRequest);
        }
        catch (JsonException)
        {
            return new AuthJsonRequestResult<TRequest>(AuthJsonRequestStatus.Malformed, null);
        }
        catch (BadHttpRequestException)
        {
            return new AuthJsonRequestResult<TRequest>(AuthJsonRequestStatus.Malformed, null);
        }
    }
}
