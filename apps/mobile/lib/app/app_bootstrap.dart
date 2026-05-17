import 'package:flutter/material.dart';

import '../api/settleora_api_client.dart';
import '../receipt_ocr_review/generated_receipt_ocr_review_repository.dart';
import '../receipt_ocr_review/receipt_ocr_review_repository.dart';
import 'app_configuration.dart';
import 'auth_session_repository.dart';
import 'secure_session_access_token_provider.dart';
import 'secure_storage.dart';
import 'server_mode_shell.dart';
import 'setup_screen.dart';
import 'sign_in_screen.dart';

typedef ReceiptOcrReviewRepositoryFactory =
    ReceiptOcrReviewRepository Function(
      SettleoraApiConfiguration configuration,
      SettleoraAccessTokenProvider accessTokenProvider,
    );

typedef SettleoraAuthRepositoryFactory =
    SettleoraAuthRepository Function(SettleoraApiConfiguration configuration);

class SettleoraAppBootstrap extends StatefulWidget {
  const SettleoraAppBootstrap({
    super.key,
    required this.secureStorage,
    this.receiptOcrReviewRepositoryFactory =
        _defaultReceiptOcrReviewRepositoryFactory,
    this.authRepositoryFactory = _defaultAuthRepositoryFactory,
    this.now,
  });

  final SettleoraSecureStorageBoundary secureStorage;
  final ReceiptOcrReviewRepositoryFactory receiptOcrReviewRepositoryFactory;
  final SettleoraAuthRepositoryFactory authRepositoryFactory;
  final DateTime Function()? now;

  @override
  State<SettleoraAppBootstrap> createState() => _SettleoraAppBootstrapState();
}

