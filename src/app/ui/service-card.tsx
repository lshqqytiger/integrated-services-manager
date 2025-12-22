import type { ServiceRuntime } from "../types";
import { ServiceStatus } from "../types";
import styles from "./service-card.module.css";
import ServiceControls from "./service-controls";

interface ServiceCardProps {
  service: ServiceRuntime;
}

function formatStatus(status: ServiceStatus) {
  switch (status) {
    case ServiceStatus.RUNNING:
      return "Running";
    case ServiceStatus.STOPPED:
    default:
      return "Stopped";
  }
}

export default function ServiceCard({ service }: ServiceCardProps) {
  const isRunning = service.status === ServiceStatus.RUNNING;
  const argsPreview = service.argv.length ? service.argv.join(" ") : "—";
  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <div>
          <p className={styles.serviceName}>{service.name}</p>
          <p className={styles.serviceVersion}>
            {service.version ? `Version ${service.version}` : "Version pending"}
          </p>
        </div>
        <span
          className={`${styles.statusBadge} ${
            isRunning ? styles.running : styles.stopped
          }`}
        >
          {formatStatus(service.status)}
        </span>
      </header>

      <dl className={styles.metaList}>
        <div className={styles.metaItem}>
          <dt className={styles.metaLabel}>Node version</dt>
          <dd>{service.nodeVersion}</dd>
        </div>
        <div className={styles.metaItem}>
          <dt className={styles.metaLabel}>Arguments</dt>
          <dd>{argsPreview}</dd>
        </div>
        <div className={styles.metaItem}>
          <dt className={styles.metaLabel}>Entry point</dt>
          <dd>{service.entryPoint}</dd>
        </div>
        <div className={styles.metaItem}>
          <dt className={styles.metaLabel}>Mode</dt>
          <dd>{service.mode}</dd>
        </div>
      </dl>

      <div className={styles.footer}>
        <div className={styles.footerInfo}>
          <span className={styles.modeTag}>{service.mode}</span>
        </div>
        <ServiceControls
          serviceId={service.id}
          serviceName={service.name}
          initialStatus={service.status}
        />
      </div>
    </article>
  );
}
