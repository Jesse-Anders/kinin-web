// Persistent sub-nav across all five metrics dashboards (and the index +
// pricing override page). Rendered by MetricsShell so every dashboard
// gets it for free. Highlights the active tab; tabs are plain buttons
// that drive the parent App.jsx page state.

const TABS = [
  { id: "admin-metrics",            label: "Index",       roman: "" },
  { id: "admin-metrics-overview",   label: "Overview",    roman: "I" },
  { id: "admin-metrics-cost",       label: "LLM Cost",    roman: "II" },
  { id: "admin-metrics-engagement", label: "Engagement",  roman: "III" },
  { id: "admin-metrics-users",      label: "Users",       roman: "IV" },
  { id: "admin-metrics-performance",label: "Performance", roman: "V" },
];

export function MetricsTabs({ activeId, setActivePage }) {
  return (
    <nav className="km-metrics-tabs" aria-label="Metrics dashboards">
      <div className="km-metrics-tabs-inner">
        {TABS.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              className={`km-metrics-tab ${isActive ? "is-active" : ""}`}
              aria-current={isActive ? "page" : undefined}
              onClick={() => {
                if (!isActive && typeof setActivePage === "function") {
                  setActivePage(tab.id);
                }
              }}
            >
              {tab.roman ? (
                <span className="km-metrics-tab-roman">{tab.roman}.</span>
              ) : null}
              <span className="km-metrics-tab-label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
