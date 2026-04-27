# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY services/api/src/Settleora.Api/Settleora.Api.csproj services/api/src/Settleora.Api/
RUN dotnet restore services/api/src/Settleora.Api/Settleora.Api.csproj

COPY services/api/src/Settleora.Api/ services/api/src/Settleora.Api/
RUN dotnet publish services/api/src/Settleora.Api/Settleora.Api.csproj \
    --configuration Release \
    --output /app/publish \
    --no-restore \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Settleora.Api.dll"]
