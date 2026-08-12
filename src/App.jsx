import React, { useEffect, useRef, useState } from 'react';
import { trackEvent } from './analytics';
import { openLiveChat, scheduleLiveChat } from './liveChat';
import { GUIDES, GuidePage } from './guides';
import { EstimatorPage } from './estimator';
import {
  CONTACT_EMAIL,
  PAGE_META,
  PHONE_DISPLAY,
  PHONE_HREF,
  SITE_URL,
  canonicalForRoute,
  getStructuredData,
  normalizePathname,
} from './seo';
import backgroundImage from './assets/backgroundImage.jpeg';

const CONSENT_VERSION = '2026-08-09';

const currentPath = () => typeof window === 'undefined' ? '/' : normalizePathname(window.location.pathname);

function upsertJsonLd(id, data) {
  let script = document.getElementById(id);
  if (!data) {
    script?.remove();
    return;
  }
  if (!script) {
    script = document.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

function usePageMeta(path) {
  useEffect(() => {
    const meta = PAGE_META[path];
    const canonicalUrl = canonicalForRoute(path);
    const schemas = getStructuredData(path);
    document.title = meta.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description);
    document.querySelector('meta[name="robots"]')?.setAttribute('content', meta.robots);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', meta.title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', meta.description);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', canonicalUrl || `${SITE_URL}${window.location.pathname}`);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', meta.title);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', meta.description);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (canonicalUrl) {
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.appendChild(canonical);
      }
      canonical.href = canonicalUrl;
    } else {
      canonical?.remove();
    }

    upsertJsonLd('nexora-page-schema', schemas.page);
    upsertJsonLd('nexora-breadcrumb-schema', schemas.breadcrumbs);
    trackEvent('page_view', { page_location: canonicalUrl || window.location.href, page_title: meta.title });
    const titleElement = document.querySelector('title');
    const titleObserver = new MutationObserver(() => {
      if (document.title !== meta.title) document.title = meta.title;
    });
    if (titleElement) titleObserver.observe(titleElement, { childList: true, characterData: true, subtree: true });
    return () => titleObserver.disconnect();
  }, [path]);
}

