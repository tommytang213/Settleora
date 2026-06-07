import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/bills/bill_repository.dart';
import 'package:mobile/bills/generated_bill_repository.dart';
import 'package:settleora_api_client/settleora_api.dart' as api;

void main() {
  group('GeneratedSettleoraBillRepository', () {
    test('requires a session before calling the generated client', () async {
      final client = FakeBillGeneratedClient();
      final repository = GeneratedSettleoraBillRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider(null),
      );

      final failure = await captureBillFailure(() {
        return repository.listPersonalBills();
      });

      expect(failure.kind, SettleoraBillFailureKind.sessionRequired);
      expect(client.listCalls, 0);
    });

    test('maps active and archived personal bill lists safely', () async {
      final accessTokenProvider = FakeAccessTokenProvider('  redacted  ');
      final client = FakeBillGeneratedClient(
        activeBills: [sampleApiBill(merchantName: 'Corner Market')],
        archivedBills: [sampleApiBill(id: _archivedBillId, merchantName: null)],
      );
      final repository = GeneratedSettleoraBillRepository(
        client: client,
        accessTokenProvider: accessTokenProvider,
      );

      final bills = await repository.listPersonalBills(limit: 25);

      expect(bills, hasLength(2));
      expect(bills.first.displayName, 'Corner Market');
      expect(bills.first.archiveState, SettleoraBillArchiveStateValues.active);
      expect(bills.first.itemCount, 1);
      expect(bills.last.displayName, 'Personal bill');
      expect(bills.last.archiveState, SettleoraBillArchiveStateValues.archived);
      expect(client.listCalls, 2);
      expect(client.archiveStates, [
        api.ExpenseBillArchiveStateValues.active,
        api.ExpenseBillArchiveStateValues.archived,
      ]);
      expect(client.limits, [25, 25]);
      expect(client.accessTokens, ['redacted', 'redacted']);
      expect(accessTokenProvider.calls, 2);
    });

    test('maps generated detail responses into bill detail models', () async {
      final client = FakeBillGeneratedClient(
        detailBill: sampleApiBill(
          participantStatus: api.ExpenseBillParticipantStatusValues.rejected,
          participantRejectionReasonCode:
              api.ExpenseBillParticipantRejectionReasonCodeValues.wrongSplit,
        ),
      );
      final repository = GeneratedSettleoraBillRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final detail = await repository.getPersonalBill(_billId);

      expect(detail.id, _billId);
      expect(detail.displayName, 'Corner Market');
      expect(detail.totalAmount, '10.80');
      expect(detail.revisionCreationActions.canCreateRevision, isTrue);
      expect(detail.items.single.name, 'Milk');
      expect(detail.participants.single.resolvedShareAmount, '10.80');
      expect(
        detail.participants.single.rejectionReasonCode,
        SettleoraBillParticipantRejectionReasonCodeValues.wrongSplit,
      );
      expect(detail.payers.single.amount, '10.80');
      expect(detail.adjustments.single.type, 'tax');
      expect(client.getCalls, 1);
      expect(client.lastBillId, _billId);
    });

    test('createPersonalBill maps a complete draft request safely', () async {
      final accessTokenProvider = FakeAccessTokenProvider('  redacted  ');
      final client = FakeBillGeneratedClient(
        createdBill: sampleApiBill(merchantName: 'Brunch Spot'),
      );
      final repository = GeneratedSettleoraBillRepository(
        client: client,
        accessTokenProvider: accessTokenProvider,
      );

      final detail = await repository.createPersonalBill(
        const SettleoraPersonalBillCreateDraft(
          merchantName: '  Brunch Spot  ',
          billDate: '  2026-05-21  ',
          currency: ' usd ',
          items: [
            SettleoraPersonalBillCreateItemDraft(
              name: '  Eggs  ',
              note: '  table 4  ',
              amount: ' 12.30 ',
              currency: ' usd ',
            ),
          ],
          adjustments: [
            SettleoraPersonalBillCreateAdjustmentDraft(
              type: ' tax ',
              direction: ' charge ',
              allocationMethod: ' equal ',
              amount: ' 1.20 ',
              currency: ' usd ',
              reasonNote: ' local tax ',
            ),
          ],
          payerPaymentMethodLabelSnapshot: '  Card  ',
        ),
      );

      final body = client.lastCreateBody;
      final payload = body?.toJson();
      expect(detail.displayName, 'Brunch Spot');
      expect(client.createCalls, 1);
      expect(accessTokenProvider.calls, 1);
      expect(client.accessTokens, ['redacted']);
      expect(payload?['merchantName'], 'Brunch Spot');
      expect(payload?['billDate'], '2026-05-21');
      expect(payload?['currency'], 'USD');
      expect(payload?['payerPaymentMethodLabelSnapshot'], 'Card');
      final item = (payload?['items'] as List).single as Map;
      expect(item['name'], 'Eggs');
      expect(item['note'], 'table 4');
      expect(item['amount'], '12.30');
      expect(item['currency'], 'USD');
      final adjustment = (payload?['adjustments'] as List).single as Map;
      expect(adjustment['type'], 'tax');
      expect(adjustment['direction'], 'charge');
      expect(adjustment['allocationMethod'], 'equal');
      expect(adjustment['amount'], '1.20');
      expect(adjustment['currency'], 'USD');
      expect(adjustment['reasonNote'], 'local tax');
    });

    test('createPersonalBill keeps optional blank strings null', () async {
      final client = FakeBillGeneratedClient();
      final repository = GeneratedSettleoraBillRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      await repository.createPersonalBill(
        const SettleoraPersonalBillCreateDraft(
          merchantName: '   ',
          billDate: '2026-05-21',
          currency: 'usd',
          items: [
            SettleoraPersonalBillCreateItemDraft(
              name: 'Coffee',
              note: '   ',
              amount: '4.50',
              currency: 'usd',
            ),
          ],
          adjustments: [
            SettleoraPersonalBillCreateAdjustmentDraft(
              type: 'tax',
              direction: 'charge',
              allocationMethod: 'equal',
              amount: '0.50',
              currency: 'usd',
              reasonNote: '   ',
            ),
          ],
          payerPaymentMethodLabelSnapshot: '   ',
        ),
      );

      final payload = client.lastCreateBody!.toJson();
      expect(payload['merchantName'], isNull);
      expect(payload['payerPaymentMethodLabelSnapshot'], isNull);
      final item = (payload['items'] as List).single as Map;
      expect(item['note'], isNull);
      expect(item['currency'], 'USD');
      final adjustment = (payload['adjustments'] as List).single as Map;
      expect(adjustment['reasonNote'], isNull);
      expect(adjustment['currency'], 'USD');
    });

    test(
      'createPersonalBill validation runs before session and generated calls',
      () async {
        final accessTokenProvider = FakeAccessTokenProvider('redacted');
        final client = FakeBillGeneratedClient();
        final repository = GeneratedSettleoraBillRepository(
          client: client,
          accessTokenProvider: accessTokenProvider,
        );

        final failure = await captureBillFailure(() {
          return repository.createPersonalBill(
            const SettleoraPersonalBillCreateDraft(
              billDate: ' ',
              currency: 'usd',
              items: [
                SettleoraPersonalBillCreateItemDraft(
                  name: 'Coffee',
                  amount: '4.50',
                  currency: 'usd',
                ),
              ],
            ),
          );
        });

        expect(failure.kind, SettleoraBillFailureKind.validation);
        expect(accessTokenProvider.calls, 0);
        expect(client.createCalls, 0);
      },
    );

    test(
      'createPersonalBill rejects empty items before session lookup',
      () async {
        final accessTokenProvider = FakeAccessTokenProvider('redacted');
        final client = FakeBillGeneratedClient();
        final repository = GeneratedSettleoraBillRepository(
          client: client,
          accessTokenProvider: accessTokenProvider,
        );

        final failure = await captureBillFailure(() {
          return repository.createPersonalBill(
            const SettleoraPersonalBillCreateDraft(
              billDate: '2026-05-21',
              currency: 'usd',
              items: [],
            ),
          );
        });

        expect(failure.kind, SettleoraBillFailureKind.validation);
        expect(accessTokenProvider.calls, 0);
        expect(client.createCalls, 0);
      },
    );

    test(
      'createPersonalBill rejects invalid item rows before session lookup',
      () async {
        final accessTokenProvider = FakeAccessTokenProvider('redacted');
        final client = FakeBillGeneratedClient();
        final repository = GeneratedSettleoraBillRepository(
          client: client,
          accessTokenProvider: accessTokenProvider,
        );

        final failure = await captureBillFailure(() {
          return repository.createPersonalBill(
            const SettleoraPersonalBillCreateDraft(
              billDate: '2026-05-21',
              currency: 'usd',
              items: [
                SettleoraPersonalBillCreateItemDraft(
                  name: ' ',
                  amount: '4.50',
                  currency: 'usd',
                ),
              ],
            ),
          );
        });

        expect(failure.kind, SettleoraBillFailureKind.validation);
        expect(accessTokenProvider.calls, 0);
        expect(client.createCalls, 0);
      },
    );

    test('createPersonalBill maps generated failures safely', () async {
      final repository = GeneratedSettleoraBillRepository(
        client: FakeBillGeneratedClient(
          failure: api.SettleoraApiException(
            422,
            'Unprocessable Content',
            _hiddenBody,
          ),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final failure = await captureBillFailure(() {
        return repository.createPersonalBill(
          const SettleoraPersonalBillCreateDraft(
            billDate: '2026-05-21',
            currency: 'usd',
            items: [
              SettleoraPersonalBillCreateItemDraft(
                name: 'Coffee',
                amount: '4.50',
                currency: 'usd',
              ),
            ],
          ),
        );
      });

      expect(failure.kind, SettleoraBillFailureKind.validation);
      expect(failure.statusCode, 422);
      expect(failure.message, isNot(contains('internal-detail')));
      expect(failure.toString(), isNot(contains('internal-detail')));
    });

    test(
      'requires a session before calling group bill generated methods',
      () async {
        final client = FakeBillGeneratedClient();
        final repository = GeneratedSettleoraBillRepository(
          client: client,
          accessTokenProvider: FakeAccessTokenProvider(' '),
        );

        final failure = await captureBillFailure(() {
          return repository.listGroupBills(_groupId);
        });

        expect(failure.kind, SettleoraBillFailureKind.sessionRequired);
        expect(client.listGroupCalls, 0);
      },
    );

    test('maps active and archived group bill reads safely', () async {
      final accessTokenProvider = FakeAccessTokenProvider('  redacted  ');
      final client = FakeBillGeneratedClient(
        activeGroupBills: [sampleApiGroupBill(merchantName: 'Noodle House')],
        archivedGroupBills: [
          sampleApiGroupBill(id: _archivedBillId, merchantName: null),
        ],
        groupDetailBill: sampleApiGroupBill(
          participantStatus: api.ExpenseBillParticipantStatusValues.rejected,
          participantRejectionReasonCode:
              api.ExpenseBillParticipantRejectionReasonCodeValues.wrongSplit,
        ),
      );
      final repository = GeneratedSettleoraBillRepository(
        client: client,
        accessTokenProvider: accessTokenProvider,
      );

      final bills = await repository.listGroupBills('  $_groupId  ', limit: 25);
      final detail = await repository.getGroupBill(
        '  $_groupId  ',
        '  $_billId  ',
      );

      expect(bills, hasLength(2));
      expect(bills.first.displayName, 'Noodle House');
      expect(bills.first.archiveState, SettleoraBillArchiveStateValues.active);
      expect(bills.last.displayName, 'Group bill');
      expect(bills.last.archiveState, SettleoraBillArchiveStateValues.archived);
      expect(detail.displayName, 'Corner Market');
      expect(detail.revisionCreationActions.canCreateRevision, isFalse);
      expect(detail.items.single.name, 'Milk');
      expect(detail.participants.single.resolvedShareAmount, '10.80');
      expect(
        detail.participants.single.rejectionReasonCode,
        SettleoraBillParticipantRejectionReasonCodeValues.wrongSplit,
      );
      expect(client.listGroupCalls, 2);
      expect(client.getGroupCalls, 1);
      expect(client.archiveStates, [
        api.ExpenseBillArchiveStateValues.active,
        api.ExpenseBillArchiveStateValues.archived,
      ]);
      expect(client.limits, [25, 25]);
      expect(client.accessTokens, ['redacted', 'redacted', 'redacted']);
      expect(client.lastGroupId, _groupId);
      expect(client.lastBillId, _billId);
      expect(accessTokenProvider.calls, 3);
    });

    test('createGroupBill maps a complete draft request safely', () async {
      final accessTokenProvider = FakeAccessTokenProvider('  redacted  ');
      final client = FakeBillGeneratedClient(
        createdGroupBill: sampleApiGroupBill(merchantName: 'Night Market'),
      );
      final repository = GeneratedSettleoraBillRepository(
        client: client,
        accessTokenProvider: accessTokenProvider,
      );

      final detail = await repository.createGroupBill(
        '  $_groupId  ',
        const SettleoraGroupBillCreateDraft(
          merchantName: '  Night Market  ',
          billDate: '  2026-05-22  ',
          currency: ' usd ',
          items: [
            SettleoraGroupBillCreateItemDraft(
              name: '  Noodles  ',
              note: '  shared bowl  ',
              amount: ' 12.00 ',
              currency: ' usd ',
              splits: [
                SettleoraGroupBillCreateItemSplitDraft(
                  userProfileId: '  $_userProfileId  ',
                  splitMethod: ' exact_amount ',
                  basisValue: ' 7.00 ',
                  allocationOrder: 1,
                ),
                SettleoraGroupBillCreateItemSplitDraft(
                  userProfileId: '  $_otherUserProfileId  ',
                  splitMethod: ' equal ',
                  allocationOrder: 2,
                ),
              ],
            ),
          ],
          adjustments: [
            SettleoraGroupBillCreateAdjustmentDraft(
              type: ' service_charge ',
              direction: ' charge ',
              allocationMethod: ' equal ',
              amount: ' 2.00 ',
              currency: ' usd ',
              reasonNote: ' tip ',
            ),
          ],
          payers: [
            SettleoraGroupBillCreatePayerDraft(
              userProfileId: ' $_userProfileId ',
              amount: ' 14.00 ',
              currency: ' usd ',
              paymentMethodLabelSnapshot: ' Cash ',
            ),
          ],
        ),
      );

      final body = client.lastGroupCreateBody;
      final payload = body?.toJson();
      expect(detail.displayName, 'Night Market');
      expect(client.createGroupCalls, 1);
      expect(client.lastGroupId, _groupId);
      expect(accessTokenProvider.calls, 1);
      expect(client.accessTokens, ['redacted']);
      expect(payload?['merchantName'], 'Night Market');
      expect(payload?['billDate'], '2026-05-22');
      expect(payload?['currency'], 'USD');
      final item = (payload?['items'] as List).single as Map;
      expect(item['name'], 'Noodles');
      expect(item['note'], 'shared bowl');
      expect(item['amount'], '12.00');
      expect(item['currency'], 'USD');
      final splits = item['splits'] as List;
      final firstSplit = splits.first as Map;
      final secondSplit = splits.last as Map;
      expect(firstSplit['userProfileId'], _userProfileId);
      expect(firstSplit['splitMethod'], 'exact_amount');
      expect(firstSplit['basisValue'], '7.00');
      expect(firstSplit['allocationOrder'], 1);
      expect(secondSplit['userProfileId'], _otherUserProfileId);
      expect(secondSplit['splitMethod'], 'equal');
      expect(secondSplit.containsKey('basisValue'), isFalse);
      expect(secondSplit['allocationOrder'], 2);
      final adjustment = (payload?['adjustments'] as List).single as Map;
      expect(adjustment['type'], 'service_charge');
      expect(adjustment['direction'], 'charge');
      expect(adjustment['allocationMethod'], 'equal');
      expect(adjustment['amount'], '2.00');
      expect(adjustment['currency'], 'USD');
      expect(adjustment['reasonNote'], 'tip');
      final payer = (payload?['payers'] as List).single as Map;
      expect(payer['userProfileId'], _userProfileId);
      expect(payer['amount'], '14.00');
      expect(payer['currency'], 'USD');
      expect(payer['paymentMethodLabelSnapshot'], 'Cash');
    });

    test('createGroupBill keeps optional blank strings null', () async {
      final client = FakeBillGeneratedClient();
      final repository = GeneratedSettleoraBillRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      await repository.createGroupBill(
        _groupId,
        const SettleoraGroupBillCreateDraft(
          merchantName: '   ',
          billDate: '2026-05-22',
          currency: 'usd',
          items: [
            SettleoraGroupBillCreateItemDraft(
              name: 'Coffee',
              note: '   ',
              amount: '4.50',
              currency: 'usd',
              splits: [
                SettleoraGroupBillCreateItemSplitDraft(
                  userProfileId: _userProfileId,
                  splitMethod: 'equal',
                  basisValue: '   ',
                ),
              ],
            ),
          ],
          adjustments: [
            SettleoraGroupBillCreateAdjustmentDraft(
              type: 'tax',
              direction: 'charge',
              allocationMethod: 'equal',
              amount: '0.50',
              currency: 'usd',
              reasonNote: '   ',
            ),
          ],
          payers: [
            SettleoraGroupBillCreatePayerDraft(
              userProfileId: _userProfileId,
              amount: '5.00',
              currency: 'usd',
              paymentMethodLabelSnapshot: '   ',
            ),
          ],
        ),
      );

      final payload = client.lastGroupCreateBody!.toJson();
      expect(payload['merchantName'], isNull);
      final item = (payload['items'] as List).single as Map;
      expect(item['note'], isNull);
      expect(item['currency'], 'USD');
      final split = (item['splits'] as List).single as Map;
      expect(split['basisValue'], isNull);
      final adjustment = (payload['adjustments'] as List).single as Map;
      expect(adjustment['reasonNote'], isNull);
      expect(adjustment['currency'], 'USD');
      final payer = (payload['payers'] as List).single as Map;
      expect(payer['paymentMethodLabelSnapshot'], isNull);
      expect(payer['currency'], 'USD');
    });

    test(
      'createGroupBill validation runs before session and generated calls',
      () async {
        final accessTokenProvider = FakeAccessTokenProvider('redacted');
        final client = FakeBillGeneratedClient();
        final repository = GeneratedSettleoraBillRepository(
          client: client,
          accessTokenProvider: accessTokenProvider,
        );

        final failure = await captureBillFailure(() {
          return repository.createGroupBill(
            '   ',
            const SettleoraGroupBillCreateDraft(
              billDate: '2026-05-22',
              currency: 'usd',
              items: [
                SettleoraGroupBillCreateItemDraft(
                  name: 'Coffee',
                  amount: '4.50',
                  currency: 'usd',
                  splits: [
                    SettleoraGroupBillCreateItemSplitDraft(
                      userProfileId: _userProfileId,
                      splitMethod: 'equal',
                    ),
                  ],
                ),
              ],
            ),
          );
        });

        expect(failure.kind, SettleoraBillFailureKind.validation);
        expect(accessTokenProvider.calls, 0);
        expect(client.createGroupCalls, 0);
      },
    );

    test(
      'createGroupBill rejects invalid split rows before session lookup',
      () async {
        final accessTokenProvider = FakeAccessTokenProvider('redacted');
        final client = FakeBillGeneratedClient();
        final repository = GeneratedSettleoraBillRepository(
          client: client,
          accessTokenProvider: accessTokenProvider,
        );

        final failure = await captureBillFailure(() {
          return repository.createGroupBill(
            _groupId,
            const SettleoraGroupBillCreateDraft(
              billDate: '2026-05-22',
              currency: 'usd',
              items: [
                SettleoraGroupBillCreateItemDraft(
                  name: 'Coffee',
                  amount: '4.50',
                  currency: 'usd',
                  splits: [
                    SettleoraGroupBillCreateItemSplitDraft(
                      userProfileId: ' ',
                      splitMethod: 'equal',
                    ),
                  ],
                ),
              ],
            ),
          );
        });

        expect(failure.kind, SettleoraBillFailureKind.validation);
        expect(accessTokenProvider.calls, 0);
        expect(client.createGroupCalls, 0);
      },
    );

    test(
      'createGroupBill rejects blank split method before session lookup',
      () async {
        final accessTokenProvider = FakeAccessTokenProvider('redacted');
        final client = FakeBillGeneratedClient();
        final repository = GeneratedSettleoraBillRepository(
          client: client,
          accessTokenProvider: accessTokenProvider,
        );

        final failure = await captureBillFailure(() {
          return repository.createGroupBill(
            _groupId,
            const SettleoraGroupBillCreateDraft(
              billDate: '2026-05-22',
              currency: 'usd',
              items: [
                SettleoraGroupBillCreateItemDraft(
                  name: 'Coffee',
                  amount: '4.50',
                  currency: 'usd',
                  splits: [
                    SettleoraGroupBillCreateItemSplitDraft(
                      userProfileId: _userProfileId,
                      splitMethod: ' ',
                    ),
                  ],
                ),
              ],
            ),
          );
        });

        expect(failure.kind, SettleoraBillFailureKind.validation);
        expect(accessTokenProvider.calls, 0);
        expect(client.createGroupCalls, 0);
      },
    );

    test(
      'createGroupBill rejects invalid allocation order before session lookup',
      () async {
        final accessTokenProvider = FakeAccessTokenProvider('redacted');
        final client = FakeBillGeneratedClient();
        final repository = GeneratedSettleoraBillRepository(
          client: client,
          accessTokenProvider: accessTokenProvider,
        );

        final failure = await captureBillFailure(() {
          return repository.createGroupBill(
            _groupId,
            const SettleoraGroupBillCreateDraft(
              billDate: '2026-05-22',
              currency: 'usd',
              items: [
                SettleoraGroupBillCreateItemDraft(
                  name: 'Coffee',
                  amount: '4.50',
                  currency: 'usd',
                  splits: [
                    SettleoraGroupBillCreateItemSplitDraft(
                      userProfileId: _userProfileId,
                      splitMethod: 'equal',
                      allocationOrder: -1,
                    ),
                  ],
                ),
              ],
            ),
          );
        });

        expect(failure.kind, SettleoraBillFailureKind.validation);
        expect(failure.message, 'Allocation order must be zero or greater.');
        expect(accessTokenProvider.calls, 0);
        expect(client.createGroupCalls, 0);
      },
    );

    test(
      'createGroupBill rejects invalid payer rows before session lookup',
      () async {
        final accessTokenProvider = FakeAccessTokenProvider('redacted');
        final client = FakeBillGeneratedClient();
        final repository = GeneratedSettleoraBillRepository(
          client: client,
          accessTokenProvider: accessTokenProvider,
        );

        final failure = await captureBillFailure(() {
          return repository.createGroupBill(
            _groupId,
            const SettleoraGroupBillCreateDraft(
              billDate: '2026-05-22',
              currency: 'usd',
              items: [
                SettleoraGroupBillCreateItemDraft(
                  name: 'Coffee',
                  amount: '4.50',
                  currency: 'usd',
                  splits: [
                    SettleoraGroupBillCreateItemSplitDraft(
                      userProfileId: _userProfileId,
                      splitMethod: 'equal',
                    ),
                  ],
                ),
              ],
              payers: [
                SettleoraGroupBillCreatePayerDraft(
                  userProfileId: ' ',
                  amount: '4.50',
                  currency: 'usd',
                ),
              ],
            ),
          );
        });

        expect(failure.kind, SettleoraBillFailureKind.validation);
        expect(accessTokenProvider.calls, 0);
        expect(client.createGroupCalls, 0);
      },
    );

    test('createGroupBill maps generated failures safely', () async {
      final repository = GeneratedSettleoraBillRepository(
        client: FakeBillGeneratedClient(
          failure: api.SettleoraApiException(
            422,
            'Unprocessable Content',
            _hiddenBody,
          ),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final failure = await captureBillFailure(() {
        return repository.createGroupBill(
          _groupId,
          const SettleoraGroupBillCreateDraft(
            billDate: '2026-05-22',
            currency: 'usd',
            items: [
              SettleoraGroupBillCreateItemDraft(
                name: 'Coffee',
                amount: '4.50',
                currency: 'usd',
                splits: [
                  SettleoraGroupBillCreateItemSplitDraft(
                    userProfileId: _userProfileId,
                    splitMethod: 'equal',
                  ),
                ],
              ),
            ],
          ),
        );
      });

      expect(failure.kind, SettleoraBillFailureKind.validation);
      expect(failure.statusCode, 422);
      expect(failure.message, isNot(contains('internal-detail')));
      expect(failure.toString(), isNot(contains('internal-detail')));
    });

    test('submitGroupBill calls generated client with bounded IDs', () async {
      final accessTokenProvider = FakeAccessTokenProvider('  redacted  ');
      final client = FakeBillGeneratedClient();
      final repository = GeneratedSettleoraBillRepository(
        client: client,
        accessTokenProvider: accessTokenProvider,
      );

      await repository.submitGroupBill(' $_groupId ', ' $_billId ');

      expect(client.submitGroupCalls, 1);
      expect(client.lastGroupId, _groupId);
      expect(client.lastBillId, _billId);
      expect(client.accessTokens, ['redacted']);
      expect(accessTokenProvider.calls, 1);
    });

    test('submitGroupBill validation runs before session lookup', () async {
      final accessTokenProvider = FakeAccessTokenProvider('redacted');
      final client = FakeBillGeneratedClient();
      final repository = GeneratedSettleoraBillRepository(
        client: client,
        accessTokenProvider: accessTokenProvider,
      );

      final failure = await captureBillFailure(() {
        return repository.submitGroupBill(_groupId, ' ');
      });

      expect(failure.kind, SettleoraBillFailureKind.validation);
      expect(accessTokenProvider.calls, 0);
      expect(client.submitGroupCalls, 0);
    });

    test('submitGroupBill maps generated failures safely', () async {
      final repository = GeneratedSettleoraBillRepository(
        client: FakeBillGeneratedClient(
          failure: api.SettleoraApiException(409, 'Conflict', _hiddenBody),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final failure = await captureBillFailure(() {
        return repository.submitGroupBill(_groupId, _billId);
      });

      expect(failure.kind, SettleoraBillFailureKind.conflict);
      expect(failure.statusCode, 409);
      expect(failure.message, isNot(contains('internal-detail')));
      expect(failure.toString(), isNot(contains('internal-detail')));
    });

    test(
      'acceptGroupBillParticipant calls generated client with bounded IDs',
      () async {
        final accessTokenProvider = FakeAccessTokenProvider('  redacted  ');
        final client = FakeBillGeneratedClient();
        final repository = GeneratedSettleoraBillRepository(
          client: client,
          accessTokenProvider: accessTokenProvider,
        );

        await repository.acceptGroupBillParticipant(
          ' $_groupId ',
          ' $_billId ',
          ' $_userProfileId ',
        );

        expect(client.acceptGroupParticipantCalls, 1);
        expect(client.lastGroupId, _groupId);
        expect(client.lastBillId, _billId);
        expect(client.lastUserProfileId, _userProfileId);
        expect(client.accessTokens, ['redacted']);
        expect(accessTokenProvider.calls, 1);
      },
    );

    test('rejectGroupBillParticipant sends bounded rejection reason', () async {
      final accessTokenProvider = FakeAccessTokenProvider('  redacted  ');
      final client = FakeBillGeneratedClient();
      final repository = GeneratedSettleoraBillRepository(
        client: client,
        accessTokenProvider: accessTokenProvider,
      );

      await repository.rejectGroupBillParticipant(
        ' $_groupId ',
        ' $_billId ',
        ' $_userProfileId ',
        SettleoraBillParticipantRejectionReasonCodeValues.wrongSplit,
      );

      expect(client.rejectGroupParticipantCalls, 1);
      expect(client.lastGroupId, _groupId);
      expect(client.lastBillId, _billId);
      expect(client.lastUserProfileId, _userProfileId);
      expect(
        client.lastRejectParticipantBody?.reasonCode,
        api.ExpenseBillParticipantRejectionReasonCodeValues.wrongSplit,
      );
      expect(client.accessTokens, ['redacted']);
      expect(accessTokenProvider.calls, 1);
    });

    test(
      'rejectGroupBillParticipant validates reason before session lookup',
      () async {
        final accessTokenProvider = FakeAccessTokenProvider('redacted');
        final client = FakeBillGeneratedClient();
        final repository = GeneratedSettleoraBillRepository(
          client: client,
          accessTokenProvider: accessTokenProvider,
        );

        final failure = await captureBillFailure(() {
          return repository.rejectGroupBillParticipant(
            _groupId,
            _billId,
            _userProfileId,
            'unsupported',
          );
        });

        expect(failure.kind, SettleoraBillFailureKind.validation);
        expect(accessTokenProvider.calls, 0);
        expect(client.rejectGroupParticipantCalls, 0);
      },
    );

    test('maps generated failures to bounded safe failures', () async {
      final repository = GeneratedSettleoraBillRepository(
        client: FakeBillGeneratedClient(
          failure: api.SettleoraApiException(
            422,
            'Unprocessable Content',
            _hiddenBody,
          ),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final failure = await captureBillFailure(() {
        return repository.listPersonalBills();
      });

      expect(failure.kind, SettleoraBillFailureKind.validation);
      expect(failure.statusCode, 422);
      expect(failure.message, isNot(contains('internal-detail')));
      expect(failure.toString(), isNot(contains('internal-detail')));
    });

    test('maps network errors to safe retry text', () async {
      final repository = GeneratedSettleoraBillRepository(
        client: FakeBillGeneratedClient(
          failure: const SocketException('internal socket detail'),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final failure = await captureBillFailure(() {
        return repository.listPersonalBills();
      });

      expect(failure.kind, SettleoraBillFailureKind.network);
      expect(failure.message, isNot(contains('internal socket detail')));
    });
  });
}

Future<SettleoraBillFailure> captureBillFailure(
  Future<Object?> Function() operation,
) async {
  try {
    await operation();
  } on SettleoraBillFailure catch (failure) {
    return failure;
  }

  fail('Expected SettleoraBillFailure.');
}

class FakeAccessTokenProvider implements SettleoraAccessTokenProvider {
  FakeAccessTokenProvider(this._accessToken);

  final String? _accessToken;
  int calls = 0;

  @override
  Future<String?> accessToken() async {
    calls += 1;
    return _accessToken;
  }
}

class FakeBillGeneratedClient implements SettleoraBillGeneratedClient {
  FakeBillGeneratedClient({
    this.failure,
    List<api.PersonalBillResponse>? activeBills,
    List<api.PersonalBillResponse>? archivedBills,
    List<api.GroupBillResponse>? activeGroupBills,
    List<api.GroupBillResponse>? archivedGroupBills,
    api.PersonalBillResponse? detailBill,
    api.PersonalBillResponse? createdBill,
    api.GroupBillResponse? groupDetailBill,
    api.GroupBillResponse? createdGroupBill,
  }) : activeBills = activeBills ?? const [],
       archivedBills = archivedBills ?? const [],
       activeGroupBills = activeGroupBills ?? const [],
       archivedGroupBills = archivedGroupBills ?? const [],
       detailBill = detailBill ?? sampleApiBill(),
       createdBill = createdBill ?? sampleApiBill(),
       groupDetailBill = groupDetailBill ?? sampleApiGroupBill(),
       createdGroupBill = createdGroupBill ?? sampleApiGroupBill();

  final Object? failure;
  final List<api.PersonalBillResponse> activeBills;
  final List<api.PersonalBillResponse> archivedBills;
  final List<api.GroupBillResponse> activeGroupBills;
  final List<api.GroupBillResponse> archivedGroupBills;
  final api.PersonalBillResponse detailBill;
  final api.PersonalBillResponse createdBill;
  final api.GroupBillResponse groupDetailBill;
  final api.GroupBillResponse createdGroupBill;
  final archiveStates = <api.ExpenseBillArchiveState?>[];
  final accessTokens = <String>[];
  final limits = <int?>[];
  int listCalls = 0;
  int createCalls = 0;
  int getCalls = 0;
  int listGroupCalls = 0;
  int createGroupCalls = 0;
  int submitGroupCalls = 0;
  int acceptGroupParticipantCalls = 0;
  int rejectGroupParticipantCalls = 0;
  int getGroupCalls = 0;
  api.CreatePersonalBillRequest? lastCreateBody;
  api.CreateGroupBillRequest? lastGroupCreateBody;
  api.RejectBillParticipantRequest? lastRejectParticipantBody;
  String? lastBillId;
  String? lastGroupId;
  String? lastUserProfileId;

  @override
  Future<api.PersonalBillListResponse> listPersonalBills({
    api.ExpenseBillArchiveState? archiveState,
    int? limit,
    required String accessToken,
  }) async {
    listCalls += 1;
    archiveStates.add(archiveState);
    accessTokens.add(accessToken);
    limits.add(limit);
    _throwIfNeeded();
    return api.PersonalBillListResponse(
      bills: archiveState == api.ExpenseBillArchiveStateValues.archived
          ? archivedBills
          : activeBills,
    );
  }

  @override
  Future<api.PersonalBillResponse> createPersonalBill(
    api.CreatePersonalBillRequest body, {
    required String accessToken,
  }) async {
    createCalls += 1;
    lastCreateBody = body;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return createdBill;
  }

  @override
  Future<api.GroupBillResponse> createGroupBill(
    String groupId,
    api.CreateGroupBillRequest body, {
    required String accessToken,
  }) async {
    createGroupCalls += 1;
    lastGroupId = groupId;
    lastGroupCreateBody = body;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return createdGroupBill;
  }

  @override
  Future<void> submitGroupBill(
    String groupId,
    String billId, {
    required String accessToken,
  }) async {
    submitGroupCalls += 1;
    lastGroupId = groupId;
    lastBillId = billId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
  }

  @override
  Future<void> acceptGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId, {
    required String accessToken,
  }) async {
    acceptGroupParticipantCalls += 1;
    lastGroupId = groupId;
    lastBillId = billId;
    lastUserProfileId = userProfileId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
  }

  @override
  Future<void> rejectGroupBillParticipant(
    String groupId,
    String billId,
    String userProfileId,
    api.RejectBillParticipantRequest body, {
    required String accessToken,
  }) async {
    rejectGroupParticipantCalls += 1;
    lastGroupId = groupId;
    lastBillId = billId;
    lastUserProfileId = userProfileId;
    lastRejectParticipantBody = body;
    accessTokens.add(accessToken);
    _throwIfNeeded();
  }

  @override
  Future<api.PersonalBillResponse> getPersonalBill(
    String billId, {
    required String accessToken,
  }) async {
    getCalls += 1;
    lastBillId = billId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return detailBill;
  }

  @override
  Future<api.GroupBillListResponse> listGroupBills(
    String groupId, {
    api.ExpenseBillArchiveState? archiveState,
    int? limit,
    required String accessToken,
  }) async {
    listGroupCalls += 1;
    lastGroupId = groupId;
    archiveStates.add(archiveState);
    accessTokens.add(accessToken);
    limits.add(limit);
    _throwIfNeeded();
    return api.GroupBillListResponse(
      bills: archiveState == api.ExpenseBillArchiveStateValues.archived
          ? archivedGroupBills
          : activeGroupBills,
    );
  }

  @override
  Future<api.GroupBillResponse> getGroupBill(
    String groupId,
    String billId, {
    required String accessToken,
  }) async {
    getGroupCalls += 1;
    lastGroupId = groupId;
    lastBillId = billId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return groupDetailBill;
  }

  void _throwIfNeeded() {
    final error = failure;
    if (error != null) {
      throw error;
    }
  }
}

api.PersonalBillResponse sampleApiBill({
  String id = _billId,
  String? merchantName = 'Corner Market',
  api.ExpenseBillParticipantStatus participantStatus =
      api.ExpenseBillParticipantStatusValues.pendingAcceptance,
  api.ExpenseBillParticipantRejectionReasonCode? participantRejectionReasonCode,
}) {
  return api.PersonalBillResponse(
    id: id,
    merchantName: merchantName,
    billDate: '2026-05-17',
    status: api.ExpenseBillStatusValues.draft,
    reconciliation: api.ExpenseBillReconciliationResponse(
      status: api.ExpenseBillReconciliationStatusValues.unreconciled,
      updatedAtUtc: null,
      updatedByUserProfileId: null,
      reconciledAtUtc: null,
      note: null,
    ),
    revisionCreationActions: const api.BillRevisionCreationActionsResponse(
      canCreateRevision: true,
    ),
    totalAmount: '10.80',
    totalCurrency: 'USD',
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    items: [
      api.PersonalBillItemResponse(
        id: _itemId,
        name: 'Milk',
        note: null,
        amount: '10.00',
        currency: 'USD',
        sortOrder: 0,
        splits: const [],
      ),
    ],
    participants: [
      api.PersonalBillParticipantResponse(
        userProfileId: _userProfileId,
        status: participantStatus,
        resolvedShareAmount: '10.80',
        resolvedShareCurrency: 'USD',
        rejectionReasonCode: participantRejectionReasonCode,
      ),
    ],
    payers: const [
      api.PersonalBillPayerResponse(
        userProfileId: _userProfileId,
        amount: '10.80',
        currency: 'USD',
        paymentMethodLabelSnapshot: null,
      ),
    ],
    adjustments: const [
      api.PersonalBillAdjustmentResponse(
        id: _adjustmentId,
        type: api.ExpenseBillAdjustmentTypeValues.tax,
        direction: api.ExpenseBillAdjustmentDirectionValues.charge,
        allocationMethod:
            api.PersonalBillAdjustmentAllocationMethodValues.equal,
        amount: '0.80',
        currency: 'USD',
        reasonNote: null,
        sortOrder: 0,
      ),
    ],
    calculatedAdjustmentAllocations: const [],
  );
}

api.GroupBillResponse sampleApiGroupBill({
  String id = _billId,
  String groupId = _groupId,
  String? merchantName = 'Corner Market',
  api.ExpenseBillParticipantStatus participantStatus =
      api.ExpenseBillParticipantStatusValues.pendingAcceptance,
  api.ExpenseBillParticipantRejectionReasonCode? participantRejectionReasonCode,
}) {
  return api.GroupBillResponse(
    id: id,
    groupId: groupId,
    merchantName: merchantName,
    billDate: '2026-05-17',
    status: api.ExpenseBillStatusValues.draft,
    reconciliation: api.ExpenseBillReconciliationResponse(
      status: api.ExpenseBillReconciliationStatusValues.unreconciled,
      updatedAtUtc: null,
      updatedByUserProfileId: null,
      reconciledAtUtc: null,
      note: null,
    ),
    revisionCreationActions: const api.BillRevisionCreationActionsResponse(
      canCreateRevision: false,
    ),
    totalAmount: '10.80',
    totalCurrency: 'USD',
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    items: [
      api.GroupBillItemResponse(
        id: _itemId,
        name: 'Milk',
        note: null,
        amount: '10.00',
        currency: 'USD',
        sortOrder: 0,
        splits: const [],
      ),
    ],
    participants: [
      api.GroupBillParticipantResponse(
        userProfileId: _userProfileId,
        status: participantStatus,
        resolvedShareAmount: '10.80',
        resolvedShareCurrency: 'USD',
        rejectionReasonCode: participantRejectionReasonCode,
      ),
    ],
    payers: const [
      api.GroupBillPayerResponse(
        userProfileId: _userProfileId,
        amount: '10.80',
        currency: 'USD',
        paymentMethodLabelSnapshot: null,
      ),
    ],
    adjustments: const [
      api.GroupBillAdjustmentResponse(
        id: _adjustmentId,
        type: api.ExpenseBillAdjustmentTypeValues.tax,
        direction: api.ExpenseBillAdjustmentDirectionValues.charge,
        allocationMethod: api.GroupBillAdjustmentAllocationMethodValues.equal,
        amount: '0.80',
        currency: 'USD',
        reasonNote: null,
        sortOrder: 0,
      ),
    ],
    calculatedAdjustmentAllocations: const [],
  );
}

const _billId = '22222222-2222-2222-2222-222222222222';
const _archivedBillId = '33333333-3333-3333-3333-333333333333';
const _groupId = '99999999-9999-9999-9999-999999999999';
const _itemId = '44444444-4444-4444-4444-444444444444';
const _userProfileId = '55555555-5555-5555-5555-555555555555';
const _otherUserProfileId = '77777777-7777-7777-7777-777777777777';
const _adjustmentId = '66666666-6666-6666-6666-666666666666';
const _hiddenBody = {'detail': 'internal-detail'};
final _createdAtUtc = DateTime.utc(2026, 5, 17, 10);
final _updatedAtUtc = DateTime.utc(2026, 5, 17, 11);
