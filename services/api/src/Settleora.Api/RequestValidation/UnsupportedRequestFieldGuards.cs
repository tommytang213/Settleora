namespace Settleora.Api.RequestValidation;

internal static class UnsupportedRequestFieldGuards
{
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
}
