import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/server_connection_probe.dart';
import 'package:settleora_api_client/settleora_api.dart' as api;

void main() {
  test(
    'uses the generated anonymous bootstrap-status method and ignores true',
    () async {
      Uri? capturedBaseUri;
      final probe = GeneratedSettleoraServerConnectionProbe(
        bootstrapStatusRequest: (client) async {
          capturedBaseUri = client.baseUri;
          return const api.BootstrapStatusResponse(bootstrapRequired: true);
        },
      );

      await probe.verify(Uri.parse('https://settleora.example/'));
      expect(capturedBaseUri, Uri.parse('https://settleora.example/'));
    },
  );

  test('ignores false bootstrap state identically', () async {
    final probe = GeneratedSettleoraServerConnectionProbe(
      bootstrapStatusRequest: (_) async =>
          const api.BootstrapStatusResponse(bootstrapRequired: false),
    );

    await expectLater(
      probe.verify(Uri.parse('https://settleora.example/')),
      completes,
    );
  });

  test('maps timeout, transport, API, and malformed failures safely', () async {
    final cases = <(Object, SettleoraServerConnectionFailureKind)>[
      (
        TimeoutException('raw timeout detail'),
        SettleoraServerConnectionFailureKind.unavailable,
      ),
      (
        const SocketException('raw host detail'),
        SettleoraServerConnectionFailureKind.unavailable,
      ),
      (
        const api.SettleoraApiException(503, 'raw reason', {'secret': 'body'}),
        SettleoraServerConnectionFailureKind.unavailable,
      ),
      (
        const FormatException('raw malformed body'),
        SettleoraServerConnectionFailureKind.incompatible,
      ),
      (
        StateError('raw unexpected state'),
        SettleoraServerConnectionFailureKind.incompatible,
      ),
    ];

    for (final entry in cases) {
      final probe = GeneratedSettleoraServerConnectionProbe(
        bootstrapStatusRequest: (_) async => throw entry.$1,
      );
      final failure = await captureFailure(
        () => probe.verify(Uri.parse('https://settleora.example/')),
      );
      expect(failure.kind, entry.$2);
      expect(failure.toString(), isNot(contains('raw')));
      expect(failure.toString(), isNot(contains('secret')));
    }
  });

  test(
    'probe-local timeout bounds completion without transport policy changes',
    () async {
      var createdClients = 0;
      final probe = GeneratedSettleoraServerConnectionProbe(
        timeout: const Duration(milliseconds: 1),
        httpClientFactory: () {
          createdClients += 1;
          return HttpClient();
        },
        bootstrapStatusRequest: (_) =>
            Completer<api.BootstrapStatusResponse>().future,
      );

      final failure = await captureFailure(
        () => probe.verify(Uri.parse('https://settleora.example/')),
      );
      expect(failure.kind, SettleoraServerConnectionFailureKind.unavailable);
      expect(createdClients, 1);
    },
  );
}

Future<SettleoraServerConnectionFailure> captureFailure(
  Future<void> Function() action,
) async {
  try {
    await action();
  } on SettleoraServerConnectionFailure catch (failure) {
    return failure;
  }
  throw StateError('Expected a SettleoraServerConnectionFailure.');
}
