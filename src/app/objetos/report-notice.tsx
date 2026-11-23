import { kindLabel, statusLabel, type ItemKind, type ItemStatus } from "./labels";
import styles from "./report-notice.module.css";

type NoticeItem = {
  kind: ItemKind;
  title: string;
  description: string;
  place: string;
  status: ItemStatus;
  created_at: string;
  photo_url: string | null;
  photo_url_2?: string | null;
};

const reportDate = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Mexico_City",
});

export function ReportNotice({
  item,
  detail = false,
  owner = false,
}: {
  item: NoticeItem;
  detail?: boolean;
  owner?: boolean;
}) {
  const Heading = detail ? "h1" : "h2";
  const photos = detail ? [item.photo_url, item.photo_url_2] : [item.photo_url || item.photo_url_2];
  const date = new Date(item.created_at);
  const stamp =
    item.status === "abierto"
      ? item.kind === "perdido"
        ? "SE BUSCA · PERDIDO"
        : "EN RESGUARDO · ENCONTRADO"
      : `${kindLabel[item.kind]} · ${statusLabel[item.status]}`;

  return (
    <div className={styles.notice} data-kind={item.kind} data-detail={detail} data-closed={item.status !== "abierto"}>
      <header className={styles.meta}>
        <span className={styles.stamp}>{stamp}</span>
        <time dateTime={date.toISOString()}>{reportDate.format(date)}</time>
      </header>
      <div className={styles.body}>
        {photos.some(Boolean) && (
          <div className={styles.photos}>
            {photos.map(
              (photo, index) =>
                photo && (
                  <img
                    key={index}
                    src={photo}
                    alt={detail ? `${item.title}, imagen ${index + 1}` : ""}
                    loading={detail ? "eager" : "lazy"}
                  />
                ),
            )}
          </div>
        )}
        <div className={styles.copy}>
          <Heading>{item.title}</Heading>
          <p className={detail ? "whitespace-pre-wrap" : "line-clamp-3"}>{item.description}</p>
        </div>
      </div>
      <footer className={styles.footer}>
        <span className={styles.place}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
            <circle cx="12" cy="10" r="2.4" />
          </svg>
          <strong>{item.place}</strong>
        </span>
        <div className={styles.trailing}>
          {owner && <span className={styles.ownerPill}>Tu reporte</span>}
          {!detail && (
            <span className={styles.cta}>
              {item.status !== "abierto"
                ? statusLabel[item.status]
                : item.kind === "perdido"
                  ? "Ver aviso ↗"
                  : "Reclamar ↗"}
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
