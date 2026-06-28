import { useEffect, useMemo, useState } from "react";
import {
  createInitialSessionBoundaryState,
  loadSessionBoundaryState,
  type SessionBoundaryState
} from "./authSession";
import { dashboardCards, navItems, safeStatePanels, type NavItem } from "./shellModel";

const primaryNav = navItems.filter((item) => item.section === "primary");
const moreNav = navItems.filter((item) => item.section === "more");
const mobileNav = [
  { item: navItems.find((item) => item.id === "home") ?? navItems[0], label: "Home" },
  { item: navItems.find((item) => item.id === "bills") ?? navItems[0], label: "Bills" },
  { item: navItems.find((item) => item.id === "groups") ?? navItems[0], label: "Groups" },
  { item: navItems.find((item) => item.id === "settle") ?? navItems[0], label: "Settle" },
  { item: navItems.find((item) => item.id === "settings") ?? navItems[0], label: "More" }
];

export function App() {
  const [activeId, setActiveId] = useState("home");
  const [session, setSession] = useState<SessionBoundaryState>(() =>
    createInitialSessionBoundaryState()
  );

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

  const activeItem = useMemo(
    () => navItems.find((item) => item.id === activeId) ?? navItems[0],
    [activeId]
  );

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
            <NavButton key={item.id} item={item} active={item.id === activeId} onClick={setActiveId} />
          ))}
        </nav>
        <div className="nav-divider" />
        <nav className="nav-group nav-group-secondary" aria-label="More user areas">
          {moreNav.map((item) => (
            <NavButton key={item.id} item={item} active={item.id === activeId} onClick={setActiveId} />
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
              onClick={() => setActiveId(item.id)}
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
                {activeItem.actionLabel}
              </button>
            </div>
          </section>

          <SessionBanner session={session} />

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
                    <button key={item.id} type="button" onClick={() => setActiveId(item.id)}>
                      <span>{item.label}</span>
                      <span>{item.status === "placeholder" ? "Planned" : "Protected"}</span>
                    </button>
                  ))}
                </div>
              </section>
            </aside>
          </section>
        </main>
      </div>
    </div>
  );
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
