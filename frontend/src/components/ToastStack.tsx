import "./ToastStack.css";

export type Toast = {
  id: number;
  kind: "error" | "warning";
  title: string;
  message?: string;
  pipelineId?: string;
};

type Props = {
  toasts: Toast[];
  onDismiss: (id: number) => void;
  onOpen?: (pipelineId: string) => void;
};

const IconAlert = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function ToastStack({ toasts, onDismiss, onOpen }: Props) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" role="region" aria-label="Notifications">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`} role="status">
          <div className="toast-icon"><IconAlert /></div>
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            {t.message && <div className="toast-message">{t.message}</div>}
            {t.pipelineId && onOpen && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  onOpen(t.pipelineId!);
                  onDismiss(t.id);
                }}
              >
                Open details
              </button>
            )}
          </div>
          <button
            type="button"
            className="toast-close"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss"
          >
            <IconClose />
          </button>
        </div>
      ))}
    </div>
  );
}
