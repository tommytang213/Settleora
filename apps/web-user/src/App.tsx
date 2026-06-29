import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  createInitialSessionBoundaryState,
  loadSessionBoundaryState,
  type SessionBoundaryState
} from "./authSession";
import {
  filterBillsForPresentation,
  formatDate,
  formatMoney,
  labelize,
  loadBillDetailReadout,
  loadBillsReadout,
  summarizeCurrencyCounts,
  summarizeStatusCounts,
  type BillDetailReadoutState,
  type BillsReadoutState
} from "./billsReadout";
import {
  createFriendsUnavailableReadout,
  filterGroupsForPresentation,
  loadGroupBillDetailReadout,
  loadGroupDetailReadout,
  loadGroupsReadout,
  summarizeGroupRoles,
  summarizeGroupStatuses,
  type FriendsReadoutState,
  type GroupBillDetailReadoutState,
  type GroupDetailReadoutState,
  type GroupsReadoutState
} from "./groupsFriendsReadout";
import {
  filterSettlementsForPresentation,
  formatProofSize,
  loadSettlementDetailReadout,
  loadSettlementsReadout,
  settlementFilterLabels,
  summarizeCounterpartyPaymentDetails,
  summarizeBalanceDirections,
  summarizeSettlementProofMetadata,
  summarizeSettlementStatuses,
  type SettlementDetailReadoutState,
  type SettlementPresentationFilter,
  type SettlementsReadoutState
} from "./settlementsReadout";
import {
  loadProfilePaymentReadout,
  summarizePaymentConfiguration,
  type ProfilePaymentReadoutState
} from "./profileReadout";
import {
  collectNotificationTargetFields,
  filterNotificationsForPresentation,
  loadNotificationsReadout,
  summarizeNotificationPreferences,
  summarizeNotificationPriorities,
  summarizeNotificationStatuses,
  type NotificationPresentationFilter,
  type NotificationPresentationSort,
  type NotificationsReadoutState
} from "./notificationsReadout";
import {
  loadReportsReadout,
  summarizeReportCounts,
  summarizeReportTotals,
  type ReportsReadoutState
} from "./reportsReadout";
import {
  labelImportExportStatus,
  loadImportExportReadout,
  type ImportExportCapability,
  type ImportExportReadoutState
} from "./importExportReadout";
import { dashboardCards, navItems, safeStatePanels, type NavItem } from "./shellModel";
import type {
  ExpenseBillReconciliationStatus,
  ExpenseBillStatus,
  GroupBillResponse,
  GroupResponse,
  InAppNotificationResponse,
  MonthlyReportResponse,
  PersonalBillResponse,
  SelfPaymentDetailsQrFileResponse,
  SettlementBalanceProjectionResponse,
  SettlementPaymentResponse,
  SettlementPaymentProofResponse,
  SettlementRequestResponse
} from "../../../packages/client-web/src/generated";

const primaryNav = navItems.filter((item) => item.section === "primary");
const moreNav = navItems.filter((item) => item.section === "more");
const mobileNav = [
  { item: navItems.find((item) => item.id === "home") ?? navItems[0], label: "Home" },
  { item: navItems.find((item) => item.id === "bills") ?? navItems[0], label: "Bills" },
  { item: navItems.find((item) => item.id === "groups") ?? navItems[0], label: "Groups" },
  { item: navItems.find((item) => item.id === "settlements") ?? navItems[0], label: "Settle" },
  { item: navItems.find((item) => item.id === "import-export") ?? navItems[0], label: "Import" },
  { item: navItems.find((item) => item.id === "notifications") ?? navItems[0], label: "Alerts" }
];

export function normalizeRouteId(routeId: string): string {
  const normalizedRouteId = routeId === "settle" ? "settlements" : routeId;

  return navItems.some((item) => item.id === normalizedRouteId) ? normalizedRouteId : "home";
}

