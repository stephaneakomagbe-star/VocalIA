import { useEffect, useRef, useState } from "react";
import { Download, Link, Mic, Square, Upload, Volume2 } from "lucide-react";
import {
  ApiError,
  LANGUES_CIBLE,
  LANGUES_SOURCE,
  NOMS_LANGUES,
  envoyerFormulaire,
  suivreTravail,
} from "./api";
import { BoutonsPartage, nomFichier, titreLocal } from "./partage";

function formatTemps(secondes) {
  const m = String(Math.floor(secondes / 60)).padStart(2, "0");
  const s = String(secondes % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function mots(texte) {
  return texte.trim() ? texte.trim().split(/\s+/).length : 0;
}

function telecharger(nom, texte) {
  const blob = new Blob([texte], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nom;
  lien.click();
  URL.revokeObjectURL(url);
}

function lire(texte) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const phrase = new SpeechSynthesisUtterance(texte);
  phrase.lang = "fr-FR";
  window.speechSynthesis.speak(phrase);
}

function mimeEnregistrement() {
  const candidats = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidats.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";
}

export default function StudioScreen({ prefs }) {
  const [source, setSource] = useState("micro");
  const [langue, setLangue] = useState("auto");
  const [dureeMax, setDureeMax] = useState(30);
  const [lien, setLien] = useState("");
  const [fichier, setFichier] = useState(null);
  const [survol, setSurvol] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [secondes, setSecondes] = useState(0);
  const [etape, setEtape] = useState("");
  const [progression, setProgression] = useState(null);
  const [erreur, setErreur] = useState("");
  const [note, setNote] = useState("");
  const [texte, setTexte] = useState("");
  const [audioTemp, setAudioTemp] = useState(null);
  const [langueCible, setLangueCible] = useState("français");
  const [derive, setDerive] = useState(null);
  const [message, setMessage] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [titre, setTitre] = useState("");
  const [titreEnCours, setTitreEnCours] = useState(false);

  const recRef = useRef(null);
  const timerRef = useRef(null);
  const abortRef = useRef(null);
  const fichierRef = useRef(null);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    window.speechSynthesis?.cancel();
    abortRef.current?.abort();
    if (recRef.current && recRef.current.state !== "inactive") {
      recRef.current.onstop = null;
      recRef.current.stop();
      recRef.current.stream?.getTracks().forEach((piste) => piste.stop());
    }
  }, []);

  async function lancer(champs, fichierEnvoye) {
    setOccupe(true);
    setErreur("");
    setMessage("");
    setDerive(null);
    setNote("");
    setEtape("Envoi…");
    setProgression(0);
    setTitre("");
    abortRef.current?.abort();
    const controle = new AbortController();
    abortRef.current = controle;
    try {
      const depart = await envoyerFormulaire(
        fichierEnvoye ? "/travaux/fichier" : "/travaux/lien",
        {
          ...champs,
          langue,
          conserver_audio: prefs.conserverAudio ? "1" : "0",
        },
        fichierEnvoye,
        (valeur) => setProgression(valeur),
      );
      setProgression(null);
      const etat = await suivreTravail(depart.id_travail, setEtape, controle.signal);
      setTexte(etat.texte || "");
      setNote(etat.note || "");
      setAudioTemp(etat.audio_temporaire || null);
      setEtape("");
      proposerTitre(etat.texte || "");
      if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("Vocalia", { body: "Votre transcription est prête." });
      }
    } catch (e) {
      if (e?.name === "AbortError") return;
      setErreur(e.message || "La transcription a échoué.");
      setEtape("");
      setProgression(null);
    } finally {
      setOccupe(false);
    }
  }

  async function demarrer() {
    setErreur("");
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = mimeEnregistrement();
      const rec = new MediaRecorder(flux, type ? { mimeType: type } : undefined);
      const morceaux = [];
      rec.ondataavailable = (event) => {
        if (event.data.size) morceaux.push(event.data);
      };
      rec.onstop = () => {
        flux.getTracks().forEach((piste) => piste.stop());
        clearInterval(timerRef.current);
        setEnregistrement(false);
        const mime = rec.mimeType || "audio/webm";
        const extension = mime.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(morceaux, { type: mime });
        const audio = new File([blob], `vocalia-${Date.now()}.${extension}`, { type: mime });
        lancer({}, audio);
      };
      recRef.current = rec;
      rec.start(1000);
      setSecondes(0);
      setEnregistrement(true);
      const debut = Date.now();
      timerRef.current = setInterval(() => {
        const ecoule = Math.floor((Date.now() - debut) / 1000);
        setSecondes(ecoule);
        if (ecoule >= dureeMax * 60) rec.stop();
      }, 250);
    } catch {
      setErreur("Impossible d’accéder au microphone. Autorisez-le dans les réglages de l’appareil, puis réessayez.");
    }
  }

  function arreter() {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
  }

  function choisirFichier(liste) {
    const choisi = liste?.[0];
    if (choisi) setFichier(choisi);
  }

  async function outil(type) {
    if (!texte.trim()) return;
    setOccupe(true);
    setErreur("");
    setMessage("");
    setEtape(type === "resume" ? "Préparation du résumé…" : "Préparation de la traduction…");
    abortRef.current?.abort();
    const controle = new AbortController();
    abortRef.current = controle;
    try {
      const depart = await envoyerFormulaire(
        type === "resume" ? "/outils/resumer" : "/outils/traduire",
        { texte, langue_cible: langueCible },
      );
      const etat = await suivreTravail(depart.id_travail, setEtape, controle.signal);
      setDerive({ type, texte: etat.texte || "" });
      setEtape("");
    } catch (e) {
      if (e?.name === "AbortError") return;
      setErreur(e instanceof ApiError ? e.message : e.message);
      setEtape("");
    } finally {
      setOccupe(false);
    }
  }

  async function proposerTitre(contenu) {
    const brut = (contenu || "").trim();
    if (!brut) {
      setTitre("");
      return;
    }
    setTitre(titreLocal(brut));
    setTitreEnCours(true);
    try {
      const reponse = await envoyerFormulaire("/outils/titre", { texte: brut });
      if (reponse.titre) setTitre(reponse.titre);
    } catch {
      /* le titre local reste affiché */
    } finally {
      setTitreEnCours(false);
    }
  }

  async function archiver(contenu, nom, avecAudio = false) {
    setMessage("");
    setErreur("");
    const titreFinal = titre.trim() || titreLocal(contenu);
    try {
      const champs = { texte: contenu, titre: titreFinal };
      if (avecAudio && audioTemp && prefs.conserverAudio) champs.audio_temporaire = audioTemp;
      await envoyerFormulaire("/sauvegarder", champs);
      let suite = "Transcription enregistrée dans vos archives.";
      const jetonDrive = localStorage.getItem("vocalia_drive_token");
      if (prefs.cloudAuto && jetonDrive) {
        try {
          await envoyerFormulaire("/sauvegarder-drive", {
            access_token: jetonDrive,
            texte: contenu,
            nom: nom || nomFichier(titreFinal),
          });
          suite = "Enregistrée dans vos archives et envoyée sur Google Drive.";
        } catch (e) {
          if (String(e.message).toLowerCase().includes("expir")) {
            localStorage.removeItem("vocalia_drive_token");
          }
          suite = `Enregistrée dans vos archives. Drive : ${e.message}`;
        }
      }
      setAudioTemp(null);
      setMessage(suite);
    } catch (e) {
      setErreur(e.message);
    }
  }

  const langueLisible = NOMS_LANGUES[langue] || (langue === "auto" ? "automatique" : langue);

  return (
    <div className="studio">
      <section className="card panel source-panel">
        <div className="seg" role="tablist" aria-label="Source">
          <button type="button" className={source === "micro" ? "active" : ""} onClick={() => setSource("micro")}>
            <Mic size={15} /> Micro
          </button>
          <button type="button" className={source === "fichier" ? "active" : ""} onClick={() => setSource("fichier")}>
            <Upload size={15} /> Fichier
          </button>
          <button type="button" className={source === "lien" ? "active" : ""} onClick={() => setSource("lien")}>
            <Link size={15} /> Lien
          </button>
        </div>

        {erreur && <div className="banner error" role="alert">{erreur}</div>}
        {message && <div className="banner ok">{message}</div>}
        {etape && (
          <div className="banner info" aria-live="polite">
            {etape}
            {progression !== null && (
              <div className="progress" aria-hidden="true"><span style={{ width: `${progression}%` }} /></div>
            )}
          </div>
        )}

        {source === "micro" && (
          <div className="recorder">
            <div className="rec-time">
              {enregistrement && <span className="rec-dot" />}
              {formatTemps(secondes)}
            </div>
            <p className="help" style={{ margin: "8px 0 16px" }}>
              Arrêt automatique après {dureeMax} min. Vous pouvez stopper plus tôt.
            </p>
            {enregistrement ? (
              <button className="btn danger block" type="button" onClick={arreter}>
                <Square size={16} /> Arrêter et transcrire
              </button>
            ) : (
              <button className="btn primary block" type="button" onClick={demarrer} disabled={occupe}>
                <Mic size={16} /> Commencer
              </button>
            )}
            <label className="field" style={{ marginTop: 16, textAlign: "left" }}>
              <span>Durée maximale</span>
              <select className="select" value={dureeMax} onChange={(e) => setDureeMax(Number(e.target.value))} disabled={enregistrement}>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 heure</option>
                <option value={120}>2 heures</option>
              </select>
            </label>
          </div>
        )}

        {source === "fichier" && (
          <>
            <div
              className={`dropzone${survol ? " over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setSurvol(true); }}
              onDragLeave={() => setSurvol(false)}
              onDrop={(e) => {
                e.preventDefault();
                setSurvol(false);
                choisirFichier(e.dataTransfer.files);
              }}
            >
              <strong>Déposez un audio ou une vidéo</strong>
              <p className="help">MP3, WAV, M4A, MP4, MOV, MKV. L’audio est extrait automatiquement.</p>
              {fichier && <p className="file-name">{fichier.name}</p>}
              <button className="btn small" type="button" style={{ marginTop: 12 }} onClick={() => fichierRef.current?.click()}>
                Parcourir
              </button>
              <input
                ref={fichierRef}
                hidden
                type="file"
                accept="audio/*,video/*"
                onChange={(e) => choisirFichier(e.target.files)}
              />
            </div>
            <button className="btn primary block" type="button" disabled={!fichier || occupe} onClick={() => lancer({}, fichier)}>
              Transcrire le fichier
            </button>
          </>
        )}

        {source === "lien" && (
          <>
            <label className="field">
              <span>Lien de la vidéo ou de l’audio</span>
              <input
                className="input"
                type="url"
                placeholder="https://"
                value={lien}
                onChange={(e) => setLien(e.target.value)}
              />
            </label>
            <p className="help" style={{ marginBottom: 12 }}>
              YouTube, Facebook, Instagram, TikTok ou un lien direct. Les liens de partage Google Drive et Dropbox ne sont pas pris en charge : importez le fichier.
            </p>
            <button
              className="btn primary block"
              type="button"
              disabled={occupe || !/^https?:\/\//i.test(lien.trim())}
              onClick={() => lancer({ url: lien.trim() })}
            >
              Transcrire le lien
            </button>
          </>
        )}

        <label className="field" style={{ marginTop: 16 }}>
          <span>Langue</span>
          <select className="select" value={langue} onChange={(e) => setLangue(e.target.value)} disabled={occupe || enregistrement}>
            {LANGUES_SOURCE.map((item) => (
              <option key={item.code} value={item.code}>{item.label}</option>
            ))}
          </select>
        </label>
        <p className="help">
          L’éwé utilise la détection automatique : le modèle ne force pas encore cette langue.
          {prefs.conserverAudio ? " L’audio sera joint si vous archivez." : " L’audio ne sera pas conservé."}
        </p>
      </section>

      <section className="card document">
        {!texte && !occupe && (
          <div className="empty-doc">
            <div>
              <strong>Rien pour l’instant.</strong>
              <p>Le texte transcrit s’affichera ici. Vous pourrez le corriger avant de l’enregistrer.</p>
            </div>
          </div>
        )}
        {(texte || occupe) && (
          <>
            <div className="doc-meta">
              <span>{texte ? `${mots(texte).toLocaleString("fr-FR")} mots` : "Transcription"}</span>
              <span>Langue : {langueLisible}</span>
            </div>
            {note && <div className="banner info">{note}</div>}
            <label className="field title-field">
              <span>{titreEnCours ? "Titre (en cours…)" : "Titre"}</span>
              <input
                className="input"
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                placeholder="Un titre sera proposé automatiquement"
                aria-label="Titre de la transcription"
              />
            </label>
            <textarea
              className="doc"
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              placeholder={occupe ? "Transcription en cours…" : ""}
              aria-label="Texte transcrit"
            />
            <BoutonsPartage titre={titre} texte={texte} className="no-print" />
            <div className="doc-toolbar no-print">
              <button className="btn small ghost" type="button" disabled={!texte} onClick={() => telecharger(nomFichier(titre || "vocalia"), texte)}>
                <Download size={14} /> Télécharger
              </button>
              <button className="btn small ghost" type="button" disabled={!texte} onClick={() => lire(texte)}>
                <Volume2 size={14} /> Lire
              </button>
              <button className="btn small primary" type="button" disabled={!texte || occupe} onClick={() => archiver(texte, nomFichier(titre || "transcription"), true)}>
                Archiver
              </button>
            </div>
            <div className="tools no-print">
              <label className="field">
                <span>Langue du résultat</span>
                <select className="select" value={langueCible} onChange={(e) => setLangueCible(e.target.value)}>
                  {LANGUES_CIBLE.map((nom) => <option key={nom}>{nom}</option>)}
                </select>
              </label>
              <button className="btn small" type="button" disabled={!texte || occupe} onClick={() => outil("resume")}>Résumer</button>
              <button className="btn small" type="button" disabled={!texte || occupe} onClick={() => outil("traduire")}>Traduire</button>
            </div>
          </>
        )}

        {derive && (
          <div style={{ marginTop: 18 }}>
            <div className="doc-meta">
              <strong>{derive.type === "resume" ? "Résumé" : "Traduction"} · {langueCible}</strong>
            </div>
            <textarea
              className="doc"
              style={{ minHeight: 160 }}
              value={derive.texte}
              onChange={(e) => setDerive({ ...derive, texte: e.target.value })}
              aria-label={derive.type === "resume" ? "Résumé" : "Traduction"}
            />
            <BoutonsPartage titre={titre} texte={derive.texte} className="no-print" />
            <div className="doc-toolbar no-print">
              <button className="btn small primary" type="button" onClick={() => archiver(derive.texte, nomFichier(titre || derive.type))}>
                Archiver ce texte
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
