import { useState, type ReactNode } from "react";
import "./sanadlandingrefined.css";

function Icon({ name, size = 18 }: { name: "arrow" | "shield" | "heart" | "check" | "globe" | "menu" | "close" | "spark" | "chevron" | "scan" | "wallet" | "people"; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<string, ReactNode> = {
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1 2.5 2.5 1-2.5 1L19 21l-1-2.5-2.5-1 2.5-1L19 14Z" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M7 12h10M12 7v10" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="3" /><path d="M3 9h18M16 14h2" /></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function Mark() {
  return <a href="#top" className="sanad-mark" aria-label="SANAD home">
    <span className="sanad-mark-seal" lang="ar">س</span><span className="sanad-mark-word">SANAD<span>.</span></span>
  </a>;
}

export default function SANADLandingRefined() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [arabic, setArabic] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  return (
    <main className={`sanad-refined ${arabic ? "is-arabic" : ""}`} id="top" dir={arabic ? "rtl" : "ltr"}>
      <header className="sr-header">
        <Mark />
        <nav className={`sr-nav ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
          <a href="#how-it-works" onClick={closeMenu}>{arabic ? "كيف يعمل" : "How it works"}</a>
          <a href="#for-business" onClick={closeMenu}>{arabic ? "للشركات" : "For business"}</a>
          <a href="#footer" onClick={closeMenu}>{arabic ? "دخول الموظفين" : "Worker sign in"}</a>
        </nav>
        <div className="sr-head-actions">
          <button className="sr-language" onClick={() => setArabic((value) => !value)} aria-label="Switch language">
            <Icon name="globe" size={15} /><span>{arabic ? "English" : "العربية"}</span>
          </button>
          <a className="sr-small-cta" href="#for-business">{arabic ? "ابدأ الآن" : "Get started"}<Icon name="arrow" size={15} /></a>
          <button className="sr-menu-toggle" onClick={() => setMenuOpen((value) => !value)} aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen}>
            <Icon name={menuOpen ? "close" : "menu"} size={20} />
          </button>
        </div>
      </header>

      <section className="sr-hero">
        <div className="sr-hero-copy">
          <div className="sr-kicker"><span className="sr-kicker-dot" />{arabic ? "لفتة تقدير، أثرها كبير" : "A little appreciation goes a long way"}</div>
          <h1>{arabic ? <>شكراً،<br /><em>بطريقة أسهل.</em></> : <>A good moment<br />deserves a<br /><em>thank you.</em></>}</h1>
          <p>{arabic ? "طريقة بسيطة وآمنة لتقدير الأشخاص الذين يجعلون يومك أفضل." : "A simple, thoughtful way to thank the people who make your day better."}</p>
          <div className="sr-hero-actions">
            <a href="#how-it-works" className="sr-button">{arabic ? "أرسل شكراً" : "Send a thank you"}<Icon name="arrow" size={17} /></a>
            <a href="#how-it-works" className="sr-text-link">{arabic ? "اكتشف كيف يعمل" : "See how it works"}<Icon name="chevron" size={15} /></a>
          </div>
          <div className="sr-privacy"><Icon name="shield" size={16} /><span>{arabic ? "خصوصيتك أولاً" : "Private by design"}<i />{arabic ? "لا تحتاج إلى حساب" : "No account needed"}</span></div>
        </div>

        <div className="sr-hero-art" aria-label="A SANAD hospitality worker">
          <div className="sr-sun-disc" />
          <div className="sr-image-frame"><img src="/__mockup/images/sanad-landing-refined-portrait.png" alt="A welcoming hospitality professional in Kuwait" /></div>
          <div className="sr-photo-index"><span>KUWAIT · EVERYDAY KINDNESS</span><span>01 / 03</span></div>
          <div className="sr-appreciation-note"><span className="sr-heart-tile"><Icon name="heart" size={17} /></span><span><strong>Thoughtful service</strong><small>deserves to be noticed</small></span></div>
          <div className="sr-side-stamp">A MORE HUMAN WAY TO TIP</div>
          <div className="sr-sadu-mark" aria-hidden="true"><i /><i /><i /><i /></div>
        </div>
      </section>

      <section className="sr-assurance" aria-label="How SANAD works">
        <div className="sr-assurance-intro"><span>THE SIMPLE PART</span><b>Three small steps.</b></div>
        <div><span className="sr-assurance-number">01</span><span>Scan their personal code</span></div>
        <div><span className="sr-assurance-number">02</span><span>Choose what feels right</span></div>
        <div><span className="sr-assurance-number">03</span><span>Send thanks in seconds</span></div>
        <div className="sr-assurance-last"><Icon name="shield" size={17} /><span>Secure, simple, discreet</span></div>
      </section>

      <section className="sr-how" id="how-it-works">
        <div className="sr-section-heading">
          <div><div className="sr-kicker"><span className="sr-kicker-dot" />A small gesture, made simple</div><h2>Good service is<br /><em>worth remembering.</em></h2></div>
          <p>One scan sends a little appreciation directly to the person who earned it. No awkward moment, no account to create.</p>
        </div>
        <div className="sr-steps">
          <article className="sr-step">
            <div className="sr-step-meta"><span>01 / FIND</span><Icon name="scan" size={17} /></div>
            <div className="sr-step-visual sr-qr-visual">
              <div className="sr-qr-card"><div className="sr-qr-grid">{Array.from({ length: 49 }, (_, i) => <i key={i} className={((i * 11 + 5) % 7 < 3 || i % 13 === 0) ? "is-filled" : ""} />)}</div><span className="sr-qr-corner sr-corner-one" /><span className="sr-qr-corner sr-corner-two" /><span className="sr-qr-corner sr-corner-three" /></div>
              <div className="sr-scan-line" />
              <span className="sr-art-caption">YOUR PERSONAL SANAD CODE</span>
            </div>
            <h3>Scan their code</h3><p>Find a SANAD badge at the counter, on a table, or tucked into a welcome card.</p>
          </article>
          <article className="sr-step">
            <div className="sr-step-meta"><span>02 / CHOOSE</span><Icon name="wallet" size={17} /></div>
            <div className="sr-step-visual sr-amount-visual">
              <span className="sr-amount-chip">KWD 1.000</span><span className="sr-amount-chip is-selected">KWD 2.000 <b>SELECTED</b></span><span className="sr-amount-chip">Choose an amount</span>
              <span className="sr-art-caption">ALWAYS YOUR CHOICE</span>
            </div>
            <h3>Choose what feels right</h3><p>Pick an amount that feels thoughtful. Add a rating if you like — it’s entirely optional.</p>
          </article>
          <article className="sr-step">
            <div className="sr-step-meta"><span>03 / SEND</span><Icon name="heart" size={17} /></div>
            <div className="sr-step-visual sr-thanks-visual">
              <div className="sr-thanks-slip"><span className="sr-confirm-icon"><Icon name="check" size={19} /></span><span><b>Thank you, Ahmed</b><small>Your appreciation is on its way.</small></span><Icon name="heart" size={15} /></div>
              <span className="sr-art-caption">A MOMENT THAT MATTERS</span>
            </div>
            <h3>That’s your thank you</h3><p>Pay securely and get a clear confirmation. Your tip goes to the person who helped.</p>
          </article>
        </div>
      </section>

      <section className="sr-quote">
        <div className="sr-quote-orbit sr-orbit-one" /><div className="sr-quote-orbit sr-orbit-two" />
        <span className="sr-quote-mark">“</span>
        <blockquote>A great experience is never just one thing.<br /><em>It’s the person who made it feel easy.</em></blockquote>
        <span className="sr-quote-byline">THE SANAD PROMISE <i /> MADE WITH CARE IN KUWAIT</span>
      </section>

      <section className="sr-business" id="for-business">
        <div className="sr-business-copy">
          <div className="sr-kicker"><span className="sr-kicker-dot" />For the people behind the experience</div>
          <h2>Make appreciation<br />part of <em>the culture.</em></h2>
          <p>Give your team a more transparent way to receive tips — and your managers a clearer view of what’s happening.</p>
          <ul><li><span><Icon name="check" size={14} /></span>Personal QR badges for every worker</li><li><span><Icon name="check" size={14} /></span>Clear tip and payout records</li><li><span><Icon name="check" size={14} /></span>One calm place to manage it all</li></ul>
          <a href="#footer" className="sr-business-link">Bring SANAD to your team<Icon name="arrow" size={16} /></a>
        </div>
        <div className="sr-team-card">
          <div className="sr-team-card-top"><span>YOUR TEAM, IN GOOD HANDS</span><i><b /></i></div>
          <span className="sr-card-label">Tips received this month</span>
          <div className="sr-team-total"><strong>KWD 1,284.750</strong><span><Icon name="arrow" size={13} /> 12.4% <small>from last month</small></span></div>
          <div className="sr-chart" aria-label="Team tip activity across twelve months">
            {[27, 38, 31, 47, 37, 58, 45, 70, 57, 78, 66, 94].map((height, index) => <div className="sr-chart-col" key={index}><i style={{ height: `${height}%` }} className={index === 11 ? "is-current" : ""} /><span>{["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"][index]}</span></div>)}
          </div>
          <div className="sr-team-foot"><span className="sr-avatar-stack"><i>RA</i><i>SA</i><i>NO</i></span><span>12 team members earning recognition</span><Icon name="chevron" size={16} /></div>
          <div className="sr-card-watermark" aria-hidden="true">س</div>
        </div>
      </section>

      <section className="sr-final-call">
        <div className="sr-final-rings" />
        <div className="sr-kicker"><span className="sr-kicker-dot" />A thank you takes a moment</div>
        <h2>Make someone’s day<br /><em>a little brighter.</em></h2>
        <a href="#how-it-works" className="sr-button">Send a thank you<Icon name="arrow" size={17} /></a>
        <span>No sign-up. No awkward moment. Just appreciation.</span>
      </section>

      <footer className="sr-footer" id="footer">
        <Mark /><span>Made with care in Kuwait.</span>
        <div><a href="#footer">Worker sign in</a><a href="#for-business">For companies</a><span>© SANAD 2025</span></div>
      </footer>
    </main>
  );
}
