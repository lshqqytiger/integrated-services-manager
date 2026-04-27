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
  const projectConfig = {
    name: service.name,
    root: service.root,
    command: service.command,
    mode: service.mode,
  };

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <div>
          <p className={styles.serviceName}>{service.name}</p>
          <p className={styles.serviceVersion}>{service.root}</p>
        </div>
        <span
          className={`${styles.statusBadge} ${
            isRunning ? styles.running : styles.stopped
          }`}
        >
          {formatStatus(service.status)}
        </span>
      </header>

      <div className={styles.footer}>
        <ServiceControls
          serviceId={service.id}
          serviceName={service.name}
          initialStatus={service.status}
          projectConfig={projectConfig}
        />
      </div>
    </article>
  );
}
