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
import { dashboardCards, navItems, safeStatePanels, type NavItem } from "./shellModel";
import type {
  ExpenseBillReconciliationStatus,
  ExpenseBillStatus,
  PersonalBillResponse
} from "../../../packages/client-web/src/generated";

const primaryNav = navItems.filter((item) => item.section === "primary");
const moreNav = navItems.filter((item) => item.section === "more");
const mobileNav = [
  { item: navItems.find((item) => item.id === "home") ?? navItems[0], label: "Home" },
  { item: navItems.find((item) => item.id === "bills") ?? navItems[0], label: "Bills" },
  { item: navItems.find((item) => item.id === "groups") ?? navItems[0], label: "Groups" },
  { item: navItems.find((item) => item.id === "settle") ?? navItems[0], label: "Settle" },
  { item: navItems.find((item) => item.id === "settings") ?? navItems[0], label: "More" }
];

function getInitialActiveId() {
  const routeId = window.location.hash.replace(/^#\/?/, "");

  return navItems.some((item) => item.id === routeId) ? routeId : "home";
}

function setActiveRoute(id: string) {
  window.location.hash = `/${id}`;
}

export function App() {
  const [activeId, setActiveId] = useState(() => getInitialActiveId());
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
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
  const [billSearch, setBillSearch] = useState("");
  const [billStatusFilter, setBillStatusFilter] = useState<ExpenseBillStatus | "all">("all");
  const [billReconciliationFilter, setBillReconciliationFilter] = useState<
    ExpenseBillReconciliationStatus | "all"
  >("all");

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
            <button className="notification-button" type="button" aria-label="Open notifications">
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
                {activeId === "bills" ? "Add bill unavailable" : activeItem.actionLabel}
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

function ReadoutMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value compact-value">{value}</p>
      <p className="metric-detail">{detail}</p>
    </article>
  );
}

function StateMessage({ state, message }: { state: BillsReadoutState["status"]; message: string }) {
  if (state === "loaded") {
    return null;
  }

  return (
    <div className="empty-state" role="status" aria-live="polite">
      <h4>{readoutStateTitle(state)}</h4>
      <p>{message}</p>
    </div>
  );
}

function BillListRow({
  bill,
  selected,
  onSelect
}: {
  bill: PersonalBillResponse;
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

function readoutStateTitle(state: BillsReadoutState["status"]): string {
  switch (state) {
    case "auth_required":
      return "Sign in required";
    case "loading":
      return "Loading";
    case "empty":
      return "No bills yet";
    case "session_expired":
      return "Session expired";
    case "unavailable":
      return "Unavailable";
    case "error":
      return "Could not load bills";
    case "loaded":
      return "Loaded";
  }
}

function statusClassForReadout(state: BillsReadoutState["status"]): string {
  if (state === "loaded") {
    return "status-sync";
  }

  if (state === "error" || state === "session_expired") {
    return "status-danger";
  }

  return "status-warning";
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
