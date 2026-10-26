import { useEffect, useState } from "react";
import { API_DISTANT, API_LOCALE, baseApi } from "./api";

function permissionNotifs() {
  try {
    if (typeof Notification === "undefined") return "unsupported";
    return Notification.permission || "unsupported";
  } catch {
    return "unsupported";
  }
}

function attendreGoogleOauth(delai = 8000) {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const debut = Date.now();
    const timer = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - debut > delai) {
        clearInterval(timer);
        reject(new Error("Google n’a pas pu se charger. Vérifiez la connexion internet."));
      }
    }, 200);
  });
}

export default function SettingsScreen({
  session,
  serveur,
  apiUrl,
  googleClientId,
  prefs,
  majPref,
  changerUrl,
  verifierServeur,
  deconnecter,
  theme,
  changerTheme,
}) {
  const [url, setUrl] = useState(apiUrl || "");
  const [etat, setEtat] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [notif, setNotif] = useState(permissionNotifs);

  useEffect(() => {
    setUrl(apiUrl || "");
  }, [apiUrl]);

  async function sauverUrl() {
    setErreur("");
    setEtat("");
    setEnCours(true);
    try {
      const suivante = changerUrl(url) || baseApi();
      setUrl(suivante);
      const ok = await verifierServeur();
      setEtat(
        ok
          ? "Adresse enregistrée, serveur joignable."
          : "Adresse enregistrée, mais le serveur ne répond pas encore. Réessayez dans quelques secondes.",
      );
    } catch (e) {
      setErreur(e.message || "Impossible d’enregistrer cette adresse.");
    } finally {
      setEnCours(false);
    }
  }

  async function connecterDrive() {
    setErreur("");
    setEtat("");
    if (!googleClientId) {
      setErreur("Google Drive n’est pas configuré sur le serveur (GOOGLE_CLIENT_ID manquant).");
      return;
    }
    try {
      await attendreGoogleOauth();
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: "https://www.googleapis.com/auth/drive.file",
        callback: (reponse) => {
          if (reponse.error || !reponse.access_token) {
            setErreur("Autorisation Google Drive refusée.");
            return;
          }
          localStorage.setItem("vocalia_drive_token", reponse.access_token);
          majPref("driveConnecte", true);
          setEtat("Google Drive est relié à cet appareil.");
        },
      });
      client.requestAccessToken();
    } catch (e) {
      setErreur(e.message);
    }
  }

  function oublierDrive() {
    majPref("driveConnecte", false);
    setEtat("Google Drive a été déconnecté de cet appareil.");
  }

  async function activerNotifs() {
    try {
      if (typeof Notification === "undefined") {
        setNotif("unsupported");
        return;
      }
      const permission = await Notification.requestPermission();
      setNotif(permission);
    } catch {
      setNotif("unsupported");
    }
  }

  const identite = [session?.prenom, session?.nom].filter(Boolean).join(" ").trim();
  const etatServeur =
    serveur === "ok" ? "en ligne" : serveur === "verification" ? "vérification…" : "injoignable";

  return (
    <div className="settings">
      {erreur && <div className="banner error" role="alert">{erreur}</div>}
      {etat && <div className="banner ok">{etat}</div>}

      <section className="card setting">
        <h2>Apparence</h2>
        <p className="help">Fond blanc par défaut. Vous pouvez basculer en noir à tout moment.</p>
        <div className="theme-pair">
          <button
            type="button"
            className={`theme-choice${theme !== "sombre" ? " active" : ""}`}
            onClick={() => changerTheme("clair")}
          >
            Blanc
            <span>Fond clair</span>
          </button>
          <button
            type="button"
            className={`theme-choice${theme === "sombre" ? " active" : ""}`}
            onClick={() => changerTheme("sombre")}
          >
            Noir
            <span>Fond sombre</span>
          </button>
        </div>
      </section>

      <section className="card setting">
        <h2>Serveur</h2>
        <p className="help">
          Vocalia parle à {baseApi()}. État : {etatServeur}.
        </p>
        <div className="actions" style={{ marginBottom: 12 }}>
          <button
            className="btn small ghost"
            type="button"
            disabled={enCours}
            onClick={() => setUrl(API_LOCALE)}
          >
            Ce PC
          </button>
          <button
            className="btn small ghost"
            type="button"
            disabled={enCours}
            onClick={() => setUrl(API_DISTANT)}
          >
            En ligne
          </button>
        </div>
        <label className="field">
          <span>Adresse</span>
          <input
            className="input"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck="false"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={API_DISTANT}
          />
        </label>
        <button className="btn primary" type="button" onClick={sauverUrl} disabled={enCours || !url.trim()}>
          {enCours ? "Vérification…" : "Enregistrer et vérifier"}
        </button>
      </section>

      <section className="card setting">
        <h2>Compte</h2>
        <p className="help">
          {identite ? `${identite} · ` : ""}
          {session?.email || "Compte connecté"}
        </p>
        <button className="btn ghost" type="button" onClick={() => deconnecter()}>Se déconnecter</button>
      </section>

      <section className="card setting">
        <h2>Archives</h2>
        <p className="help">Ces choix s’appliquent aux prochains enregistrements sur cet appareil.</p>
        <div className="switch-row">
          <div>
            <strong>Conserver l’audio</strong>
            <p>Le son est joint à la transcription quand vous archivez.</p>
          </div>
          <input
            className="toggle"
            type="checkbox"
            checked={Boolean(prefs.conserverAudio)}
            onChange={(e) => majPref("conserverAudio", e.target.checked)}
            aria-label="Conserver l’audio"
          />
        </div>
        <div className="switch-row">
          <div>
            <strong>Copier aussi sur Google Drive</strong>
            <p>
              {prefs.driveConnecte
                ? "Drive est autorisé sur cet appareil."
                : googleClientId
                  ? "Reliez Google Drive d’abord, puis activez la copie."
                  : "Drive n’est pas activé sur le serveur pour le moment."}
            </p>
          </div>
          <input
            className="toggle"
            type="checkbox"
            checked={Boolean(prefs.cloudAuto && prefs.driveConnecte)}
            disabled={!prefs.driveConnecte}
            onChange={(e) => majPref("cloudAuto", e.target.checked)}
            aria-label="Envoyer les archives sur Google Drive"
          />
        </div>
        {(prefs.driveConnecte || googleClientId) && (
          <div className="actions" style={{ marginBottom: 8 }}>
            {prefs.driveConnecte ? (
              <button className="btn small ghost" type="button" onClick={oublierDrive}>
                Oublier Google Drive
              </button>
            ) : (
              <button className="btn small" type="button" onClick={connecterDrive}>
                Relier Google Drive
              </button>
            )}
          </div>
        )}
      </section>

      <section className="card setting">
        <h2>Notifications</h2>
        <p className="help">
          {notif === "unsupported" && "Ce navigateur ne propose pas les notifications."}
          {notif === "granted" && "Les notifications sont autorisées pour Vocalia."}
          {notif === "denied" && "Elles sont bloquées. Autorisez-les dans les paramètres du navigateur pour ce site."}
          {notif === "default" && "Vocalia peut vous prévenir quand une longue transcription est prête, si vous l’autorisez."}
        </p>
        {notif === "default" && (
          <button className="btn" type="button" onClick={activerNotifs}>Autoriser les notifications</button>
        )}
      </section>
    </div>
  );
}
