import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CtaFooter() {
  return (
    <footer>
      <section className="mx-auto max-w-6xl px-5 py-16 md:py-20">
        <div className="flex flex-col items-center gap-6 rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground">
          <h2 className="text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
            Prêt à dire adieu aux ordures ?
          </h2>
          <p className="max-w-md text-pretty leading-relaxed text-primary-foreground/85">
            Trouvez un ramasseur proche de chez vous en un clic et retrouvez un quotidien plus
            propre dès aujourd&apos;hui.
          </p>
          <Button
            asChild
            variant="secondary"
            className="rounded-full px-8 py-6 text-base font-semibold"
          >
            <a href="#demande">Demander un ramassage</a>
          </Button>
        </div>
      </section>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Trash2 className="size-4" aria-hidden="true" />
            </span>
            <span className="font-extrabold tracking-tight">Ramassage</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Ramassage. Tous droits réservés.
          </p>
          <nav aria-label="Liens du pied de page" className="flex gap-6 text-sm text-muted-foreground">
            <a href="#" className="transition-colors hover:text-foreground">
              Confidentialité
            </a>
            <a href="#" className="transition-colors hover:text-foreground">
              Contact
            </a>
          </nav>
        </div>
      </div>
    </footer>
  )
}
