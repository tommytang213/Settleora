import 'sync_queue.dart';
import 'sync_repository.dart';

class SettleoraSyncChangeFeedHydrationSeam {
  const SettleoraSyncChangeFeedHydrationSeam({
    required SettleoraSyncRepository repository,
  }) : _repository = repository;

  final SettleoraSyncRepository _repository;

  Future<SettleoraSyncChangeFeedHydrationResult> readMetadataOnlyChanges({
    int? sinceVersion,
    int? limit,
    SettleoraSyncResourceType? resourceType,
  }) async {
    final boundedSinceVersion = _boundedSinceVersion(sinceVersion);
    final boundedLimit = _boundedLimit(limit);
    final boundedResourceType = _boundedResourceType(resourceType);

    final feed = await _repository.listChanges(
      sinceVersion: boundedSinceVersion,
      limit: boundedLimit,
      resourceType: boundedResourceType,
    );

    return SettleoraSyncChangeFeedHydrationResult(
      feed: feed,
      metadataOnly: true,
      persistentCacheHydrated: false,
      mobileBusinessTruthAccepted: false,
    );
  }
}

class SettleoraSyncChangeFeedHydrationResult {
  const SettleoraSyncChangeFeedHydrationResult({
    required this.feed,
    required this.metadataOnly,
    required this.persistentCacheHydrated,
    required this.mobileBusinessTruthAccepted,
  });

  final SettleoraSyncChangeFeed feed;
  final bool metadataOnly;
  final bool persistentCacheHydrated;
  final bool mobileBusinessTruthAccepted;
}

int? _boundedSinceVersion(int? value) {
  if (value == null) {
    return null;
  }

  if (value < 0) {
    throw const SettleoraSyncFailure(
      kind: SettleoraSyncFailureKind.validation,
      message: 'Choose a valid sync version.',
      safeErrorCode: 'invalid_since_version',
    );
  }

  return value;
}

int? _boundedLimit(int? value) {
  if (value == null) {
    return null;
  }

  if (value < 1 || value > 100) {
    throw const SettleoraSyncFailure(
      kind: SettleoraSyncFailureKind.validation,
      message: 'Choose a sync change limit from 1 to 100.',
      safeErrorCode: 'invalid_limit',
    );
  }

  return value;
}

SettleoraSyncResourceType? _boundedResourceType(
  SettleoraSyncResourceType? value,
) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) {
    return null;
  }

  if (!SettleoraSyncResourceTypeValues.values.contains(trimmed)) {
    throw const SettleoraSyncFailure(
      kind: SettleoraSyncFailureKind.validation,
      message: 'Choose a supported sync resource type.',
      safeErrorCode: 'unsupported_resource_type',
    );
  }

  return trimmed;
}
