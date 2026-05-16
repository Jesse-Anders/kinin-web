// Sticky top-nav for every page inside the admin section. Replaces the
// old "Navigate" frame on AdminHomePage and stays pinned to the viewport
// as the admin scrolls. Each entry is a plain button; the active page
// gets a "is-active" outline so wayfinding is obvious.

const SECTIONS = [
  { id: "admin",                    label: "Home" },
  { id: "admin-metrics",            label: "Metrics" },
  { id: "admin-crm",                label: "CRM" },
  { id: "admin-onboarding-preview", label: "Preview onboarding" },
  { id: "admin-user-purge",         label: "User purge" },
  { id: "admin-theme",              label: "Theme Studio" },
  { id: "admin-email",              label: "Email Studio" },
];

const METRICS_SUBPAGES = new Set([
  "admin-metrics",
  "admin-metrics-overview",
  "admin-metrics-cost",
  "admin-metrics-engagement",
  "admin-metrics-users",
  "admin-metrics-performance",
  "admin-metrics-pricing",
]);

function sectionIdFor(activePage) {
  // Treat every metrics sub-page as belonging to the Metrics section.
  if (METRICS_SUBPAGES.has(activePage)) return "admin-metrics";
  return activePage;
}

export function AdminNav({ activePage, setActivePage }) {
  const activeSection = sectionIdFor(activePage);

  return (
    <nav className="km-admin-nav" aria-label="Admin sections">
      <div className="km-admin-nav-inner">
        <span className="km-admin-nav-eyebrow">Admin</span>
        <div className="km-admin-nav-items">
          {SECTIONS.map((section) => {
            const isActive = section.id === activeSection;
            return (
              <button
                key={section.id}
                type="button"
                className={`km-admin-nav-item ${isActive ? "is-active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  if (!isActive && typeof setActivePage === "function") {
                    setActivePage(section.id);
                  }
                }}
              >
                {section.label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
