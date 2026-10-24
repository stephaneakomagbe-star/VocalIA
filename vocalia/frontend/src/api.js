const CLE_URL = "vocalia_api_url";
export const API_DISTANT = "https://vocalia-ud4o.onrender.com";
export const API_LOCALE = "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

let onUnauthorized = () => {};

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export function estNatif() {
  if (typeof window === "undefined") return false;
  if (window.Capacitor?.isNativePlatform?.()) return true;
  const protocole = window.location.protocol;
  return protocole === "capacitor:" || protocole === "ionic:" || protocole === "file:";
}

export function baseApi() {
  const stockee = (localStorage.getItem(CLE_URL) || "").trim().replace(/\/$/, "");
  if (stockee) return stockee;
  const env = String(import.meta.env.VITE_API_URL || "").trim().replace(/\/$/, "");
  if (env) return env;
  if (estNatif()) return API_DISTANT;
  const hote = window.location.hostname;
  if (!hote || hote === "localhost" || hote === "127.0.0.1") return API_LOCALE;
  return API_DISTANT;
}

function normaliserUrl(valeur) {
  let propre = String(valeur || "").trim().replace(/\/$/, "");
  if (!propre) return "";
  if (!/^https?:\/\//i.test(propre)) {
    const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(propre);
    propre = `${local ? "http" : "https"}://${propre}`;
  }
  return propre;
}

export function definirBaseApi(valeur) {
  const propre = normaliserUrl(valeur);
  if (propre) localStorage.setItem(CLE_URL, propre);
  else localStorage.removeItem(CLE_URL);
  return baseApi();
}

function jeton() {
  return localStorage.getItem("vocalia_token") || "";
}

async function lireJson(reponse) {
  const texte = await reponse.text();
  if (!texte) {
    if (!reponse.ok) throw new ApiError(`Erreur serveur (${reponse.status}).`, reponse.status);
    return {};
  }
  try {
    return JSON.parse(texte);
  } catch {
    throw new ApiError(
      reponse.ok ? "Réponse du serveur illisible." : `Erreur serveur (${reponse.status}).`,
      reponse.status,
    );
  }
}

function verifier(donnees, status) {
  if (donnees?.erreur) {
    const erreur = new ApiError(donnees.erreur, status);
    if (status === 401 && /session/i.test(String(donnees.erreur))) onUnauthorized();
    throw erreur;
  }
  if (status >= 400) throw new ApiError(`Erreur serveur (${status}).`, status);
  return donnees;
}

export async function requete(chemin, { method = "GET", body } = {}) {
  let reponse;
  try {
    const headers = {};
    const token = jeton();
    if (token) headers.Authorization = `Bearer ${token}`;
    reponse = await fetch(`${baseApi()}${chemin}`, {
      method,
      body,
      cache: "no-store",
      headers,
    });
  } catch {
    throw new ApiError("Impossible de joindre le serveur Vocalia. Vérifiez l’adresse et la connexion.");
  }
  const donnees = await lireJson(reponse);
  return verifier(donnees, reponse.status);
}

export function envoyerFormulaire(chemin, champs, fichier, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    Object.entries(champs || {}).forEach(([cle, valeur]) => {
      if (valeur !== undefined && valeur !== null) form.append(cle, valeur);
    });
    if (fichier) form.append("fichier", fichier, fichier.name || "audio.webm");

    xhr.open("POST", `${baseApi()}${chemin}`);
    const token = jeton();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      let donnees = {};
      try {
        donnees = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        reject(new ApiError("Réponse du serveur illisible.", xhr.status));
        return;
      }
      try {
        resolve(verifier(donnees, xhr.status));
      } catch (erreur) {
        reject(erreur);
      }
    };
    xhr.onerror = () => {
      reject(new ApiError("Impossible de joindre le serveur Vocalia pendant l’envoi."));
    };
    xhr.send(form);
  });
}

function attendre(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const abandon = () => {
      clearTimeout(timer);
      reject(new DOMException("Annulé", "AbortError"));
    };
    if (signal?.aborted) abandon();
    else signal?.addEventListener("abort", abandon, { once: true });
  });
}

export async function suivreTravail(id, onEtape, signal) {
  const debut = Date.now();
  for (;;) {
    if (signal?.aborted) throw new DOMException("Annulé", "AbortError");
    const etat = await requete(`/travaux/${id}`);
    if (etat.statut === "en_cours") {
      if (Date.now() - debut > 45 * 60 * 1000) {
        throw new ApiError("Le traitement dure trop longtemps. Réessayez avec un extrait plus court.");
      }
      onEtape?.(etat.etape || "Traitement en cours…");
      await attendre(2000, signal);
      continue;
    }
    if (etat.statut === "erreur") {
      throw new ApiError(etat.message || "Une erreur est survenue.");
    }
    return etat;
  }
}

export async function sante() {
  let reponse;
  try {
    reponse = await fetch(`${baseApi()}/health`, { cache: "no-store" });
  } catch {
    throw new ApiError("Serveur injoignable.");
  }
  if (!reponse.ok) throw new ApiError("Serveur indisponible.", reponse.status);
  return reponse.json();
}

export async function blobMedia(nom) {
  let reponse;
  try {
    const headers = {};
    const token = jeton();
    if (token) headers.Authorization = `Bearer ${token}`;
    reponse = await fetch(`${baseApi()}/media/${encodeURIComponent(nom)}`, { headers, cache: "no-store" });
  } catch {
    throw new ApiError("Impossible de récupérer l’audio.");
  }
  if (reponse.status === 401) {
    onUnauthorized();
    throw new ApiError("Session invalide ou expirée, veuillez vous reconnecter.", 401);
  }
  if (!reponse.ok) throw new ApiError("Audio introuvable.", reponse.status);
  return URL.createObjectURL(await reponse.blob());
}

export const LANGUES_SOURCE = [
  { code: "auto", label: "Détection automatique" },
  { code: "fr", label: "Français" },
  { code: "en", label: "Anglais" },
  { code: "ee", label: "Éwé (expérimental)" },
];

export const LANGUES_CIBLE = [
  "français",
  "anglais",
  "espagnol",
  "allemand",
  "portugais",
  "italien",
  "arabe",
  "lingala",
  "swahili",
  "éwé",
];

export const NOMS_LANGUES = {
  fr: "français",
  en: "anglais",
  es: "espagnol",
  de: "allemand",
  pt: "portugais",
  it: "italien",
  ar: "arabe",
  ln: "lingala",
  sw: "swahili",
  ee: "éwé",
};
