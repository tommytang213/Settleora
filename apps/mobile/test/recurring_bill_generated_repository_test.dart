import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/settleora_api_client.dart';
import 'package:mobile/recurring_bills/generated_recurring_bill_repository.dart';
import 'package:mobile/recurring_bills/recurring_bill_repository.dart';
import 'package:settleora_api_client/settleora_api.dart' as api;

void main() {
  group('GeneratedSettleoraRecurringBillRepository', () {
    test('requires a session before calling the generated client', () async {
      final client = FakeRecurringBillGeneratedClient();
      final repository = GeneratedSettleoraRecurringBillRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider(null),
      );

      final failure = await captureRecurringBillFailure(() {
        return repository.listTemplates();
      });

      expect(failure.kind, SettleoraRecurringBillFailureKind.sessionRequired);
      expect(client.listTemplateCalls, 0);
    });

    test('maps template lists into safe mobile models', () async {
      final tokenProvider = FakeAccessTokenProvider('  redacted  ');
      final client = FakeRecurringBillGeneratedClient(
        templates: [
          sampleApiTemplate(),
          sampleApiTemplate(
            id: _groupTemplateId,
            merchantName: null,
            groupId: _groupId,
          ),
        ],
      );
      final repository = GeneratedSettleoraRecurringBillRepository(
        client: client,
        accessTokenProvider: tokenProvider,
      );

      final templates = await repository.listTemplates(
        status: ' active ',
        groupId: ' $_groupId ',
        fromDate: '2026-05-01',
        toDate: '2026-06-01',
        maxItems: 25,
      );

      expect(templates, hasLength(2));
      expect(templates.first.displayName, 'Rent');
      expect(templates.first.forecastAmount, '1200.00');
      expect(templates.first.forecastCurrency, 'USD');
      expect(templates.first.createdAtUtc.isUtc, isTrue);
      expect(templates.last.displayName, 'Group recurring bill');
      expect(templates.last.isGroupScoped, isTrue);
      expect(client.listTemplateCalls, 1);
      expect(client.lastStatus, 'active');
      expect(client.lastGroupId, _groupId);
      expect(client.lastFromDate, '2026-05-01');
      expect(client.lastToDate, '2026-06-01');
      expect(client.accessTokens, ['redacted']);
      expect(tokenProvider.calls, 1);
    });

    test('maps forecast occurrences into safe mobile models', () async {
      final client = FakeRecurringBillGeneratedClient(
        forecast: [
          sampleApiForecast(),
          sampleApiForecast(
            status: api.RecurringBillOccurrenceStatusValues.draftGenerated,
            draftGenerated: true,
            generatedBillId: _generatedBillId,
          ),
        ],
      );
      final repository = GeneratedSettleoraRecurringBillRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final forecast = await repository.listForecast(
        fromDate: ' 2026-05-18 ',
        toDate: '2026-06-18',
        limit: 10,
      );

      expect(forecast, hasLength(2));
      expect(forecast.first.displayName, 'Rent');
      expect(forecast.first.canGenerateDraft, isTrue);
      expect(forecast.first.forecastAmount, '1200.00');
      expect(forecast.last.canGenerateDraft, isFalse);
      expect(forecast.last.generatedBillId, _generatedBillId);
      expect(client.forecastCalls, 1);
      expect(client.lastLimit, 10);
      expect(client.lastFromDate, '2026-05-18');
      expect(client.lastToDate, '2026-06-18');
    });

    test('maps detail and generate draft responses', () async {
      final client = FakeRecurringBillGeneratedClient();
      final repository = GeneratedSettleoraRecurringBillRepository(
        client: client,
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final detail = await repository.getTemplate(' $_templateId ');
      final draft = await repository.generateDraft(
        templateId: ' $_templateId ',
        occurrenceDate: ' 2026-06-01 ',
      );

      expect(detail.id, _templateId);
      expect(detail.payloadVersion, 1);
      expect(detail.schedule.startDate, '2026-05-01');
      expect(detail.billPayload?.currency, 'USD');
      expect(detail.billPayload?.items.single.name, 'Base rent');
      expect(detail.billPayload?.items.single.amount, '1200.00');
      expect(detail.billPayload?.items.single.currency, 'USD');
      expect(
        detail.billPayload?.items.single.splits.single.userProfileId,
        _ownerProfileId,
      );
      expect(
        detail.billPayload?.items.single.splits.single.basisValue,
        '1200.00',
      );
      expect(detail.billPayload?.adjustments.single.amount, '5.00');
      expect(detail.billPayload?.payers.single.userProfileId, _ownerProfileId);
      expect(draft.generatedBillId, _generatedBillId);
      expect(draft.totalAmount, '1200.00');
      expect(draft.totalCurrency, 'USD');
      expect(client.getTemplateCalls, 1);
      expect(client.generateDraftCalls, 1);
      expect(client.lastTemplateId, _templateId);
      expect(client.lastOccurrenceDate, '2026-06-01');
      expect(client.accessTokens, ['redacted', 'redacted']);
    });

    test(
      'creates, updates, and runs lifecycle through generated client',
      () async {
        final client = FakeRecurringBillGeneratedClient();
        final repository = GeneratedSettleoraRecurringBillRepository(
          client: client,
          accessTokenProvider: FakeAccessTokenProvider(' redacted '),
        );

        final created = await repository.createTemplate(
          const SettleoraRecurringBillCreateDraft(
            groupId: ' 66666666-6666-6666-6666-666666666666 ',
            merchantName: ' Rent ',
            description: ' Monthly rent ',
            schedule: SettleoraRecurringBillScheduleDraft(
              type: SettleoraRecurringBillScheduleTypeValues.monthly,
              intervalCount: 1,
              intervalDays: null,
              startDate: ' 2026-05-01 ',
              endDate: null,
              dueOffsetDays: 3,
            ),
            currency: ' usd ',
            items: [
              SettleoraRecurringBillTemplatePayloadItemDraft(
                name: ' Base rent ',
                amount: ' 1200.00 ',
                note: ' Apartment ',
              ),
            ],
          ),
        );
        final updated = await repository.updateTemplate(
          templateId: ' $_templateId ',
          draft: const SettleoraRecurringBillUpdateDraft(
            merchantName: ' Rent v2 ',
            description: '',
            schedule: SettleoraRecurringBillScheduleDraft(
              type: SettleoraRecurringBillScheduleTypeValues.weekly,
              intervalCount: 2,
              intervalDays: null,
              startDate: '2026-05-08',
              endDate: '2026-06-08',
              dueOffsetDays: 0,
            ),
            billPayload: SettleoraRecurringBillTemplatePayloadDraft(
              currency: ' hkd ',
              items: [
                SettleoraRecurringBillTemplatePayloadItemDraft(
                  name: ' Base rent v2 ',
                  amount: ' 1250.00 ',
                  note: ' Apartment v2 ',
                  currency: ' hkd ',
                  splits: [
                    SettleoraRecurringBillTemplatePayloadItemSplit(
                      userProfileId: _ownerProfileId,
                      splitMethod:
                          api.ExpenseBillItemSplitMethodValues.exactAmount,
                      basisValue: '1250.00',
                      allocationOrder: 0,
                    ),
                  ],
                ),
              ],
              adjustments: [
                SettleoraRecurringBillTemplatePayloadAdjustment(
                  type: api.ExpenseBillAdjustmentTypeValues.serviceCharge,
                  direction: api.ExpenseBillAdjustmentDirectionValues.charge,
                  allocationMethod: api
                      .PersonalBillAdjustmentAllocationMethodValues
                      .proportionalByItemSubtotal,
                  amount: '5.00',
                  currency: 'hkd',
                  reasonNote: 'Template fee',
                ),
              ],
              payers: [
                SettleoraRecurringBillTemplatePayloadPayer(
                  userProfileId: _ownerProfileId,
                  amount: '1255.00',
                  currency: 'hkd',
                  paymentMethodLabelSnapshot: 'Card',
                ),
              ],
            ),
          ),
        );
        await repository.pauseTemplate(' $_templateId ');
        await repository.resumeTemplate(' $_templateId ');
        await repository.archiveTemplate(' $_templateId ');

        expect(created.id, _templateId);
        expect(updated.id, _templateId);
        expect(client.createTemplateCalls, 1);
        expect(client.updateTemplateCalls, 1);
        expect(client.pauseTemplateCalls, 1);
        expect(client.resumeTemplateCalls, 1);
        expect(client.archiveTemplateCalls, 1);
        expect(client.lastCreateRequest?.groupId, _groupId);
        expect(client.lastCreateRequest?.merchantName, 'Rent');
        expect(client.lastCreateRequest?.billPayload.currency, 'USD');
        expect(
          client.lastCreateRequest?.billPayload.items.single.name,
          'Base rent',
        );
        expect(
          client.lastCreateRequest?.billPayload.items.single.amount,
          '1200.00',
        );
        expect(client.lastUpdateRequest?.merchantName, 'Rent v2');
        expect(client.lastUpdateRequest?.description, isNull);
        expect(client.lastUpdateRequest?.schedule?.type, 'weekly');
        expect(client.lastUpdateRequest?.billPayload?.currency, 'HKD');
        expect(
          client.lastUpdateRequest?.billPayload?.items.single.name,
          'Base rent v2',
        );
        expect(
          client.lastUpdateRequest?.billPayload?.items.single.amount,
          '1250.00',
        );
        expect(
          client.lastUpdateRequest?.billPayload?.items.single.currency,
          'HKD',
        );
        expect(
          client
              .lastUpdateRequest
              ?.billPayload
              ?.items
              .single
              .splits
              ?.single
              .basisValue,
          '1250.00',
        );
        expect(
          client.lastUpdateRequest?.billPayload?.adjustments?.single.amount,
          '5.00',
        );
        expect(
          client.lastUpdateRequest?.billPayload?.payers?.single.amount,
          '1255.00',
        );
        expect(client.lastTemplateId, _templateId);
        expect(client.accessTokens, [
          'redacted',
          'redacted',
          'redacted',
          'redacted',
          'redacted',
        ]);
      },
    );

    test('maps 401 responses to session-expired failures', () async {
      final repository = GeneratedSettleoraRecurringBillRepository(
        client: FakeRecurringBillGeneratedClient(
          failure: api.SettleoraApiException(401, 'Unauthorized', _hiddenBody),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final failure = await captureRecurringBillFailure(() {
        return repository.listForecast();
      });

      expect(failure.kind, SettleoraRecurringBillFailureKind.sessionExpired);
      expect(failure.statusCode, 401);
      expect(failure.message, isNot(contains('internal-detail')));
      expect(failure.toString(), isNot(contains('internal-detail')));
    });

    test('validates required IDs, limits, statuses, and ISO dates', () async {
      final repository = GeneratedSettleoraRecurringBillRepository(
        client: FakeRecurringBillGeneratedClient(),
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      expect(
        (await captureRecurringBillFailure(
          () => repository.listForecast(limit: 0),
        )).kind,
        SettleoraRecurringBillFailureKind.validation,
      );
      expect(
        (await captureRecurringBillFailure(
          () => repository.listTemplates(status: 'deleted'),
        )).kind,
        SettleoraRecurringBillFailureKind.validation,
      );
      expect(
        (await captureRecurringBillFailure(
          () => repository.getTemplate(' '),
        )).kind,
        SettleoraRecurringBillFailureKind.validation,
      );
      expect(
        (await captureRecurringBillFailure(
          () => repository.generateDraft(
            templateId: _templateId,
            occurrenceDate: '2026-99-99',
          ),
        )).kind,
        SettleoraRecurringBillFailureKind.validation,
      );
      expect(
        (await captureRecurringBillFailure(
          () => repository.createTemplate(
            const SettleoraRecurringBillCreateDraft(
              groupId: null,
              merchantName: null,
              description: null,
              schedule: SettleoraRecurringBillScheduleDraft(
                type: SettleoraRecurringBillScheduleTypeValues.monthly,
                intervalCount: 0,
                intervalDays: null,
                startDate: '2026-05-01',
                endDate: null,
                dueOffsetDays: null,
              ),
              currency: 'US',
              items: [],
            ),
          ),
        )).kind,
        SettleoraRecurringBillFailureKind.validation,
      );
    });

    test('maps network and server failures to bounded messages', () async {
      final networkRepository = GeneratedSettleoraRecurringBillRepository(
        client: FakeRecurringBillGeneratedClient(
          failure: const SocketException('internal socket detail'),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );
      final serverRepository = GeneratedSettleoraRecurringBillRepository(
        client: FakeRecurringBillGeneratedClient(
          failure: api.SettleoraApiException(503, 'Unavailable', _hiddenBody),
        ),
        accessTokenProvider: FakeAccessTokenProvider('redacted'),
      );

      final networkFailure = await captureRecurringBillFailure(() {
        return networkRepository.listTemplates();
      });
      final serverFailure = await captureRecurringBillFailure(() {
        return serverRepository.listTemplates();
      });

      expect(networkFailure.kind, SettleoraRecurringBillFailureKind.network);
      expect(networkFailure.message, isNot(contains('internal socket detail')));
      expect(serverFailure.kind, SettleoraRecurringBillFailureKind.server);
      expect(serverFailure.statusCode, 503);
      expect(serverFailure.message, isNot(contains('internal-detail')));
    });
  });
}

Future<SettleoraRecurringBillFailure> captureRecurringBillFailure(
  Future<Object?> Function() operation,
) async {
  try {
    await operation();
  } on SettleoraRecurringBillFailure catch (failure) {
    return failure;
  }

  fail('Expected SettleoraRecurringBillFailure.');
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

class FakeRecurringBillGeneratedClient
    implements SettleoraRecurringBillGeneratedClient {
  FakeRecurringBillGeneratedClient({
    this.failure,
    List<api.RecurringBillTemplateResponse>? templates,
    List<api.RecurringBillForecastOccurrenceResponse>? forecast,
    api.RecurringBillTemplateResponse? detail,
    api.RecurringBillGenerateDraftResponse? draft,
  }) : templates = templates ?? [sampleApiTemplate()],
       forecast = forecast ?? [sampleApiForecast()],
       detail = detail ?? sampleApiTemplate(),
       draft = draft ?? sampleApiDraft();

  final Object? failure;
  final List<api.RecurringBillTemplateResponse> templates;
  final List<api.RecurringBillForecastOccurrenceResponse> forecast;
  final api.RecurringBillTemplateResponse detail;
  final api.RecurringBillGenerateDraftResponse draft;
  final accessTokens = <String>[];
  int listTemplateCalls = 0;
  int forecastCalls = 0;
  int getTemplateCalls = 0;
  int createTemplateCalls = 0;
  int updateTemplateCalls = 0;
  int pauseTemplateCalls = 0;
  int resumeTemplateCalls = 0;
  int archiveTemplateCalls = 0;
  int generateDraftCalls = 0;
  api.CreateRecurringBillTemplateRequest? lastCreateRequest;
  api.UpdateRecurringBillTemplateRequest? lastUpdateRequest;
  String? lastStatus;
  String? lastGroupId;
  String? lastFromDate;
  String? lastToDate;
  int? lastLimit;
  String? lastTemplateId;
  String? lastOccurrenceDate;

  @override
  Future<api.RecurringBillTemplateResponse> createRecurringBillTemplate(
    api.CreateRecurringBillTemplateRequest body, {
    required String accessToken,
  }) async {
    createTemplateCalls += 1;
    lastCreateRequest = body;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return detail;
  }

  @override
  Future<api.RecurringBillTemplateListResponse> listRecurringBillTemplates({
    api.RecurringBillTemplateStatus? status,
    String? groupId,
    String? fromDate,
    String? toDate,
    required String accessToken,
  }) async {
    listTemplateCalls += 1;
    lastStatus = status;
    lastGroupId = groupId;
    lastFromDate = fromDate;
    lastToDate = toDate;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return api.RecurringBillTemplateListResponse(templates: templates);
  }

  @override
  Future<api.RecurringBillForecastListResponse> listRecurringBillForecast({
    String? fromDate,
    String? toDate,
    int? limit,
    String? groupId,
    required String accessToken,
  }) async {
    forecastCalls += 1;
    lastFromDate = fromDate;
    lastToDate = toDate;
    lastLimit = limit;
    lastGroupId = groupId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return api.RecurringBillForecastListResponse(occurrences: forecast);
  }

  @override
  Future<api.RecurringBillTemplateResponse> getRecurringBillTemplate(
    String templateId, {
    required String accessToken,
  }) async {
    getTemplateCalls += 1;
    lastTemplateId = templateId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return detail;
  }

  @override
  Future<api.RecurringBillTemplateResponse> updateRecurringBillTemplate(
    String templateId,
    api.UpdateRecurringBillTemplateRequest body, {
    required String accessToken,
  }) async {
    updateTemplateCalls += 1;
    lastTemplateId = templateId;
    lastUpdateRequest = body;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return detail;
  }

  @override
  Future<api.RecurringBillTemplateResponse> pauseRecurringBillTemplate(
    String templateId, {
    required String accessToken,
  }) async {
    pauseTemplateCalls += 1;
    lastTemplateId = templateId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return detail;
  }

  @override
  Future<api.RecurringBillTemplateResponse> resumeRecurringBillTemplate(
    String templateId, {
    required String accessToken,
  }) async {
    resumeTemplateCalls += 1;
    lastTemplateId = templateId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return detail;
  }

  @override
  Future<api.RecurringBillTemplateResponse> archiveRecurringBillTemplate(
    String templateId, {
    required String accessToken,
  }) async {
    archiveTemplateCalls += 1;
    lastTemplateId = templateId;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return detail;
  }

  @override
  Future<api.RecurringBillGenerateDraftResponse> generateRecurringBillDraft(
    String templateId,
    String occurrenceDate, {
    required String accessToken,
  }) async {
    generateDraftCalls += 1;
    lastTemplateId = templateId;
    lastOccurrenceDate = occurrenceDate;
    accessTokens.add(accessToken);
    _throwIfNeeded();
    return draft;
  }

  void _throwIfNeeded() {
    final error = failure;
    if (error != null) {
      throw error;
    }
  }
}

api.RecurringBillTemplateResponse sampleApiTemplate({
  String id = _templateId,
  String? groupId,
  String? merchantName = 'Rent',
}) {
  return api.RecurringBillTemplateResponse(
    id: id,
    ownerUserProfileId: _ownerProfileId,
    groupId: groupId,
    merchantName: merchantName,
    description: 'Monthly apartment rent',
    status: api.RecurringBillTemplateStatusValues.active,
    schedule: const api.RecurringBillScheduleResponse(
      type: api.RecurringBillScheduleTypeValues.monthly,
      intervalCount: 1,
      intervalDays: null,
      startDate: '2026-05-01',
      endDate: null,
      dueOffsetDays: 3,
    ),
    forecastAmount: '1200.00',
    forecastCurrency: 'USD',
    billPayload: api.RecurringBillTemplatePayload(
      currency: 'USD',
      items: [
        api.RecurringBillTemplatePayloadItem(
          name: 'Base rent',
          note: 'Apartment',
          amount: '1200.00',
          currency: null,
          splits: [
            api.RecurringBillTemplatePayloadItemSplit(
              userProfileId: _ownerProfileId,
              splitMethod: api.ExpenseBillItemSplitMethodValues.exactAmount,
              basisValue: '1200.00',
              allocationOrder: null,
            ),
          ],
        ),
      ],
      adjustments: [
        api.RecurringBillTemplatePayloadAdjustment(
          type: api.ExpenseBillAdjustmentTypeValues.serviceCharge,
          direction: api.ExpenseBillAdjustmentDirectionValues.charge,
          allocationMethod: api
              .PersonalBillAdjustmentAllocationMethodValues
              .proportionalByItemSubtotal,
          amount: '5.00',
          currency: null,
          reasonNote: 'Template fee',
        ),
      ],
      payers: [
        api.RecurringBillTemplatePayloadPayer(
          userProfileId: _ownerProfileId,
          amount: '1205.00',
          currency: null,
          paymentMethodLabelSnapshot: 'Card',
        ),
      ],
    ),
    nextOccurrenceDate: '2026-06-01',
    payloadVersion: 1,
    createdAtUtc: _createdAtUtc,
    updatedAtUtc: _updatedAtUtc,
    archivedAtUtc: null,
  );
}

api.RecurringBillForecastOccurrenceResponse sampleApiForecast({
  String status = api.RecurringBillOccurrenceStatusValues.forecasted,
  bool draftGenerated = false,
  String? generatedBillId,
}) {
  return api.RecurringBillForecastOccurrenceResponse(
    templateId: _templateId,
    occurrenceId: _occurrenceId,
    groupId: null,
    occurrenceDate: '2026-06-01',
    dueDate: '2026-06-04',
    status: status,
    draftGenerated: draftGenerated,
    generatedBillId: generatedBillId,
    forecastAmount: '1200.00',
    forecastCurrency: 'USD',
    merchantName: 'Rent',
  );
}

api.RecurringBillGenerateDraftResponse sampleApiDraft() {
  return const api.RecurringBillGenerateDraftResponse(
    templateId: _templateId,
    occurrenceId: _occurrenceId,
    occurrenceDate: '2026-06-01',
    dueDate: '2026-06-04',
    occurrenceStatus: api.RecurringBillOccurrenceStatusValues.draftGenerated,
    generatedBillId: _generatedBillId,
    billStatus: api.ExpenseBillStatusValues.draft,
    totalAmount: '1200.00',
    totalCurrency: 'USD',
  );
}

const _templateId = '11111111-1111-1111-1111-111111111111';
const _groupTemplateId = '22222222-2222-2222-2222-222222222222';
const _occurrenceId = '33333333-3333-3333-3333-333333333333';
const _generatedBillId = '44444444-4444-4444-4444-444444444444';
const _ownerProfileId = '55555555-5555-5555-5555-555555555555';
const _groupId = '66666666-6666-6666-6666-666666666666';
const _hiddenBody = {'detail': 'internal-detail'};
final _createdAtUtc = DateTime.utc(2026, 5, 18, 9);
final _updatedAtUtc = DateTime.utc(2026, 5, 18, 10);
