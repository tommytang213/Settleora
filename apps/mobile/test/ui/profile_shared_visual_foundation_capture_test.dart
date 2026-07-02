import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/ui/settleora_components.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260702-2204-mobile-shared-visual-foundation';

void main() {
  testWidgets('captures profile shared visual foundation evidence', (
    tester,
  ) async {
    await tester.runAsync(() async {
      await loadSettleoraVisualTestFonts();
      await Directory(_visualOutputDir).create(recursive: true);
    });
    await setSettleoraMobileViewport(tester);

    const captureKey = Key('profile-shared-visual-foundation-capture');

    await tester.pumpWidget(
      RepaintBoundary(
        key: captureKey,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: SettleoraTheme.light(),
          home: const Scaffold(
            body: SafeArea(
              child: SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(16, 12, 16, 28),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SettleoraListRow(
                      leadingIcon: Icons.person_outline,
                      title: 'Taylor',
                      subtitle: 'Signed in - USD',
                    ),
                    SizedBox(height: 12),
                    SettleoraInlinePanel(
                      icon: Icons.privacy_tip_outlined,
                      title: 'Account visibility',
                      message:
                          'Account and profile details are shown only after sign-in. Refresh if something looks stale before sharing payment information.',
                      variant: SettleoraSurfaceVariant.info,
                    ),
                    SizedBox(height: 20),
                    SettleoraSection(
                      title: 'Payment Details',
                      children: [
                        AppCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SettleoraCompactHeader(
                                leadingIcon: Icons.payments_outlined,
                                title: 'Payment details on file',
                                subtitle:
                                    'Settlement counterparties means details can be shown only inside an eligible settlement or payment relationship.',
                              ),
                              SizedBox(height: 12),
                              SettleoraKeyValueText(
                                label: 'Method',
                                value: 'Bank transfer',
                                labelWidth: 78,
                                valueAlignment: Alignment.centerLeft,
                                valueTextAlign: TextAlign.start,
                              ),
                              SettleoraKeyValueText(
                                label: 'Handle',
                                value: 'pay.example/taylor',
                                labelWidth: 78,
                                valueAlignment: Alignment.centerLeft,
                                valueTextAlign: TextAlign.start,
                              ),
                              SettleoraKeyValueText(
                                label: 'Visibility',
                                value: 'Settlement counterparties',
                                labelWidth: 78,
                                valueAlignment: Alignment.centerLeft,
                                valueTextAlign: TextAlign.start,
                              ),
                            ],
                          ),
                        ),
                        SizedBox(height: 12),
                        SettleoraListRow(
                          leadingIcon: Icons.check_circle_outline,
                          title: 'QR available',
                          subtitle: 'image/png - 2.0 KB - updated today.',
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(SettleoraListRow), findsNWidgets(2));
    expect(find.byType(SettleoraInlinePanel), findsOneWidget);
    expect(find.byType(SettleoraCompactHeader), findsOneWidget);
    await _captureBoundary(
      tester,
      captureKey,
      'profile-shared-visual-foundation-390x844.png',
    );
  });
}

Future<void> _captureBoundary(
  WidgetTester tester,
  Key key,
  String fileName,
) async {
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(key),
    );
    final image = await boundary.toImage(pixelRatio: 1);
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    await File(
      '$_visualOutputDir/$fileName',
    ).writeAsBytes(byteData!.buffer.asUint8List());
  });
}
