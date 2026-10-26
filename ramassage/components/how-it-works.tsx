import { MapPin, UserCheck, Truck } from 'lucide-react'

const steps = [
  {
    icon: MapPin,
    title: 'Indiquez votre adresse',
    description:
      'Saisissez votre localisation et le type de déchets à évacuer : encombrants, ménagers ou verts.',
  },
  {
    icon: UserCheck,
    title: 'Choisissez un ramasseur',
    description:
      'Découvrez les ramasseurs disponibles autour de vous, avec leurs avis et leurs tarifs.',
  },
  {
    icon: Truck,
    title: "C'est ramassé",
    description:
      "Le ramasseur intervient rapidement. Vous suivez la collecte en temps réel jusqu'à la fin.",
  },
]

export function HowItWorks() {
  return (
    <section id="comment" className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">
          Comment ça marche
        </p>
        <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
          Un quartier propre en trois étapes
        </h2>
      </div>

      <ol className="mt-14 grid gap-6 md:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="relative flex flex-col gap-4 rounded-2xl border border-border bg-card p-7"
          >
            <span className="font-mono text-sm font-semibold text-muted-foreground">
              {'0'}
              {index + 1}
            </span>
            <span className="flex size-12 items-center justify-center rounded-xl bg-secondary text-primary">
              <step.icon className="size-6" aria-hidden="true" />
            </span>
            <h3 className="text-lg font-bold">{step.title}</h3>
            <p className="text-pretty leading-relaxed text-muted-foreground">{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