function InternalLink({ to, children, ...props }) {
  const handleClick = (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const [, hash = ''] = to.split('#');
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.setTimeout(() => {
      if (hash) document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 0);
  };
  return <a href={to} onClick={handleClick} {...props}>{children}</a>;
}

function LiveChatLink({ children = 'Live chat', className = '' }) {
  const handleClick = async (event) => {
    event.preventDefault();
    try {
      await openLiveChat();
    } catch {
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=Website%20support%20request`;
    }
  };

  return <a href={`mailto:${CONTACT_EMAIL}?subject=Website%20support%20request`} onClick={handleClick} className={className}>{children}</a>;
}

function ChatFallbackLauncher() {
  const [showFallback, setShowFallback] = useState(false);
  const [chatBlocked, setChatBlocked] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    const cleanupSchedule = scheduleLiveChat();
    const markReady = () => setShowFallback(false);
    window.addEventListener('nexora:tawk-ready', markReady);
    const timer = window.setTimeout(() => {
      if (!window.__NEXORA_TAWK_READY__) setShowFallback(true);
    }, 4500);
    return () => {
      cleanupSchedule();
      window.removeEventListener('nexora:tawk-ready', markReady);
      window.clearTimeout(timer);
    };
  }, []);

  if (!showFallback) return null;

  const handleOpen = async () => {
    setOpening(true);
    try {
      await openLiveChat();
      setShowFallback(false);
    } catch {
      setChatBlocked(true);
    } finally {
      setOpening(false);
    }
  };

  return (
    <aside className="fixed bottom-4 right-4 z-[60] max-w-[calc(100vw-2rem)]" aria-label="Customer support">
      {chatBlocked && (
        <div className="mb-3 w-72 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-200 shadow-2xl">
          <p className="font-semibold text-white">Chat is blocked in this browser.</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">You can still reach our support team by email.</p>
          <a className="mt-3 inline-block break-all font-semibold text-cyan-300 underline" href={`mailto:${CONTACT_EMAIL}?subject=Website%20support%20request`}>{CONTACT_EMAIL}</a>
        </div>
      )}
      <button type="button" onClick={handleOpen} disabled={opening} className="ml-auto flex items-center gap-2 rounded-full bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 shadow-xl transition hover:bg-cyan-300 disabled:opacity-70">
        <span aria-hidden="true">●</span>{opening ? 'Opening chat…' : 'Live chat'}
      </button>
    </aside>
  );
}

function Layout({ children, path }) {
  const homeHref = path === '/' ? '#top' : '/';
  return (
    <div id="top" className="min-h-screen text-slate-100 flex flex-col bg-slate-950 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur sticky top-0 z-50">
        <nav aria-label="Main navigation" className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-5">
          <InternalLink to={homeHref} className="text-lg md:text-xl font-black tracking-wider text-cyan-400">NEXORA GLOBAL</InternalLink>
          <div className="hidden md:flex items-center gap-6 text-sm text-slate-300">
            <InternalLink className="hover:text-cyan-300" to="/how-it-works">How it works</InternalLink>
            <InternalLink className="hover:text-cyan-300" to="/about">About</InternalLink>
            <InternalLink className="hover:text-cyan-300" to="/contact">Contact</InternalLink>
            <LiveChatLink className="hover:text-cyan-300" />
          </div>
          <InternalLink to={path === '/' ? '#solar-check' : '/#solar-check'} className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition">Check my property</InternalLink>
        </nav>
      </header>
      {children}
      <footer className="bg-slate-950 border-t border-slate-800 mt-auto py-10 text-slate-400 text-xs">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h2 className="text-slate-100 font-bold text-sm mb-3">NEXORA GLOBAL</h2>
            <p className="leading-relaxed">A solar inquiry and matching service for US property owners. Nexora Global is not a solar installer, lender, utility, or government agency.</p>
          </div>
          <div>
            <h2 className="text-slate-100 font-bold text-sm mb-3">Contact</h2>
            <p className="mb-2"><a href={`tel:${PHONE_HREF}`} className="hover:text-cyan-300">{PHONE_DISPLAY}</a></p>
            <p><a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-cyan-300 break-all">{CONTACT_EMAIL}</a></p>
          </div>
          <div>
            <h2 className="text-slate-100 font-bold text-sm mb-3">Information</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-2 mb-4">
              <InternalLink to="/about" className="hover:text-cyan-300">About</InternalLink>
              <InternalLink to="/how-it-works" className="hover:text-cyan-300">How it works</InternalLink>
              <InternalLink to="/contact" className="hover:text-cyan-300">Contact</InternalLink>
              <InternalLink to="/privacy" className="hover:text-cyan-300">Privacy</InternalLink>
              <InternalLink to="/terms" className="hover:text-cyan-300">Terms</InternalLink>
              <LiveChatLink className="hover:text-cyan-300" />
            </div>
            <p>© 2026 Nexora Global. All rights reserved.</p>
          </div>
        </div>
      </footer>
      <ChatFallbackLauncher />
    </div>
  );
}

const initialForm = {
  name: '', number: '', email: '', address: '', zipCode: '', propertyType: '',
  ownership: '', timeline: '', financingInterest: '', description: '', consent: false, website: '',
};

function HomePage() {
  const [step, setStep] = useState(1);
  const [billRange, setBillRange] = useState('');
  const [sunExposure, setSunExposure] = useState('');
  const [formData, setFormData] = useState(initialForm);
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef(null);

  const update = (field, value) => setFormData((current) => ({ ...current, [field]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formData.consent || formData.website || submitting) return;
    setSubmitting(true);
    setStatus('Submitting your solar request…');
    const params = new URLSearchParams(window.location.search);
    try {
      const [{ addDoc, collection, serverTimestamp }, { getDatabase }, { sendLeadNotification }] = await Promise.all([
        import('firebase/firestore'),
        import('./firebase'),
        import('./leadNotification'),
      ]);
      const db = await getDatabase();
      const { website: _honeypot, ...leadFormData } = formData;
      const leadData = {
        electricBill: billRange,
        sunlightExposure: sunExposure,
        ...leadFormData,
        leadStatus: 'new',
        phoneVerified: false,
        consentText: 'Agreed to contact by Nexora Global and one participating independent solar provider regarding the submitted solar inquiry by phone, email, or text. Consent is not a condition of purchase.',
        consentVersion: CONSENT_VERSION,
        pageUrl: window.location.href,
        source: {
          utmSource: params.get('utm_source') || '',
          utmMedium: params.get('utm_medium') || '',
          utmCampaign: params.get('utm_campaign') || '',
          gclid: params.get('gclid') || '',
        },
        createdAt: serverTimestamp(),
      };
      const leadDocument = await addDoc(collection(db, 'inquiries'), leadData);
      trackEvent('generate_lead', {
        currency: 'USD',
        property_type: formData.propertyType,
        timeline: formData.timeline,
      });
      try {
        await sendLeadNotification({
          ...leadData,
          leadId: leadDocument.id,
          createdAt: new Date().toISOString(),
        });
      } catch (notificationError) {
        console.error('Lead notification error:', notificationError);
      }
      setStatus('Thank you. We received your request and will review your information before contacting you.');
      setFormData(initialForm);
      setBillRange('');
      setSunExposure('');
      setStep(1);
    } catch (error) {
      console.error('Lead submission error:', error);
      setStatus('We could not submit your request. Please try again or contact us directly.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex-grow">
      <section className="relative bg-cover bg-center" style={{ backgroundImage: `linear-gradient(rgba(2,6,23,.82),rgba(2,6,23,.94)),url(${backgroundImage})` }}>
        <div className="max-w-6xl mx-auto px-6 py-14 md:py-20 grid lg:grid-cols-2 gap-10 items-start">
          <div className="py-4">
            <p className="inline-flex text-xs font-bold uppercase tracking-[.18em] text-cyan-300 border border-cyan-400/30 bg-cyan-400/10 rounded-full px-3 py-1">Solar options for US properties</p>
            <h1 className="mt-6 text-4xl md:text-5xl font-black tracking-tight leading-tight text-white">See whether solar could be a fit for your property.</h1>
            <p className="mt-6 text-lg text-slate-300 leading-relaxed">Tell us about your property and electricity use. Nexora Global reviews your request and, when appropriate, connects you with a participating independent solar provider serving your area.</p>
            <ul className="mt-8 space-y-3 text-slate-300" aria-label="Service benefits">
              <li>✓ No obligation to purchase</li>
              <li>✓ Residential and commercial inquiries welcome</li>
              <li>✓ Your request is reviewed before referral</li>
            </ul>
            <p className="mt-7 text-xs text-slate-500">Savings, system suitability, incentives, financing, and availability vary. A participating provider must evaluate your property and usage before presenting recommendations.</p>
          </div>

          <div id="solar-check" ref={formRef} className="bg-slate-900/95 border border-slate-700 p-6 md:p-8 rounded-2xl shadow-2xl">
            <div className="flex justify-between gap-4 mb-5">
              <p className="text-xs font-bold uppercase text-cyan-300 tracking-widest">Solar property check</p>
              <p className="text-xs text-slate-400">Step {step} of 3</p>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mb-7"><div className="bg-cyan-400 h-1.5 rounded-full transition-all" style={{ width: `${(step / 3) * 100}%` }} /></div>

            {step === 1 && <QuestionStep title="What is your average monthly electricity bill?" help="This helps us understand the scale of your electricity use." options={['Under $100', '$100–$200', '$201–$350', '$351–$500', '$500+']} selected={billRange} onSelect={(value) => { trackEvent('solar_form_started', { electric_bill: value }); setBillRange(value); setStep(2); }} />}

            {step === 2 && <QuestionStep title="How much shade does the roof or proposed area receive?" help="If you are unsure, select that option. A provider will assess actual suitability." options={['Mostly full sun', 'Some shade', 'Heavy shade', 'Unsure']} selected={sunExposure} onSelect={(value) => { setSunExposure(value); setStep(3); }} onBack={() => setStep(1)} />}

            {step === 3 && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="absolute -left-[10000px]" aria-hidden="true">
                  <label>Website<input name="website" tabIndex="-1" autoComplete="off" value={formData.website} onChange={(e) => update('website', e.target.value)} /></label>
                </div>
                <div><h2 className="text-2xl font-bold">Request a solar review</h2><p className="text-slate-400 text-sm mt-1">Fields marked * are required.</p></div>
                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="Full name *"><input required name="name" autoComplete="name" value={formData.name} onChange={(e) => update('name', e.target.value)} /></Field>
                  <Field label="Phone number *"><input required name="phone" type="tel" autoComplete="tel" value={formData.number} onChange={(e) => update('number', e.target.value)} /></Field>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="Email address *"><input required name="email" type="email" autoComplete="email" value={formData.email} onChange={(e) => update('email', e.target.value)} /></Field>
                  <Field label="ZIP code *"><input required name="postalCode" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{5}(-[0-9]{4})?" value={formData.zipCode} onChange={(e) => update('zipCode', e.target.value)} placeholder="e.g. 33701" /></Field>
                </div>
                <Field label="Property address *"><input required name="address" autoComplete="street-address" value={formData.address} onChange={(e) => update('address', e.target.value)} /></Field>
                <div className="grid md:grid-cols-2 gap-4">
                  <SelectField name="propertyType" label="Property type *" value={formData.propertyType} onChange={(e) => update('propertyType', e.target.value)} options={['Single-family home', 'Multifamily property', 'Commercial property', 'Farm or agricultural property', 'Other']} />
                  <SelectField name="ownership" label="Your relationship to the property *" value={formData.ownership} onChange={(e) => update('ownership', e.target.value)} options={['I own the property', 'I am authorized to make decisions', 'I am purchasing the property', 'I rent or lease the property']} />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <SelectField name="timeline" label="When are you considering solar? *" value={formData.timeline} onChange={(e) => update('timeline', e.target.value)} options={['As soon as possible', 'Within 1–3 months', 'Within 3–6 months', 'Within 6–12 months', 'Just researching']} />
                  <SelectField name="financingInterest" label="Financing interest *" value={formData.financingInterest} onChange={(e) => update('financingInterest', e.target.value)} options={['Interested in financing', 'Planning to pay cash', 'Not sure yet']} />
                </div>
                <Field label="Anything else we should know? (optional)"><textarea name="description" rows="3" value={formData.description} onChange={(e) => update('description', e.target.value)} /></Field>
                <label className="flex items-start gap-3 text-xs text-slate-300 leading-relaxed border border-slate-700 bg-slate-950/70 rounded-lg p-4">
                  <input required name="consent" type="checkbox" className="mt-1 accent-cyan-400" checked={formData.consent} onChange={(e) => update('consent', e.target.checked)} />
                  <span>I agree that Nexora Global and one participating independent solar provider serving my area may contact me about this request by phone, email, or text. Consent is not a condition of purchase. Message and data rates may apply. I can opt out at any time. See the <InternalLink to="/privacy" className="text-cyan-300 underline">Privacy Policy</InternalLink>.</span>
                </label>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setStep(2)} className="px-4 py-3 bg-slate-950 border border-slate-700 hover:border-slate-500 rounded-lg">Back</button>
                  <button disabled={submitting} type="submit" className="flex-1 py-3 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 text-slate-950 font-bold rounded-lg">{submitting ? 'Submitting…' : 'Submit my solar request'}</button>
                </div>
              </form>
            )}
            {status && <p role="status" aria-live="polite" className="mt-5 text-sm text-cyan-300 font-medium">{status}</p>}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center max-w-2xl mx-auto"><p className="text-xs uppercase tracking-widest text-cyan-300 font-bold">Simple and transparent</p><h2 className="text-3xl font-black mt-3">What happens after you submit?</h2></div>
        <div className="grid md:grid-cols-3 gap-6 mt-10">
          <InfoCard number="01" title="We review your request">We check the location, property relationship, energy use, and timeline you provided.</InfoCard>
          <InfoCard number="02" title="We verify your interest">Our team may contact you to confirm your information and answer basic process questions.</InfoCard>
          <InfoCard number="03" title="We make a suitable connection">If a participating independent provider serves your area, we may share your request so they can discuss possible options with you.</InfoCard>
        </div>
        <div className="mt-10 text-center"><InternalLink to="/how-it-works" className="text-cyan-300 font-semibold hover:underline">Read how the matching process works →</InternalLink></div>
      </section>

      <section className="border-y border-slate-800 bg-slate-900/50">
        <div className="max-w-4xl mx-auto px-6 py-14 text-center"><h2 className="text-2xl font-bold">Important information</h2><p className="mt-4 text-slate-400 leading-relaxed">Nexora Global provides inquiry collection, verification, and matching services. We do not install solar equipment, provide engineering advice, make financing decisions, guarantee savings, or determine eligibility for incentives. Any proposal, inspection, contract, installation, warranty, or financing is provided separately by the independent provider you choose to engage.</p></div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-16" aria-labelledby="solar-questions-title">
        <p className="text-xs uppercase tracking-widest text-cyan-300 font-bold">Common questions</p>
        <h2 id="solar-questions-title" className="mt-3 text-3xl font-black">Before you request a solar review</h2>
        <div className="mt-8 divide-y divide-slate-800 border-y border-slate-800">
          <FaqItem question="Is Nexora Global a solar installer?">No. Nexora collects and reviews inquiries and may introduce a property owner to one participating independent provider. The provider is responsible for any assessment, proposal, contract, installation, financing option, or warranty.</FaqItem>
          <FaqItem question="Does submitting the form commit me to buying solar?">No. Submitting an inquiry gives us permission to review the information and contact you as described in the form. You remain free to decline any introduction or proposal.</FaqItem>
          <FaqItem question="What properties can be submitted?">Residential, multifamily, commercial, farm, and agricultural property inquiries are welcome. Actual provider coverage and project criteria vary by location and project type.</FaqItem>
          <FaqItem question="Why do you ask about my electricity bill and sunlight?">These details help us understand the scale and basic context of the inquiry. They do not replace a professional site assessment or determine final project suitability.</FaqItem>
        </div>
      </section>
    </main>
  );
}

function QuestionStep({ title, help, options, selected, onSelect, onBack }) {
  return <div><h2 className="text-2xl font-bold">{title}</h2><p className="text-slate-400 text-sm mt-2 mb-6">{help}</p><div className="space-y-3">{options.map((option) => <button key={option} type="button" onClick={() => onSelect(option)} className={`w-full text-left p-4 rounded-lg border transition ${selected === option ? 'bg-cyan-400/10 border-cyan-400 text-cyan-300' : 'bg-slate-950/80 border-slate-700 hover:border-slate-500 text-slate-200'}`}>{option}</button>)}</div>{onBack && <button type="button" onClick={onBack} className="text-sm text-slate-400 hover:text-cyan-300 mt-5">← Back</button>}</div>;
}

function Field({ label, children }) {
  return <label className="block"><span className="block text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">{label}</span>{React.cloneElement(children, { className: 'w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 text-slate-100 placeholder:text-slate-600' })}</label>;
}

function SelectField({ name, label, value, onChange, options }) {
  return <Field label={label}><select required name={name} value={value} onChange={onChange}><option value="">Select an option</option>{options.map((option) => <option key={option}>{option}</option>)}</select></Field>;
}

function InfoCard({ number, title, children }) {
  return <article className="bg-slate-900 border border-slate-800 p-6 rounded-xl"><p className="text-cyan-300 font-black text-sm">{number}</p><h3 className="text-lg font-bold mt-3">{title}</h3><p className="text-slate-400 text-sm leading-relaxed mt-2">{children}</p></article>;
}

function FaqItem({ question, children }) {
  return <article className="py-6"><h3 className="text-lg font-bold text-slate-100">{question}</h3><p className="mt-2 leading-relaxed text-slate-400">{children}</p></article>;
}

function ContentPage({ eyebrow, title, children }) {
  return <main className="flex-grow"><article className="max-w-4xl mx-auto px-6 py-14 md:py-20"><p className="text-xs uppercase tracking-[.18em] text-cyan-300 font-bold">{eyebrow}</p><h1 className="text-4xl font-black mt-3 mb-8">{title}</h1><div className="prose-nexora">{children}</div></article></main>;
}

function AboutPage() {
  return <ContentPage eyebrow="About us" title="About Nexora Global: a solar inquiry and matching service"><p>Nexora Global helps US property owners submit and verify solar inquiries. When a request appears suitable and a participating independent solar provider serves the area, we may connect the property owner with that provider for a more detailed conversation.</p><h2>What we do</h2><p>We collect information supplied voluntarily by property owners, review basic qualification details, confirm interest, and coordinate an introduction when an appropriate provider is available.</p><h2>How provider matching works</h2><p>Before sharing an inquiry, we confirm that a participating provider represents that it serves the relevant area and accepts the general project type. Provider territories, licensing requirements, capacity, and project criteria can change. Property owners should independently verify credentials, licenses, insurance, warranties, and contract terms before making a decision.</p><h2>What we do not do</h2><p>Nexora Global is not a solar installer, engineering firm, lender, utility, or government agency. We do not guarantee project suitability, pricing, savings, incentives, financing approval, installation timelines, or provider availability.</p><h2>Our approach</h2><p>We aim to make the initial inquiry more useful for both property owners and providers by asking relevant questions before making a connection. Property owners remain free to accept, decline, or independently evaluate any provider or proposal.</p></ContentPage>;
}

function HowItWorksPage() {
  return <ContentPage eyebrow="Our process" title="How Nexora’s solar matching process works"><h2>1. Tell us about the property</h2><p>You provide information such as ZIP code, property type, relationship to the property, electricity bill range, sunlight exposure, expected timeline, and contact details.</p><h2>2. We review and verify</h2><p>Nexora Global reviews the submission and may contact you to confirm the details and your interest in speaking with a solar provider.</p><h2>3. We check provider availability</h2><p>Provider territories and project criteria differ. Submission does not guarantee that a provider is available or that the property qualifies.</p><h2>4. An independent provider may contact you</h2><p>If an appropriate participating provider is available, Nexora may share the request with one provider serving your area. That provider is responsible for its own assessment, representations, proposal, contract, financing options, installation, and warranties.</p><h2>5. You decide what happens next</h2><p>There is no obligation to purchase through this website. Review provider credentials, terms, licenses, warranties, and financing documents carefully before making a decision.</p></ContentPage>;
}

function ContactPage() {
  return <ContentPage eyebrow="Contact" title="How to reach Nexora Global"><p>For help with a solar inquiry, the matching process, privacy requests, or communication preferences, contact our support team using the details below.</p><h2>Email support</h2><p><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p><h2>Phone</h2><p><a href={`tel:${PHONE_HREF}`}>{PHONE_DISPLAY}</a></p><h2>Live chat</h2><p><LiveChatLink className="font-semibold">Open live chat</LiveChatLink>. If a privacy or ad-blocking extension prevents the chat service from loading, please use email instead.</p><h2>About project proposals</h2><p>Nexora Global does not issue solar proposals, engineering assessments, financing approvals, or installation warranties. Questions about those items should be directed to the independent provider that supplied them.</p></ContentPage>;
}

function PrivacyPage() {
  return <ContentPage eyebrow="Last updated August 9, 2026" title="Privacy Policy"><p>This policy describes how Nexora Global collects, uses, and shares information submitted through nexoraglobal.agency.</p><h2>Information we collect</h2><p>We may collect contact details, property address and ZIP code, property type and ownership or decision-making relationship, electricity bill range, sunlight information, project timeline, financing interest, notes, consent records, referral and advertising parameters, and technical information such as page URL and submission time.</p><h2>How we use information</h2><p>We use information to review and verify solar inquiries, respond to requests, identify a participating independent solar provider that may serve the property, make an authorized referral, maintain consent and operational records, prevent misuse, analyze campaign performance, and comply with applicable requirements.</p><h2>How we share information</h2><p>When appropriate and consistent with the permission you provide, we may share an inquiry with one participating independent solar provider serving the relevant area. We may also use service providers that support hosting, databases, communications, analytics, security, and business operations. We may disclose information when required by law or necessary to protect rights and safety.</p><h2>Contact choices</h2><p>You may ask us to stop contacting you at any time. Reply STOP to an applicable text message or communicate your request directly. A request to Nexora may not automatically reach an independent provider, so contact that provider directly as well.</p><h2>Retention and security</h2><p>We retain information only as reasonably necessary for the purposes described, recordkeeping, dispute resolution, and legal obligations. No internet or storage system can be guaranteed completely secure.</p><h2>Your requests</h2><p>To request access, correction, or deletion where applicable, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We may need to verify your identity before completing a request.</p><h2>Children</h2><p>This service is intended for adults and is not directed to children under 18.</p><h2>Changes</h2><p>We may update this policy and will post the revised date on this page.</p></ContentPage>;
}

function TermsPage() {
  return <ContentPage eyebrow="Last updated August 9, 2026" title="Terms of Use"><p>By using this website, you agree to these terms. If you do not agree, do not submit information through the service.</p><h2>Matching service only</h2><p>Nexora Global collects, reviews, verifies, and may refer solar inquiries. Nexora Global is not the installer, seller, engineer, lender, utility, or government agency. Participating providers are independent businesses and are responsible for their own statements, services, licensing, proposals, agreements, financing options, installations, warranties, and legal compliance.</p><h2>No guarantee</h2><p>Submitting an inquiry does not guarantee provider availability, project eligibility, savings, pricing, incentives, financing, approval, or installation. Information on this website is general and is not engineering, legal, tax, investment, or financial advice.</p><h2>Your responsibilities</h2><p>You agree to provide accurate information and to submit only for a property for which you are authorized to make the request. You should independently evaluate any provider and carefully review all documents before entering an agreement.</p><h2>Communications</h2><p>When you affirmatively consent on the inquiry form, Nexora Global and one participating independent provider may contact you about the request using the methods disclosed there. Consent is not a condition of purchase, and you may opt out.</p><h2>Acceptable use</h2><p>You may not misuse the site, submit false or unauthorized information, interfere with its operation, or attempt to access systems or data without authorization.</p><h2>Limitation</h2><p>To the extent permitted by law, Nexora Global is not responsible for the acts or omissions of independent providers or for decisions made based on general website content.</p><h2>Contact</h2><p>Questions about these terms may be sent to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p></ContentPage>;
}

function NotFoundPage() {
  return <ContentPage eyebrow="404" title="We could not find that page"><p>The address may be incorrect or the page may have moved.</p><p><InternalLink to="/" className="font-semibold">Return to the Nexora Global homepage</InternalLink> or <InternalLink to="/contact" className="font-semibold">contact support</InternalLink>.</p></ContentPage>;
}

function App({ initialPath }) {
  const [path, setPath] = useState(() => initialPath || currentPath());
  useEffect(() => {
    const handleNavigation = () => setPath(currentPath());
    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, []);
  usePageMeta(path);
  const pages = {
    '/': <HomePage />,
    '/about': <AboutPage />,
    '/how-it-works': <HowItWorksPage />,
    '/contact': <ContactPage />,
    '/privacy': <PrivacyPage />,
    '/terms': <TermsPage />,
    '/solar-system-size-estimator': <EstimatorPage />,
    ...Object.fromEntries(Object.entries(GUIDES).map(([route, page]) => [route, <GuidePage key={route} page={page} />])),
    '/404': <NotFoundPage />,
  };
  return <Layout path={path}>{pages[path] || pages['/404']}</Layout>;
}

export default App;


