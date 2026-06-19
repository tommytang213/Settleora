namespace Settleora.Api.RequestValidation;

internal static class UnsupportedRequestFieldGuards
{
    public static bool TryRejectNoBodyReadEnvelope(
        HttpRequest request,
        string title,
        string detail,
        string bodyMessage,
        out IResult result)
    {
        if (TryRejectQueryFields(request, title, detail, out result))
        {
            return true;
        }

        if (RequestHasBody(request))
        {
            result = Results.ValidationProblem(
                new Dictionary<string, string[]>(StringComparer.Ordinal)
                {
                    ["body"] = [bodyMessage]
                },
                title: title,
                detail: detail,
                statusCode: StatusCodes.Status400BadRequest);
            return true;
        }

        result = null!;
        return false;
    }

    public static bool TryRejectQueryFields(
        HttpRequest request,
        string title,
        string detail,
        out IResult result)
    {
        if (request.Query.Count == 0)
        {
            result = null!;
            return false;
        }

        result = Results.ValidationProblem(
            new Dictionary<string, string[]>(StringComparer.Ordinal)
            {
                ["query"] = ["Unsupported query fields are not allowed."]
            },
            title: title,
            detail: detail,
            statusCode: StatusCodes.Status400BadRequest);
        return true;
    }

    public static bool RequestHasBody(HttpRequest request)
    {
        return request.ContentLength.GetValueOrDefault() > 0
            || request.Headers.TryGetValue("Transfer-Encoding", out var transferEncoding)
            && transferEncoding.Count > 0;
    }
}
