import { Clock, Leaf, ShieldCheck, Wallet } from 'lucide-react'

const benefits = [
  {
    icon: Clock,
    title: 'Intervention rapide',
    description: 'Un ramasseur disponible en moins de 30 minutes en moyenne dans votre zone.',
  },
  {
    icon: Leaf,
    title: 'Tri responsable',
    description: 'Vos déchets sont acheminés vers les bons centres de tri et de recyclage.',
  },
  {
    icon: Wallet,
    title: 'Tarifs transparents',
    description: 'Le prix est affiché avant de confirmer. Aucun frais caché, jamais de surprise.',
  },
  {
    icon: ShieldCheck,
    title: 'Ramasseurs vérifiés',
    description: 'Chaque ramasseur est identifié, noté et couvert pour votre tranquillité.',
  },
]

export function Benefits() {
  return (
    <section id="avantages" className="bg-secondary/50">
      <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <div className="grid gap-12 md:grid-cols-[1fr_1.4fr] md:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              Pourquoi Ramassage
            </p>
            <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
              La propreté, sans effort et sans attente
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
              On s&apos;occupe de tout, du premier clic jusqu&apos;au dernier sac. Vous gardez un
              espace sain, on garde la ville propre.
            </p>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <li
                key={benefit.title}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <benefit.icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="font-bold">{benefit.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {benefit.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
