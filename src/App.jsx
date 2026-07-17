import React, { useState, useRef } from 'react';
import { db } from './firebase';
import { collection, addDoc } from 'firebase/firestore';
import backgroundImage from './assets/backgroundimage.jpeg'; // Exactly matches your file name

function App() {
  // Slider State Tracking
  const [sliderStep, setSliderStep] = useState(1);
  const [billRange, setBillRange] = useState('');
  const [sunExposure, setSunExposure] = useState('');
  
  // Final Lead Form State
  const [formData, setFormData] = useState({
    name: '',
    number: '',
    address: '',
    email: '',
    description: ''
  });
  const [status, setStatus] = useState('');

  // Ref to target the form section for scrolling
  const formSectionRef = useRef(null);

  const scrollToForm = (e) => {
    e.preventDefault();
    formSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Move forward in slider
  const nextStep = () => {
    setSliderStep((prev) => prev + 1);
  };

  // Go backward in slider
  const prevStep = () => {
    setSliderStep((prev) => prev - 1);
  };

  // Submit collected slide data + final contact data to Firestore
  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('Submitting Quote Request...');
    try {
      await addDoc(collection(db, "inquiries"), {
        electricBill: billRange,
        sunlightExposure: sunExposure,
        ...formData,
        timestamp: new Date()
      });
      setStatus('Your customized quote has been requested! We will reach out shortly.');
      // Reset form and return to step 1
      setFormData({ name: '', number: '', address: '', email: '', description: '' });
      setBillRange('');
      setSunExposure('');
      setSliderStep(1);
    } catch (error) {
      console.error("Database connection error: ", error);
      setStatus('Something went wrong. Please try again.');
    }
  };

  return (
    <div 
      className="min-h-screen text-slate-100 flex flex-col justify-between font-sans bg-cover bg-center bg-no-repeat bg-fixed relative"
      style={{ 
        backgroundImage: `url(${backgroundImage})` 
      }}
    >
      
      {/* HEADER */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="text-xl font-bold tracking-wider text-cyan-400">NEXORA GLOBAL</div>
          <button 
            onClick={scrollToForm} 
            className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded transition"
          >
            Contact Us
          </button>
        </div>
      </header>

      {/* HERO SECTION */}
      <main className="flex-grow max-w-6xl w-full mx-auto px-6 py-12 md:py-20 flex flex-col lg:flex-row items-center gap-12 relative z-10">
        
        {/* LEFT COLUMN: Flashy, Hyper-Urgent, Scannable Pitch */}
        <div className="lg:w-1/2 w-full flex flex-col justify-between bg-slate-900/90 border border-slate-800 p-8 rounded-2xl shadow-xl backdrop-blur-sm self-stretch">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/30 px-3 py-1 rounded-full">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-ping"></span>
              <span className="text-xs font-black tracking-widest text-red-400 uppercase">Rate Alert: Outages & Hikes Imminent</span>
            </div>
            
            <h1 spellcheck="false" className="text-4xl md:text-5xl font-black tracking-tight leading-tight text-white uppercase">
              Stop Letting The Grid <span className="text-red-500 no-underline decoration-transparent">Bleed Your Wallet.</span>
            </h1>
            
            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-3">
                <span className="text-xl text-cyan-400">⚡</span>
                <p className="text-base text-slate-200 font-medium">
                  Utility rates rise every single year. <strong className="text-cyan-400">You are renting power you should own.</strong>
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-xl text-cyan-400">🔋</span>
                <p className="text-base text-slate-200 font-medium">
                  Intercept their system. Lock your operational electricity costs at <strong className="text-cyan-400">Zero.</strong>
                </p>
              </div>
            </div>
          </div>
          
          {/* Visual Call-to-Action Callout */}
          <div className="space-y-6 mt-8 pt-6 border-t border-slate-800 bg-slate-950/40 p-4 rounded-xl border border-dashed border-slate-800">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 text-center lg:text-left">
              👉 Take 30 seconds to run the configurator on the right.
            </h3>
            <p className="text-xs text-slate-400 text-center lg:text-left">
              See exactly how much unrecoverable capital you can save before the next mandatory billing cycle hits.
            </p>
            <div className="hidden lg:block pt-2">
              <button 
                onClick={scrollToForm} 
                className="w-full text-center px-6 py-3 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-lg text-xs uppercase tracking-widest transition shadow-lg shadow-cyan-400/30 animate-pulse"
              >
                Calculate ROI Drop ↓
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: DYNAMIC SLIDER COMPONENT */}
        <div ref={formSectionRef} className="lg:w-1/2 w-full bg-slate-900/90 border border-slate-800 p-8 rounded-2xl shadow-xl backdrop-blur-sm flex flex-col justify-between transition-all duration-300 self-stretch">
          
          <div>
            {/* Progress Indicators */}
            <div className="flex items-center justify-between mb-6">
              <span className="text-xs font-bold uppercase text-cyan-400 tracking-widest">Savings Configurator</span>
              <span className="text-xs text-slate-400 font-medium">Step {sliderStep} of 3</span>
            </div>
            
            {/* Step Progress Bar */}
            <div className="w-full bg-slate-950 h-1.5 rounded-full mb-8 overflow-hidden">
              <div 
                className="bg-cyan-400 h-1.5 transition-all duration-500 ease-out" 
                style={{ width: `${(sliderStep / 3) * 100}%` }}
              ></div>
            </div>

            {/* SLIDE PAGE 1: Electric Bill Range */}
            {sliderStep === 1 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold">What is your average monthly electric bill?</h2>
                <p className="text-slate-400 text-sm">We use this to analyze the exact system sizing needed for your return on investment.</p>
                
                <div className="space-y-3">
                  {['Under $100', '$100 - $200', '$201 - $350', '$350+'].map((range) => (
                    <button
                      key={range}
                      onClick={() => { setBillRange(range); nextStep(); }}
                      className={`w-full text-left p-4 rounded border transition ${
                        billRange === range 
                          ? 'bg-cyan-400/10 border-cyan-400 text-cyan-400' 
                          : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* SLIDE PAGE 2: Sunlight Exposure */}
            {sliderStep === 2 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold">How much shade does your roof receive?</h2>
                <p className="text-slate-400 text-sm">Obstructions like trees and chimneys help determine if high-efficiency optimizers are required.</p>
                
                <div className="space-y-3">
                  {['Full Sun (No Trees)', 'Partial Shade (Some Trees)', 'Heavy Shade', 'Unsure'].map((shade) => (
                    <button
                      key={shade}
                      onClick={() => { setSunExposure(shade); nextStep(); }}
                      className={`w-full text-left p-4 rounded border transition ${
                        sunExposure === shade 
                          ? 'bg-cyan-400/10 border-cyan-400 text-cyan-400' 
                          : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      {shade}
                    </button>
                  ))}
                </div>

                <button onClick={prevStep} className="text-xs text-slate-400 hover:text-cyan-400 underline pt-4 block">
                  ← Go back to previous step
                </button>
              </div>
            )}

            {/* SLIDE PAGE 3: Final Contact Form */}
            {sliderStep === 3 && (
              <div>
                <h2 className="text-2xl font-bold mb-2">Configure Your Quote</h2>
                <p className="text-slate-400 text-sm mb-6">Enter your details. We will process your choices (Bill: {billRange}, Roof: {sunExposure}) automatically.</p>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">Full Name *</label>
                    <input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded px-4 py-2 text-sm focus:outline-none focus:border-cyan-400 text-slate-100" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">Phone Number *</label>
                      <input required type="tel" value={formData.number} onChange={(e) => setFormData({...formData, number: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded px-4 py-2 text-sm focus:outline-none focus:border-cyan-400 text-slate-100" />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">Email (Optional)</label>
                      <input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded px-4 py-2 text-sm focus:outline-none focus:border-cyan-400 text-slate-100" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">Property Address *</label>
                    <input required type="text" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded px-4 py-2 text-sm focus:outline-none focus:border-cyan-400 text-slate-100" />
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">Specific notes (e.g., Gate code, peak outage hours) *</label>
                    <textarea required rows="2" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded px-4 py-2 text-sm focus:outline-none focus:border-cyan-400 text-slate-100 resize-none"></textarea>
                  </div>

                  <div className="flex gap-4 items-center pt-2">
                    <button type="button" onClick={prevStep} className="px-4 py-3 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 rounded text-sm transition">
                      Back
                    </button>
                    <button type="submit" className="flex-1 py-3 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold rounded text-sm transition">
                      Get My Design & Pricing Info
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {status && <p className="mt-4 text-xs text-center text-cyan-400 font-medium ">{status}</p>}

        </div>
      </main>

      {/* FOOTER */}
      <footer className="bg-slate-950 border-t border-slate-900 mt-auto py-10 text-slate-500 text-xs relative z-10">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-slate-200 font-bold text-sm mb-3">NEXORA GLOBAL</h3>
            <p className="leading-relaxed">Engineered B2B solar systems and smart grid backup deployments.</p>
          </div>
          <div>
            <h3 className="text-slate-200 font-bold text-sm mb-3">Contact Information</h3>
            <p className="mb-1">📧 <a href="mailto:syedmunsifali@nexoraglobal.agency" className="hover:text-cyan-400">syedmunsifali@nexoraglobal.agency</a></p>
            <p>🌐 <a href="https://nexoraglobal.agency" className="hover:text-cyan-400">nexoraglobal.agency</a></p>
          </div>
          <div>
            <h3 className="text-slate-200 font-bold text-sm mb-3">Legal & Rights</h3>
            <p>© 2026 Nexora Global Agency. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;