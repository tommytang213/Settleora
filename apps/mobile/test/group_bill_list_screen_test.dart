import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/bills/bill_attachment_repository.dart';
import 'package:mobile/bills/bill_list_screen.dart';
import 'package:mobile/bills/bill_revision_repository.dart';
import 'package:mobile/bills/bill_repository.dart';
import 'package:mobile/groups/group_repository.dart';

void main() {
  testWidgets('group bill list renders loading, empty, and refresh states', (
    tester,
  ) async {
    final repository = FakeBillRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillListScreen(
          repository: repository,
          groupRepository: FakeGroupRepository(),
          groupId: _groupId,
          groupName: 'Trip Crew',
        ),
      ),
    );

    expect(find.text('Loading group bills'), findsOneWidget);
    await tester.pumpAndSettle();

    expect(find.text('Trip Crew'), findsOneWidget);
    expect(find.text('No group bills'), findsOneWidget);
    expect(find.byKey(const Key('group-bill-list-create')), findsOneWidget);
    expect(find.text('Create group bill'), findsOneWidget);
    expect(find.byKey(const Key('bill-list-create')), findsNothing);
    expect(find.text('Create bill'), findsNothing);
    expect(repository.listGroupCalls, 1);

    await tester.tap(find.byKey(const Key('group-bill-list-refresh')));
    await tester.pumpAndSettle();

    expect(repository.listGroupCalls, 2);
  });

  testWidgets('group bill create stays unavailable when members fail to load', (
    tester,
  ) async {
    final billRepository = FakeBillRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillListScreen(
          repository: billRepository,
          groupRepository: FakeGroupRepository(
            memberFailure: const SettleoraGroupFailure(
              kind: SettleoraGroupFailureKind.server,
              message: 'Groups are unavailable right now. Try again later.',
            ),
          ),
          groupId: _groupId,
          groupName: 'Trip Crew',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('group-bill-list-create')));
    await tester.pumpAndSettle();

    expect(find.text('Groups unavailable'), findsOneWidget);
    expect(
      find.text('Groups are unavailable right now. Try again later.'),
      findsOneWidget,
    );
    expect(find.byKey(const Key('group-bill-save')), findsNothing);
    expect(find.byKey(const Key('group-bill-merchant-name')), findsNothing);
    expect(billRepository.createGroupCalls, 0);
    expect(billRepository.createPersonalCalls, 0);
  });

  testWidgets('group bill list shows safe error and retries', (tester) async {
    final repository = FakeBillRepository(
      listFailures: [
        const SettleoraBillFailure(
          kind: SettleoraBillFailureKind.denied,
          message: 'Bills are not available to this account.',
          statusCode: 403,
        ),
      ],
      groupBills: [sampleBillSummary()],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillListScreen(
          repository: repository,
          groupRepository: FakeGroupRepository(),
          groupId: _groupId,
          groupName: 'Trip Crew',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Bills unavailable'), findsOneWidget);
    expect(
      find.text('Bills are not available to this account.'),
      findsOneWidget,
    );

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(find.text('Corner Market'), findsOneWidget);
    expect(repository.listGroupCalls, 2);
  });

  testWidgets('group bill list opens detail and refreshes detail', (
    tester,
  ) async {
    final repository = FakeBillRepository(
      groupBills: [sampleBillSummary()],
      detail: sampleBillDetail(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillListScreen(
          repository: repository,
          groupRepository: FakeGroupRepository(),
          groupId: _groupId,
          groupName: 'Trip Crew',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();

    expect(repository.getGroupCalls, 1);
    expect(find.text('Group bill'), findsWidgets);
    expect(find.text('Items'), findsOneWidget);
    expect(find.text('Milk'), findsOneWidget);
    expect(
      find.byKey(const Key('group-bill-detail-propose-change')),
      findsNothing,
    );

    await tester.tap(find.byKey(const Key('group-bill-detail-refresh')));
    await tester.pumpAndSettle();

    expect(repository.getGroupCalls, 2);
  });

  testWidgets('group bill detail loads attachments with group route', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final attachmentRepository = FakeBillAttachmentRepository(
      attachments: [sampleAttachment()],
      downloadedBytes: const [5, 6],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillListScreen(
          repository: FakeBillRepository(
            groupBills: [sampleBillSummary()],
            detail: sampleBillDetail(),
          ),
          groupRepository: FakeGroupRepository(),
          attachmentRepository: attachmentRepository,
          groupId: _groupId,
          groupName: 'Trip Crew',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();

    expect(attachmentRepository.listCalls, 1);
    expect(attachmentRepository.lastRoute?.groupId, _groupId);
    expect(attachmentRepository.lastRoute?.billId, _billId);
    expect(find.text('Attachments'), findsOneWidget);
    expect(find.text('Supporting attachment'), findsOneWidget);

    await tester.ensureVisible(
      find.byKey(const ValueKey('group-bill-attachments-download-0')),
    );
    await tester.tap(
      find.byKey(const ValueKey('group-bill-attachments-download-0')),
    );
    await tester.pumpAndSettle();

    expect(attachmentRepository.downloadCalls, 1);
    expect(attachmentRepository.lastRoute?.groupId, _groupId);
    expect(attachmentRepository.lastRoute?.billId, _billId);
    expect(attachmentRepository.lastDownloadedFileId, _fileId);
    expect(find.text('Downloaded 2 bytes.'), findsOneWidget);
  });

  testWidgets('group bill detail creates revision from server capability', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final detail = sampleBillDetail(canCreateRevision: true);
    final repository = FakeBillRepository(
      groupBills: [sampleBillSummary()],
      details: [detail, detail, detail],
    );
    final revisionRepository = FakeBillRevisionRepository(
      createResponse: sampleRevision(id: _createdRevisionId),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillListScreen(
          repository: repository,
          groupRepository: FakeGroupRepository(),
          revisionRepository: revisionRepository,
          groupId: _groupId,
          groupName: 'Trip Crew',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('group-bill-detail-propose-change')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-revision-proposal-save')));
    await tester.pumpAndSettle();

    expect(repository.getGroupCalls, 3);
    expect(revisionRepository.createCalls, 1);
    expect(revisionRepository.lastCreatedBillId, _billId);
    expect(revisionRepository.lastProposal?.totalAmount, '10.80');
    expect(find.text('Revision review'), findsOneWidget);
  });

  testWidgets(
    'group bill detail stops stale create capability before opening',
    (tester) async {
      await useLargeSurface(tester);
      final repository = FakeBillRepository(
        groupBills: [sampleBillSummary()],
        details: [
          sampleBillDetail(canCreateRevision: true),
          sampleBillDetail(canCreateRevision: false),
        ],
      );
      final revisionRepository = FakeBillRevisionRepository();

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraGroupBillListScreen(
            repository: repository,
            groupRepository: FakeGroupRepository(),
            revisionRepository: revisionRepository,
            groupId: _groupId,
            groupName: 'Trip Crew',
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Corner Market'));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const Key('group-bill-detail-propose-change')),
      );
      await tester.pumpAndSettle();

      expect(repository.getGroupCalls, 2);
      expect(revisionRepository.createCalls, 0);
      expect(
        find.byKey(const Key('group-bill-detail-propose-change')),
        findsNothing,
      );
      expect(find.textContaining('Refresh needed'), findsOneWidget);
    },
  );

  testWidgets('group bill create save refreshes capability before mutation', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final repository = FakeBillRepository(
      groupBills: [sampleBillSummary()],
      details: [
        sampleBillDetail(canCreateRevision: true),
        sampleBillDetail(canCreateRevision: true),
        sampleBillDetail(canCreateRevision: false),
      ],
    );
    final revisionRepository = FakeBillRevisionRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillListScreen(
          repository: repository,
          groupRepository: FakeGroupRepository(),
          revisionRepository: revisionRepository,
          groupId: _groupId,
          groupName: 'Trip Crew',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Corner Market'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('group-bill-detail-propose-change')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('bill-revision-proposal-save')));
    await tester.pumpAndSettle();

    expect(repository.getGroupCalls, 3);
    expect(revisionRepository.createCalls, 0);
    expect(find.text('Refresh needed'), findsOneWidget);
    expect(
      find.text(
        'This bill can no longer accept a revision proposal. Review the refreshed bill before trying again.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('group bill create validation blocks blank fields and rows', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final billRepository = FakeBillRepository();

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillListScreen(
          repository: billRepository,
          groupRepository: FakeGroupRepository(
            members: [sampleMember(displayName: 'Taylor')],
          ),
          groupId: _groupId,
          groupName: 'Trip Crew',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('group-bill-list-create')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('group-bill-add-payer')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('group-bill-currency')), '');
    await tester.enterText(
      find.byKey(const Key('group-bill-item-currency-0')),
      '',
    );
    await tester.enterText(
      find.byKey(const Key('group-bill-split-method-0-0')),
      '',
    );
    await tester.enterText(
      find.byKey(const Key('group-bill-split-order-0-0')),
      '-1',
    );
    await tester.enterText(
      find.byKey(const Key('group-bill-payer-currency-0')),
      '',
    );
    await _tapSaveGroupBill(tester);

    expect(find.text('Enter a bill date.'), findsOneWidget);
    expect(find.text('Enter a currency.'), findsOneWidget);
    expect(find.text('Enter an item name.'), findsOneWidget);
    expect(find.text('Enter an item amount.'), findsOneWidget);
    expect(find.text('Enter an item currency.'), findsOneWidget);
    expect(find.text('Choose a member for every split.'), findsOneWidget);
    expect(find.text('Enter a split method.'), findsOneWidget);
    expect(
      find.text('Allocation order must be zero or greater.'),
      findsOneWidget,
    );
    expect(find.text('Choose a member for every payer.'), findsOneWidget);
    expect(find.text('Enter a payer amount.'), findsOneWidget);
    expect(find.text('Enter a payer currency.'), findsOneWidget);
    expect(billRepository.createGroupCalls, 0);

    await tester.tap(find.byKey(const Key('group-bill-item-remove-0')));
    await tester.pumpAndSettle();
    await _tapSaveGroupBill(tester);

    expect(find.text('Add at least one item before saving.'), findsOneWidget);
    expect(billRepository.createGroupCalls, 0);
  });

  testWidgets('group bill create member menus use active members only', (
    tester,
  ) async {
    await useLargeSurface(tester);

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillListScreen(
          repository: FakeBillRepository(),
          groupRepository: FakeGroupRepository(
            members: [
              sampleMember(displayName: 'Taylor'),
              sampleMember(
                userProfileId: _otherProfileId,
                displayName: 'Removed Morgan',
                status: SettleoraGroupMembershipStatusValues.removed,
              ),
            ],
          ),
          groupId: _groupId,
          groupName: 'Trip Crew',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('group-bill-list-create')));
    await tester.pumpAndSettle();

    await _chooseDropdownValue(
      tester,
      const Key('group-bill-split-member-0-0'),
      'Taylor',
    );
    expect(find.text('Removed Morgan'), findsNothing);

    await tester.tap(find.byKey(const Key('group-bill-add-payer')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const Key('group-bill-payer-member-0')),
    );
    await tester.tap(find.byKey(const Key('group-bill-payer-member-0')));
    await tester.pumpAndSettle();

    expect(find.text('Taylor'), findsWidgets);
    expect(find.text('Removed Morgan'), findsNothing);
  });

  testWidgets('group bill create maps member split and payer draft strings', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final billRepository = FakeBillRepository(
      createdGroupDetail: sampleBillDetail(
        id: _createdBillId,
        merchantName: 'Night Market',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillListScreen(
          repository: billRepository,
          groupRepository: FakeGroupRepository(
            members: [
              sampleMember(displayName: 'Taylor'),
              sampleMember(
                userProfileId: _otherProfileId,
                displayName: 'Morgan',
              ),
            ],
          ),
          groupId: _groupId,
          groupName: 'Trip Crew',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('group-bill-list-create')));
    await tester.pumpAndSettle();
    await _fillMinimalGroupCreateForm(tester);
    await tester.enterText(
      find.byKey(const Key('group-bill-split-method-0-0')),
      ' exact_amount ',
    );
    await tester.enterText(
      find.byKey(const Key('group-bill-split-basis-0-0')),
      ' 7.00 ',
    );
    await tester.enterText(
      find.byKey(const Key('group-bill-split-order-0-0')),
      '2',
    );
    await tester.tap(find.byKey(const Key('group-bill-add-payer')));
    await tester.pumpAndSettle();
    await _chooseDropdownValue(
      tester,
      const Key('group-bill-payer-member-0'),
      'Morgan',
    );
    await tester.enterText(
      find.byKey(const Key('group-bill-payer-amount-0')),
      ' 12.00 ',
    );
    await tester.enterText(
      find.byKey(const Key('group-bill-payer-currency-0')),
      ' usd ',
    );
    await tester.enterText(
      find.byKey(const Key('group-bill-payer-method-0')),
      ' Cash ',
    );
    await _tapSaveGroupBill(tester);

    final draft = billRepository.lastGroupCreateDraft;
    expect(billRepository.createGroupCalls, 1);
    expect(billRepository.createPersonalCalls, 0);
    expect(billRepository.lastGroupId, _groupId);
    expect(draft?.merchantName, '  Night Market  ');
    expect(draft?.billDate, '  2026-05-23  ');
    expect(draft?.currency, ' usd ');
    expect(draft?.items.single.name, '  Noodles  ');
    expect(draft?.items.single.note, ' shared bowl ');
    expect(draft?.items.single.amount, ' 12.00 ');
    expect(draft?.items.single.currency, ' usd ');
    expect(draft?.items.single.splits.single.userProfileId, _profileId);
    expect(draft?.items.single.splits.single.splitMethod, ' exact_amount ');
    expect(draft?.items.single.splits.single.basisValue, ' 7.00 ');
    expect(draft?.items.single.splits.single.allocationOrder, 2);
    expect(draft?.payers.single.userProfileId, _otherProfileId);
    expect(draft?.payers.single.amount, ' 12.00 ');
    expect(draft?.payers.single.currency, ' usd ');
    expect(draft?.payers.single.paymentMethodLabelSnapshot, ' Cash ');
  });

  testWidgets(
    'group bill create uses returned detail without offline queueing',
    (tester) async {
      await useLargeSurface(tester);
      final billRepository = FakeBillRepository(
        createdGroupDetail: sampleBillDetail(
          id: _createdBillId,
          merchantName: 'Returned Market',
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: SettleoraGroupBillListScreen(
            repository: billRepository,
            groupRepository: FakeGroupRepository(
              members: [sampleMember(displayName: 'Taylor')],
            ),
            groupId: _groupId,
            groupName: 'Trip Crew',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('bill-list-sync')), findsNothing);
      await tester.tap(find.byKey(const Key('group-bill-list-create')));
      await tester.pumpAndSettle();
      await _fillMinimalGroupCreateForm(tester);
      await _tapSaveGroupBill(tester);

      expect(find.text('Group bill'), findsWidgets);
      expect(find.text('Returned Market'), findsOneWidget);
      expect(billRepository.createGroupCalls, 1);
      expect(billRepository.createPersonalCalls, 0);
      expect(billRepository.getGroupCalls, 0);

      await tester.pageBack();
      await tester.pumpAndSettle();

      expect(billRepository.listGroupCalls, 2);
    },
  );

  testWidgets('group bill create failure shows bounded safe copy', (
    tester,
  ) async {
    await useLargeSurface(tester);
    final billRepository = FakeBillRepository(
      createGroupFailure: const SettleoraBillFailure(
        kind: SettleoraBillFailureKind.server,
        message: 'Bills are unavailable right now. Try again later.',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SettleoraGroupBillListScreen(
          repository: billRepository,
          groupRepository: FakeGroupRepository(
            members: [sampleMember(displayName: 'Taylor')],
          ),
          groupId: _groupId,
          groupName: 'Trip Crew',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('group-bill-list-create')));
    await tester.pumpAndSettle();
    await _fillMinimalGroupCreateForm(tester);
    await _tapSaveGroupBill(tester);

    expect(billRepository.createGroupCalls, 1);
    expect(find.byKey(const Key('group-bill-create-failure')), findsOneWidget);
    expect(find.textContaining('Bills unavailable'), findsOneWidget);
    expect(
      find.textContaining('Bills are unavailable right now. Try again later.'),
      findsOneWidget,
    );
    expect(find.text('Create group bill'), findsWidgets);
  });
}

Future<void> useLargeSurface(WidgetTester tester) async {
  await tester.binding.setSurfaceSize(const Size(900, 1600));
  addTearDown(() => tester.binding.setSurfaceSize(null));
}

Future<void> _fillMinimalGroupCreateForm(WidgetTester tester) async {
  await tester.enterText(
    find.byKey(const Key('group-bill-merchant-name')),
    '  Night Market  ',
  );
  await tester.enterText(
    find.byKey(const Key('group-bill-date')),
    '  2026-05-23  ',
  );
  await tester.enterText(find.byKey(const Key('group-bill-currency')), ' usd ');
  await tester.enterText(
    find.byKey(const Key('group-bill-item-name-0')),
    '  Noodles  ',
  );
  await tester.enterText(
    find.byKey(const Key('group-bill-item-amount-0')),
    ' 12.00 ',
  );
  await tester.enterText(
    find.byKey(const Key('group-bill-item-currency-0')),
    ' usd ',
  );
  await tester.enterText(
    find.byKey(const Key('group-bill-item-note-0')),
    ' shared bowl ',
  );
  await _chooseDropdownValue(
    tester,
    const Key('group-bill-split-member-0-0'),
    'Taylor',
  );
}

Future<void> _chooseDropdownValue(
  WidgetTester tester,
  Key dropdownKey,
  String label,
) async {
  await tester.ensureVisible(find.byKey(dropdownKey));
  await tester.tap(find.byKey(dropdownKey));
  await tester.pumpAndSettle();
  await tester.tap(find.text(label).last);
  await tester.pumpAndSettle();
}

Future<void> _tapSaveGroupBill(WidgetTester tester) async {
  await tester.ensureVisible(find.byKey(const Key('group-bill-save')));
  await tester.tap(find.byKey(const Key('group-bill-save')));
  await tester.pumpAndSettle();
}

class FakeBillRepository implements SettleoraBillRepository {
  FakeBillRepository({
    this.groupBills = const [],
    SettleoraBillDetail? detail,
    List<SettleoraBillDetail>? details,
    List<SettleoraBillFailure>? listFailures,
    SettleoraBillDetail? createdGroupDetail,
    this.createGroupFailure,
  }) : details = details ?? [detail ?? sampleBillDetail()],
       listFailures = listFailures ?? [],
       createdGroupDetail = createdGroupDetail ?? sampleBillDetail();

  final List<SettleoraBillSummary> groupBills;
  final List<SettleoraBillDetail> details;
  final List<SettleoraBillFailure> listFailures;
  final SettleoraBillDetail createdGroupDetail;
  final SettleoraBillFailure? createGroupFailure;
  int listGroupCalls = 0;
  int getGroupCalls = 0;
  int createPersonalCalls = 0;
  int createGroupCalls = 0;
  String? lastGroupId;
  SettleoraGroupBillCreateDraft? lastGroupCreateDraft;

  SettleoraBillDetail _detailForCall(int callIndex) {
    final index = callIndex < details.length ? callIndex : details.length - 1;
    return details[index];
  }

  @override
  Future<SettleoraBillDetail> createPersonalBill(
    SettleoraPersonalBillCreateDraft draft,
  ) async {
    createPersonalCalls += 1;
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillDetail> createGroupBill(
    String groupId,
    SettleoraGroupBillCreateDraft draft,
  ) async {
    createGroupCalls += 1;
    lastGroupId = groupId;
    lastGroupCreateDraft = draft;
    final failure = createGroupFailure;
    if (failure != null) {
      throw failure;
    }

    return createdGroupDetail;
  }

  @override
  Future<SettleoraBillDetail> getGroupBill(
    String groupId,
    String billId,
  ) async {
    getGroupCalls += 1;
    return _detailForCall(getGroupCalls - 1);
  }

  @override
  Future<SettleoraBillDetail> getPersonalBill(String billId) {
    throw UnimplementedError();
  }

  @override
  Future<List<SettleoraBillSummary>> listGroupBills(
    String groupId, {
    int limit = 50,
  }) async {
    listGroupCalls += 1;
    if (listFailures.isNotEmpty) {
      throw listFailures.removeAt(0);
    }

    return groupBills;
  }

  @override
  Future<List<SettleoraBillSummary>> listPersonalBills({int limit = 50}) {
    throw UnimplementedError();
  }
}

class FakeBillAttachmentRepository
    implements SettleoraBillAttachmentRepository {
  FakeBillAttachmentRepository({
    this.attachments = const [],
    this.downloadedBytes = const [7, 8, 9],
  });

  final List<SettleoraBillAttachment> attachments;
  final List<int> downloadedBytes;
  int listCalls = 0;
  int downloadCalls = 0;
  SettleoraBillAttachmentRoute? lastRoute;
  String? lastDownloadedFileId;

  @override
  Future<SettleoraBillAttachment> attachAttachment(
    SettleoraBillAttachmentRoute route,
    SettleoraBillAttachmentUpload upload,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<List<SettleoraBillAttachment>> listAttachments(
    SettleoraBillAttachmentRoute route,
  ) async {
    listCalls += 1;
    lastRoute = route;
    return attachments;
  }

  @override
  Future<void> removeAttachment(
    SettleoraBillAttachmentRoute route,
    String fileId,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraBillAttachmentContent> downloadAttachmentContent(
    SettleoraBillAttachmentRoute route,
    String fileId,
  ) async {
    downloadCalls += 1;
    lastRoute = route;
    lastDownloadedFileId = fileId;
    return SettleoraBillAttachmentContent(bytes: downloadedBytes);
  }
}

class FakeGroupRepository implements SettleoraGroupRepository {
  FakeGroupRepository({this.members = const [], this.memberFailure});

  final List<SettleoraGroupMember> members;
  final SettleoraGroupFailure? memberFailure;
  int listMemberCalls = 0;

  @override
  Future<List<SettleoraGroup>> listGroups() {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraGroup> createGroup(SettleoraGroupSaveRequest request) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraGroup> getGroup(String groupId) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraGroup> updateGroup(
    String groupId,
    SettleoraGroupSaveRequest request,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<List<SettleoraGroupMember>> listGroupMembers(String groupId) async {
    listMemberCalls += 1;
    final failure = memberFailure;
    if (failure != null) {
      throw failure;
    }

    return members;
  }

  @override
  Future<SettleoraGroupMember> addGroupMember(
    String groupId,
    SettleoraGroupMemberAddRequest request,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<SettleoraGroupMember> updateGroupMember(
    String groupId,
    String userProfileId,
    SettleoraGroupMemberRoleUpdate update,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<void> removeGroupMember(String groupId, String userProfileId) {
    throw UnimplementedError();
  }
}

class FakeBillRevisionRepository implements SettleoraBillRevisionRepository {
  FakeBillRevisionRepository({
    this.revisions = const [],
    SettleoraBillRevision? detailResponse,
    SettleoraBillRevision? createResponse,
  }) : detailResponse = detailResponse ?? createResponse ?? sampleRevision(),
       createResponse = createResponse ?? detailResponse ?? sampleRevision();

  final List<SettleoraBillRevision> revisions;
  SettleoraBillRevision detailResponse;
  SettleoraBillRevision createResponse;
  int listCalls = 0;
  int getCalls = 0;
  int createCalls = 0;
  String? lastCreatedBillId;
  SettleoraBillRevisionProposalSnapshot? lastProposal;

  @override
  Future<List<SettleoraBillRevision>> listBillRevisions(String billId) async {
    listCalls += 1;
    return revisions;
  }

  @override
  Future<SettleoraBillRevision> createBillRevision(
    String billId,
    SettleoraBillRevisionProposalSnapshot proposal,
  ) async {
    createCalls += 1;
    lastCreatedBillId = billId;
    lastProposal = proposal;
    detailResponse = createResponse;
    return createResponse;
  }

  @override
  Future<SettleoraBillRevision> getBillRevision(
    String billId,
    String revisionId,
  ) async {
    getCalls += 1;
    return detailResponse;
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

SettleoraBillSummary sampleBillSummary() {
  return SettleoraBillSummary(
    id: _billId,
    merchantName: 'Corner Market',
    billDate: '2026-05-17',
    status: 'draft',
    reconciliationStatus: 'unreconciled',
    totalAmount: '10.80',
    totalCurrency: 'USD',
    archiveState: SettleoraBillArchiveStateValues.active,
    itemCount: 1,
    participantCount: 1,
    payerCount: 1,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    displayNameFallback: 'Group bill',
  );
}

SettleoraBillAttachment sampleAttachment() {
  return SettleoraBillAttachment(
    fileId: _fileId,
    billId: _billId,
    purpose: SettleoraBillAttachmentPurposeValues.supportingAttachment,
    contentType: 'application/pdf',
    sizeBytes: 2048,
    uploadedAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

SettleoraBillDetail sampleBillDetail({
  bool canCreateRevision = false,
  String id = _billId,
  String? merchantName = 'Corner Market',
}) {
  return SettleoraBillDetail(
    id: id,
    merchantName: merchantName,
    billDate: '2026-05-17',
    status: 'draft',
    reconciliationStatus: 'unreconciled',
    reconciliationNote: null,
    revisionCreationActions: SettleoraBillRevisionCreationActions(
      canCreateRevision: canCreateRevision,
    ),
    totalAmount: '10.80',
    totalCurrency: 'USD',
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    items: const [
      SettleoraBillItem(
        id: 'item-1',
        name: 'Milk',
        note: null,
        amount: '10.00',
        currency: 'USD',
        sortOrder: 0,
      ),
    ],
    participants: const [
      SettleoraBillParticipant(
        userProfileId: _profileId,
        status: 'pending_acceptance',
        resolvedShareAmount: '10.80',
        resolvedShareCurrency: 'USD',
      ),
    ],
    payers: const [
      SettleoraBillPayer(
        userProfileId: _profileId,
        amount: '10.80',
        currency: 'USD',
      ),
    ],
    adjustments: const [],
    displayNameFallback: 'Group bill',
  );
}

SettleoraGroupMember sampleMember({
  String userProfileId = _profileId,
  String displayName = 'Taylor',
  String status = SettleoraGroupMembershipStatusValues.active,
}) {
  return SettleoraGroupMember(
    userProfileId: userProfileId,
    displayName: displayName,
    role: SettleoraGroupRoleValues.member,
    status: status,
    joinedAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
  );
}

SettleoraBillRevision sampleRevision({String id = _revisionId}) {
  return SettleoraBillRevision(
    id: id,
    billId: _billId,
    groupId: _groupId,
    status: SettleoraBillRevisionStatusValues.draftRevision,
    totalAmount: '10.80',
    totalCurrency: 'USD',
    calculationHash: _hash,
    submittedAtUtc: null,
    updatedAtUtc: _updatedAtUtc,
    participants: const [
      SettleoraBillRevisionParticipant(
        userProfileId: _profileId,
        resolvedShareAmount: '10.80',
        resolvedShareCurrency: 'USD',
        affectedByRevision: true,
      ),
    ],
    payers: const [
      SettleoraBillRevisionPayer(
        userProfileId: _profileId,
        amount: '10.80',
        currency: 'USD',
        requiresPayerConfirmation: false,
        payerConfirmationStatus:
            SettleoraBillRevisionPayerConfirmationStatusValues.confirmed,
      ),
    ],
    approvals: const [],
    viewerActions: const SettleoraBillRevisionViewerActions(
      canSubmit: true,
      canWithdraw: false,
      canRevise: false,
      canApprove: false,
      canReject: false,
      canConfirmPayer: false,
      canApply: false,
    ),
    reviewContext: sampleReviewContext(),
    viewerApprovalBasis: null,
  );
}

SettleoraBillRevisionReviewContext sampleReviewContext() {
  return SettleoraBillRevisionReviewContext(
    viewerUserProfileId: _profileId,
    baseline: SettleoraBillRevisionReviewBaseline(
      baselineType:
          SettleoraBillRevisionReviewBaselineTypeValues.activeAcceptedBill,
      baselineBillRevisionId: '11111111-1111-1111-1111-111111111111',
      baselineRevisionStatus: SettleoraBillRevisionStatusValues.acceptedApplied,
      baselineReviewedAtUtc: null,
      derivationReason: 'Server selected the active accepted bill baseline.',
    ),
    defaultViewMode: SettleoraBillRevisionReviewViewModeValues.fullBill,
    fullViewRecommendedReason:
        SettleoraBillRevisionReviewRecommendationReasonValues
            .baselineAvailableFullViewOptional,
    viewerFinancialImpact: const SettleoraBillRevisionViewerFinancialImpact(
      previousShare: SettleoraBillRevisionMoneyValue(
        amount: '10.80',
        currency: 'USD',
      ),
      proposedShare: SettleoraBillRevisionMoneyValue(
        amount: '10.80',
        currency: 'USD',
      ),
      deltaShare: SettleoraBillRevisionMoneyValue(
        amount: '0.00',
        currency: 'USD',
      ),
      affectedByRevision: true,
      isPayer: false,
      payerImpact: null,
    ),
    changeSummary: const [],
    changes: const [],
    limitations: const [],
  );
}

const _groupId = '11111111-1111-1111-1111-111111111111';
const _billId = '22222222-2222-2222-2222-222222222222';
const _revisionId = '33333333-3333-3333-3333-333333333333';
const _createdRevisionId = '44444444-4444-4444-4444-444444444444';
const _fileId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const _profileId = '55555555-5555-5555-5555-555555555555';
const _otherProfileId = '66666666-6666-6666-6666-666666666666';
const _createdBillId = '77777777-7777-7777-7777-777777777777';
const _hash =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
final _createdAtUtc = DateTime.utc(2026, 5, 17, 10);
final _updatedAtUtc = DateTime.utc(2026, 5, 17, 11);
