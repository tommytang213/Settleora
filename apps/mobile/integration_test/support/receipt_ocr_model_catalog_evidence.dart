// Recovery packs may supply bounded block evidence without owning an ordinary
// script route. Keep both identities verifiable without replacing that route.
class ReceiptOcrNativeModelCatalogEvidence {
  const ReceiptOcrNativeModelCatalogEvidence._({
    required this.detectionPackId,
    required this.packVersions,
    required this.recognizerRoutes,
    required Set<String> recognizerPackIds,
  }) : _recognizerPackIds = recognizerPackIds;

  factory ReceiptOcrNativeModelCatalogEvidence.fromJson(
    Map<String, Object?> value,
  ) {
    final rawPacks = value['packs'];
    if (rawPacks is! List<Object?> || rawPacks.isEmpty) {
      throw StateError('Native model catalog has no packs');
    }
    final versions = <String, String>{};
    final routes = <String, String>{};
    final recognizers = <String>{};
    String? detectionPackId;
    for (final rawPack in rawPacks) {
      if (rawPack is! Map<String, Object?>) {
        throw StateError('Native model catalog pack is invalid');
      }
      final packId = rawPack['modelPackId'];
      final version = rawPack['modelVersion'];
      final role = rawPack['role'];
      final rawScripts = rawPack['routeScripts'];
      if (packId is! String ||
          packId.isEmpty ||
          version is! String ||
          version.isEmpty ||
          rawScripts is! List<Object?> ||
          rawScripts.isEmpty ||
          versions.containsKey(packId)) {
        throw StateError('Native model catalog identity is invalid');
      }
      if (rawScripts.any((script) => script is! String || script.isEmpty)) {
        throw StateError('Native model catalog route is invalid');
      }
      versions[packId] = version;
      switch (role) {
        case 'detection':
          if (rawScripts.length != 1 || rawScripts.single != 'Any') {
            throw StateError('Native model catalog detection route is invalid');
          }
          if (detectionPackId != null) {
            throw StateError(
              'Native model catalog detection route is ambiguous',
            );
          }
          detectionPackId = packId;
        case 'recognition':
          recognizers.add(packId);
          for (final script in rawScripts.cast<String>()) {
            if (script == 'Any') {
              throw StateError(
                'Native model catalog recognition route is invalid',
              );
            }
            if (routes.putIfAbsent(script, () => packId) != packId) {
              throw StateError(
                'Native model catalog recognition route is ambiguous',
              );
            }
          }
        case 'recognition_recovery':
          if (rawPack['recoveryPolicy'] != 'corroborated_rupee_money' ||
              rawScripts.length != 1 ||
              rawScripts.single != 'Latin') {
            throw StateError('Native model catalog recovery route is invalid');
          }
          recognizers.add(packId);
        default:
          throw StateError('Native model catalog role is invalid');
      }
    }
    if (detectionPackId == null) {
      throw StateError('Native model catalog detection route is missing');
    }
    return ReceiptOcrNativeModelCatalogEvidence._(
      detectionPackId: detectionPackId,
      packVersions: Map.unmodifiable(versions),
      recognizerRoutes: Map.unmodifiable(routes),
      recognizerPackIds: Set.unmodifiable(recognizers),
    );
  }

  final String detectionPackId;
  final Map<String, String> packVersions;
  final Map<String, String> recognizerRoutes;
  final Set<String> _recognizerPackIds;

  String? versionFor(String? packId) => packVersions[packId];

  bool isRecognizer(String? packId) => _recognizerPackIds.contains(packId);

  String recognizerForScript(String fixtureScript) {
    final catalogScript = switch (fixtureScript) {
      'Chinese' => 'HanSimplified',
      _ => fixtureScript,
    };
    final packId = recognizerRoutes[catalogScript];
    if (packId == null) {
      throw StateError('Fixture script has no catalog recognition route');
    }
    return packId;
  }
}
