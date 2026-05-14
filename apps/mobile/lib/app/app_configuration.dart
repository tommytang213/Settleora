import 'dart:io';

enum SettleoraAppMode {
  local,
  server;

  String get storageValue {
    return switch (this) {
      SettleoraAppMode.local => 'local',
      SettleoraAppMode.server => 'server',
    };
  }

  static SettleoraAppMode? fromStorageValue(Object? value) {
    return switch (value) {
      'local' => SettleoraAppMode.local,
      'server' => SettleoraAppMode.server,
      _ => null,
    };
  }
}

class SettleoraAppConfiguration {
  const SettleoraAppConfiguration.local()
    : mode = SettleoraAppMode.local,
      serverBaseUri = null;

  const SettleoraAppConfiguration.server({required Uri this.serverBaseUri})
    : mode = SettleoraAppMode.server;

  final SettleoraAppMode mode;
  final Uri? serverBaseUri;

  Map<String, Object?> toJson() {
    return {
      'mode': mode.storageValue,
      if (serverBaseUri != null) 'serverBaseUri': serverBaseUri.toString(),
    };
  }

  static SettleoraAppConfiguration fromJson(Map<String, Object?> json) {
    final mode = SettleoraAppMode.fromStorageValue(json['mode']);
    if (mode == SettleoraAppMode.local) {
      return const SettleoraAppConfiguration.local();
    }

    if (mode == SettleoraAppMode.server) {
      final rawBaseUri = json['serverBaseUri'];
      if (rawBaseUri is! String) {
        throw const FormatException('Server configuration is missing.');
      }

      final validation = validateServerBaseUri(rawBaseUri);
      final normalized = validation.normalizedUri;
      if (normalized == null) {
        throw const FormatException('Server configuration is invalid.');
      }

      return SettleoraAppConfiguration.server(serverBaseUri: normalized);
    }

    throw const FormatException('App mode is invalid.');
  }
}

class ServerBaseUriValidationResult {
  const ServerBaseUriValidationResult._({
    required this.normalizedUri,
    required this.errorMessage,
    required this.isLocalDevelopmentHttp,
  });

  const ServerBaseUriValidationResult.valid(
    Uri normalizedUri, {
    bool isLocalDevelopmentHttp = false,
  }) : this._(
         normalizedUri: normalizedUri,
         errorMessage: null,
         isLocalDevelopmentHttp: isLocalDevelopmentHttp,
       );

  const ServerBaseUriValidationResult.invalid(String errorMessage)
    : this._(
        normalizedUri: null,
        errorMessage: errorMessage,
        isLocalDevelopmentHttp: false,
      );

  final Uri? normalizedUri;
  final String? errorMessage;
  final bool isLocalDevelopmentHttp;

  bool get isValid => normalizedUri != null;

  String? get warningMessage {
    if (!isLocalDevelopmentHttp) {
      return null;
    }

    return 'HTTP is saved only for a local development server.';
  }
}

ServerBaseUriValidationResult validateServerBaseUri(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    return const ServerBaseUriValidationResult.invalid(
      'Enter a server base URL.',
    );
  }

  final parsed = Uri.tryParse(trimmed);
  if (parsed == null || !parsed.hasScheme || parsed.host.isEmpty) {
    return const ServerBaseUriValidationResult.invalid(
      'Use an absolute URL such as https://settleora.example.',
    );
  }

  if (parsed.userInfo.isNotEmpty) {
    return const ServerBaseUriValidationResult.invalid(
      'Remove usernames and passwords from the URL.',
    );
  }

  if (parsed.hasQuery || parsed.hasFragment) {
    return const ServerBaseUriValidationResult.invalid(
      'Remove query strings and fragments from the URL.',
    );
  }

  final scheme = parsed.scheme.toLowerCase();
  if (scheme != 'https' && scheme != 'http') {
    return const ServerBaseUriValidationResult.invalid(
      'Use an HTTPS URL, or HTTP only for local development.',
    );
  }

  final host = parsed.host.toLowerCase();
  final isLocalDevelopmentHttp =
      scheme == 'http' && _isLocalDevelopmentHost(host);
  if (scheme == 'http' && !isLocalDevelopmentHttp) {
    return const ServerBaseUriValidationResult.invalid(
      'HTTP is allowed only for localhost, loopback, or local development.',
    );
  }

  final normalized = parsed.normalizePath().replace(
    scheme: scheme,
    host: host,
    path: _normalizeBasePath(parsed.normalizePath().path),
  );

  return ServerBaseUriValidationResult.valid(
    normalized,
    isLocalDevelopmentHttp: isLocalDevelopmentHttp,
  );
}

String _normalizeBasePath(String value) {
  var path = value.trim();
  if (path.isEmpty || path == '/') {
    return '/';
  }

  path = path.replaceFirst(RegExp(r'/+$'), '');
  return path.isEmpty ? '/' : '$path/';
}

bool _isLocalDevelopmentHost(String host) {
  final normalized = host.toLowerCase();
  if (normalized == 'localhost' ||
      normalized.endsWith('.localhost') ||
      normalized == '10.0.2.2') {
    return true;
  }

  final address = InternetAddress.tryParse(normalized);
  if (address == null) {
    return false;
  }

  if (address.type == InternetAddressType.IPv4) {
    return address.rawAddress.first == 127;
  }

  if (address.type == InternetAddressType.IPv6) {
    return address.rawAddress.take(15).every((byte) => byte == 0) &&
        address.rawAddress.last == 1;
  }

  return false;
}
