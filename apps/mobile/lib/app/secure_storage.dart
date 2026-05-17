import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'app_configuration.dart';

abstract interface class SecureKeyValueStore {
  Future<String?> read(String key);

  Future<void> write(String key, String value);

  Future<void> delete(String key);
}

class FlutterSecureKeyValueStore implements SecureKeyValueStore {
  FlutterSecureKeyValueStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) {
    return _storage.read(key: key);
  }

  @override
  Future<void> write(String key, String value) {
    return _storage.write(key: key, value: value);
  }

  @override
  Future<void> delete(String key) {
    return _storage.delete(key: key);
  }
}

abstract interface class SettleoraSecureStorageBoundary {
  Future<SettleoraAppConfiguration?> readAppConfiguration();

  Future<void> writeAppConfiguration(SettleoraAppConfiguration configuration);

  Future<SettleoraServerSessionMaterial?> readServerSession();

  Future<void> writeServerSession(SettleoraServerSessionMaterial session);

  Future<void> clearServerSession();
}

class SettleoraSecureStorage implements SettleoraSecureStorageBoundary {
  SettleoraSecureStorage({SecureKeyValueStore? keyValueStore})
    : _keyValueStore = keyValueStore ?? FlutterSecureKeyValueStore();

  final SecureKeyValueStore _keyValueStore;

  @override
  Future<SettleoraAppConfiguration?> readAppConfiguration() async {
    final raw = await _keyValueStore.read(_appConfigurationKey);
    if (raw == null || raw.trim().isEmpty) {
      return null;
    }

    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) {
        return null;
      }

      return SettleoraAppConfiguration.fromJson(
        Map<String, Object?>.from(decoded),
      );
    } on FormatException {
      return null;
    } on TypeError {
      return null;
    }
  }

  @override
  Future<void> writeAppConfiguration(SettleoraAppConfiguration configuration) {
    return _keyValueStore.write(
      _appConfigurationKey,
      jsonEncode(configuration.toJson()),
    );
  }

  @override
  Future<SettleoraServerSessionMaterial?> readServerSession() async {
    final raw = await _keyValueStore.read(_serverSessionKey);
    if (raw == null || raw.trim().isEmpty) {
      return null;
    }

    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) {
        return null;
      }

      return SettleoraServerSessionMaterial.fromJson(
        Map<String, Object?>.from(decoded),
      );
    } on FormatException {
      return null;
    } on TypeError {
      return null;
    }
  }

  @override
  Future<void> writeServerSession(SettleoraServerSessionMaterial session) {
    return _keyValueStore.write(
      _serverSessionKey,
      jsonEncode(session.toJson()),
    );
  }

  @override
  Future<void> clearServerSession() {
    return _keyValueStore.delete(_serverSessionKey);
  }
}

class SettleoraServerSessionMaterial {
  const SettleoraServerSessionMaterial({
    required this.accessToken,
    this.accessSessionExpiresAtUtc,
    this.refreshCredential,
    this.refreshIdleExpiresAtUtc,
    this.refreshAbsoluteExpiresAtUtc,
  });

  final String accessToken;
  final DateTime? accessSessionExpiresAtUtc;
  final String? refreshCredential;
  final DateTime? refreshIdleExpiresAtUtc;
  final DateTime? refreshAbsoluteExpiresAtUtc;

  bool hasUsableAccessToken({DateTime? now}) {
    if (accessToken.trim().isEmpty) {
      return false;
    }

    final expiresAt = accessSessionExpiresAtUtc;
    if (expiresAt == null) {
      return true;
    }

    return expiresAt.toUtc().isAfter((now ?? DateTime.now()).toUtc());
  }

  bool shouldRefreshAccessToken({DateTime? now, Duration? refreshSkew}) {
    if (accessToken.trim().isEmpty) {
      return true;
    }

    final expiresAt = accessSessionExpiresAtUtc;
    if (expiresAt == null) {
      return false;
    }

    final currentTime = (now ?? DateTime.now()).toUtc();
    final skew = refreshSkew ?? Duration.zero;
    return !expiresAt.toUtc().isAfter(currentTime.add(skew));
  }

  bool hasUsableRefreshCredential({DateTime? now}) {
    final credential = refreshCredential?.trim();
    if (credential == null || credential.isEmpty) {
      return false;
    }

    final currentTime = (now ?? DateTime.now()).toUtc();
    final idleExpiresAt = refreshIdleExpiresAtUtc;
    if (idleExpiresAt == null || !idleExpiresAt.toUtc().isAfter(currentTime)) {
      return false;
    }

    final absoluteExpiresAt = refreshAbsoluteExpiresAtUtc;
    if (absoluteExpiresAt == null ||
        !absoluteExpiresAt.toUtc().isAfter(currentTime)) {
      return false;
    }

    return true;
  }

  Map<String, Object?> toJson() {
    return {
      'accessToken': accessToken,
      if (accessSessionExpiresAtUtc != null)
        'accessSessionExpiresAtUtc': accessSessionExpiresAtUtc!
            .toUtc()
            .toIso8601String(),
      if (refreshCredential != null) 'refreshCredential': refreshCredential,
      if (refreshIdleExpiresAtUtc != null)
        'refreshIdleExpiresAtUtc': refreshIdleExpiresAtUtc!
            .toUtc()
            .toIso8601String(),
      if (refreshAbsoluteExpiresAtUtc != null)
        'refreshAbsoluteExpiresAtUtc': refreshAbsoluteExpiresAtUtc!
            .toUtc()
            .toIso8601String(),
    };
  }

  static SettleoraServerSessionMaterial fromJson(Map<String, Object?> json) {
    final accessToken = json['accessToken'];
    if (accessToken is! String) {
      throw const FormatException('Session is missing access material.');
    }

    return SettleoraServerSessionMaterial(
      accessToken: accessToken,
      accessSessionExpiresAtUtc: _readDateTime(
        json['accessSessionExpiresAtUtc'],
      ),
      refreshCredential: _readNullableString(json['refreshCredential']),
      refreshIdleExpiresAtUtc: _readDateTime(json['refreshIdleExpiresAtUtc']),
      refreshAbsoluteExpiresAtUtc: _readDateTime(
        json['refreshAbsoluteExpiresAtUtc'],
      ),
    );
  }

  @override
  String toString() {
    return 'SettleoraServerSessionMaterial(redacted)';
  }
}

DateTime? _readDateTime(Object? value) {
  if (value == null) {
    return null;
  }

  if (value is! String) {
    throw const FormatException('Session timestamp is invalid.');
  }

  return DateTime.parse(value).toUtc();
}

String? _readNullableString(Object? value) {
  if (value == null) {
    return null;
  }

  if (value is! String) {
    throw const FormatException('Session field is invalid.');
  }

  return value;
}

const _appConfigurationKey = 'settleora.app_configuration.v1';
const _serverSessionKey = 'settleora.server_session.v1';
