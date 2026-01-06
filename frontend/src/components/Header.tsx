import "./Header.css";

type HeaderProps = {
  wsConnected: boolean;
};

export default function Header({ wsConnected }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="header-left">
        <span
          className={`ws-dot ${wsConnected ? "connected" : "disconnected"}`}
          title={wsConnected ? "WebSocket Connected" : "WebSocket Disconnected"}
        ></span>
        <span className="ws-status-text">
          {wsConnected ? "Connected" : "Disconnected"}
        </span>
      </div>
      <div className="header-center">
        <h1>Pipeline Monitoring Dashboard</h1>
      </div>
    </header>
  );
}
