import Logo from "./Logo";

export default function SplashScreen({ sortant }) {
  return (
    <div className={`splash${sortant ? " sortant" : ""}`} role="status" aria-live="polite" aria-label="Vocalia">
      <div className="splash-inner">
        <Logo size={96} className="splash-logo" />
        <strong className="splash-name">Vocalia</strong>
        <span className="splash-kicker">Transcription</span>
      </div>
    </div>
  );
}
