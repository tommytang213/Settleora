import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_revision_proposal_editor_screen.dart';
import 'package:mobile/bills/bill_revision_repository.dart';
import 'package:mobile/ui/settleora_theme.dart';

import '../helpers/settleora_visual_test_fonts.dart';

const _visualOutputDir =
    '/workspace/logs/settleora-visual-qa/20260622-1717-mobile-bill-revision-money-rows';

const _billId = '22222222-2222-2222-2222-222222222222';

void main() {
  testWidgets(
    'captures bill revision money row visual QA evidence',
    (tester) async {
      await tester.runAsync(() async {
        await loadSettleoraVisualTestFonts();
        await Directory(_visualOutputDir).create(recursive: true);
      });
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;

      const editorKey = Key('bill-revision-editor-money-rows-capture');
      await _pumpEditor(tester, editorKey);
      await _captureBoundary(
        tester,
        editorKey,
        'bill-revision-editor-money-rows-showcase-390x844.png',
      );
    },
    // Blocked after writing PNG: the Flutter test runner does not exit cleanly
    // for this screenshot harness in the current DevBox.
    skip: true,
  );
}

Future<void> _pumpEditor(WidgetTester tester, Key boundaryKey) async {
  await tester.pumpWidget(
    RepaintBoundary(
      key: boundaryKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SettleoraTheme.light(),
        home: SettleoraBillRevisionProposalEditorScreen.create(
          repository: _VisualBillRevisionRepository(),
          billId: _billId,
          billLabel: 'Corner Market',
          initialProposal: _sampleProposalSnapshot(),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
}

Future<void> _captureBoundary(
  WidgetTester tester,
  Key key,
  String fileName,
) async {
  await tester.pump(const Duration(milliseconds: 100));
  final boundary = tester.renderObject<RenderRepaintBoundary>(find.byKey(key));
  final image = await boundary.toImage(pixelRatio: 1);
  final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
  final bytes = byteData!.buffer.asUint8List();
  image.dispose();
  File('$_visualOutputDir/$fileName').writeAsBytesSync(bytes);
}

SettleoraBillRevisionProposalSnapshot _sampleProposalSnapshot() {
  return const SettleoraBillRevisionProposalSnapshot(
    totalAmount: '12.00',
    totalCurrency: 'USD',
    participants: [
      SettleoraBillRevisionProposalParticipantRow(
        userProfileId: '44444444-4444-4444-4444-444444444444',
        resolvedShareAmount: '12.00',
        resolvedShareCurrency: 'USD',
      ),
    ],
    payers: [
      SettleoraBillRevisionProposalPayerRow(
        userProfileId: '44444444-4444-4444-4444-444444444444',
        amount: '12.00',
        currency: 'USD',
      ),
    ],
  );
}

class _VisualBillRevisionRepository implements SettleoraBillRevisionRepository {
  @override
  Future<List<SettleoraBillRevision>> listBillRevisions(String billId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> createBillRevision(
    String billId,
    SettleoraBillRevisionProposalSnapshot proposal,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> getBillRevision(
    String billId,
    String revisionId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> reviseBillRevision(
    String billId,
    String revisionId,
    SettleoraBillRevisionProposalSnapshot proposal,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> submitBillRevision(
    String billId,
    String revisionId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> withdrawBillRevision(
    String billId,
    String revisionId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> approveBillRevision(
    SettleoraBillRevision revision,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> rejectBillRevision(
    String billId,
    String revisionId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> confirmBillRevisionPayer(
    SettleoraBillRevision revision,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillRevision> applyBillRevision(
    String billId,
    String revisionId,
  ) {
    throw UnimplementedError();
  }
}
