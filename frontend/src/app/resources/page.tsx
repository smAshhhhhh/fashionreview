import Link from "next/link";
import ResourceShell from "../components/ResourceShell";
import { RESOURCE_GROUPS } from "./resource-navigation";

export default function ResourcesPage() {
  return (
    <ResourceShell>
      <div className="resource-content resource-overview">
        <header className="resource-overview-header">
          <h1 className="resource-overview-title">资源中心</h1>
          <p className="resource-page-description">
            管理点评所用的数据资源与分析配置。
          </p>
        </header>

        <div className="resource-entry-groups">
          {RESOURCE_GROUPS.map((group) => (
            <section key={group.title}>
              <div className="resource-group-heading">
                <h2 className="resource-section-title">{group.title}</h2>
                <p className="resource-page-description">{group.description}</p>
              </div>
              <div className="resource-entry-list">
                {group.entries.map((entry) => (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    className="resource-entry"
                  >
                    <span aria-hidden="true" className="resource-entry-icon">
                      <span className="material-symbols-outlined">
                        {entry.icon}
                      </span>
                    </span>
                    <div className="min-w-0">
                      <h3 className="resource-item-title">{entry.title}</h3>
                      <p className="resource-entry-description">
                        {entry.description}
                      </p>
                    </div>
                    <span
                      aria-hidden="true"
                      className="material-symbols-outlined resource-entry-arrow"
                    >
                      chevron_right
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </ResourceShell>
  );
}
