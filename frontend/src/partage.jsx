import { Copy, FileDown, MessageCircle, Share2 } from "lucide-react";

export function titreLocal(texte) {
  const extrait = String(texte || "").replace(/\s+/g, " ").trim();
  if (!extrait) {
    return `Notes du ${new Date().toLocaleDateString("fr-FR")}`;
  }
  const premiere = extrait.split(/[.!?\n]/)[0].trim();
  const mots = premiere.split(/\s+/).slice(0, 8);
  return mots.join(" ") || `Notes du ${new Date().toLocaleDateString("fr-FR")}`;
}

export function nomFichier(titre) {
  const slug = String(titre || "vocalia")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50);
  return `${slug || "vocalia"}.txt`;
}

function echapper(valeur) {
  return String(valeur || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paquet(titre, texte) {
  const nom = (titre || "").trim() || "Vocalia";
  const corps = String(texte || "").trim();
  return { nom, corps, plein: corps ? `${nom}\n\n${corps}` : nom };
}

export async function copierTexte(titre, texte) {
  const { plein } = paquet(titre, texte);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(plein);
    return;
  }
  const zone = document.createElement("textarea");
  zone.value = plein;
  document.body.appendChild(zone);
  zone.select();
  document.execCommand("copy");
  zone.remove();
}

export function partagerWhatsApp(titre, texte) {
  const { plein } = paquet(titre, texte);
  const message = plein.length > 3500 ? `${plein.slice(0, 3490)}…` : plein;
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
}

export function exporterPdf(titre, texte) {
  const { nom, corps } = paquet(titre, texte);
  const fenetre = window.open("", "_blank");
  if (!fenetre) return;
  fenetre.document.write(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${echapper(nom)}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; max-width: 720px; margin: 48px auto; padding: 0 28px 64px; color: #111; }
  h1 { font-size: 28px; font-weight: 500; letter-spacing: -0.03em; margin: 0 0 8px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 28px; font-family: system-ui, sans-serif; }
  pre { white-space: pre-wrap; word-break: break-word; font: 16px/1.65 Georgia, serif; margin: 0; }
</style></head>
<body>
  <h1>${echapper(nom)}</h1>
  <p class="meta">Vocalia · ${echapper(new Date().toLocaleString("fr-FR"))}</p>
  <pre>${echapper(corps)}</pre>
</body></html>`);
  fenetre.document.close();
  fenetre.focus();
  setTimeout(() => fenetre.print(), 250);
}

export async function partagerNatif(titre, texte) {
  const { nom, plein } = paquet(titre, texte);
  if (!navigator.share) return false;
  await navigator.share({ title: nom, text: plein });
  return true;
}

export function BoutonsPartage({ titre, texte, className = "" }) {
  const pret = Boolean(String(texte || "").trim());

  async function essayerPartage() {
    try {
      const ok = await partagerNatif(titre, texte);
      if (!ok) partagerWhatsApp(titre, texte);
    } catch {
      partagerWhatsApp(titre, texte);
    }
  }

  return (
    <div className={`share-row ${className}`.trim()}>
      {typeof navigator !== "undefined" && navigator.share && (
        <button className="btn small ghost" type="button" disabled={!pret} onClick={essayerPartage}>
          <Share2 size={14} /> Partager
        </button>
      )}
      <button className="btn small ghost" type="button" disabled={!pret} onClick={() => copierTexte(titre, texte)}>
        <Copy size={14} /> Copier
      </button>
      <button className="btn small ghost" type="button" disabled={!pret} onClick={() => partagerWhatsApp(titre, texte)}>
        <MessageCircle size={14} /> WhatsApp
      </button>
      <button className="btn small ghost" type="button" disabled={!pret} onClick={() => exporterPdf(titre, texte)}>
        <FileDown size={14} /> PDF
      </button>
    </div>
  );
}
