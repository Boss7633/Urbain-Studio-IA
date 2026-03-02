import React from 'react';
import { BarChart, Users, Zap, Globe, CreditCard, ArrowUpRight } from 'lucide-react';

export default function Dashboard() {
  const stats = [
    { label: 'Utilisateurs Actifs', value: '1,284', icon: Users, change: '+12%' },
    { label: 'Projets Générés', value: '8,432', icon: Zap, change: '+24%' },
    { label: 'Revenu (CFA)', value: '2.4M', icon: CreditCard, change: '+8%' },
    { label: 'Taux de Déploiement', value: '94%', icon: Globe, change: '+2%' },
  ];

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tableau de Bord Urbain</h1>
          <p className="text-white/40 text-sm">Aperçu des performances de la plateforme en Afrique.</p>
        </div>
        <button className="px-4 py-2 bg-emerald-500 text-black rounded-lg text-sm font-bold flex items-center gap-2">
          Exporter Rapport
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-6">
        {stats.map((s, i) => (
          <div key={i} className="bg-white/5 border border-white/10 p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <s.icon className="w-5 h-5 text-emerald-500" />
              </div>
              <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full">{s.change}</span>
            </div>
            <div>
              <p className="text-white/40 text-xs font-bold uppercase tracking-widest">{s.label}</p>
              <p className="text-3xl font-bold mt-1">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/10 p-6 rounded-2xl h-64 flex flex-col items-center justify-center text-white/20">
          <BarChart className="w-12 h-12 mb-4" />
          <p className="text-sm">Graphique d'utilisation (Simulation)</p>
        </div>
        <div className="bg-white/5 border border-white/10 p-6 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-white/40">Derniers Projets</h3>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-500 text-xs font-bold">
                    {i}
                  </div>
                  <div>
                    <p className="text-sm font-medium">SaaS Livraison Gaz #{i}</p>
                    <p className="text-[10px] text-white/30">Déployé il y a {i}h</p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-white/20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
