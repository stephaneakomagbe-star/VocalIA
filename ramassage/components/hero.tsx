import { MapPin, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-2 md:py-24">
        <div className="flex flex-col items-start gap-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">
            <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
            Service disponible dans votre quartier
          </span>

          <h1 className="text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            Plus d&apos;ordures qui traînent
          </h1>

          <p className="max-w-md text-pretty text-lg leading-relaxed text-muted-foreground">
            Ne laissez plus les déchets gâcher votre quotidien. En un clic, trouvez un ramasseur
            proche de chez vous et retrouvez un espace propre.
          </p>

          <form
            id="demande"
            action="/app"
            method="get"
            className="flex w-full max-w-md flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm sm:flex-row"
          >
            <label htmlFor="adresse" className="sr-only">
              Votre adresse
            </label>
            <div className="flex flex-1 items-center gap-2 rounded-xl bg-secondary px-3">
              <MapPin className="size-5 shrink-0 text-primary" aria-hidden="true" />
              <input
                id="adresse"
                name="adresse"
                type="text"
                placeholder="Entrez votre adresse"
                className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Button type="submit" className="rounded-xl px-6 font-semibold">
              Trouver un ramasseur
            </Button>
          </form>

          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="flex text-primary" aria-hidden="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="size-4 fill-current" />
              ))}
            </div>
            <span>Noté 4,9/5 par plus de 12 000 foyers</span>
          </div>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-3xl border border-border shadow-xl">
            <img
              src="/images/hero-collector.png"
              alt="Un ramasseur en uniforme vert collecte des sacs de déchets dans une rue résidentielle propre"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="absolute -bottom-5 -left-5 hidden rounded-2xl border border-border bg-card p-4 shadow-lg sm:block">
            <p className="text-2xl font-extrabold text-primary">~25 min</p>
            <p className="text-sm text-muted-foreground">Délai moyen d&apos;intervention</p>
          </div>
        </div>
      </div>
    </section>
  )
}