function getInitialActiveId() {
  const routeId = window.location.hash.replace(/^#\/?/, "");

  return normalizeRouteId(routeId);
}

function setActiveRoute(id: string) {
  window.location.hash = `/${id}`;
}

export function App() {
  const [activeId, setActiveId] = useState(() => getInitialActiveId());
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupBillId, setSelectedGroupBillId] = useState<string | null>(null);
  const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionBoundaryState>(() =>
    createInitialSessionBoundaryState()
  );
  const [billsReadout, setBillsReadout] = useState<BillsReadoutState>({
    status: "auth_required",
    message: "Sign in is required before Settleora can show personal bills on the web.",
    bills: []
  });
  const [billDetail, setBillDetail] = useState<BillDetailReadoutState>({
    status: "auth_required",
    message: "Select a visible bill after sign-in to open the read-only detail."
  });
  const [groupsReadout, setGroupsReadout] = useState<GroupsReadoutState>({
    status: "auth_required",
    message: "Sign in is required before Settleora can show your groups on the web.",
    groups: []
  });
  const [groupDetail, setGroupDetail] = useState<GroupDetailReadoutState>({
    status: "auth_required",
    message: "Select a visible group after sign-in to open the read-only detail."
  });
  const [groupBillDetail, setGroupBillDetail] = useState<GroupBillDetailReadoutState>({
    status: "auth_required",
    message: "Select a visible group bill after sign-in to open the read-only detail."
  });
  const [friendsReadout] = useState<FriendsReadoutState>(() => createFriendsUnavailableReadout());
  const [settlementsReadout, setSettlementsReadout] = useState<SettlementsReadoutState>({
    status: "auth_required",
    message: "Sign in is required before Settleora can show settlement requests on the web.",
    settlements: []
  });
  const [settlementDetail, setSettlementDetail] = useState<SettlementDetailReadoutState>({
    status: "auth_required",
    message: "Select a visible settlement after sign-in to open the read-only detail."
  });
  const [profileReadout, setProfileReadout] = useState<ProfilePaymentReadoutState>({
    status: "auth_required",
    message: "Sign in is required before Settleora can show profile and payment details on the web.",
    unavailableSections: []
  });
  const [notificationsReadout, setNotificationsReadout] = useState<NotificationsReadoutState>({
    status: "auth_required",
    message: "Sign in is required before Settleora can show notifications on the web.",
    notifications: [],
    missingMethods: [],
    unsupportedSections: []
  });
  const [reportsReadout, setReportsReadout] = useState<ReportsReadoutState>({
    status: "auth_required",
    message: "Sign in is required before Settleora can show reports and search results on the web.",
    month: new Date().toISOString().slice(0, 7),
    searchRows: [],
    missingMethods: [],
    unsupportedSections: []
  });
  const [billSearch, setBillSearch] = useState("");
  const [billStatusFilter, setBillStatusFilter] = useState<ExpenseBillStatus | "all">("all");
  const [billReconciliationFilter, setBillReconciliationFilter] = useState<
    ExpenseBillReconciliationStatus | "all"
  >("all");
  const [groupSearch, setGroupSearch] = useState("");
  const [settlementFilter, setSettlementFilter] = useState<SettlementPresentationFilter>("all");
  const [notificationSearch, setNotificationSearch] = useState("");
  const [notificationFilter, setNotificationFilter] = useState<NotificationPresentationFilter>("inbox");
  const [notificationSort, setNotificationSort] = useState<NotificationPresentationSort>("newest");
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [reportSearch, setReportSearch] = useState("");

  useEffect(() => {
    let isMounted = true;
    setSession({
      status: "checking",
      message: "Checking whether a verified Settleora web session is available."
    });

    void loadSessionBoundaryState({ accessToken: null }).then((nextState) => {
      if (isMounted) {
        setSession(nextState);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setActiveId(getInitialActiveId());
    };

    window.addEventListener("hashchange", onHashChange);

    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  const activeItem = useMemo(
    () => navItems.find((item) => item.id === activeId) ?? navItems[0],
    [activeId]
  );
  const importExportReadout = useMemo(() => loadImportExportReadout(), []);

  useEffect(() => {
    if (activeId !== "bills") {
      return;
    }

    let isMounted = true;
    setBillsReadout({
      status: "loading",
      message: "Loading visible bills from Settleora.",
      bills: []
    });

    void loadBillsReadout({ accessToken: session.accessToken }).then((nextState) => {
      if (!isMounted) {
        return;
      }

      setBillsReadout(nextState);
      setSelectedBillId((currentBillId) => currentBillId ?? nextState.bills[0]?.id ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [activeId, session.accessToken]);

  useEffect(() => {
    if (activeId !== "bills" || !selectedBillId) {
      setBillDetail({
        status: "auth_required",
        message: "Select a visible bill after sign-in to open the read-only detail."
      });
      return;
    }

    let isMounted = true;
    setBillDetail({
      status: "loading",
      message: "Loading bill detail, attachments, revisions, and settlement readouts."
    });

    void loadBillDetailReadout({ accessToken: session.accessToken, billId: selectedBillId }).then((nextState) => {
      if (isMounted) {
        setBillDetail(nextState);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeId, selectedBillId, session.accessToken]);

  useEffect(() => {
    if (activeId !== "groups") {
      return;
    }

    let isMounted = true;
    setGroupsReadout({
      status: "loading",
      message: "Loading visible groups from Settleora.",
      groups: []
    });

    void loadGroupsReadout({ accessToken: session.accessToken }).then((nextState) => {
      if (!isMounted) {
        return;
      }

      setGroupsReadout(nextState);
      setSelectedGroupId((currentGroupId) => currentGroupId ?? nextState.groups[0]?.id ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [activeId, session.accessToken]);

  useEffect(() => {
    if (activeId !== "groups" || !selectedGroupId) {
      setGroupDetail({
        status: "auth_required",
        message: "Select a visible group after sign-in to open the read-only detail."
      });
      setSelectedGroupBillId(null);
      return;
    }

    let isMounted = true;
    setSelectedGroupBillId(null);
    setGroupDetail({
      status: "loading",
      message: "Loading group detail, member readouts, and visible group bills."
    });

    void loadGroupDetailReadout({ accessToken: session.accessToken, groupId: selectedGroupId }).then((nextState) => {
      if (!isMounted) {
        return;
      }

      setGroupDetail(nextState);
      setSelectedGroupBillId(nextState.bills?.bills[0]?.id ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [activeId, selectedGroupId, session.accessToken]);

  useEffect(() => {
    if (activeId !== "groups" || !selectedGroupId || !selectedGroupBillId) {
      setGroupBillDetail({
        status: "auth_required",
        message: "Select a visible group bill after sign-in to open the read-only detail."
      });
      return;
    }

    let isMounted = true;
    setGroupBillDetail({
      status: "loading",
      message: "Loading group bill detail from Settleora."
    });

    void loadGroupBillDetailReadout({
      accessToken: session.accessToken,
      groupId: selectedGroupId,
      billId: selectedGroupBillId
    }).then((nextState) => {
      if (isMounted) {
        setGroupBillDetail(nextState);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeId, selectedGroupBillId, selectedGroupId, session.accessToken]);

  useEffect(() => {
    if (activeId !== "settlements") {
      return;
    }

    let isMounted = true;
    setSettlementsReadout({
      status: "loading",
      message: "Loading visible settlements from Settleora.",
      settlements: []
    });

    void loadSettlementsReadout({ accessToken: session.accessToken }).then((nextState) => {
      if (!isMounted) {
        return;
      }

      setSettlementsReadout(nextState);
      setSelectedSettlementId((currentSettlementId) => currentSettlementId ?? nextState.settlements[0]?.id ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [activeId, session.accessToken]);

  useEffect(() => {
    if (activeId !== "settlements" || !selectedSettlementId) {
      setSettlementDetail({
        status: "auth_required",
        message: "Select a visible settlement after sign-in to open the read-only detail."
      });
      return;
    }

    let isMounted = true;
    setSettlementDetail({
      status: "loading",
      message: "Loading settlement request detail and payment readouts."
    });

    void loadSettlementDetailReadout({
      accessToken: session.accessToken,
      currentUserProfileId: session.currentUser?.userProfile.id,
      settlementId: selectedSettlementId
    }).then((nextState) => {
      if (isMounted) {
        setSettlementDetail(nextState);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeId, selectedSettlementId, session.accessToken, session.currentUser?.userProfile.id]);

  useEffect(() => {
    if (activeId !== "profile") {
      return;
    }

    let isMounted = true;
    setProfileReadout({
      status: "loading",
      message: "Loading profile and payment detail metadata from Settleora.",
      unavailableSections: []
    });

    void loadProfilePaymentReadout({ accessToken: session.accessToken }).then((nextState) => {
      if (isMounted) {
        setProfileReadout(nextState);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeId, session.accessToken]);

  useEffect(() => {
    if (activeId !== "notifications") {
      return;
    }

    let isMounted = true;
    setNotificationsReadout({
      status: "loading",
      message: "Loading visible notifications from Settleora.",
      notifications: [],
      missingMethods: [],
      unsupportedSections: []
    });

    void loadNotificationsReadout({ accessToken: session.accessToken }).then((nextState) => {
      if (isMounted) {
        setNotificationsReadout(nextState);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeId, session.accessToken]);

  useEffect(() => {
    if (activeId !== "reports") {
      return;
    }

    let isMounted = true;
    setReportsReadout({
      status: "loading",
      message: "Loading monthly report and search rows from Settleora.",
      month: reportMonth,
      searchRows: [],
      missingMethods: [],
      unsupportedSections: []
    });

    void loadReportsReadout({
      accessToken: session.accessToken,
      month: reportMonth,
      search: reportSearch
    }).then((nextState) => {
      if (isMounted) {
        setReportsReadout(nextState);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeId, reportMonth, reportSearch, session.accessToken]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            S
          </div>
          <div>
            <p className="eyebrow">Settleora</p>
            <h1>User web</h1>
          </div>
        </div>
        <nav className="nav-group" aria-label="Day 1 areas">
          {primaryNav.map((item) => (
            <NavButton key={item.id} item={item} active={item.id === activeId} onClick={setActiveRoute} />
          ))}
        </nav>
        <div className="nav-divider" />
        <nav className="nav-group nav-group-secondary" aria-label="More user areas">
          {moreNav.map((item) => (
            <NavButton key={item.id} item={item} active={item.id === activeId} onClick={setActiveRoute} />
          ))}
        </nav>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Self-hosted workspace</p>
            <p className="topbar-title">Private session required</p>
          </div>
          <div className="topbar-actions" aria-label="Workspace status">
            <span className="status-chip status-sync">Server mode</span>
            <span className="status-chip status-warning">Sign-in needed</span>
            <button
              className="notification-button"
              type="button"
              aria-label="Open notifications"
              onClick={() => setActiveRoute("notifications")}
            >
              <span className="notification-dot" aria-hidden="true" />
              <span>Notifications</span>
            </button>
            <button className="avatar-button" type="button" aria-label="Open account">
              Account
            </button>
          </div>
        </header>

        <nav className="mobile-nav" aria-label="Compact navigation">
          {mobileNav.map(({ item, label }) => (
            <button
              key={item.id}
              type="button"
              className={item.id === activeId ? "mobile-nav-item active" : "mobile-nav-item"}
              onClick={() => setActiveRoute(item.id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <main id="main-content" className="main-content">
          <section className="page-header" aria-labelledby="page-title">
            <div>
              <p className="eyebrow">Day 1 user web</p>
              <h2 id="page-title">{activeItem.label}</h2>
              <p>{activeItem.description}</p>
            </div>
            <div className="page-actions" aria-label="Page actions">
              <button className="secondary-button" type="button" disabled>
                Search after sign-in
              </button>
              <button className="primary-button" type="button" disabled>
                {activeId === "bills"
                  ? "Add bill unavailable"
                  : activeId === "groups"
                    ? "Create group unavailable"
                    : activeId === "friends"
                      ? "Invite unavailable"
                      : activeId === "settlements"
                        ? "Settlement actions unavailable"
                        : activeId === "reports"
                          ? "Report actions unavailable"
                          : activeId === "import-export"
                            ? "Availability readout only"
                      : activeItem.actionLabel}
              </button>
            </div>
          </section>

          <SessionBanner session={session} />

          {activeId === "bills" ? (
            <BillsReadoutPanel
              billsReadout={billsReadout}
              detailReadout={billDetail}
              selectedBillId={selectedBillId}
              onSelectBill={setSelectedBillId}
              search={billSearch}
              onSearchChange={setBillSearch}
              statusFilter={billStatusFilter}
              onStatusFilterChange={setBillStatusFilter}
              reconciliationFilter={billReconciliationFilter}
              onReconciliationFilterChange={setBillReconciliationFilter}
            />
          ) : activeId === "groups" ? (
            <GroupsReadoutPanel
              groupsReadout={groupsReadout}
              detailReadout={groupDetail}
              groupBillDetail={groupBillDetail}
              selectedGroupId={selectedGroupId}
              selectedGroupBillId={selectedGroupBillId}
              onSelectGroup={(groupId) => {
                setSelectedGroupId(groupId);
                setSelectedGroupBillId(null);
              }}
              onSelectGroupBill={setSelectedGroupBillId}
              search={groupSearch}
              onSearchChange={setGroupSearch}
            />
          ) : activeId === "friends" ? (
            <FriendsReadoutPanel readout={friendsReadout} />
          ) : activeId === "settlements" ? (
            <SettlementsReadoutPanel
              settlementsReadout={settlementsReadout}
              detailReadout={settlementDetail}
              selectedSettlementId={selectedSettlementId}
              onSelectSettlement={setSelectedSettlementId}
              filter={settlementFilter}
              onFilterChange={setSettlementFilter}
            />
          ) : activeId === "reports" ? (
            <ReportsReadoutPanel
              readout={reportsReadout}
              month={reportMonth}
              onMonthChange={setReportMonth}
              search={reportSearch}
              onSearchChange={setReportSearch}
            />
          ) : activeId === "import-export" ? (
            <ImportExportReadoutPanel readout={importExportReadout} />
          ) : activeId === "notifications" ? (
            <NotificationsReadoutPanel
              readout={notificationsReadout}
              search={notificationSearch}
              onSearchChange={setNotificationSearch}
              filter={notificationFilter}
              onFilterChange={setNotificationFilter}
              sort={notificationSort}
              onSortChange={setNotificationSort}
            />
          ) : activeId === "profile" ? (
            <ProfilePaymentReadoutPanel readout={profileReadout} />
          ) : (

          <section className="content-grid" aria-label="Workspace readouts">
            <div className="dashboard-column">
              <section className="metric-grid" aria-label="Dashboard summary">
                {dashboardCards.map((card) => (
                  <article className="metric-card" key={card.label}>
                    <p className="metric-label">{card.label}</p>
                    <p className="metric-value">{card.value}</p>
                    <p className="metric-detail">{card.detail}</p>
                  </article>
                ))}
              </section>

              <section className="surface-panel" aria-labelledby="surface-title">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Protected area</p>
                    <h3 id="surface-title">{activeItem.label} stays private</h3>
                  </div>
                  <span className="status-chip status-sync">
                    {activeItem.status === "placeholder" ? "Planned surface" : "Session gated"}
                  </span>
                </div>
                <div className="empty-state" role="status" aria-live="polite">
                  <h4>Sign in to open this area</h4>
                  <p>
                    This web foundation keeps the navigation and protected shell ready while personal information
                    remains hidden until Settleora verifies a real session.
                  </p>
                </div>
              </section>

              <section className="surface-panel" aria-labelledby="states-title">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Safe states</p>
                    <h3 id="states-title">Reusable presentation states</h3>
                  </div>
                </div>
                <div className="state-list">
                  {safeStatePanels.map((state) => (
                    <article className="state-row" key={state.title}>
                      <strong>{state.title}</strong>
                      <span>{state.body}</span>
                    </article>
                  ))}
                </div>
              </section>
            </div>

            <aside className="right-rail" aria-label="Session and readiness readouts">
              <section className="surface-panel compact-panel">
                <p className="eyebrow">Session</p>
                <h3>Account boundary</h3>
                <p>{session.message}</p>
                <dl className="readout-list">
                  <div>
                    <dt>Current user</dt>
                    <dd>{session.currentUser?.userProfile.displayName ?? "Not shown"}</dd>
                  </div>
                  <div>
                    <dt>Active sessions</dt>
                    <dd>{session.sessions?.sessions.length ?? "Not loaded"}</dd>
                  </div>
                  <div>
                    <dt>Protected actions</dt>
                    <dd>{session.status === "authenticated" ? "Available as authorized" : "Disabled"}</dd>
                  </div>
                </dl>
              </section>

              <section className="surface-panel compact-panel">
                <p className="eyebrow">More</p>
                <h3>All functions</h3>
                <div className="quick-list">
                  {moreNav.slice(0, 5).map((item) => (
                    <button key={item.id} type="button" onClick={() => setActiveRoute(item.id)}>
                      <span>{item.label}</span>
                      <span>{item.status === "placeholder" ? "Planned" : "Protected"}</span>
                    </button>
                  ))}
                </div>
              </section>
            </aside>
          </section>
          )}
        </main>
      </div>
    </div>
  );
}

function ReportsReadoutPanel({
  readout,
  month,
  onMonthChange,
  search,
  onSearchChange
}: {
  readout: ReportsReadoutState;
  month: string;
  onMonthChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const report = readout.report;
  const totalSummary = useMemo(() => summarizeReportTotals(report?.totalByCurrency ?? []), [report?.totalByCurrency]);
  const actorShareSummary = useMemo(
    () => summarizeReportTotals(report?.actorShareByCurrency ?? []),
    [report?.actorShareByCurrency]
  );
  const actorPaidSummary = useMemo(
    () => summarizeReportTotals(report?.actorPaidByCurrency ?? []),
    [report?.actorPaidByCurrency]
  );
  const canSearch = readout.status === "loaded" || readout.status === "empty";

  return (
    <section className="bills-workspace" aria-label="Reports and search readout">
      <div className="bills-summary-row" aria-label="Reports summary">
        <ReadoutMetric
          label="Month"
          value={report?.month ?? readout.month}
          detail={report ? `Generated ${formatDate(report.generatedAtUtc)}` : "Session-gated report"}
        />
        <ReadoutMetric
          label="Bills in report"
          value={String(report?.billCount ?? 0)}
          detail="Server-returned count"
        />
        <ReadoutMetric
          label="Search rows"
          value={String(readout.searchRows.length)}
          detail="Server bill-list search"
        />
      </div>

      <section className="bills-toolbar reports-toolbar surface-panel" aria-label="Report search controls">
        <label className="filter-field">
          <span>Report month</span>
          <input value={month} onChange={(event) => onMonthChange(event.target.value)} type="month" />
        </label>
        <label className="filter-field">
          <span>Search visible bills</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Merchant, category, date, or server-supported text"
            disabled={!canSearch}
          />
        </label>
      </section>

      <section className="bills-split" aria-label="Monthly report and search rows">
        <div className="surface-panel bills-list-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Monthly report</p>
              <h3>{report?.month ?? "Reports stay private"}</h3>
            </div>
            <span className={`status-chip ${statusClassForReadout(readout.status)}`}>
              {labelize(readout.status)}
            </span>
          </div>

          <StateMessage
            state={readout.status}
            message={readout.message}
            emptyTitle="No report rows yet"
            errorTitle="Could not load reports"
          />

          {report ? (
            <>
              <ReadoutSection title="Currency totals">
                <ReportSummaryPills totals={totalSummary} empty="No currency totals were returned." />
              </ReadoutSection>
              <ReadoutSection title="Your report position">
                <ReportSummaryPills totals={actorShareSummary} empty="No actor share totals were returned." />
                <ReportSummaryPills totals={actorPaidSummary} empty="No actor payer totals were returned." />
              </ReadoutSection>
              <ReportCountSection title="Reconciliation" counts={report.reconciliationCounts} />
              <ReportCountSection title="Settlement requests" counts={report.settlementRequestCounts} />
              <ReportCountSection title="Settlement payments" counts={report.settlementPaymentCounts} />
            </>
          ) : null}
        </div>

        <aside className="surface-panel bills-detail-panel" aria-label="Search and export readiness">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Search</p>
              <h3>Returned bill rows</h3>
            </div>
            <span className="status-chip status-warning">Read-only</span>
          </div>

          {readout.status === "loaded" && readout.searchRows.length === 0 ? (
            <div className="empty-state" role="status">
              <h4>No bills match this search</h4>
              <p>Change the search text to ask Settleora for a different visible bill list.</p>
            </div>
          ) : null}

          <div className="bill-row-list" aria-label="Report search results">
            {readout.searchRows.map((bill) => (
              <ReportBillRow key={bill.id} bill={bill} />
            ))}
          </div>

          <ReadoutSection title="Export, import, and local backup">
            {readout.unsupportedSections.map((item) => (
              <p className="muted-copy" key={item}>
                {item}
              </p>
            ))}
            {readout.missingMethods.length > 0 ? (
              <StatusPill label="Missing client reads" value={readout.missingMethods.join(", ")} />
            ) : null}
          </ReadoutSection>
        </aside>
      </section>
    </section>
  );
}

function ReportSummaryPills({ totals, empty }: { totals: Array<{ label: string; value: string }>; empty: string }) {
  if (totals.length === 0) {
    return <p className="muted-copy">{empty}</p>;
  }

  return (
    <>
      {totals.map((item) => (
        <StatusPill key={`${item.label}:${item.value}`} label={item.label} value={item.value} />
      ))}
    </>
  );
}

function ReportCountSection({
  title,
  counts
}: {
  title: string;
  counts: MonthlyReportResponse["reconciliationCounts"];
}) {
  const summary = summarizeReportCounts(counts);

  return (
    <ReadoutSection title={title}>
      {summary.length === 0 ? (
        <p className="muted-copy">No {title.toLowerCase()} counts were returned.</p>
      ) : (
        summary.map((item) => <StatusPill key={`${title}:${item.label}`} label={labelize(item.label)} value={item.value} />)
      )}
    </ReadoutSection>
  );
}

function ReportBillRow({ bill }: { bill: PersonalBillResponse }) {
  return (
    <article className="notification-row">
      <div className="notification-row-header">
        <div>
          <strong>{bill.merchantName ?? "Untitled bill"}</strong>
          <small>{formatDate(bill.billDate)}</small>
        </div>
        <span className={`status-chip ${statusClassForReadout("loaded")}`}>{labelize(bill.status)}</span>
      </div>
      <dl className="readout-list detail-readouts">
        <div>
          <dt>Total</dt>
          <dd>{formatMoney(bill.totalAmount, bill.totalCurrency)}</dd>
        </div>
        <div>
          <dt>Reconciliation</dt>
          <dd>{labelize(bill.reconciliation.status)}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{formatDate(bill.updatedAtUtc)}</dd>
        </div>
      </dl>
    </article>
  );
}

function ImportExportReadoutPanel({ readout }: { readout: ImportExportReadoutState }) {
  const unavailableCount = readout.capabilities.filter(
    (capability) => capability.status === "not_available_yet" || capability.status === "needs_readiness_endpoint"
  ).length;

  return (
    <section className="bills-workspace" aria-label="Import and export availability readout">
      <div className="bills-summary-row" aria-label="Import and export summary">
        <ReadoutMetric
          label="Operation methods"
          value={String(readout.methodsFound.length)}
          detail="Presence checked without runtime calls"
        />
        <ReadoutMetric
          label="Actions started"
          value="0"
          detail="No downloads, uploads, imports, restores, or sync submissions"
        />
        <ReadoutMetric
          label="Follow-up areas"
          value={String(unavailableCount)}
          detail="Need readiness, local design, or future review"
        />
      </div>

      <section className="surface-panel" aria-labelledby="import-export-title">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Availability</p>
            <h3 id="import-export-title">Import / Export control center</h3>
          </div>
          <span className="status-chip status-warning">Readout only</span>
        </div>
        <div className="empty-state" role="status" aria-live="polite">
          <h4>Actions are not available from this screen</h4>
          <p>{readout.message}</p>
        </div>
      </section>

      <section className="capability-grid" aria-label="Capability availability">
        {readout.capabilities.map((capability) => (
          <ImportExportCapabilityCard key={capability.id} capability={capability} />
        ))}
      </section>

      <section className="content-grid" aria-label="Import and export boundaries">
        <section className="surface-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Unsupported now</p>
              <h3>Follow-up coverage</h3>
            </div>
            <span className="status-chip status-warning">Future reviewed slice</span>
          </div>
          <div className="state-list">
            {readout.unsupportedSections.map((item) => (
              <article className="state-row" key={item}>
                <strong>Unavailable</strong>
                <span>{item}</span>
              </article>
            ))}
          </div>
        </section>

        <aside className="right-rail" aria-label="Generated method readout">
          <section className="surface-panel compact-panel">
            <p className="eyebrow">Generated client</p>
            <h3>Methods found</h3>
            <ReadoutSection title="Present">
              {readout.methodsFound.map((method) => (
                <StatusPill key={method} label="Found" value={method} />
              ))}
            </ReadoutSection>
            <ReadoutSection title="Intentionally not called">
              {readout.intentionallyNotCalled.map((method) => (
                <StatusPill key={method} label="No runtime call" value={method} />
              ))}
            </ReadoutSection>
            {readout.missingMethods.length > 0 ? (
              <ReadoutSection title="Missing">
                {readout.missingMethods.map((method) => (
                  <StatusPill key={method} label="Missing" value={method} />
                ))}
              </ReadoutSection>
            ) : null}
          </section>
        </aside>
      </section>
    </section>
  );
}

function ImportExportCapabilityCard({ capability }: { capability: ImportExportCapability }) {
  return (
    <article className="surface-panel capability-card">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Capability</p>
          <h3>{capability.title}</h3>
        </div>
        <span className={`status-chip ${importExportStatusClass(capability.status)}`}>
          {labelImportExportStatus(capability.status)}
        </span>
      </div>
      <p className="muted-copy">{capability.summary}</p>
      <ReadoutSection title="Status">
        {capability.chips.map((chip) => (
          <StatusPill key={chip} label={chip} value="Current readout" />
        ))}
      </ReadoutSection>
      <ReadoutSection title="Follow-up">
        {capability.followUps.map((item) => (
          <p className="muted-copy" key={item}>
            {item}
          </p>
        ))}
      </ReadoutSection>
      {capability.missingMethods.length > 0 ? (
        <ReadoutSection title="Missing methods">
          {capability.missingMethods.map((method) => (
            <StatusPill key={method} label="Missing" value={method} />
          ))}
        </ReadoutSection>
      ) : null}
    </article>
  );
}

function ProfilePaymentReadoutPanel({ readout }: { readout: ProfilePaymentReadoutState }) {
  const summary = useMemo(() => summarizePaymentConfiguration(readout.paymentDetails), [readout.paymentDetails]);
  const paymentDetails = readout.paymentDetails;
  const profile = readout.profile;

  return (
    <section className="content-grid" aria-label="Profile and payment details readout">
      <div className="dashboard-column">
        <section className="metric-grid" aria-label="Profile payment summary">
          {summary.map((item) => (
            <ReadoutMetric key={item.label} label={item.label} value={item.value} detail="Server-returned readout" />
          ))}
        </section>

        <section className="surface-panel" aria-labelledby="profile-readout-title">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Profile</p>
              <h3 id="profile-readout-title">{profile?.displayName ?? "Profile details"}</h3>
            </div>
            <span className={`status-chip ${statusClassForReadout(readout.status)}`}>
              {labelize(readout.status)}
            </span>
          </div>

          {profile ? (
            <>
              <dl className="readout-list detail-readouts">
                <div>
                  <dt>Display name</dt>
                  <dd>{profile.displayName}</dd>
                </div>
                <div>
                  <dt>Preferred currency</dt>
                  <dd>{profile.defaultCurrency ?? "Not set"}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatDate(profile.createdAtUtc)}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatDate(profile.updatedAtUtc)}</dd>
                </div>
              </dl>

              <ReadoutSection title="Payment details">
                {paymentDetails?.isConfigured ? (
                  <>
                    <StatusPill label="Method" value={paymentDetails.preferredMethodLabel ?? "Not set"} />
                    <StatusPill label="Handle" value={paymentDetails.paymentHandle ?? "Not set"} />
                    <StatusPill label="Visibility" value={labelize(paymentDetails.visibility)} />
                    <StatusPill label="Note" value={paymentDetails.paymentNote ?? "Not set"} />
                  </>
                ) : (
                  <p className="muted-copy">No active payment detail row is configured for this account.</p>
                )}
              </ReadoutSection>

              <ReadoutSection title="QR metadata">
                {paymentDetails?.qrFile ? (
                  <QrMetadataReadout qrFile={paymentDetails.qrFile} />
                ) : (
                  <p className="muted-copy">No active payment QR metadata was returned.</p>
                )}
              </ReadoutSection>
            </>
          ) : (
            <StateMessage
              state={readout.status}
              message={readout.message}
              emptyTitle="No profile details"
              errorTitle="Could not load profile"
            />
          )}
        </section>
      </div>

      <aside className="right-rail" aria-label="Payment detail boundaries">
        <section className="surface-panel compact-panel">
          <p className="eyebrow">Boundary</p>
          <h3>Read-only scope</h3>
          <p>{readout.message}</p>
          <div className="state-list">
            {readout.unavailableSections.map((item) => (
              <article className="state-row" key={item}>
                <strong>Unavailable</strong>
                <span>{item}</span>
              </article>
            ))}
          </div>
        </section>
      </aside>
    </section>
  );
}

function NotificationsReadoutPanel({
  readout,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  sort,
  onSortChange
}: {
  readout: NotificationsReadoutState;
  search: string;
  onSearchChange: (value: string) => void;
  filter: NotificationPresentationFilter;
  onFilterChange: (value: NotificationPresentationFilter) => void;
  sort: NotificationPresentationSort;
  onSortChange: (value: NotificationPresentationSort) => void;
}) {
  const visibleNotifications = useMemo(
    () => filterNotificationsForPresentation(readout.notifications, { search, status: filter, sort }),
    [filter, readout.notifications, search, sort]
  );
  const statusCounts = useMemo(
    () => summarizeNotificationStatuses(readout.notifications),
    [readout.notifications]
  );
  const priorityCounts = useMemo(
    () => summarizeNotificationPriorities(readout.notifications),
    [readout.notifications]
  );
  const canFilter = readout.status === "loaded" || readout.status === "empty";

  return (
    <section className="bills-workspace" aria-label="Notifications readout">
      <div className="bills-summary-row" aria-label="Notifications summary">
        <ReadoutMetric
          label="Unread"
          value={String(readout.summary?.unreadCount ?? 0)}
          detail="Server summary"
        />
        <ReadoutMetric
          label="Attention"
          value={String(readout.summary?.attentionCount ?? 0)}
          detail={`${readout.summary?.urgentCount ?? 0} urgent`}
        />
        <ReadoutMetric
          label="Loaded rows"
          value={String(readout.notifications.length)}
          detail="Current-user list"
        />
      </div>

      <section className="bills-toolbar notifications-toolbar surface-panel" aria-label="Notification filters">
        <label className="filter-field">
          <span>Search loaded notifications</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Event, subject, or summary"
            disabled={!canFilter}
          />
        </label>
        <label className="filter-field">
          <span>View</span>
          <select
            value={filter}
            onChange={(event) => onFilterChange(event.target.value as NotificationPresentationFilter)}
            disabled={!canFilter}
          >
            <option value="inbox">Inbox</option>
            <option value="unread">Unread</option>
            <option value="attention">Attention</option>
            <option value="archived">Archived</option>
            <option value="all">All loaded</option>
          </select>
        </label>
        <label className="filter-field">
          <span>Sort</span>
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as NotificationPresentationSort)}
            disabled={!canFilter}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="priority">Priority first</option>
          </select>
        </label>
      </section>

      <section className="bills-split" aria-label="Notification list and boundaries">
        <div className="surface-panel bills-list-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Notifications list</p>
              <h3>Current-user alerts</h3>
            </div>
            <span className={`status-chip ${statusClassForReadout(readout.status)}`}>
              {labelize(readout.status)}
            </span>
          </div>
          <NotificationStateMessage state={readout.status} message={readout.message} />
          {readout.status === "loaded" && visibleNotifications.length === 0 ? (
            <div className="empty-state" role="status">
              <h4>No notifications match this view</h4>
              <p>Change the local filters to return to the loaded Settleora notification list.</p>
            </div>
          ) : null}
          <div className="bill-row-list" aria-label="Loaded notifications">
            {visibleNotifications.map((notification) => (
              <NotificationReadoutRow key={notification.id} notification={notification} />
            ))}
          </div>
        </div>

        <aside className="surface-panel bills-detail-panel" aria-label="Notification readout boundaries">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Read-only scope</p>
              <h3>Notification metadata</h3>
            </div>
            <span className="status-chip status-warning">Display only</span>
          </div>

          <ReadoutSection title="Returned row summary">
            {statusCounts.length === 0 ? (
              <p className="muted-copy">No notification status rows were returned.</p>
            ) : (
              statusCounts.map((item) => (
                <StatusPill key={item.label} label={labelize(item.label)} value={String(item.count)} />
              ))
            )}
            {priorityCounts.map((item) => (
              <StatusPill key={item.label} label={labelize(item.label)} value={String(item.count)} />
            ))}
          </ReadoutSection>

          <ReadoutSection title="Preference readout">
            {readout.preferences ? (
              summarizeNotificationPreferences(readout.preferences).map((item) => (
                <StatusPill key={item.label} label={item.label} value={item.value} />
              ))
            ) : (
              <p className="muted-copy">
                Notification preferences are unavailable until the server returns the current user's preference
                readout.
              </p>
            )}
          </ReadoutSection>

          <ReadoutSection title="Unsupported actions">
            {readout.unsupportedSections.map((item) => (
              <p className="muted-copy" key={item}>
                {item}
              </p>
            ))}
            {readout.missingMethods.length > 0 ? (
              <StatusPill label="Missing client reads" value={readout.missingMethods.join(", ")} />
            ) : null}
          </ReadoutSection>
        </aside>
      </section>
    </section>
  );
}

function NotificationReadoutRow({ notification }: { notification: InAppNotificationResponse }) {
  const targets = collectNotificationTargetFields(notification);

  return (
    <article className="notification-row">
      <div className="notification-row-header">
        <div>
          <strong>{formatNotificationEvent(notification.eventType)}</strong>
          <small>{notification.safeSummary ?? notification.messageKey}</small>
        </div>
        <span className={`status-chip ${notificationPriorityClass(notification.priority)}`}>
          {labelize(notification.priority)}
        </span>
      </div>
      <dl className="readout-list detail-readouts">
        <div>
          <dt>Status</dt>
          <dd>{labelize(notification.status)}</dd>
        </div>
        <div>
          <dt>Subject</dt>
          <dd>{labelize(notification.subjectType)}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDate(notification.createdAtUtc)}</dd>
        </div>
        <div>
          <dt>Read</dt>
          <dd>{formatDate(notification.readAtUtc)}</dd>
        </div>
      </dl>
      <ReadoutSection title="Display keys">
        <StatusPill label="Title key" value={notification.titleKey} />
        <StatusPill label="Message key" value={notification.messageKey} />
        <StatusPill label="Action path" value={notification.actionUrl ?? "Not returned"} />
      </ReadoutSection>
      <ReadoutSection title="Related IDs">
        {targets.length === 0 ? (
          <p className="muted-copy">No related target IDs were returned.</p>
        ) : (
          targets.map((target) => <StatusPill key={target.label} label={target.label} value={target.value} />)
        )}
      </ReadoutSection>
    </article>
  );
}

function NotificationStateMessage({
  state,
  message
}: {
  state: NotificationsReadoutState["status"];
  message: string;
}) {
  if (state === "loaded") {
    return null;
  }

  return (
    <div className="empty-state" role="status" aria-live="polite">
      <h4>{readoutStateTitle(state, "No notifications yet", "Could not load notifications")}</h4>
      <p>{message}</p>
    </div>
  );
}

function QrMetadataReadout({ qrFile }: { qrFile: SelfPaymentDetailsQrFileResponse }) {
  return (
    <>
      <StatusPill label="File metadata ID" value={qrFile.id} />
      <StatusPill label="Content type" value={qrFile.contentType} />
      <StatusPill label="Size" value={`${qrFile.sizeBytes} bytes`} />
      <StatusPill label="Updated" value={formatDate(qrFile.updatedAtUtc)} />
    </>
  );
}

function BillsReadoutPanel({
  billsReadout,
  detailReadout,
  selectedBillId,
  onSelectBill,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  reconciliationFilter,
  onReconciliationFilterChange
}: {
  billsReadout: BillsReadoutState;
  detailReadout: BillDetailReadoutState;
  selectedBillId: string | null;
  onSelectBill: (billId: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: ExpenseBillStatus | "all";
  onStatusFilterChange: (value: ExpenseBillStatus | "all") => void;
  reconciliationFilter: ExpenseBillReconciliationStatus | "all";
  onReconciliationFilterChange: (value: ExpenseBillReconciliationStatus | "all") => void;
}) {
  const visibleBills = useMemo(
    () =>
      filterBillsForPresentation(billsReadout.bills, {
        search,
        status: statusFilter,
        reconciliationStatus: reconciliationFilter
      }),
    [billsReadout.bills, reconciliationFilter, search, statusFilter]
  );
  const statusCounts = useMemo(() => summarizeStatusCounts(billsReadout.bills), [billsReadout.bills]);
  const currencyCounts = useMemo(() => summarizeCurrencyCounts(billsReadout.bills), [billsReadout.bills]);
  const statusOptions = useMemo(() => uniqueValues(billsReadout.bills.map((bill) => bill.status)), [billsReadout.bills]);
  const reconciliationOptions = useMemo(
    () => uniqueValues(billsReadout.bills.map((bill) => bill.reconciliation.status)),
    [billsReadout.bills]
  );
  const canFilter = billsReadout.status === "loaded" || billsReadout.status === "empty";

  return (
    <section className="bills-workspace" aria-label="Bills readout">
      <div className="bills-summary-row" aria-label="Bills summary">
        <ReadoutMetric label="Visible bills" value={String(billsReadout.bills.length)} detail="API-backed personal bills" />
        <ReadoutMetric
          label="Statuses"
          value={statusCounts.length === 0 ? "None" : statusCounts.map((item) => `${item.count} ${item.label}`).join(", ")}
          detail="Returned by Settleora"
        />
        <ReadoutMetric
          label="Currencies"
          value={currencyCounts.length === 0 ? "None" : currencyCounts.map((item) => `${item.count} ${item.label}`).join(", ")}
          detail="No browser-side totals"
        />
      </div>

      <section className="bills-toolbar surface-panel" aria-label="Bills filters">
        <label className="filter-field">
          <span>Search loaded bills</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Merchant, date, or currency"
            disabled={!canFilter}
          />
        </label>
        <label className="filter-field">
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value as ExpenseBillStatus | "all")}
            disabled={!canFilter}
          >
            <option value="all">All statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {labelize(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Reconciliation</span>
          <select
            value={reconciliationFilter}
            onChange={(event) =>
              onReconciliationFilterChange(event.target.value as ExpenseBillReconciliationStatus | "all")
            }
            disabled={!canFilter}
          >
            <option value="all">All reconciliation states</option>
            {reconciliationOptions.map((status) => (
              <option key={status} value={status}>
                {labelize(status)}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="bills-split" aria-label="Bills list and detail">
        <div className="surface-panel bills-list-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Bills list</p>
              <h3>Personal bills</h3>
            </div>
            <span className={`status-chip ${statusClassForReadout(billsReadout.status)}`}>
              {labelize(billsReadout.status)}
            </span>
          </div>
          <StateMessage state={billsReadout.status} message={billsReadout.message} />
          {billsReadout.status === "loaded" && visibleBills.length === 0 ? (
            <div className="empty-state" role="status">
              <h4>No bills match these filters</h4>
              <p>Clear the local filters to return to the loaded Settleora bill list.</p>
            </div>
          ) : null}
          <div className="bill-row-list" aria-label="Loaded bills">
            {visibleBills.map((bill) => (
              <BillListRow
                key={bill.id}
                bill={bill}
                selected={bill.id === selectedBillId}
                onSelect={() => onSelectBill(bill.id)}
              />
            ))}
          </div>
        </div>

        <BillDetailPanel readout={detailReadout} fallbackBill={billsReadout.bills.find((bill) => bill.id === selectedBillId)} />
      </section>
    </section>
  );
}

function GroupsReadoutPanel({
  groupsReadout,
  detailReadout,
  groupBillDetail,
  selectedGroupId,
  selectedGroupBillId,
  onSelectGroup,
  onSelectGroupBill,
  search,
  onSearchChange
}: {
  groupsReadout: GroupsReadoutState;
  detailReadout: GroupDetailReadoutState;
  groupBillDetail: GroupBillDetailReadoutState;
  selectedGroupId: string | null;
  selectedGroupBillId: string | null;
  onSelectGroup: (groupId: string) => void;
  onSelectGroupBill: (billId: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const visibleGroups = useMemo(
    () => filterGroupsForPresentation(groupsReadout.groups, search),
    [groupsReadout.groups, search]
  );
  const roleCounts = useMemo(() => summarizeGroupRoles(groupsReadout.groups), [groupsReadout.groups]);
  const statusCounts = useMemo(() => summarizeGroupStatuses(groupsReadout.groups), [groupsReadout.groups]);
  const canFilter = groupsReadout.status === "loaded" || groupsReadout.status === "empty";

  return (
    <section className="bills-workspace" aria-label="Groups readout">
      <div className="bills-summary-row" aria-label="Groups summary">
        <ReadoutMetric label="Visible groups" value={String(groupsReadout.groups.length)} detail="API-backed group rows" />
        <ReadoutMetric
          label="Your roles"
          value={roleCounts.length === 0 ? "None" : roleCounts.map((item) => `${item.count} ${labelize(item.label)}`).join(", ")}
          detail="Returned by Settleora"
        />
        <ReadoutMetric
          label="Membership"
          value={statusCounts.length === 0 ? "None" : statusCounts.map((item) => `${item.count} ${labelize(item.label)}`).join(", ")}
          detail="No browser-side authorization"
        />
      </div>

      <section className="bills-toolbar groups-toolbar surface-panel" aria-label="Groups filters">
        <label className="filter-field">
          <span>Search loaded groups</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Group name, role, or status"
            disabled={!canFilter}
          />
        </label>
      </section>

      <section className="bills-split" aria-label="Groups list and detail">
        <div className="surface-panel bills-list-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Groups list</p>
              <h3>Your groups</h3>
            </div>
            <span className={`status-chip ${statusClassForReadout(groupsReadout.status)}`}>
              {labelize(groupsReadout.status)}
            </span>
          </div>
          <StateMessage
            state={groupsReadout.status}
            message={groupsReadout.message}
            emptyTitle="No groups yet"
            errorTitle="Could not load groups"
          />
          {groupsReadout.status === "loaded" && visibleGroups.length === 0 ? (
            <div className="empty-state" role="status">
              <h4>No groups match these filters</h4>
              <p>Clear the local filters to return to the loaded Settleora group list.</p>
            </div>
          ) : null}
          <div className="bill-row-list" aria-label="Loaded groups">
            {visibleGroups.map((group) => (
              <GroupListRow
                key={group.id}
                group={group}
                selected={group.id === selectedGroupId}
                onSelect={() => onSelectGroup(group.id)}
              />
            ))}
          </div>
        </div>

        <GroupDetailPanel
          readout={detailReadout}
          fallbackGroup={groupsReadout.groups.find((group) => group.id === selectedGroupId)}
          selectedGroupBillId={selectedGroupBillId}
          groupBillDetail={groupBillDetail}
          onSelectGroupBill={onSelectGroupBill}
        />
      </section>
    </section>
  );
}

function FriendsReadoutPanel({ readout }: { readout: FriendsReadoutState }) {
  return (
    <section className="content-grid" aria-label="Friends and direct-sharing readout">
      <div className="dashboard-column">
        <section className="metric-grid" aria-label="Friends summary">
          <ReadoutMetric label="Friend records" value="Unavailable" detail="No generated read method" />
          <ReadoutMetric label="Requests" value="Unavailable" detail="No request read method" />
          <ReadoutMetric label="Direct sharing" value="Unavailable" detail="No eligibility read method" />
        </section>

        <section className="surface-panel" aria-labelledby="friends-unavailable-title">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Friends and direct sharing</p>
              <h3 id="friends-unavailable-title">Unavailable in this build</h3>
            </div>
            <span className="status-chip status-warning">{labelize(readout.status)}</span>
          </div>
          <div className="empty-state" role="status" aria-live="polite">
            <h4>Future API coverage required</h4>
            <p>{readout.message}</p>
          </div>
        </section>
      </div>

      <aside className="right-rail" aria-label="Missing friends coverage">
        <section className="surface-panel compact-panel">
          <p className="eyebrow">Missing reads</p>
          <h3>Follow-up surfaces</h3>
          <div className="state-list">
            {readout.missingCoverage.map((item) => (
              <article className="state-row" key={item}>
                <strong>Unavailable</strong>
                <span>{item}</span>
              </article>
            ))}
          </div>
        </section>
      </aside>
    </section>
  );
}

function SettlementsReadoutPanel({
  settlementsReadout,
  detailReadout,
  selectedSettlementId,
  onSelectSettlement,
  filter,
  onFilterChange
}: {
  settlementsReadout: SettlementsReadoutState;
  detailReadout: SettlementDetailReadoutState;
  selectedSettlementId: string | null;
  onSelectSettlement: (settlementId: string) => void;
  filter: SettlementPresentationFilter;
  onFilterChange: (value: SettlementPresentationFilter) => void;
}) {
  const visibleSettlements = useMemo(
    () => filterSettlementsForPresentation(settlementsReadout.settlements, filter),
    [filter, settlementsReadout.settlements]
  );
  const statusCounts = useMemo(
    () => summarizeSettlementStatuses(settlementsReadout.settlements),
    [settlementsReadout.settlements]
  );
  const balanceDirections = useMemo(
    () => summarizeBalanceDirections(settlementsReadout.balances),
    [settlementsReadout.balances]
  );
  const canFilter = settlementsReadout.status === "loaded" || settlementsReadout.status === "empty";
  const balanceRows = settlementsReadout.balances?.balances ?? [];

  return (
    <section className="bills-workspace" aria-label="Settlements readout">
      <div className="bills-summary-row" aria-label="Settlements summary">
        <ReadoutMetric
          label="Requests"
          value={String(settlementsReadout.settlements.length)}
          detail="API-backed settlement rows"
        />
        <ReadoutMetric
          label="Statuses"
          value={statusCounts.length === 0 ? "None" : statusCounts.map((item) => `${item.count} ${item.label}`).join(", ")}
          detail="Returned by Settleora"
        />
        <ReadoutMetric
          label="Balances"
          value={balanceDirections.length === 0 ? "None" : balanceDirections.map((item) => `${item.count} ${item.label}`).join(", ")}
          detail="No browser-side netting"
        />
      </div>

      <section className="bills-toolbar settlements-toolbar surface-panel" aria-label="Settlement filters">
        <label className="filter-field">
          <span>Request view</span>
          <select
            value={filter}
            onChange={(event) => onFilterChange(event.target.value as SettlementPresentationFilter)}
            disabled={!canFilter}
          >
            {Object.entries(settlementFilterLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="bills-split" aria-label="Settlement list and detail">
        <div className="surface-panel bills-list-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Settlements list</p>
              <h3>Requests and balance rows</h3>
            </div>
            <span className={`status-chip ${statusClassForReadout(settlementsReadout.status)}`}>
              {labelize(settlementsReadout.status)}
            </span>
          </div>
          <StateMessage
            state={settlementsReadout.status}
            message={settlementsReadout.message}
            emptyTitle="No settlements yet"
            errorTitle="Could not load settlements"
          />
          {settlementsReadout.status === "loaded" && visibleSettlements.length === 0 ? (
            <div className="empty-state" role="status">
              <h4>No settlements match this view</h4>
              <p>Change the local view to return to the loaded Settleora settlement list.</p>
            </div>
          ) : null}

          {balanceRows.length ? (
            <ReadoutSection title="Balance projection rows">
              {balanceRows.map((balance) => (
                <BalanceProjectionRow key={balanceProjectionKey(balance)} balance={balance} />
              ))}
            </ReadoutSection>
          ) : null}

          <div className="bill-row-list" aria-label="Loaded settlement requests">
            {visibleSettlements.map((settlement) => (
              <SettlementListRow
                key={settlement.id}
                settlement={settlement}
                selected={settlement.id === selectedSettlementId}
                onSelect={() => onSelectSettlement(settlement.id)}
              />
            ))}
          </div>
        </div>

        <SettlementDetailPanel
          readout={detailReadout}
          fallbackSettlement={settlementsReadout.settlements.find(
            (settlement) => settlement.id === selectedSettlementId
          )}
        />
      </section>
    </section>
  );
}

function SettlementListRow({
  settlement,
  selected,
  onSelect
}: {
  settlement: SettlementRequestResponse;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={selected ? "bill-row active" : "bill-row"}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
    >
      <span>
        <strong>{settlement.creditorUserProfileId}</strong>
        <small>Debtor {settlement.debtorUserProfileId}</small>
      </span>
      <span>
        <strong>{formatMoney(settlement.amount, settlement.currency)}</strong>
        <small>{labelize(settlement.status)}</small>
      </span>
    </button>
  );
}

function SettlementDetailPanel({
  readout,
  fallbackSettlement
}: {
  readout: SettlementDetailReadoutState;
  fallbackSettlement?: SettlementRequestResponse;
}) {
  const settlement = readout.settlement ?? fallbackSettlement;
  const payments = readout.payments?.payments ?? [];
  const counterpartyPaymentDetails = readout.counterpartyPaymentDetails;
  const counterpartySummary = useMemo(
    () => summarizeCounterpartyPaymentDetails(counterpartyPaymentDetails?.details),
    [counterpartyPaymentDetails?.details]
  );
  const proofMetadataSummary = useMemo(
    () => summarizeSettlementProofMetadata(readout.proofMetadata),
    [readout.proofMetadata]
  );

  return (
    <aside className="surface-panel bills-detail-panel" aria-label="Settlement detail readout">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Settlement detail</p>
          <h3>{settlement ? formatMoney(settlement.amount, settlement.currency) : "Select a settlement"}</h3>
        </div>
        <span className={`status-chip ${statusClassForReadout(readout.status)}`}>{labelize(readout.status)}</span>
      </div>
      {settlement ? (
        <>
          <dl className="readout-list detail-readouts">
            <div>
              <dt>Status</dt>
              <dd>{labelize(settlement.status)}</dd>
            </div>
            <div>
              <dt>Requested</dt>
              <dd>{formatDate(settlement.requestedAtUtc)}</dd>
            </div>
            <div>
              <dt>Group</dt>
              <dd>{settlement.groupId ?? "Personal"}</dd>
            </div>
            <div>
              <dt>Source bill</dt>
              <dd>{settlement.sourceExpenseBillId}</dd>
            </div>
          </dl>

          <ReadoutSection title="Participants">
            <StatusPill label="Debtor" value={settlement.debtorUserProfileId} />
            <StatusPill label="Creditor" value={settlement.creditorUserProfileId} />
            <StatusPill label="Requested by" value={settlement.requestedByUserProfileId} />
          </ReadoutSection>

          <ReadoutSection title="Request lines">
            {settlement.lines.length === 0 ? (
              <p className="muted-copy">No request-line rows were returned.</p>
            ) : (
              settlement.lines.map((line) => (
                <DataRow
                  key={line.id}
                  label={`${line.sourceExpenseBillId} · ${labelize(line.status)}`}
                  value={formatMoney(line.exactAmount, line.currency)}
                />
              ))
            )}
          </ReadoutSection>

          <ReadoutSection title="Payment readout">
            {readout.status === "loading" ? (
              <p className="muted-copy">Loading visible payment claims.</p>
            ) : payments.length ? (
              payments.map((payment) => <SettlementPaymentRow key={payment.paymentId} payment={payment} />)
            ) : (
              <p className="muted-copy">No visible settlement payment rows were returned.</p>
            )}
          </ReadoutSection>

          <ReadoutSection title="Payment proof metadata">
            <div className="mini-metric-row" aria-label="Settlement proof metadata summary">
              {proofMetadataSummary.map((item) => (
                <StatusPill key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
            {readout.proofMetadata?.paymentProofs.some((item) => item.proofs.length > 0) ? (
              readout.proofMetadata.paymentProofs.map((item) => (
                <SettlementPaymentProofGroup
                  key={item.paymentId}
                  paymentId={item.paymentId}
                  proofs={item.proofs}
                />
              ))
            ) : (
              <p className="muted-copy">
                {readout.proofMetadata?.message ??
                  "Proof metadata is unavailable until Settleora loads a selected settlement and visible payment rows."}
              </p>
            )}
            {readout.proofMetadata?.missingMethods.length ? (
              <StatusPill
                label="Missing client read"
                value={readout.proofMetadata.missingMethods.join(", ")}
              />
            ) : null}
            <p className="muted-copy">
              Proof content is not fetched in this readout. Upload, remove, and content methods stay unused.
            </p>
          </ReadoutSection>

          <ReadoutSection title="Counterparty payment details">
            <div className="mini-metric-row" aria-label="Counterparty payment detail summary">
              {counterpartySummary.map((item) => (
                <StatusPill key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
            {counterpartyPaymentDetails?.details ? (
              <>
                <StatusPill
                  label="Counterparty"
                  value={counterpartyPaymentDetails.details.userProfileId}
                />
                <StatusPill
                  label="Method"
                  value={counterpartyPaymentDetails.details.preferredMethodLabel ?? "Not set"}
                />
                <StatusPill
                  label="Handle"
                  value={counterpartyPaymentDetails.details.paymentHandle ?? "Not set"}
                />
                <StatusPill
                  label="Note"
                  value={counterpartyPaymentDetails.details.paymentNote ?? "Not set"}
                />
                <StatusPill
                  label="Visibility applied"
                  value={labelize(counterpartyPaymentDetails.details.visibilityApplied)}
                />
                {counterpartyPaymentDetails.details.qrFile ? (
                  <QrMetadataReadout qrFile={counterpartyPaymentDetails.details.qrFile} />
                ) : (
                  <p className="muted-copy">No counterparty QR metadata was returned for this settlement.</p>
                )}
                <p className="muted-copy">
                  QR image content is not fetched in this readout. Only server-returned metadata is shown.
                </p>
              </>
            ) : (
              <p className="muted-copy">
                {counterpartyPaymentDetails?.message ??
                  "Counterparty payment details are unavailable until Settleora verifies a settlement-scoped counterparty context."}
              </p>
            )}
          </ReadoutSection>
        </>
      ) : (
        <div className="empty-state" role="status">
          <h4>{readoutStateTitle(readout.status, "No settlement selected", "Could not load settlement")}</h4>
          <p>{readout.message}</p>
        </div>
      )}
    </aside>
  );
}

function SettlementPaymentProofGroup({
  paymentId,
  proofs
}: {
  paymentId: string;
  proofs: SettlementPaymentProofResponse[];
}) {
  if (proofs.length === 0) {
    return <DataRow label={`Payment ${paymentId}`} value="No proof metadata returned" />;
  }

  return (
    <div className="state-list">
      {proofs.map((proof) => (
        <article className="state-row" key={`${paymentId}:${proof.fileId}`}>
          <strong>{proof.fileId}</strong>
          <span>
            Payment {proof.settlementPaymentId} · {proof.contentType} · {formatProofSize(proof.sizeBytes)} · Uploaded{" "}
            {formatDate(proof.uploadedAtUtc)}
          </span>
        </article>
      ))}
    </div>
  );
}

function SettlementPaymentRow({ payment }: { payment: SettlementPaymentResponse }) {
  return (
    <div className="data-row">
      <span>
        {labelize(payment.status)} · {formatDate(payment.paymentDate)}
      </span>
      <strong>
        {formatMoney(payment.amount, payment.currency)} · {payment.allocations.length} allocations ·{" "}
        {payment.residuals.length} residuals
      </strong>
    </div>
  );
}

function BalanceProjectionRow({ balance }: { balance: SettlementBalanceProjectionResponse }) {
  return (
    <DataRow
      label={`${labelize(balance.direction)} · ${balance.counterpartyUserProfileId}`}
      value={`${formatMoney(balance.remainingUnclaimedAmount, balance.currency)} remaining`}
    />
  );
}

function balanceProjectionKey(balance: SettlementBalanceProjectionResponse): string {
  return [
    balance.counterpartyUserProfileId,
    balance.groupId ?? "personal",
    balance.direction,
    balance.currency
  ].join(":");
}

function ReadoutMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value compact-value">{value}</p>
      <p className="metric-detail">{detail}</p>
    </article>
  );
}

function StateMessage({
  state,
  message,
  emptyTitle = "No bills yet",
  errorTitle = "Could not load bills"
}: {
  state: BillsReadoutState["status"];
  message: string;
  emptyTitle?: string;
  errorTitle?: string;
}) {
  if (state === "loaded") {
    return null;
  }

  return (
    <div className="empty-state" role="status" aria-live="polite">
      <h4>{readoutStateTitle(state, emptyTitle, errorTitle)}</h4>
      <p>{message}</p>
    </div>
  );
}

function BillListRow({
  bill,
  selected,
  onSelect
}: {
  bill: Pick<PersonalBillResponse | GroupBillResponse, "id" | "merchantName" | "billDate" | "totalAmount" | "totalCurrency" | "status">;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={selected ? "bill-row active" : "bill-row"}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
    >
      <span>
        <strong>{bill.merchantName ?? "Untitled bill"}</strong>
        <small>{formatDate(bill.billDate)}</small>
      </span>
      <span>
        <strong>{formatMoney(bill.totalAmount, bill.totalCurrency)}</strong>
        <small>{labelize(bill.status)}</small>
      </span>
    </button>
  );
}

function BillDetailPanel({
  readout,
  fallbackBill
}: {
  readout: BillDetailReadoutState;
  fallbackBill?: PersonalBillResponse;
}) {
  const bill = readout.bill ?? fallbackBill;

  return (
    <aside className="surface-panel bills-detail-panel" aria-label="Bill detail readout">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Bill detail</p>
          <h3>{bill?.merchantName ?? "Select a bill"}</h3>
        </div>
        <span className={`status-chip ${statusClassForReadout(readout.status)}`}>{labelize(readout.status)}</span>
      </div>
      {bill ? (
        <>
          <dl className="readout-list detail-readouts">
            <div>
              <dt>Date</dt>
              <dd>{formatDate(bill.billDate)}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{formatMoney(bill.totalAmount, bill.totalCurrency)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{labelize(bill.status)}</dd>
            </div>
            <div>
              <dt>Reconciliation</dt>
              <dd>{labelize(bill.reconciliation.status)}</dd>
            </div>
          </dl>

          <ReadoutSection title="Workflow readout">
            <StatusPill label="Revision proposals" value={bill.revisionCreationActions.canCreateRevision ? "Available" : "Unavailable"} />
            <StatusPill label="Items" value={String(bill.items.length)} />
            <StatusPill label="Participants" value={String(bill.participants.length)} />
            <StatusPill label="Payers" value={String(bill.payers.length)} />
          </ReadoutSection>

          <ReadoutSection title="Participants">
            {bill.participants.length === 0 ? (
              <p className="muted-copy">No participant rows were returned.</p>
            ) : (
              bill.participants.map((participant) => (
                <DataRow
                  key={participant.userProfileId}
                  label={participant.userProfileId}
                  value={`${formatMoney(participant.resolvedShareAmount, participant.resolvedShareCurrency)} · ${labelize(participant.status)}`}
                />
              ))
            )}
          </ReadoutSection>

          <ReadoutSection title="Payers">
            {bill.payers.length === 0 ? (
              <p className="muted-copy">No payer rows were returned.</p>
            ) : (
              bill.payers.map((payer) => (
                <DataRow
                  key={payer.userProfileId}
                  label={payer.paymentMethodLabelSnapshot ?? payer.userProfileId}
                  value={formatMoney(payer.amount, payer.currency)}
                />
              ))
            )}
          </ReadoutSection>

          <ReadoutSection title="Attachments and reviews">
            {readout.status === "loading" ? (
              <p className="muted-copy">Loading attachment and revision readouts.</p>
            ) : (
              <>
                <StatusPill label="Attachments" value={String(readout.attachments?.attachments.length ?? 0)} />
                <StatusPill label="Revisions" value={String(readout.revisions?.revisions.length ?? 0)} />
                <StatusPill
                  label="Settlement candidates"
                  value={String(readout.settlementCandidates?.candidates.length ?? 0)}
                />
              </>
            )}
          </ReadoutSection>
        </>
      ) : (
        <div className="empty-state" role="status">
          <h4>{readoutStateTitle(readout.status)}</h4>
          <p>{readout.message}</p>
        </div>
      )}
    </aside>
  );
}

function GroupListRow({
  group,
  selected,
  onSelect
}: {
  group: GroupResponse;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={selected ? "bill-row active" : "bill-row"}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
    >
      <span>
        <strong>{group.name}</strong>
        <small>Updated {formatDate(group.updatedAtUtc)}</small>
      </span>
      <span>
        <strong>{labelize(group.currentUserRole)}</strong>
        <small>{labelize(group.currentUserStatus)}</small>
      </span>
    </button>
  );
}

function GroupDetailPanel({
  readout,
  fallbackGroup,
  selectedGroupBillId,
  groupBillDetail,
  onSelectGroupBill
}: {
  readout: GroupDetailReadoutState;
  fallbackGroup?: GroupResponse;
  selectedGroupBillId: string | null;
  groupBillDetail: GroupBillDetailReadoutState;
  onSelectGroupBill: (billId: string) => void;
}) {
  const group = readout.group ?? fallbackGroup;
  const groupBills = readout.bills?.bills ?? [];

  return (
    <aside className="surface-panel bills-detail-panel" aria-label="Group detail readout">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Group detail</p>
          <h3>{group?.name ?? "Select a group"}</h3>
        </div>
        <span className={`status-chip ${statusClassForReadout(readout.status)}`}>{labelize(readout.status)}</span>
      </div>
      {group ? (
        <>
          <dl className="readout-list detail-readouts">
            <div>
              <dt>Your role</dt>
              <dd>{labelize(group.currentUserRole)}</dd>
            </div>
            <div>
              <dt>Membership</dt>
              <dd>{labelize(group.currentUserStatus)}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(group.createdAtUtc)}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{formatDate(group.updatedAtUtc)}</dd>
            </div>
          </dl>

          <ReadoutSection title="Member readout">
            {readout.status === "loading" ? (
              <p className="muted-copy">Loading visible members.</p>
            ) : readout.members?.members.length ? (
              readout.members.members.map((member) => (
                <DataRow
                  key={member.userProfileId}
                  label={member.displayName}
                  value={`${labelize(member.role)} · ${labelize(member.status)}`}
                />
              ))
            ) : (
              <p className="muted-copy">No member rows were returned.</p>
            )}
          </ReadoutSection>

          <ReadoutSection title="Group bills">
            {readout.status === "loading" ? (
              <p className="muted-copy">Loading visible group bills.</p>
            ) : groupBills.length ? (
              <div className="embedded-row-list" aria-label="Loaded group bills">
                {groupBills.map((bill) => (
                  <BillListRow
                    key={bill.id}
                    bill={bill}
                    selected={bill.id === selectedGroupBillId}
                    onSelect={() => onSelectGroupBill(bill.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="muted-copy">No visible group bill rows were returned.</p>
            )}
          </ReadoutSection>

          <GroupBillDetailPanel
            readout={groupBillDetail}
            fallbackBill={groupBills.find((bill) => bill.id === selectedGroupBillId)}
          />
        </>
      ) : (
        <div className="empty-state" role="status">
          <h4>{readoutStateTitle(readout.status, "No group selected", "Could not load group")}</h4>
          <p>{readout.message}</p>
        </div>
      )}
    </aside>
  );
}

function GroupBillDetailPanel({
  readout,
  fallbackBill
}: {
  readout: GroupBillDetailReadoutState;
  fallbackBill?: GroupBillResponse;
}) {
  const bill = readout.bill ?? fallbackBill;

  return (
    <ReadoutSection title="Group bill detail">
      {bill ? (
        <>
          <StatusPill label="Merchant" value={bill.merchantName ?? "Untitled bill"} />
          <StatusPill label="Date" value={formatDate(bill.billDate)} />
          <StatusPill label="Total" value={formatMoney(bill.totalAmount, bill.totalCurrency)} />
          <StatusPill label="Status" value={labelize(bill.status)} />
          <StatusPill label="Reconciliation" value={labelize(bill.reconciliation.status)} />
          <StatusPill label="Items" value={String(bill.items.length)} />
          <StatusPill label="Participants" value={String(bill.participants.length)} />
          <StatusPill label="Payers" value={String(bill.payers.length)} />
        </>
      ) : (
        <p className="muted-copy">{readout.message}</p>
      )}
    </ReadoutSection>
  );
}

function ReadoutSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="detail-section" aria-label={title}>
      <h4>{title}</h4>
      <div className="detail-section-body">{children}</div>
    </section>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="readout-pill">
      <strong>{label}</strong>
      <span>{value}</span>
    </span>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="data-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function uniqueValues<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

type ReadoutStateName = BillsReadoutState["status"] | NotificationsReadoutState["status"];

function readoutStateTitle(state: ReadoutStateName, emptyTitle = "No bills yet", errorTitle = "Could not load bills"): string {
  switch (state) {
    case "auth_required":
      return "Sign in required";
    case "loading":
      return "Loading";
    case "empty":
      return emptyTitle;
    case "session_expired":
      return "Session expired";
    case "unavailable":
      return "Unavailable";
    case "unsupported":
      return "Unsupported";
    case "error":
      return errorTitle;
    case "loaded":
      return "Loaded";
  }
}

function statusClassForReadout(state: ReadoutStateName): string {
  if (state === "loaded") {
    return "status-sync";
  }

  if (state === "error" || state === "session_expired") {
    return "status-danger";
  }

  return "status-warning";
}

function importExportStatusClass(state: ImportExportCapability["status"]): string {
  if (state === "operation_method_exists" || state === "readout_only") {
    return "status-sync";
  }

  if (state === "not_available_yet") {
    return "status-danger";
  }

  return "status-warning";
}

function formatNotificationEvent(eventType: string): string {
  return labelize(eventType.replace(/[.]/g, "_"));
}

function notificationPriorityClass(priority: string): string {
  if (priority === "urgent") {
    return "status-danger";
  }

  if (priority === "attention") {
    return "status-warning";
  }

  return "status-sync";
}

function NavButton({
  item,
  active,
  onClick
}: {
  item: NavItem;
  active: boolean;
  onClick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={active ? "nav-item active" : "nav-item"}
      aria-current={active ? "page" : undefined}
      onClick={() => onClick(item.id)}
    >
      <span className="nav-label">{item.label}</span>
      <span className="nav-state">{item.status === "placeholder" ? "Planned" : "Protected"}</span>
    </button>
  );
}

function SessionBanner({ session }: { session: SessionBoundaryState }) {
  const tone = session.status === "authenticated" ? "success" : session.status === "error" ? "danger" : "warning";

  return (
    <section className={`session-banner ${tone}`} role="status" aria-live="polite">
      <div>
        <p className="eyebrow">Session state</p>
        <h3>{session.status === "authenticated" ? "Verified session" : "Authentication required"}</h3>
      </div>
      <p>{session.message}</p>
    </section>
  );
}
