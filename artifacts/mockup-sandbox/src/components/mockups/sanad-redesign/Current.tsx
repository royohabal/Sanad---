import { useState } from 'react';
import {
  ArrowUpRight, BadgeCheck, Check, ChevronRight, Globe2, Heart, ShieldCheck,
} from 'lucide-react';
import './_group.css';

function LanguageToggle() {
  const [language, setLanguage] = useState<'en' | 'ar'>('en');
  return (
    <button
      data-testid="button-language"
      className="language-toggle"
      onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
      aria-label="Switch language"
    >
      <Globe2 size={15} />
      <span>{language === 'en' ? 'العربية' : 'English'}</span>
    </button>
  );
}

function Brand({ light = false }: { light?: boolean }) {
  return (
    <a href="/" className={`brand ${light ? 'brand-light' : ''}`} data-testid="link-brand">
      <span className="brand-mark">س</span>
      <span>SANAD<span className="brand-dot">.</span></span>
    </a>
  );
}

function Avatar({ name, photo, size = 'md' }: { name: string; photo?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return photo
    ? <img className={`avatar avatar-${size}`} src={photo} alt={name} />
    : <span className={`avatar avatar-${size}`} aria-label={name}>{initials}</span>;
}

function Header() {
  return (
    <header className="site-header">
      <Brand />
      <nav className="public-nav">
        <a href="#how-it-works">How it works</a>
        <a href="#for-business">For business</a>
        <a href="/sign-in">Sign in</a>
      </nav>
      <div className="header-actions">
        <LanguageToggle />
        <a className="header-signup" href="/sign-up">Get started <ArrowUpRight size={15} /></a>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <Brand />
      <span>Made with care in Kuwait.</span>
      <div>
        <a href="/sign-in">Worker sign in</a>
        <a href="/sign-up">For companies</a>
        <span>© SANAD 2025</span>
      </div>
    </footer>
  );
}

function QrGraphic() {
  return (
    <div className="qr-graphic" aria-label="Decorative QR pattern">
      <div className="qr-corner" /><div className="qr-corner" /><div className="qr-corner" />
      {Array.from({ length: 25 }).map((_, i) => (
        <i key={i} className={((i * 7 + 3) % 5 === 0 || (i * 13) % 7 < 2) ? 'qr-dark' : ''} />
      ))}
    </div>
  );
}

export function Current() {
  return (
    <main className="landing">
      <Header />
      <section className="hero-wrap">
        <div className="hero-copy rise">
          <div className="eyebrow"><span className="eyebrow-dot" /> A little appreciation goes a long way</div>
          <h1>A good moment<br />deserves a <em>thank you.</em></h1>
          <p>SANAD makes it simple to show appreciation to the people who make your day better.</p>
          <div className="hero-actions">
            <a href="/tip/ahmed-almutairi" className="cta-primary">Send a thank you <ArrowUpRight size={17} /></a>
            <a href="#how-it-works" className="cta-quiet">See how it works <ChevronRight size={16} /></a>
          </div>
          <div className="trust-note"><ShieldCheck size={16} /><span>Private by design <i /> No account needed to tip</span></div>
        </div>
        <div className="hero-art rise">
          <div className="art-sun" />
          <div className="hero-arch"><img src="/__mockup/images/worker-portrait.png" alt="A SANAD hospitality worker" /></div>
          <div className="floating-note">
            <span className="note-heart"><Heart size={15} fill="currentColor" /></span>
            <div><strong>Thoughtful service</strong><small>deserves to be noticed</small></div>
          </div>
          <div className="hero-caption"><span>Everyday kindness, returned.</span><span>01 — 03</span></div>
          <div className="sadu art-pattern" />
        </div>
        <div className="hero-vertical">A MORE HUMAN WAY TO TIP · KUWAIT</div>
      </section>
      <section className="proof-strip">
        <div><span className="proof-number">01</span><span>Scan a personal QR code</span></div>
        <div><span className="proof-number">02</span><span>Choose what feels right</span></div>
        <div><span className="proof-number">03</span><span>Send thanks in seconds</span></div>
        <div className="proof-last"><ShieldCheck size={18} /><span>Secure, simple, discreet</span></div>
      </section>
      <section id="how-it-works" className="story-section">
        <div className="section-intro">
          <div className="eyebrow">A small gesture, made simple</div>
          <h2>Good service is<br /><em>worth remembering.</em></h2>
          <p>One scan is all it takes to send a little appreciation directly to the person who earned it.</p>
        </div>
        <div className="steps-grid">
          <article className="step-card">
            <span className="step-index">01 / FIND</span>
            <div className="step-visual scan-visual"><QrGraphic /><span className="scan-target" /></div>
            <h3>Scan their code</h3>
            <p>Look for a SANAD QR badge at the counter, on a table, or in a welcome card.</p>
          </article>
          <article className="step-card">
            <span className="step-index">02 / CHOOSE</span>
            <div className="step-visual amount-visual">
              <span className="amount-chip">1.000 KWD</span>
              <span className="amount-chip selected">2.000 KWD</span>
              <span className="amount-chip">Your amount</span>
            </div>
            <h3>Choose an amount</h3>
            <p>Pick a thoughtful amount and add a rating if you’d like. No account required.</p>
          </article>
          <article className="step-card">
            <span className="step-index">03 / SEND</span>
            <div className="step-visual send-visual">
              <div className="send-seal"><Check size={24} /></div>
              <div className="send-lines"><b>Thank you, Ahmed</b><span>Your appreciation is on its way.</span></div>
            </div>
            <h3>That’s your thank you</h3>
            <p>Pay securely and get a clear confirmation. Your tip goes to the person who helped.</p>
          </article>
        </div>
      </section>
      <section className="quote-band">
        <div className="quote-mark">“</div>
        <blockquote>A great experience is never just one thing.<br />It’s the person who made it feel easy.</blockquote>
        <span>THE SANAD PROMISE</span>
      </section>
      <section id="for-business" className="business-section">
        <div className="business-copy">
          <div className="eyebrow">For the people behind the experience</div>
          <h2>Make appreciation<br />part of <em>the culture.</em></h2>
          <p>Give your team a more transparent way to receive tips and your managers a clearer view of what’s happening.</p>
          <ul>
            <li><BadgeCheck />Personal QR badges for every worker</li>
            <li><BadgeCheck />Clear tip and payout records</li>
            <li><BadgeCheck />One calm place for your team to manage it all</li>
          </ul>
          <a href="/sign-up" className="business-link">Bring SANAD to your team <ArrowUpRight size={16} /></a>
        </div>
        <div className="business-panel">
          <div className="panel-topline"><span>YOUR TEAM, IN GOOD HANDS</span><span className="panel-dot" /></div>
          <div className="business-stat">
            <span>This month</span><strong>KWD 1,284.750</strong>
            <small><ArrowUpRight size={14} /> 12.4% from last month</small>
          </div>
          <div className="mini-bars">
            {[28, 42, 34, 56, 38, 67, 51, 74, 61, 89, 69, 96].map((n, i) => (
              <span key={i} style={{ height: `${n}%` }} className={i === 11 ? 'bar-highlight' : ''} />
            ))}
          </div>
          <div className="business-people">
            <div className="people-stack"><Avatar name="Rana" size="sm" /><Avatar name="Sami" size="sm" /><Avatar name="Noor" size="sm" /></div>
            <span>12 team members earning recognition</span><ChevronRight size={15} />
          </div>
          <div className="sadu panel-pattern" />
        </div>
      </section>
      <section className="last-call">
        <div className="last-orbit" />
        <div className="eyebrow">A thank you takes a moment</div>
        <h2>Make someone’s<br /><em>day a little brighter.</em></h2>
        <a href="/tip/ahmed-almutairi" className="cta-primary">Send a thank you <ArrowUpRight size={17} /></a>
        <span>No sign-up. No awkward moment. Just appreciation.</span>
      </section>
      <Footer />
    </main>
  );
}
