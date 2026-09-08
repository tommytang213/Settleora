import 'dart:async';
import 'dart:io';

import 'package:settleora_api_client/settleora_api.dart' as api;

import '../api/settleora_api_client.dart';

abstract interface class SettleoraServerConnectionProbe {
  Future<void> verify(Uri baseUri);
}

enum SettleoraServerConnectionFailureKind { unavailable, incompatible }

class SettleoraServerConnectionFailure implements Exception {
  const SettleoraServerConnectionFailure(this.kind);

  final SettleoraServerConnectionFailureKind kind;

  @override
  String toString() => 'SettleoraServerConnectionFailure($kind)';
}

typedef SettleoraBootstrapStatusRequest =
    Future<api.BootstrapStatusResponse> Function(api.SettleoraApiClient client);

class GeneratedSettleoraServerConnectionProbe
    implements SettleoraServerConnectionProbe {
  const GeneratedSettleoraServerConnectionProbe({
    this.clientFactory = const SettleoraGeneratedApiClientFactory(),
    this.timeout = const Duration(seconds: 10),
    this.bootstrapStatusRequest = _getBootstrapStatus,
  });

  final SettleoraGeneratedApiClientFactory clientFactory;
  final Duration timeout;
  final SettleoraBootstrapStatusRequest bootstrapStatusRequest;

  @override
  Future<void> verify(Uri baseUri) async {
    final client = clientFactory.create(
      SettleoraApiConfiguration(baseUri: baseUri),
    );

    try {
      // Successful completion proves that the candidate answered with the
      // generated Settleora bootstrap-status response shape. The returned
      // first-owner state is deliberately not exposed or interpreted here.
      await bootstrapStatusRequest(client).timeout(timeout);
    } on TimeoutException {
      throw const SettleoraServerConnectionFailure(
        SettleoraServerConnectionFailureKind.unavailable,
      );
    } on SocketException {
      throw const SettleoraServerConnectionFailure(
        SettleoraServerConnectionFailureKind.unavailable,
      );
    } on api.SettleoraApiException {
      throw const SettleoraServerConnectionFailure(
        SettleoraServerConnectionFailureKind.unavailable,
      );
    } on FormatException {
      throw const SettleoraServerConnectionFailure(
        SettleoraServerConnectionFailureKind.incompatible,
      );
    } on TypeError {
      throw const SettleoraServerConnectionFailure(
        SettleoraServerConnectionFailureKind.incompatible,
      );
    } catch (_) {
      throw const SettleoraServerConnectionFailure(
        SettleoraServerConnectionFailureKind.incompatible,
      );
    }
  }

  static Future<api.BootstrapStatusResponse> _getBootstrapStatus(
    api.SettleoraApiClient client,
  ) {
    return client.getAuthBootstrapStatus();
  }
}