class _SettleoraAppBootstrapState extends State<SettleoraAppBootstrap> {
  _BootstrapSnapshot? _snapshot;
  bool _isLoading = true;
  bool _loadFailed = false;
  bool _isEditingConfiguration = false;
  SettleoraAuthFailure? _currentUserFailure;
  String? _signInNotice;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  Future<void> _load({String? signInNotice}) async {
    setState(() {
      _isLoading = true;
      _loadFailed = false;
      _currentUserFailure = null;
      _signInNotice = signInNotice;
    });

    try {
      final configuration = await widget.secureStorage.readAppConfiguration();
      var session = await widget.secureStorage.readServerSession();
      SettleoraCurrentUser? currentUser;
      var hasUsableServerSession = false;

      if (configuration?.mode == SettleoraAppMode.server && session != null) {
        final baseUri = configuration?.serverBaseUri;
        if (baseUri != null) {
          final authRepository = widget.authRepositoryFactory(
            SettleoraApiConfiguration(baseUri: baseUri),
          );
          final tokenProvider = SecureSessionAccessTokenProvider(
            secureStorage: widget.secureStorage,
            authRepository: authRepository,
            now: widget.now,
          );

          try {
            final accessToken = await tokenProvider.accessToken();
            if (accessToken == null || accessToken.trim().isEmpty) {
              session = null;
              _signInNotice = 'Your saved session expired. Sign in again.';
            } else {
              currentUser = await authRepository.currentUser(
                accessToken: accessToken,
              );
              session = await widget.secureStorage.readServerSession();
              hasUsableServerSession = session != null;
            }
          } on SettleoraAuthFailure catch (failure) {
            if (_requiresFreshSignIn(failure)) {
              await widget.secureStorage.clearServerSession();
              session = null;
              hasUsableServerSession = false;
              _signInNotice = failure.message;
            } else {
              _currentUserFailure = failure;
            }
          }
        }
      }

      if (!mounted) {
        return;
      }

      setState(() {
        _snapshot = _BootstrapSnapshot(
          configuration: configuration,
          hasUsableServerSession: hasUsableServerSession && session != null,
          currentUser: currentUser,
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

  Future<void> _signIn(SettleoraSignInSubmission submission) async {
    final baseUri = _snapshot?.configuration?.serverBaseUri;
    if (baseUri == null) {
      throw const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.validation,
        message: 'Save a server before signing in.',
      );
    }

    final repository = widget.authRepositoryFactory(
      SettleoraApiConfiguration(baseUri: baseUri),
    );
    final session = await repository.signIn(submission);
    try {
      await widget.secureStorage.writeServerSession(session);
    } catch (_) {
      throw const SettleoraAuthFailure(
        kind: SettleoraAuthFailureKind.storage,
        message:
            'Sign-in could not be saved on this device. Try again after secure storage is ready.',
      );
    }

    await _load();
  }

  Future<void> _clearSessionAndLoad(String? signInNotice) async {
    await widget.secureStorage.clearServerSession();
    if (!mounted) {
      return;
    }

    await _load(signInNotice: signInNotice);
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
          onPressed: () => _load(),
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
    if (baseUri == null) {
      return SettleoraSetupScreen(
        initialConfiguration: configuration,
        onSaveConfiguration: _saveConfiguration,
      );
    }

    final currentUserFailure = _currentUserFailure;
    if (currentUserFailure != null) {
      return _BootstrapStateScreen(
        icon: Icons.cloud_off_outlined,
        title: currentUserFailure.title,
        message: currentUserFailure.message,
        action: Wrap(
          alignment: WrapAlignment.center,
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              key: const Key('bootstrap-current-user-retry'),
              onPressed: () => _load(),
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
            OutlinedButton.icon(
              key: const Key('bootstrap-change-server'),
              onPressed: _editConfiguration,
              icon: const Icon(Icons.tune_outlined),
              label: const Text('Change Server'),
            ),
          ],
        ),
      );
    }

    if (!snapshot!.hasUsableServerSession || snapshot.currentUser == null) {
      return SettleoraSignInScreen(
        serverBaseUri: baseUri,
        onSignIn: _signIn,
        onChangeServer: _editConfiguration,
        noticeMessage: _signInNotice,
      );
    }

    final authRepository = widget.authRepositoryFactory(
      SettleoraApiConfiguration(baseUri: baseUri),
    );
    final tokenProvider = SecureSessionAccessTokenProvider(
      secureStorage: widget.secureStorage,
      authRepository: authRepository,
      now: widget.now,
    );
    final repository = widget.receiptOcrReviewRepositoryFactory(
      SettleoraApiConfiguration(baseUri: baseUri),
      tokenProvider,
    );

    return SettleoraAuthenticatedServerShell(
      currentUser: snapshot.currentUser!,
      receiptOcrReviewRepository: repository,
      authRepository: authRepository,
      accessTokenProvider: tokenProvider,
      onSessionEnded: _clearSessionAndLoad,
    );
  }
}

class _BootstrapSnapshot {
  const _BootstrapSnapshot({
    required this.configuration,
    required this.hasUsableServerSession,
    required this.currentUser,
  });

  final SettleoraAppConfiguration? configuration;
  final bool hasUsableServerSession;
  final SettleoraCurrentUser? currentUser;
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

SettleoraAuthRepository _defaultAuthRepositoryFactory(
  SettleoraApiConfiguration configuration,
) {
  return GeneratedSettleoraAuthRepository.fromConfiguration(
    configuration: configuration,
  );
}

bool _requiresFreshSignIn(SettleoraAuthFailure failure) {
  return switch (failure.kind) {
    SettleoraAuthFailureKind.sessionExpired ||
    SettleoraAuthFailureKind.invalidCredentials => true,
    SettleoraAuthFailureKind.validation ||
    SettleoraAuthFailureKind.tooManyAttempts ||
    SettleoraAuthFailureKind.denied ||
    SettleoraAuthFailureKind.unavailable ||
    SettleoraAuthFailureKind.conflict ||
    SettleoraAuthFailureKind.network ||
    SettleoraAuthFailureKind.server ||
    SettleoraAuthFailureKind.storage => false,
  };
}
