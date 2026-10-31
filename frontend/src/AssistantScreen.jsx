import { useEffect, useRef, useState } from "react";
import { Mic, Send, Square, Volume2 } from "lucide-react";
import { envoyerFormulaire } from "./api";
import { BoutonsPartage } from "./partage";
import { creerAssistantVocal, vocalDisponible } from "./voixTempsReel";

const EXEMPLES = [
  "Quels points retenir d’une prédication sur la persévérance ?",
  "Propose un plan de notes pour une réunion d’une heure.",
  "Reformule ce conseil pour une lecture claire à voix haute.",
];

function lire(texte) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const phrase = new SpeechSynthesisUtterance(texte);
  phrase.lang = "fr-FR";
  window.speechSynthesis.speak(phrase);
}

export default function AssistantScreen({ allerA }) {
  const [messages, setMessages] = useState([]);
  const [saisie, setSaisie] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");
  const [ecoute, setEcoute] = useState(false);
  const [etatVocal, setEtatVocal] = useState("ferme");
  const [niveau, setNiveau] = useState(0);
  const [parle, setParle] = useState(false);

  const finRef = useRef(null);
  const recRef = useRef(null);
  const vocalRef = useRef(null);
  const messagesRef = useRef([]);
  const actionsRef = useRef([]);
  const allerARef = useRef(allerA);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    allerARef.current = allerA;
  }, [allerA]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, occupe]);

  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    vocalRef.current?.fermer();
    if (recRef.current && recRef.current.state !== "inactive") {
      recRef.current.onstop = null;
      recRef.current.stop();
      recRef.current.stream?.getTracks().forEach((piste) => piste.stop());
    }
  }, []);

  function executerActions(actions) {
    actions.forEach((action) => {
      if (action.action === "ouvrir_ecran" && allerARef.current) allerARef.current(action.ecran);
    });
  }

  function lireReponse(texte) {
    const fin = () => {
      setParle(false);
      const actions = actionsRef.current;
      actionsRef.current = [];
      executerActions(actions);
    };
    if (!window.speechSynthesis) {
      fin();
      return;
    }
    window.speechSynthesis.cancel();
    const phrase = new SpeechSynthesisUtterance(texte);
    phrase.lang = "fr-FR";
    phrase.onend = fin;
    phrase.onerror = fin;
    setParle(true);
    window.speechSynthesis.speak(phrase);
  }

  function arreterParole() {
    actionsRef.current = [];
    window.speechSynthesis?.cancel();
    setParle(false);
  }

  function obtenirVocal() {
    if (!vocalRef.current) {
      vocalRef.current = creerAssistantVocal({
        onEtat: setEtatVocal,
        onNiveau: setNiveau,
        getHistorique: () => messagesRef.current.slice(-10),
        onTranscription: (texte) => {
          setMessages((liste) => [...liste, { role: "user", texte }]);
        },
        onAction: (action) => {
          actionsRef.current.push(action);
        },
        onReponse: (reponse) => {
          setMessages((liste) => [...liste, { role: "assistant", texte: reponse.texte }]);
          lireReponse(reponse.texte);
        },
        onErreur: (message) => setErreur(message),
      });
    }
    return vocalRef.current;
  }

  async function envoyerTexte(texte) {
    const contenu = texte.trim();
    if (!contenu || occupe) return;
    setSaisie("");
    setErreur("");
    setInfo("");
    setOccupe(true);
    const historique = messages.slice(-10);
    setMessages((liste) => [...liste, { role: "user", texte: contenu }]);
    try {
      const reponse = await envoyerFormulaire("/assistant-texte", {
        message: contenu,
        historique: JSON.stringify(historique),
      });
      setMessages((liste) => [...liste, { role: "assistant", texte: reponse.reponse }]);
    } catch (e) {
      setErreur(e.message);
      setMessages((liste) => liste.slice(0, -1));
      setSaisie(contenu);
    } finally {
      setOccupe(false);
    }
  }

  async function envoyerVocal(fichier) {
    setErreur("");
    setInfo("");
    setOccupe(true);
    const historique = messages.slice(-10);
    try {
      const reponse = await envoyerFormulaire(
        "/assistant",
        { historique: JSON.stringify(historique) },
        fichier,
      );
      setMessages((liste) => [
        ...liste,
        { role: "user", texte: reponse.question },
        { role: "assistant", texte: reponse.reponse },
      ]);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setOccupe(false);
    }
  }

  async function demarrerClassique() {
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(flux);
      const morceaux = [];
      rec.ondataavailable = (event) => {
        if (event.data.size) morceaux.push(event.data);
      };
      rec.onstop = () => {
        flux.getTracks().forEach((piste) => piste.stop());
        setEcoute(false);
        const mime = rec.mimeType || "audio/webm";
        const blob = new Blob(morceaux, { type: mime });
        envoyerVocal(new File([blob], "question.webm", { type: mime }));
      };
      recRef.current = rec;
      rec.start();
      setEcoute(true);
    } catch {
      setErreur("Micro indisponible. Vérifiez l’autorisation du navigateur.");
    }
  }

  async function basculerMicro() {
    setErreur("");
    setInfo("");

    if (parle) arreterParole();

    if (ecoute && recRef.current) {
      recRef.current.stop();
      return;
    }

    if (vocalDisponible()) {
      const vocal = obtenirVocal();
      const etat = vocal.etat();
      if (etat === "ecoute") {
        vocal.terminerEcoute();
        return;
      }
      if (etat === "traitement" || etat === "connexion") return;
      try {
        await vocal.ecouter();
        return;
      } catch (e) {
        console.warn("[vocal] temps réel indisponible :", e);
        setInfo("Mode temps réel indisponible, mode classique utilisé.");
      }
    }
    await demarrerClassique();
  }

  async function archiver() {
    if (!messages.length) return;
    setInfo("");
    setErreur("");
    try {
      await envoyerFormulaire("/sauvegarder-conversation", {
        conversation: JSON.stringify(messages),
      });
      let suite = "Conversation archivée.";
      const jeton = localStorage.getItem("vocalia_drive_token");
      if (localStorage.getItem("vocalia_cloud_auto") === "1" && jeton) {
        const texte = messages.map((m) => `${m.role === "assistant" ? "Vocalia" : "Vous"} : ${m.texte}`).join("\n\n");
        try {
          await envoyerFormulaire("/sauvegarder-drive", {
            access_token: jeton,
            texte,
            nom: `conversation-vocalia-${Date.now()}.txt`,
          });
          suite = "Conversation archivée et envoyée sur Google Drive.";
        } catch (e) {
          suite = `Archivée ici. Drive : ${e.message}`;
        }
      }
      setInfo(suite);
    } catch (e) {
      setErreur(e.message);
    }
  }

  function touche(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      envoyerTexte(saisie);
    }
  }

  const vocalActif = etatVocal === "ecoute";
  const micOccupe = occupe || etatVocal === "connexion" || etatVocal === "traitement";

  return (
    <section className="chat">
      {erreur && <div className="banner error" role="alert">{erreur}</div>}
      {info && <div className="banner ok">{info}</div>}
      {etatVocal === "connexion" && <div className="banner info">Connexion vocale…</div>}
      {vocalActif && (
        <div className="banner info" aria-live="polite">
          Je vous écoute. Parlez, je m’arrête quand vous vous taisez.
          <div
            aria-hidden="true"
            style={{
              marginTop: 8,
              height: 4,
              borderRadius: 2,
              background: "currentColor",
              opacity: 0.6,
              width: `${Math.min(100, niveau * 600)}%`,
              transition: "width 80ms",
            }}
          />
        </div>
      )}
      {etatVocal === "traitement" && <div className="banner info" aria-live="polite">Je réfléchis…</div>}
      {parle && <div className="banner info">Lecture de la réponse. Touchez le micro pour interrompre.</div>}

      <div className="thread">
        {messages.length === 0 && (
          <div className="empty-doc card" style={{ minHeight: 220 }}>
            <div>
              <strong>Une question, une note, une reformulation.</strong>
              <p>L’assistant répond en texte simple. La lecture à voix haute se fait avec le bouton Lire.</p>
              <div className="suggestions">
                {EXEMPLES.map((exemple) => (
                  <button key={exemple} type="button" onClick={() => setSaisie(exemple)}>{exemple}</button>
                ))}
              </div>
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`bubble ${message.role}`}>
            {message.texte}
            {message.role === "assistant" && (
              <div>
                <button className="btn small ghost" type="button" onClick={() => lire(message.texte)}>
                  <Volume2 size={14} /> Lire
                </button>
              </div>
            )}
          </div>
        ))}
        {occupe && <div className="bubble assistant">Vocalia écrit…</div>}
        <div ref={finRef} />
      </div>

      {messages.length > 0 && (
        <div className="actions" style={{ marginBottom: 10 }}>
          <BoutonsPartage
            titre="Conversation Vocalia"
            texte={messages.map((m) => `${m.role === "assistant" ? "Vocalia" : "Vous"} : ${m.texte}`).join("\n\n")}
          />
          <button className="btn small ghost" type="button" onClick={() => { setMessages([]); setInfo(""); }}>
            Nouvelle conversation
          </button>
          <button className="btn small" type="button" onClick={archiver}>Archiver</button>
        </div>
      )}

      <div className="composer">
        <button
          className={`icon-btn${ecoute || vocalActif ? " live" : ""}`}
          type="button"
          onClick={basculerMicro}
          disabled={micOccupe}
          aria-label={ecoute || vocalActif ? "Arrêter et envoyer" : "Parler"}
        >
          {ecoute || vocalActif ? <Square size={16} /> : <Mic size={18} />}
        </button>
        <textarea
          rows={1}
          placeholder={ecoute || vocalActif ? "Écoute en cours…" : "Écrivez votre message…"}
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={touche}
          disabled={ecoute || vocalActif}
        />
        <button
          className="icon-btn primary"
          type="button"
          onClick={() => envoyerTexte(saisie)}
          disabled={occupe || !saisie.trim()}
          aria-label="Envoyer"
        >
          <Send size={18} />
        </button>
      </div>
    </section>
  );
}