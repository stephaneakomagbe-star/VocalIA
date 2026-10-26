import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

const links = [
  { label: 'Comment ça marche', href: '#comment' },
  { label: 'Avantages', href: '#avantages' },
  { label: 'Zones couvertes', href: '#zones' },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <a href="#" className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Trash2 className="size-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-extrabold tracking-tight">Ramassage</span>
        </a>

        <nav aria-label="Navigation principale" className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <a href="#">Se connecter</a>
          </Button>
          <Button asChild className="rounded-full font-semibold">
            <a href="/app">Demander un ramassage</a>
          </Button>
        </div>
      </div>
    </header>
  )
}
