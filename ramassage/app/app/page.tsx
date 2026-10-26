import Link from 'next/link'
import { Trash2 } from 'lucide-react'
import { PickupApp } from '@/components/app/pickup-app'

export const metadata = {
  title: 'Demander un ramassage | Ramassage',
  description: 'Trouvez un ramasseur près de chez vous et planifiez un enlèvement de déchets en quelques clics.',
}

export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ adresse?: string }>
}) {
  const { adresse } = await searchParams
  const initialAddress = typeof adresse === 'string' ? adresse.trim() : ''
  return (
    <main className="min-h-dvh bg-background">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Trash2 className="size-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-extrabold tracking-tight">Ramassage</span>
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Retour au site
          </Link>
        </div>
      </header>
      <PickupApp initialAddress={initialAddress} />
    </main>
  )
}
