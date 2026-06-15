import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Radio, Activity, Bell, BarChart2, Shield, Zap, Globe, ChevronDown, Star, ArrowRight, Menu, X, Clock, Server, Wifi, PlayCircle } from 'lucide-react'

const FEATURES = [
  { icon: Activity, title: 'Real-time Monitoring', desc: 'Monitor your websites, APIs and servers in real-time from multiple locations.' },
  { icon: Bell, title: 'Instant Alerts', desc: 'Get notified instantly when your services go down via multiple channels.' },
  { icon: BarChart2, title: 'Beautiful Reports', desc: 'Advanced analytics and beautiful reports to track your uptime.' },
  { icon: Shield, title: 'SSL Monitoring', desc: 'Monitor SSL certificates and get alerts before they expire.' },
  { icon: Zap, title: 'Fast Checks', desc: '30-second intervals ensure you know about outages as fast as possible.' },
  { icon: Globe, title: 'Global Locations', desc: 'Monitor from multiple global locations to ensure worldwide availability.' },
]

const HOW_IT_WORKS = [
  { step: '01', title: 'Add Monitor', desc: 'Add your website, API or server in just a few clicks.' },
  { step: '02', title: 'We Monitor', desc: 'Our global servers monitor your services 24/7.' },
  { step: '03', title: 'You Get Alerts', desc: 'Get notified instantly when something goes wrong.' },
  { step: '04', title: 'Stay Uptime', desc: 'Stay informed and your users stay happy.' },
]

const TESTIMONIALS = [
  { name: 'Sarah Johnson', role: 'CTO at TechCorp', avatar: 'SJ', text: 'Uptime has been a game changer for our team. We catch issues before customers report them.' },
  { name: 'Marcus Chen', role: 'DevOps Lead at Startup', avatar: 'MC', text: 'The simplest monitoring tool I have ever used. Setup took 5 minutes and it just works.' },
  { name: 'Priya Patel', role: 'Founder at SaasApp', avatar: 'PP', text: 'Best uptime monitoring at this price point. The status pages alone are worth it.' },
]

const FAQS = [
  { q: 'How quickly do you detect outages?', a: 'We check your services as frequently as every 30 seconds on our paid plans, and every 5 minutes on the free plan.' },
  { q: 'What notification channels are supported?', a: 'We support Email, Telegram, Slack, Discord, and SMS notifications.' },
  { q: 'Can I monitor APIs, not just websites?', a: 'Yes! You can monitor any HTTP/HTTPS endpoint with custom methods, headers, and request bodies.' },
  { q: 'Do you offer a free plan?', a: 'Yes — our free plan includes 10 monitors with 5-minute check intervals and 1 status page, forever.' },
  { q: 'How do status pages work?', a: 'Create a branded public status page at /status/your-slug. Customers can subscribe to updates and see real-time service health.' },
]

const TRUSTED_BY = ['Google', 'Microsoft', 'Amazon', 'Airbnb', 'Slack']

