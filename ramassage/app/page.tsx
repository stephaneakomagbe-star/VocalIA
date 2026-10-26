import { SiteHeader } from '@/components/site-header'
import { Hero } from '@/components/hero'
import { HowItWorks } from '@/components/how-it-works'
import { Benefits } from '@/components/benefits'
import { Coverage } from '@/components/coverage'
import { CtaFooter } from '@/components/cta-footer'

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <HowItWorks />
        <Benefits />
        <Coverage />
        <CtaFooter />
      </main>
    </>
  )
}
