import { useEffect, useRef, useState } from "react";
import { Copy, Download, Search, Trash2 } from "lucide-react";
import { blobMedia, requete } from "./api";

function telecharger(nom, texte) {
  const blob = new Blob([texte], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nom;
  lien.click();
  URL.revokeObjectURL(url);
}

function texteConversation(messages) {
  if (!Array.isArray(messages)) return "";
  return messages
    .map((m) => `${m.role === "assistant" ? "Vocalia" : "Vous"} : ${m.texte || m.content || ""}`)
    .join("\n\n");
}

export default function LibraryScreen() {
  const [onglet, setOnglet] = useState("transcriptions");
  const [transcriptions, setTranscriptions] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [recherche, setRecherche] = useState("");
  const [erreur, setErreur] = useState("");
  const [ouvert, setOuvert] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [audios, setAudios] = useState({});
  const urls = useRef({});

  async function charger() {
    setErreur("");
    try {
      const [textes, echanges] = await Promise.all([
        requete("/historique"),
        requete("/historique-conversations"),
      ]);
      setTranscriptions(Array.isArray(textes.transcriptions) ? textes.transcriptions : []);
      setConversations(Array.isArray(echanges.conversations) ? echanges.conversations : []);
    } catch (e) {
      setErreur(e.message);
    }
  }

  useEffect(() => {
    charger();
    return () => {
      Object.values(urls.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    let annule = false;
    async function preparer() {
      const manquants = transcriptions.filter((item) => item.audio_fichier && !urls.current[item.id]);
      if (!manquants.length) return;
      const suivants = { ...urls.current };
      await Promise.all(manquants.map(async (item) => {
        try {
          const url = await blobMedia(item.audio_fichier);
          suivants[item.id] = url;
          urls.current[item.id] = url;
        } catch {
          urls.current[item.id] = "";
        }
      }));
      if (!annule) setAudios({ ...urls.current });
    }
    preparer();
    return () => { annule = true; };
  }, [transcriptions]);

  async function supprimer(type, id) {
    setErreur("");
    try {
      await requete(type === "transcriptions" ? `/transcriptions/${id}` : `/conversations/${id}`, { method: "DELETE" });
      if (type === "transcriptions") {
        setTranscriptions((liste) => liste.filter((item) => item.id !== id));
        if (urls.current[id]) URL.revokeObjectURL(urls.current[id]);
        delete urls.current[id];
      } else {
        setConversations((liste) => liste.filter((item) => item.id !== id));
      }
      setConfirmation(null);
    } catch (e) {
      setErreur(e.message);
    }
  }

  const filtre = recherche.trim().toLowerCase();
  const listeTextes = transcriptions.filter((item) => !filtre || (item.texte || "").toLowerCase().includes(filtre));
  const listeEchanges = conversations.filter((item) => !filtre || texteConversation(item.messages).toLowerCase().includes(filtre));
  const liste = onglet === "transcriptions" ? listeTextes : listeEchanges;

  return (
    <section>
      <div className="filters">
        <div className="seg pair" style={{ margin: 0, minWidth: 240, flex: "0 0 280px" }}>
          <button type="button" className={onglet === "transcriptions" ? "active" : ""} onClick={() => setOnglet("transcriptions")}>
            Textes
          </button>
          <button type="button" className={onglet === "conversations" ? "active" : ""} onClick={() => setOnglet("conversations")}>
            Conversations
          </button>
        </div>
        <label className="search">
          <Search size={16} />
          <input
            className="input"
            placeholder="Rechercher"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            aria-label="Rechercher dans les archives"
          />
        </label>
      </div>

      {erreur && <div className="banner error" style={{ maxWidth: 980 }}>{erreur}</div>}

      <div className="archive">
        {liste.length === 0 && (
          <div className="card empty-doc" style={{ minHeight: 180 }}>
            <div>
              <strong>{filtre ? "Aucun résultat." : "Archives vides."}</strong>
              <p>{filtre ? "Essayez un autre mot." : "Les textes que vous archivez apparaîtront ici."}</p>
            </div>
          </div>
        )}

        {onglet === "transcriptions" && listeTextes.map((item) => {
          const long = (item.texte || "").length > 420;
          const montre = ouvert === item.id;
          return (
            <article key={item.id} className="card archive-item">
              <header>
                <strong>Transcription</strong>
                <time>{item.date}</time>
              </header>
              <p className={`excerpt${montre ? "" : " clamp"}`}>{item.texte}</p>
              {long && (
                <button className="linkish" type="button" style={{ marginTop: 8, color: "var(--accent-dark)" }} onClick={() => setOuvert(montre ? null : item.id)}>
                  {montre ? "Réduire" : "Lire la suite"}
                </button>
              )}
              {audios[item.id] && <audio controls src={audios[item.id]} />}
              <div className="actions">
                <button className="btn small ghost" type="button" onClick={() => navigator.clipboard.writeText(item.texte || "")}>
                  <Copy size={14} /> Copier
                </button>
                <button className="btn small ghost" type="button" onClick={() => telecharger(`vocalia-${item.id}.txt`, item.texte || "")}>
                  <Download size={14} /> Télécharger
                </button>
                {confirmation === `t-${item.id}` ? (
                  <>
                    <button className="btn small danger" type="button" onClick={() => supprimer("transcriptions", item.id)}>Confirmer</button>
                    <button className="btn small ghost" type="button" onClick={() => setConfirmation(null)}>Annuler</button>
                  </>
                ) : (
                  <button className="btn small ghost" type="button" onClick={() => setConfirmation(`t-${item.id}`)}>
                    <Trash2 size={14} /> Supprimer
                  </button>
                )}
              </div>
            </article>
          );
        })}

        {onglet === "conversations" && listeEchanges.map((item) => {
          const corps = texteConversation(item.messages);
          return (
            <article key={item.id} className="card archive-item">
              <header>
                <strong>Conversation</strong>
                <time>{item.date}</time>
              </header>
              <div className="thread" style={{ minHeight: 0, margin: 0 }}>
                {(item.messages || []).map((message, index) => (
                  <div key={index} className={`bubble ${message.role === "assistant" ? "assistant" : "user"}`}>
                    {message.texte || message.content}
                  </div>
                ))}
              </div>
              <div className="actions">
                <button className="btn small ghost" type="button" onClick={() => navigator.clipboard.writeText(corps)}>
                  <Copy size={14} /> Copier
                </button>
                <button className="btn small ghost" type="button" onClick={() => telecharger(`conversation-${item.id}.txt`, corps)}>
                  <Download size={14} /> Télécharger
                </button>
                {confirmation === `c-${item.id}` ? (
                  <>
                    <button className="btn small danger" type="button" onClick={() => supprimer("conversations", item.id)}>Confirmer</button>
                    <button className="btn small ghost" type="button" onClick={() => setConfirmation(null)}>Annuler</button>
                  </>
                ) : (
                  <button className="btn small ghost" type="button" onClick={() => setConfirmation(`c-${item.id}`)}>
                    <Trash2 size={14} /> Supprimer
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