function NavBar() {
  const [open, setOpen] = useState(false)
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <Radio className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-lg">Uptime</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            {['Features', 'Resources', 'Company'].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`} className="text-sm text-slate-400 hover:text-white transition-colors">{item}</a>
            ))}
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Link to="/login" className="text-sm text-slate-300 hover:text-white transition-colors font-medium">Log In</Link>
            <Link to="/register" className="btn-primary text-sm py-2 px-4">Get Started</Link>
          </div>
          <button onClick={() => setOpen(!open)} className="md:hidden p-2 text-slate-400">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {open && (
          <div className="md:hidden py-4 space-y-2 border-t border-slate-800">
            {['Features', 'Resources', 'Company'].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`} className="block px-2 py-2 text-sm text-slate-400 hover:text-white">{item}</a>
            ))}
            <div className="pt-2 flex flex-col gap-2">
              <Link to="/login" className="btn-ghost text-center text-sm">Log In</Link>
              <Link to="/register" className="btn-primary text-center text-sm">Get Started</Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}

// Live mini dashboard preview
function DashboardPreview() {
  return (
    <div className="bg-slate-800/80 rounded-2xl border border-slate-700/50 overflow-hidden shadow-2xl">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700 bg-slate-800/60">
        <div className="w-3 h-3 rounded-full bg-red-500" />
        <div className="w-3 h-3 rounded-full bg-amber-500" />
        <div className="w-3 h-3 rounded-full bg-green-500" />
        <span className="ml-2 text-xs text-slate-500 font-mono">dashboard.uptime.io</span>
      </div>
      {/* Mini stats */}
      <div className="p-4 grid grid-cols-4 gap-3">
        {[
          { label: 'Total', value: '24', color: 'text-white' },
          { label: 'Up', value: '22', color: 'text-green-400' },
          { label: 'Down', value: '2', color: 'text-red-400' },
          { label: 'Uptime', value: '99.98%', color: 'text-green-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-700/50 rounded-xl p-2.5 text-center">
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>
      {/* Monitor list preview */}
      <div className="px-4 pb-4 space-y-2">
        {[
          { name: 'Website', url: 'https://example.com', status: 'up', uptime: '99.99%' },
          { name: 'API Server', url: 'https://api.example.com', status: 'up', uptime: '99.98%' },
          { name: 'Database', url: 'db.example.com', status: 'down', uptime: '98.12%' },
          { name: 'Payment Gateway', url: 'https://pay.example.com', status: 'up', uptime: '99.90%' },
        ].map(m => (
          <div key={m.name} className="flex items-center gap-3 bg-slate-700/30 rounded-xl px-3 py-2.5">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${m.status === 'up' ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white">{m.name}</p>
              <p className="text-xs text-slate-500 truncate">{m.url}</p>
            </div>
            <span className={`text-xs font-semibold ${m.status === 'up' ? 'text-green-400' : 'text-red-400'}`}>{m.uptime}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Landing() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <NavBar />

      {/* Hero */}
      <section className="hero-gradient pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 bg-primary-600/10 border border-primary-500/20 text-primary-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
                #1 Monitoring Platform
              </div>
              <h1 className="text-5xl lg:text-6xl font-extrabold leading-tight mb-6">
                Monitor. Detect. Alert.<br />
                <span className="gradient-text">Stay Always Online.</span>
              </h1>
              <p className="text-lg text-slate-400 mb-8 leading-relaxed">
                Uptime is an AI-powered monitoring platform that helps you monitor websites, APIs, servers and more. Get real-time alerts and 99.99% uptime.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link to="/register" className="btn-primary flex items-center justify-center gap-2 py-3 px-8 text-base">
                  Get Started for Free <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/demo" className="btn-secondary flex items-center justify-center gap-2 py-3 px-8 text-base group">
                  <PlayCircle className="w-4 h-4 group-hover:text-primary-400 transition-colors" />
                  View Live Demo
                </Link>
              </div>
              <p className="text-xs text-slate-500 mt-4">No credit card required · Free 10 monitors</p>

              {/* Trust logos */}
              <div className="mt-10">
                <p className="text-xs text-slate-500 mb-4">Trusted by developers at</p>
                <div className="flex items-center gap-6 flex-wrap">
                  {TRUSTED_BY.map(b => (
                    <span key={b} className="text-slate-500 font-semibold text-sm hover:text-slate-300 transition-colors">{b}</span>
                  ))}
                </div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
              <DashboardPreview />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-bold mb-4">Everything you need to stay online</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">Comprehensive monitoring tools to keep your infrastructure healthy and your users happy.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
                className="glass-card p-6 hover:border-primary-500/30 transition-all"
              >
                <div className="w-12 h-12 bg-primary-600/15 rounded-2xl flex items-center justify-center mb-4">
                  <f.icon className="w-6 h-6 text-primary-400" />
                </div>
                <h3 className="font-bold text-white text-lg mb-2">{f.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 bg-slate-800/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-bold mb-4">How Uptime Works</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {HOW_IT_WORKS.map((step, i) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.15 }}
                viewport={{ once: true }}
                className="text-center"
              >
                <div className="w-14 h-14 bg-primary-600/15 border border-primary-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-primary-400 font-bold text-lg">{step.step}</span>
                </div>
                <h3 className="font-bold text-white mb-2">{step.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4 bg-slate-800/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-bold mb-4">Loved by developers worldwide</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
                className="glass-card p-6"
              >
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, j) => <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
                </div>
                <p className="text-slate-300 text-sm leading-relaxed mb-5">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center text-sm font-bold text-white">{t.avatar}</div>
                  <div>
                    <p className="font-semibold text-white text-sm">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-bold mb-4">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="glass-card overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-700/20 transition-colors"
                >
                  <span className="font-medium text-white">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-slate-400 flex-shrink-0 ml-4 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 text-sm text-slate-400 leading-relaxed border-t border-slate-700/50 pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center glass-card p-12">
          <h2 className="text-4xl font-bold mb-4">Start monitoring in 60 seconds</h2>
          <p className="text-slate-400 text-lg mb-8">No credit card required. Free forever on our starter plan.</p>
          <Link to="/register" className="btn-primary inline-flex items-center gap-2 py-3 px-8 text-base">
            Get Started for Free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-10 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center">
              <Radio className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-white">Uptime</span>
          </div>
          <p className="text-sm text-slate-500">© 2024 Uptime. All rights reserved.</p>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
