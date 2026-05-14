import 'package:flutter/material.dart';

import '../api/settleora_api_client.dart';
import '../receipt_ocr_review/generated_receipt_ocr_review_repository.dart';
import '../receipt_ocr_review/receipt_ocr_review_repository.dart';
import '../receipt_ocr_review/receipt_ocr_review_screen.dart';
import 'app_configuration.dart';
import 'secure_session_access_token_provider.dart';
import 'secure_storage.dart';
import 'setup_screen.dart';

typedef ReceiptOcrReviewRepositoryFactory =
    ReceiptOcrReviewRepository Function(
      SettleoraApiConfiguration configuration,
      SettleoraAccessTokenProvider accessTokenProvider,
    );

class SettleoraAppBootstrap extends StatefulWidget {
  const SettleoraAppBootstrap({
    super.key,
    required this.secureStorage,
    this.receiptOcrReviewRepositoryFactory =
        _defaultReceiptOcrReviewRepositoryFactory,
    this.now,
  });

  final SettleoraSecureStorageBoundary secureStorage;
  final ReceiptOcrReviewRepositoryFactory receiptOcrReviewRepositoryFactory;
  final DateTime Function()? now;

  @override
  State<SettleoraAppBootstrap> createState() => _SettleoraAppBootstrapState();
}

class _SettleoraAppBootstrapState extends State<SettleoraAppBootstrap> {
  _BootstrapSnapshot? _snapshot;
  bool _isLoading = true;
  bool _loadFailed = false;
  bool _isEditingConfiguration = false;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _loadFailed = false;
    });

    try {
      final configuration = await widget.secureStorage.readAppConfiguration();
      final session = await widget.secureStorage.readServerSession();
      if (!mounted) {
        return;
      }

      setState(() {
        _snapshot = _BootstrapSnapshot(
          configuration: configuration,
          hasUsableServerSession:
              session?.hasUsableAccessToken(now: widget.now?.call()) ?? false,
        );
        _isLoading = false;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _isLoading = false;
        _loadFailed = true;
      });
    }
  }

  Future<void> _saveConfiguration(
    SettleoraAppConfiguration configuration,
  ) async {
    await widget.secureStorage.writeAppConfiguration(configuration);
    await widget.secureStorage.clearServerSession();
    if (!mounted) {
      return;
    }

    setState(() {
      _isEditingConfiguration = false;
    });
    await _load();
  }

  void _editConfiguration() {
    setState(() {
      _isEditingConfiguration = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final snapshot = _snapshot;
    final configuration = snapshot?.configuration;

    if (_isLoading) {
      return const _BootstrapStateScreen(
        icon: Icons.hourglass_top_outlined,
        title: 'Loading Settleora',
        message: 'Reading saved configuration.',
        showProgress: true,
      );
    }

    if (_loadFailed) {
      return _BootstrapStateScreen(
        icon: Icons.lock_outline,
        title: 'Configuration unavailable',
        message: 'Open the app again or retry after secure storage is ready.',
        action: OutlinedButton.icon(
          onPressed: _load,
          icon: const Icon(Icons.refresh),
          label: const Text('Retry'),
        ),
      );
    }

    if (_isEditingConfiguration || configuration == null) {
      return SettleoraSetupScreen(
        initialConfiguration: configuration,
        onSaveConfiguration: _saveConfiguration,
      );
    }

    if (configuration.mode == SettleoraAppMode.local) {
      return _BootstrapStateScreen(
        icon: Icons.phone_android_outlined,
        title: 'Local Mode',
        message:
            'This device is separate for now. Server collaboration, friends, groups, and server sync are unavailable until the local runtime exists.',
        action: FilledButton.icon(
          key: const Key('bootstrap-connect-server'),
          onPressed: _editConfiguration,
          icon: const Icon(Icons.cloud_outlined),
          label: const Text('Connect to Server'),
        ),
      );
    }

    final baseUri = configuration.serverBaseUri;
    if (baseUri == null || !snapshot!.hasUsableServerSession) {
      return _BootstrapStateScreen(
        icon: Icons.lock_outline,
        title: 'Sign in required',
        message:
            'A server is configured, but this device has no saved session yet. Sign-in UI will be added in a later slice.',
        action: OutlinedButton.icon(
          key: const Key('bootstrap-change-server'),
          onPressed: _editConfiguration,
          icon: const Icon(Icons.tune_outlined),
          label: const Text('Change Server'),
        ),
      );
    }

    final tokenProvider = SecureSessionAccessTokenProvider(
      secureStorage: widget.secureStorage,
      now: widget.now,
    );
    final repository = widget.receiptOcrReviewRepositoryFactory(
      SettleoraApiConfiguration(baseUri: baseUri),
      tokenProvider,
    );

    return ReceiptOcrReviewQueueScreen(repository: repository);
  }
}

class _BootstrapSnapshot {
  const _BootstrapSnapshot({
    required this.configuration,
    required this.hasUsableServerSession,
  });

  final SettleoraAppConfiguration? configuration;
  final bool hasUsableServerSession;
}

class _BootstrapStateScreen extends StatelessWidget {
  const _BootstrapStateScreen({
    required this.icon,
    required this.title,
    required this.message,
    this.action,
    this.showProgress = false,
  });

  final IconData icon;
  final String title;
  final String message;
  final Widget? action;
  final bool showProgress;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settleora')),
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (showProgress)
                  const CircularProgressIndicator()
                else
                  Icon(
                    icon,
                    size: 42,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                const SizedBox(height: 14),
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleLarge,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 6),
                Text(message, textAlign: TextAlign.center),
                if (action != null) ...[const SizedBox(height: 14), action!],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

ReceiptOcrReviewRepository _defaultReceiptOcrReviewRepositoryFactory(
  SettleoraApiConfiguration configuration,
  SettleoraAccessTokenProvider accessTokenProvider,
) {
  return GeneratedReceiptOcrReviewRepository.fromConfiguration(
    configuration: configuration,
    accessTokenProvider: accessTokenProvider,
  );
}
