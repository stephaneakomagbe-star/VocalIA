const stats = [
  { value: '48', label: 'quartiers couverts' },
  { value: '320+', label: 'ramasseurs actifs' },
  { value: '99%', label: 'collectes réussies' },
]

export function Coverage() {
  return (
    <section id="zones" className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <div className="grid gap-10 md:grid-cols-2 md:items-center">
        <div className="order-2 md:order-1">
          <div className="overflow-hidden rounded-3xl border border-border shadow-lg">
            <img
              src="/images/coverage.png"
              alt="Vue aérienne d'un quartier propre avec des repères indiquant les ramasseurs disponibles"
              className="h-full w-full object-cover"
            />
          </div>
        </div>

        <div className="order-1 md:order-2">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Zones couvertes
          </p>
          <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
            Un ramasseur toujours proche de chez vous
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            Notre réseau grandit chaque semaine. Vérifiez votre adresse et voyez en un instant les
            ramasseurs disponibles autour de vous.
          </p>

          <dl className="mt-8 grid grid-cols-3 gap-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-border bg-card p-5">
                <dt className="sr-only">{stat.label}</dt>
                <dd className="text-3xl font-extrabold text-primary">{stat.value}</dd>
                <dd className="mt-1 text-sm text-muted-foreground">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}
