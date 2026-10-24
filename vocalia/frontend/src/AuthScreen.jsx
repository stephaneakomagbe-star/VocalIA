import { useEffect, useRef, useState } from "react";
import { Check, Moon, Sun } from "lucide-react";
import Logo from "./Logo";
import { envoyerFormulaire } from "./api";

export default function AuthScreen({
  serveur,
  apiUrl,
  googleClientId,
  messageSession,
  onConnecter,
  onChangerUrl,
  onVerifier,
  theme = "clair",
  onTheme,
}) {
  const [mode, setMode] = useState("connexion");
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [url, setUrl] = useState(apiUrl);
  const [montrerUrl, setMontrerUrl] = useState(false);
  const [erreur, setErreur] = useState(messageSession || "");
  const [enCours, setEnCours] = useState(false);
  const googleRef = useRef(null);

  useEffect(() => {
    setUrl(apiUrl);
  }, [apiUrl]);

  useEffect(() => {
    if (!messageSession) return;
    setErreur(messageSession);
  }, [messageSession]);

  useEffect(() => {
    if (!googleClientId || mode !== "connexion") return undefined;
    let annule = false;
    const dessiner = () => {
      if (annule || !window.google?.accounts?.id || !googleRef.current) return false;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (reponse) => {
          setEnCours(true);
          setErreur("");
          try {
            const donnees = await envoyerFormulaire("/connexion-google", {
              id_token_google: reponse.credential,
            });
            onConnecter(donnees);
          } catch (e) {
            setErreur(e.message);
          } finally {
            setEnCours(false);
          }
        },
      });
      googleRef.current.innerHTML = "";
      const largeur = Math.max(220, googleRef.current.clientWidth || 320);
      window.google.accounts.id.renderButton(googleRef.current, {
        theme: "outline",
        size: "large",
        width: largeur,
        text: "continue_with",
        shape: "rectangular",
        locale: "fr",
      });
      return true;
    };
    if (dessiner()) return () => { annule = true; };
    const timer = setInterval(() => {
      if (dessiner()) clearInterval(timer);
    }, 300);
    return () => {
      annule = true;
      clearInterval(timer);
    };
  }, [googleClientId, mode, onConnecter]);

  async function soumettre(event) {
    event.preventDefault();
    setErreur("");
    if (mode === "inscription") {
      if (prenom.trim().length < 2 || nom.trim().length < 2) {
        setErreur("Indiquez votre prénom et votre nom.");
        return;
      }
      if (motDePasse.length < 6) {
        setErreur("Le mot de passe doit contenir au moins 6 caractères.");
        return;
      }
      if (motDePasse !== confirmation) {
        setErreur("Les mots de passe ne correspondent pas.");
        return;
      }
    }
    setEnCours(true);
    try {
      const champs = { email: email.trim(), mot_de_passe: motDePasse };
      if (mode === "inscription") {
        champs.prenom = prenom.trim();
        champs.nom = nom.trim();
        champs.telephone = telephone.trim();
      }
      const donnees = await envoyerFormulaire(mode === "connexion" ? "/connexion" : "/inscription", champs);
      onConnecter(donnees);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnCours(false);
    }
  }

  async function enregistrerUrl() {
    onChangerUrl(url);
    setMontrerUrl(false);
    await onVerifier();
  }

  return (
    <div className="auth-layout">
      <aside className="auth-aside">
        <div>
          <div className="brand">
            <Logo size={36} />
            <span>
              <strong className="brand-name">Vocalia</strong>
              <span className="brand-kicker">Transcription</span>
            </span>
          </div>
          <h1>Le texte, après la parole.</h1>
          <p className="lead">
            Prédications, réunions, entretiens et vidéos. Vocalia transcrit, puis vous résumez, traduisez et archivez.
          </p>
          <ul>
            <li><Check className="gold" size={18} /> Micro, fichier ou lien YouTube</li>
            <li><Check className="gold" size={18} /> Résumé et traduction du texte obtenu</li>
            <li><Check className="gold" size={18} /> Archives privées, liées à votre compte</li>
          </ul>
        </div>
        <p className="aside-foot help" style={{ color: "var(--on-sidebar-muted)" }}>
          Conçu pour le travail réel : cultes, réunions, notes à relire.
        </p>
      </aside>

      <section className="auth-panel">
        {onTheme && (
          <button
            className="theme-btn auth-theme"
            type="button"
            aria-label={theme === "sombre" ? "Passer au fond blanc" : "Passer au fond noir"}
            onClick={() => onTheme(theme === "sombre" ? "clair" : "sombre")}
          >
            {theme === "sombre" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        )}
        <form className="card auth-card" onSubmit={soumettre}>
          <div className="seg pair" role="tablist">
            <button type="button" className={mode === "connexion" ? "active" : ""} onClick={() => { setMode("connexion"); setErreur(""); }}>
              Connexion
            </button>
            <button type="button" className={mode === "inscription" ? "active" : ""} onClick={() => { setMode("inscription"); setErreur(""); }}>
              Inscription
            </button>
          </div>
          <h2>{mode === "connexion" ? "Bon retour." : "Créer un compte"}</h2>
          <p className="help" style={{ marginBottom: 16 }}>
            {mode === "connexion"
              ? "Utilisez l’email de votre compte Vocalia."
              : "Un compte suffit pour retrouver vos transcriptions."}
          </p>

          {serveur === "verification" && <div className="banner info">Connexion au serveur…</div>}
          {serveur === "ko" && (
            <div className="banner warn">
              Le serveur ne répond pas. S’il est hébergé à distance, laissez-lui quelques secondes, puis réessayez.
            </div>
          )}
          {erreur && <div className="banner error" role="alert">{erreur}</div>}

          {mode === "connexion" && googleClientId && (
            <>
              <div className="google-slot" ref={googleRef} />
              <div className="sep">ou avec un email</div>
            </>
          )}

          {mode === "inscription" && (
            <>
              <div className="row">
                <label className="field" style={{ flex: 1 }}>
                  <span>Prénom</span>
                  <input className="input" value={prenom} onChange={(e) => setPrenom(e.target.value)} autoComplete="given-name" required />
                </label>
                <label className="field" style={{ flex: 1 }}>
                  <span>Nom</span>
                  <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="family-name" required />
                </label>
              </div>
              <label className="field">
                <span>Téléphone (optionnel)</span>
                <input className="input" value={telephone} onChange={(e) => setTelephone(e.target.value)} autoComplete="tel" inputMode="tel" />
              </label>
            </>
          )}

          <label className="field">
            <span>Email</span>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label className="field">
            <span>Mot de passe</span>
            <input
              className="input"
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              autoComplete={mode === "connexion" ? "current-password" : "new-password"}
              required
            />
          </label>
          {mode === "inscription" && (
            <label className="field">
              <span>Confirmer le mot de passe</span>
              <input className="input" type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" required />
            </label>
          )}

          <button className="btn primary block" type="submit" disabled={enCours || serveur === "verification"}>
            {enCours ? "Veuillez patienter…" : mode === "connexion" ? "Se connecter" : "Créer mon compte"}
          </button>

          <div className="server-line">
            {montrerUrl || serveur === "ko" ? (
              <div className="field" style={{ marginTop: 8 }}>
                <span>Adresse du serveur</span>
                <div className="row">
                  <input className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://vocalia-ud4o.onrender.com" />
                  <button className="btn small" type="button" onClick={enregistrerUrl}>OK</button>
                </div>
              </div>
            ) : (
              <button className="linkish" type="button" style={{ color: "var(--muted)" }} onClick={() => setMontrerUrl(true)}>
                Serveur : {apiUrl.replace(/^https?:\/\//, "")}
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
