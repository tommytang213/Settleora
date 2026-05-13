import 'dart:io';

import 'package:settleora_api_client/settleora_api.dart' as api;

class SettleoraApiConfiguration {
  const SettleoraApiConfiguration({required this.baseUri});

  final Uri baseUri;
}

abstract interface class SettleoraAccessTokenProvider {
  Future<String?> accessToken();
}

class NoSettleoraAccessTokenProvider implements SettleoraAccessTokenProvider {
  const NoSettleoraAccessTokenProvider();

  @override
  Future<String?> accessToken() async => null;
}

class SettleoraGeneratedApiClientFactory {
  const SettleoraGeneratedApiClientFactory({this.httpClient});

  final HttpClient? httpClient;

  api.SettleoraApiClient create(SettleoraApiConfiguration configuration) {
    return api.SettleoraApiClient(
      baseUri: configuration.baseUri,
      httpClient: httpClient,
    );
  }
}
