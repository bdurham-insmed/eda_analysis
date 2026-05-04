import "./Header.css";

type HeaderProps = {
  title: string;
  wsConnected: boolean;
};

export default function Header({ title, wsConnected }: HeaderProps) {
  return (
    <header className="topbar">
      <div className="topbar-title">{title}</div>
      <div className="topbar-actions">
        <span
          className={`ws-pill ${
            wsConnected ? "ws-pill--connected" : "ws-pill--disconnected"
          }`}
          title={wsConnected ? "Real-time stream connected" : "Stream disconnected"}
        >
          <span className="ws-dot" />
          {wsConnected ? "Live" : "Disconnected"}
        </span>
      </div>
    </header>
  );
}
