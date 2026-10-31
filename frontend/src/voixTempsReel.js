import { baseApi, requete } from "./api";

const TAUX_VISE = 16000;
const SILENCE_FIN_MS = 900;
const ATTENTE_PAROLE_MS = 8000;
const DUREE_MAX_MS = 15000;
const PAROLE_MIN_MS = 300;
const SEUIL_MIN = 0.02;
const SEUIL_MAX = 0.06;
const PREROLL_BLOCS = 3;

function urlWebSocket() {
  return `${baseApi().replace(/^http/i, "ws")}/ws/assistant`;
}

export function vocalDisponible() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.WebSocket) &&
    Boolean(window.AudioContext || window.webkitAudioContext) &&
    Boolean(window.AudioWorkletNode) &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export function creerAssistantVocal({
  onEtat,
  onTranscription,
  onReponse,
  onAction,
  onErreur,
  onNiveau,
  getHistorique,
}) {
  let ws = null;
  let tauxConnexion = 0;
  let etat = "ferme";
  let keepalive = null;
  let capture = null;
  let finEcouteAt = 0;

  function changer(suivant) {
    etat = suivant;
    onEtat?.(suivant);
  }

  function envoyerJson(objet) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(objet));
  }

  function arreterCapture() {
    if (!capture) return;
    const c = capture;
    capture = null;
    try {
      c.noeud.port.onmessage = null;
      c.noeud.disconnect();
      c.source.disconnect();
    } catch {}
    c.flux.getTracks().forEach((piste) => piste.stop());
    try {
      c.ctx.close();
    } catch {}
  }

  function fermerSocket() {
    clearInterval(keepalive);
    keepalive = null;
    const socket = ws;
    ws = null;
    if (socket) {
      try {
        socket.close();
      } catch {}
    }
  }

  function gererMessage(m) {
    if (m.type === "transcription") {
      onTranscription?.(m.texte);
    } else if (m.type === "action") {
      onAction?.(m);
    } else if (m.type === "reponse") {
      const total = Math.round(performance.now() - finEcouteAt);
      console.info("[vocal] chronos", { ...m.chronos, total_client_ms: total });
      changer("pret");
      onReponse?.(m);
    } else if (m.type === "erreur") {
      if (etat === "traitement" || etat === "connexion") changer(ws ? "pret" : "ferme");
      onErreur?.(m.message);
    }
  }

  async function ouvrir(taux) {
    if (ws && ws.readyState === WebSocket.OPEN && tauxConnexion === taux) return;
    fermerSocket();
    changer("connexion");
    const { ticket } = await requete("/ws-ticket", { method: "POST" });

    await new Promise((resolve, reject) => {
      const socket = new WebSocket(urlWebSocket());
      socket.binaryType = "arraybuffer";
      let pret = false;
      const delai = setTimeout(() => {
        reject(new Error("Le serveur vocal ne répond pas."));
        try {
          socket.close();
        } catch {}
      }, 20000);

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: "auth", ticket, taux }));
      };
      socket.onmessage = (event) => {
        let m;
        try {
          m = JSON.parse(event.data);
        } catch {
          return;
        }
        if (m.type === "pret" && !pret) {
          pret = true;
          clearTimeout(delai);
          ws = socket;
          tauxConnexion = taux;
          clearInterval(keepalive);
          keepalive = setInterval(() => envoyerJson({ type: "ping" }), 25000);
          changer("pret");
          resolve();
          return;
        }
        gererMessage(m);
      };
      socket.onerror = () => {
        if (!pret) {
          clearTimeout(delai);
          reject(new Error("Connexion vocale impossible."));
        }
      };
      socket.onclose = () => {
        clearTimeout(delai);
        if (!pret) {
          reject(new Error("Connexion vocale fermée."));
          return;
        }
        if (ws === socket) {
          if (etat === "traitement" || etat === "ecoute") {
            onErreur?.("Connexion vocale perdue. Réessayez.");
          }
          arreterCapture();
          clearInterval(keepalive);
          keepalive = null;
          ws = null;
          changer("ferme");
        }
      };
    });
  }

  function envoyerBloc(bloc) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(bloc.buffer);
  }

  function terminerEcoute() {
    if (etat !== "ecoute") return;
    arreterCapture();
    finEcouteAt = performance.now();
    changer("traitement");
    envoyerJson({ type: "fin_enonce", historique: (getHistorique?.() || []).slice(-10) });
  }

  function annuler(message) {
    arreterCapture();
    envoyerJson({ type: "annuler" });
    changer(ws ? "pret" : "ferme");
    if (message) onErreur?.(message);
  }

  async function ecouter() {
    if (etat === "ecoute" || etat === "traitement" || etat === "connexion") return;

    const Contexte = window.AudioContext || window.webkitAudioContext;
    let ctx;
    try {
      ctx = new Contexte({ sampleRate: TAUX_VISE });
    } catch {
      ctx = new Contexte();
    }
    ctx.resume?.().catch(() => {});

    let flux = null;
    try {
      await ouvrir(ctx.sampleRate);
      flux = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      await ctx.audioWorklet.addModule("/pcm-processor.js");

      const source = ctx.createMediaStreamSource(flux);
      const noeud = new AudioWorkletNode(ctx, "pcm-processor");
      source.connect(noeud);
      capture = { ctx, flux, noeud, source };

      const dureeBloc = (1600 / ctx.sampleRate) * 1000;
      const c = {
        prerolls: [],
        parole: false,
        msParole: 0,
        msSilence: 0,
        msTotal: 0,
        bruit: [],
        seuil: SEUIL_MIN,
      };

      noeud.port.onmessage = (event) => {
        const bloc = new Int16Array(event.data);
        let somme = 0;
        for (let i = 0; i < bloc.length; i += 1) {
          const v = bloc[i] / 32768;
          somme += v * v;
        }
        const rms = Math.sqrt(somme / bloc.length);
        onNiveau?.(rms);
        c.msTotal += dureeBloc;

        if (!c.parole && c.bruit.length < 3) {
          c.bruit.push(rms);
          if (c.bruit.length === 3) {
            const moyenne = c.bruit.reduce((a, b) => a + b, 0) / 3;
            c.seuil = Math.min(SEUIL_MAX, Math.max(SEUIL_MIN, moyenne * 3));
          }
        }

        if (rms > c.seuil) {
          if (!c.parole) {
            c.parole = true;
            c.prerolls.forEach(envoyerBloc);
            c.prerolls = [];
          }
          c.msSilence = 0;
          c.msParole += dureeBloc;
          envoyerBloc(bloc);
        } else if (c.parole) {
          c.msSilence += dureeBloc;
          envoyerBloc(bloc);
          if (c.msSilence >= SILENCE_FIN_MS) {
            if (c.msParole >= PAROLE_MIN_MS) {
              terminerEcoute();
              return;
            }
            c.parole = false;
            c.msParole = 0;
            c.msSilence = 0;
          }
        } else {
          c.prerolls.push(bloc);
          if (c.prerolls.length > PREROLL_BLOCS) c.prerolls.shift();
          if (c.msTotal > ATTENTE_PAROLE_MS) {
            annuler("Je n'ai rien entendu. Touchez le micro pour réessayer.");
            return;
          }
        }

        if (c.msTotal > DUREE_MAX_MS) terminerEcoute();
      };

      changer("ecoute");
    } catch (erreur) {
      arreterCapture();
      flux?.getTracks().forEach((piste) => piste.stop());
      try {
        ctx.close();
      } catch {}
      changer(ws ? "pret" : "ferme");
      throw erreur;
    }
  }

  function fermer() {
    arreterCapture();
    fermerSocket();
    changer("ferme");
  }

  return { ecouter, terminerEcoute, annuler, fermer, etat: () => etat };
}