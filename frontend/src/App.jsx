import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, LogOut, MessageSquare, Mic, Moon, Settings, Sun } from "lucide-react";
import { baseApi, definirBaseApi, requete, sante, setUnauthorizedHandler } from "./api";
import { appliquerTheme, lireTheme } from "./theme";
import AuthScreen from "./AuthScreen";
import StudioScreen from "./StudioScreen";
import AssistantScreen from "./AssistantScreen";
import LibraryScreen from "./LibraryScreen";
import SettingsScreen from "./SettingsScreen";
import SplashScreen from "./SplashScreen";
import Logo from "./Logo";

const VUES = [
  { id: "studio", label: "Transcription", icon: Mic },
  { id: "assistant", label: "Assistant", icon: MessageSquare },
  { id: "archives", label: "Archives", icon: Archive },
  { id: "reglages", label: "Réglages", icon: Settings },
];

function BoutonTheme({ theme, onTheme, className = "" }) {
  return (
    <button
      className={`theme-btn${className ? ` ${className}` : ""}`}
      type="button"
      aria-label={theme === "sombre" ? "Passer au fond blanc" : "Passer au fond noir"}
      onClick={() => onTheme(theme === "sombre" ? "clair" : "sombre")}
    >
      {theme === "sombre" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

const TITRES = {
  studio: ["Transcription", "Enregistrez, importez un fichier ou collez un lien. Le texte reste modifiable avant l’archivage."],
  assistant: ["Assistant", "Posez une question à l’écrit ou à la voix. Les réponses peuvent être lues à voix haute."],
  archives: ["Archives", "Vos transcriptions et conversations, sur cet appareil et sur votre compte."],
  reglages: ["Réglages", "Serveur, compte et façon dont Vocalia conserve votre travail."],
};

function lireSession() {
  const token = localStorage.getItem("vocalia_token") || "";
  if (!token) return null;
  return {
    token,
    email: localStorage.getItem("vocalia_email") || "",
    prenom: localStorage.getItem("vocalia_prenom") || "",
    nom: localStorage.getItem("vocalia_nom") || "",
  };
}

function lirePrefs() {
  return {
    conserverAudio: localStorage.getItem("vocalia_conserver_audio") !== "0",
    cloudAuto: localStorage.getItem("vocalia_cloud_auto") === "1",
    driveConnecte: Boolean(localStorage.getItem("vocalia_drive_token")),
  };
}

export default function App() {
  const [session, setSession] = useState(lireSession);
  const [vue, setVue] = useState("studio");
  const [apiUrl, setApiUrl] = useState(baseApi);
  const [serveur, setServeur] = useState("verification");
  const [googleClientId, setGoogleClientId] = useState(import.meta.env.VITE_GOOGLE_CLIENT_ID || "");
  const [prefs, setPrefs] = useState(lirePrefs);
  const [theme, setTheme] = useState(lireTheme);
  const [messageSession, setMessageSession] = useState("");
  const [intro, setIntro] = useState("visible");

  useEffect(() => {
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const attente = reduit ? 400 : 1700;
    const fondu = reduit ? 180 : 480;
    const t1 = setTimeout(() => setIntro("sortie"), attente);
    const t2 = setTimeout(() => setIntro("fini"), attente + fondu);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const changerTheme = useCallback((suivant) => {
    const valeur = suivant === "sombre" ? "sombre" : "clair";
    setTheme(valeur);
    appliquerTheme(valeur);
  }, []);

  const deconnecter = useCallback((message = "") => {
    const token = localStorage.getItem("vocalia_token");
    localStorage.removeItem("vocalia_token");
    localStorage.removeItem("vocalia_email");
    localStorage.removeItem("vocalia_prenom");
    localStorage.removeItem("vocalia_nom");
    setSession(null);
    setMessageSession(message);
    if (token) {
      const form = new FormData();
      fetch(`${baseApi()}/deconnexion`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      deconnecter("Votre session a expiré. Reconnectez-vous.");
    });
  }, [deconnecter]);

  const verifierServeur = useCallback(async () => {
    setServeur("verification");
    for (let essai = 0; essai < 3; essai += 1) {
      try {
        await sante();
        setServeur("ok");
        try {
          const config = await requete("/config");
          if (config.google_client_id) setGoogleClientId(config.google_client_id);
        } catch {
          /* la config publique n'empêche pas l'usage */
        }
        return true;
      } catch {
        if (essai < 2) await new Promise((r) => setTimeout(r, 1800));
      }
    }
    setServeur("ko");
    return false;
  }, []);

  useEffect(() => {
    verifierServeur();
  }, [verifierServeur, apiUrl]);

  function connecter(donnees) {
    localStorage.setItem("vocalia_token", donnees.token);
    localStorage.setItem("vocalia_email", donnees.email || "");
    localStorage.setItem("vocalia_prenom", donnees.prenom || "");
    localStorage.setItem("vocalia_nom", donnees.nom || "");
    setSession({
      token: donnees.token,
      email: donnees.email || "",
      prenom: donnees.prenom || "",
      nom: donnees.nom || "",
    });
    setMessageSession("");
    setVue("studio");
  }

  const changerUrl = useCallback((valeur) => {
    const suivante = definirBaseApi(valeur);
    setApiUrl(suivante);
    return suivante;
  }, []);

  const majPref = useCallback((cle, valeur) => {
    setPrefs((actuel) => {
      const suivant = { ...actuel, [cle]: valeur };
      if (cle === "driveConnecte" && !valeur) suivant.cloudAuto = false;
      return suivant;
    });
    if (cle === "conserverAudio") localStorage.setItem("vocalia_conserver_audio", valeur ? "1" : "0");
    if (cle === "cloudAuto") localStorage.setItem("vocalia_cloud_auto", valeur ? "1" : "0");
    if (cle === "driveConnecte" && !valeur) {
      localStorage.removeItem("vocalia_drive_token");
      localStorage.setItem("vocalia_cloud_auto", "0");
    }
  }, []);

  const contexte = useMemo(
    () => ({
      session,
      serveur,
      apiUrl,
      googleClientId,
      prefs,
      majPref,
      theme,
      changerTheme,
      changerUrl,
      verifierServeur,
      deconnecter,
    }),
    [session, serveur, apiUrl, googleClientId, prefs, majPref, theme, changerTheme, changerUrl, deconnecter, verifierServeur],
  );

  useEffect(() => {
    const titre = session ? TITRES[vue]?.[0] : "Connexion";
    document.title = titre ? `${titre} · Vocalia` : "Vocalia";
  }, [vue, session]);

  const splash = intro !== "fini" ? <SplashScreen sortant={intro === "sortie"} /> : null;

  if (!session) {
    return (
      <>
        {splash}
        <AuthScreen
          serveur={serveur}
          apiUrl={apiUrl}
          googleClientId={googleClientId}
          messageSession={messageSession}
          onConnecter={connecter}
          onChangerUrl={changerUrl}
          onVerifier={verifierServeur}
          boutonTheme={<BoutonTheme theme={theme} onTheme={changerTheme} />}
        />
      </>
    );
  }

  const [titre, sousTitre] = TITRES[vue];
  const prenom = session.prenom || "Compte";

  return (
    <div className="shell">
      {splash}
      <aside className="sidebar">
        <div className="brand">
          <Logo size={36} />
          <span>
            <strong className="brand-name">Vocalia</strong>
            <span className="brand-kicker">Transcription</span>
          </span>
        </div>
        <nav className="nav" aria-label="Sections">
          {VUES.map((item) => {
            const Icone = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-btn${vue === item.id ? " active" : ""}`}
                onClick={() => setVue(item.id)}
              >
                <Icone size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="side-foot">
          <div className="side-user">
            <span className={`status-dot${serveur === "ok" ? "" : " off"}`} />
            <div>
              <strong>{prenom}</strong>
              <span>{session.email}</span>
            </div>
          </div>
          <button className="linkish" onClick={() => deconnecter()} style={{ marginTop: 10 }}>
            <LogOut size={16} /> Se déconnecter
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="brand topbar-brand">
            <Logo size={32} />
            <strong className="brand-name">Vocalia</strong>
          </div>
          <BoutonTheme theme={theme} onTheme={changerTheme} />
        </header>
        <div className="page-head">
          <h1>{titre}</h1>
          <p>{sousTitre}</p>
        </div>
        {serveur !== "ok" && (
          <div className={`banner ${serveur === "verification" ? "info" : "warn"}`} style={{ maxWidth: 980 }}>
            {serveur === "verification"
              ? "Connexion au serveur… S’il vient de se réveiller, cela peut prendre quelques secondes."
              : "Le serveur ne répond pas. Vérifiez l’adresse dans Réglages."}
          </div>
        )}
        {vue === "studio" && <StudioScreen {...contexte} />}
        {vue === "assistant" && <AssistantScreen {...contexte} />}
        {vue === "archives" && <LibraryScreen {...contexte} />}
        {vue === "reglages" && <SettingsScreen {...contexte} />}
      </main>

      <nav className="bottom-nav" aria-label="Sections">
        {VUES.map((item) => {
          const Icone = item.icon;
          return (
            <button
              key={item.id}
              className={vue === item.id ? "active" : ""}
              onClick={() => setVue(item.id)}
            >
              <Icone size={18} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
