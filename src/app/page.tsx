import styles from "./page.module.css";
import ServiceCard from "./ui/service-card";
import { requireSession } from "./lib/session";
import { getServiceSettings } from "./lib/settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireSession();
  const { services, stats } = await getServiceSettings();

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.kicker}>Integrated Services Manager</p>
          <h1>Runtime control for every service, in one place.</h1>
          <p>
            Securely start, stop, and inspect every managed process without
            touching the CLI.
          </p>
        </section>

        <section className={styles.stats}>
          <div className={styles.statCard}>
            <p>Total Services</p>
            <span>{stats.total}</span>
          </div>
          <div className={styles.statCard}>
            <p>Production</p>
            <span>{stats.production}</span>
          </div>
          <div className={styles.statCard}>
            <p>Development</p>
            <span>{stats.development}</span>
          </div>
        </section>

        <section className={styles.servicesSection}>
          <header>
            <h2>Configured Services</h2>
          </header>

          {services.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No services configured yet.</p>
              <p>
                Edit <code>data/settings.json</code> to define your first
                service.
              </p>
            </div>
          ) : (
            <div className={styles.serviceGrid}>
              {services.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
