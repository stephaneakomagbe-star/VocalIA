import { useEffect, useRef, useState } from "react";
import { Mic, Send, Square, Volume2 } from "lucide-react";
import { envoyerFormulaire } from "./api";

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

export default function AssistantScreen() {
  const [messages, setMessages] = useState([]);
  const [saisie, setSaisie] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");
  const [ecoute, setEcoute] = useState(false);
  const finRef = useRef(null);
  const recRef = useRef(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, occupe]);

  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    if (recRef.current && recRef.current.state !== "inactive") {
      recRef.current.onstop = null;
      recRef.current.stop();
      recRef.current.stream?.getTracks().forEach((piste) => piste.stop());
    }
  }, []);

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

  async function basculerMicro() {
    if (ecoute && recRef.current) {
      recRef.current.stop();
      return;
    }
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

  return (
    <section className="chat">
      {erreur && <div className="banner error" role="alert">{erreur}</div>}
      {info && <div className="banner ok">{info}</div>}

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
          <button className="btn small ghost" type="button" onClick={() => { setMessages([]); setInfo(""); }}>
            Nouvelle conversation
          </button>
          <button className="btn small" type="button" onClick={archiver}>Archiver</button>
        </div>
      )}

      <div className="composer">
        <button
          className={`icon-btn${ecoute ? " live" : ""}`}
          type="button"
          onClick={basculerMicro}
          disabled={occupe}
          aria-label={ecoute ? "Arrêter et envoyer" : "Parler"}
        >
          {ecoute ? <Square size={16} /> : <Mic size={18} />}
        </button>
        <textarea
          rows={1}
          placeholder={ecoute ? "Écoute en cours…" : "Écrivez votre message…"}
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={touche}
          disabled={ecoute}
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
