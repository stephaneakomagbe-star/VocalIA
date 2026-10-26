'use client'

import { useState } from 'react'
import {
  MapPin,
  Star,
  Clock,
  Trash2,
  Leaf,
  Package,
  Recycle,
  Sofa,
  Check,
  ArrowLeft,
  CircleCheck,
  LocateFixed,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Step = 'adresse' | 'ramasseurs' | 'details' | 'confirmation'

type Collector = {
  id: string
  name: string
  rating: number
  reviews: number
  distanceKm: number
  etaMin: number
  price: number
  vehicle: string
}

const collectors: Collector[] = [
  {
    id: 'c1',
    name: 'Karim B.',
    rating: 4.9,
    reviews: 342,
    distanceKm: 0.8,
    etaMin: 18,
    price: 12,
    vehicle: 'Camionnette électrique',
  },
  {
    id: 'c2',
    name: 'Sophie M.',
    rating: 4.8,
    reviews: 217,
    distanceKm: 1.4,
    etaMin: 24,
    price: 10,
    vehicle: 'Utilitaire compact',
  },
  {
    id: 'c3',
    name: 'Éco-Collect Pro',
    rating: 4.7,
    reviews: 1203,
    distanceKm: 2.1,
    etaMin: 31,
    price: 9,
    vehicle: 'Benne de tri',
  },
]

const wasteTypes = [
  { id: 'menager', label: 'Déchets ménagers', icon: Trash2 },
  { id: 'tri', label: 'Recyclables', icon: Recycle },
  { id: 'vert', label: 'Déchets verts', icon: Leaf },
  { id: 'encombrant', label: 'Encombrants', icon: Sofa },
  { id: 'carton', label: 'Cartons / colis', icon: Package },
]

const steps: { id: Step; label: string }[] = [
  { id: 'adresse', label: 'Adresse' },
  { id: 'ramasseurs', label: 'Ramasseur' },
  { id: 'details', label: 'Détails' },
  { id: 'confirmation', label: 'Confirmation' },
]

export function PickupApp({ initialAddress = '' }: { initialAddress?: string }) {
  const [step, setStep] = useState<Step>(initialAddress ? 'ramasseurs' : 'adresse')
  const [address, setAddress] = useState(initialAddress)
  const [selectedCollector, setSelectedCollector] = useState<Collector | null>(null)
  const [selectedWaste, setSelectedWaste] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState('')

  const stepIndex = steps.findIndex((s) => s.id === step)

  function handleLocate() {
    setGeoError('')
    if (!('geolocation' in navigator)) {
      setGeoError("La géolocalisation n'est pas prise en charge par votre navigateur.")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
            { headers: { 'Accept-Language': 'fr' } },
          )
          if (!res.ok) throw new Error('reverse geocoding failed')
          const data = await res.json()
          setAddress(
            data.display_name ??
              `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
          )
        } catch {
          setAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`)
        } finally {
          setLocating(false)
        }
      },
      (error) => {
        setLocating(false)
        setGeoError(
          error.code === error.PERMISSION_DENIED
            ? "Accès à la position refusé. Autorisez la localisation ou saisissez votre adresse."
            : "Impossible de récupérer votre position. Réessayez ou saisissez votre adresse.",
        )
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  function toggleWaste(id: string) {
    setSelectedWaste((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id],
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10">
      {/* Stepper */}
      <ol className="mb-10 flex items-center gap-2" aria-label="Progression">
        {steps.map((s, i) => {
          const done = i < stepIndex
          const active = i === stepIndex
          return (
            <li key={s.id} className="flex flex-1 items-center gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                    done && 'bg-primary text-primary-foreground',
                    active && 'bg-primary text-primary-foreground ring-4 ring-primary/20',
                    !done && !active && 'bg-secondary text-muted-foreground',
                  )}
                  aria-current={active ? 'step' : undefined}
                >
                  {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
                </span>
                <span
                  className={cn(
                    'hidden text-sm font-medium sm:inline',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <span
                  className={cn(
                    'h-px flex-1 transition-colors',
                    i < stepIndex ? 'bg-primary' : 'bg-border',
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          )
        })}
      </ol>

      {/* Step: adresse */}
      {step === 'adresse' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight">Où faut-il intervenir ?</h1>
            <p className="text-muted-foreground">
              Indiquez l&apos;adresse où les déchets doivent être récupérés.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (address.trim()) setStep('ramasseurs')
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 shadow-sm">
              <MapPin className="size-5 shrink-0 text-primary" aria-hidden="true" />
              <label htmlFor="address" className="sr-only">
                Adresse
              </label>
              <input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="12 rue des Lilas, 75011 Paris"
                className="w-full bg-transparent py-4 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <button
              type="button"
              onClick={handleLocate}
              disabled={locating}
              className="inline-flex items-center justify-center gap-2 self-start rounded-lg px-1 text-sm font-semibold text-primary transition-colors hover:text-primary/80 disabled:opacity-60"
            >
              {locating ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <LocateFixed className="size-4" aria-hidden="true" />
              )}
              {locating ? 'Localisation en cours…' : 'Me localiser'}
            </button>
            {geoError && (
              <p role="alert" className="text-sm text-destructive">
                {geoError}
              </p>
            )}
            <Button type="submit" size="lg" className="rounded-xl font-semibold" disabled={!address.trim()}>
              Voir les ramasseurs disponibles
            </Button>
          </form>
        </div>
      )}

      {/* Step: ramasseurs */}
      {step === 'ramasseurs' && (
        <div className="flex flex-col gap-6">
          <button
            onClick={() => setStep('adresse')}
            className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Modifier l&apos;adresse
          </button>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-extrabold tracking-tight">Ramasseurs près de vous</h1>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-4 text-primary" aria-hidden="true" />
              {address}
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {collectors.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => {
                    setSelectedCollector(c)
                    setStep('details')
                  }}
                  className="flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:border-primary hover:shadow-md"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-lg font-bold text-primary">
                    {c.name.charAt(0)}
                  </span>
                  <div className="flex flex-1 flex-col gap-1">
                    <span className="font-semibold">{c.name}</span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1 text-foreground">
                        <Star className="size-4 fill-primary text-primary" aria-hidden="true" />
                        {c.rating.toFixed(1)}
                        <span className="text-muted-foreground">({c.reviews})</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-4" aria-hidden="true" /> {c.distanceKm} km
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-4" aria-hidden="true" /> {c.etaMin} min
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">{c.vehicle}</span>
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="block text-lg font-extrabold text-primary">{c.price} €</span>
                    <span className="text-xs text-muted-foreground">à partir de</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Step: details */}
      {step === 'details' && selectedCollector && (
        <div className="flex flex-col gap-6">
          <button
            onClick={() => setStep('ramasseurs')}
            className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Changer de ramasseur
          </button>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-extrabold tracking-tight">Quels déchets ?</h1>
            <p className="text-muted-foreground">
              Sélectionnez les types de déchets à faire enlever par {selectedCollector.name}.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {wasteTypes.map((w) => {
              const Icon = w.icon
              const active = selectedWaste.includes(w.id)
              return (
                <button
                  key={w.id}
                  onClick={() => toggleWaste(w.id)}
                  aria-pressed={active}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-2xl border p-4 text-center text-sm font-medium transition-all',
                    active
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/50',
                  )}
                >
                  <Icon className={cn('size-6', active ? 'text-primary' : '')} aria-hidden="true" />
                  {w.label}
                </button>
              )
            })}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="note" className="text-sm font-medium">
              Note pour le ramasseur (facultatif)
            </label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Ex : les sacs sont devant le portail vert."
              className="rounded-xl border border-border bg-card p-3 text-sm outline-none ring-primary/20 placeholder:text-muted-foreground focus:ring-4"
            />
          </div>

          <Button
            size="lg"
            className="rounded-xl font-semibold"
            disabled={selectedWaste.length === 0}
            onClick={() => setStep('confirmation')}
          >
            Confirmer la demande
          </Button>
        </div>
      )}

      {/* Step: confirmation */}
      {step === 'confirmation' && selectedCollector && (
        <div className="flex flex-col items-center gap-6 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary">
            <CircleCheck className="size-9" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight">Demande confirmée !</h1>
            <p className="max-w-md text-muted-foreground">
              {selectedCollector.name} arrive dans environ{' '}
              <span className="font-semibold text-foreground">{selectedCollector.etaMin} minutes</span>{' '}
              à l&apos;adresse indiquée.
            </p>
          </div>

          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-left shadow-sm">
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Ramasseur</dt>
                <dd className="font-medium">{selectedCollector.name}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Adresse</dt>
                <dd className="font-medium">{address}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Déchets</dt>
                <dd className="text-right font-medium">
                  {selectedWaste
                    .map((id) => wasteTypes.find((w) => w.id === id)?.label)
                    .join(', ')}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
                <dt className="font-semibold">Total estimé</dt>
                <dd className="text-lg font-extrabold text-primary">{selectedCollector.price} €</dd>
              </div>
            </dl>
          </div>

          <Button
            variant="outline"
            className="rounded-xl font-semibold"
            onClick={() => {
              setStep('adresse')
              setAddress('')
              setSelectedCollector(null)
              setSelectedWaste([])
              setNote('')
            }}
          >
            Nouvelle demande
          </Button>
        </div>
      )}
    </div>
  )
}
