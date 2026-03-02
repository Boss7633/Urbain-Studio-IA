import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Code2, 
  Play, 
  Terminal as TerminalIcon, 
  Download, 
  Github, 
  Layout, 
  Cpu,
  Sparkles,
  ChevronRight,
  Plus,
  History,
  Settings,
  Globe,
  Zap,
  Package,
  Smartphone,
  Key,
  Save,
  X,
  ShieldAlert,
  RefreshCw
} from 'lucide-react';
import { generateProjectStream } from './services/ai';
import { ChatMessage, ProjectState } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Dashboard from './components/Dashboard';
import { getWebContainer, mountFiles, runCommand } from './services/webcontainer';
import Markdown from 'react-markdown';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "Bonjour Urbain ! Je suis Urbain Studio AI. Que souhaites-tu bâtir aujourd'hui ? Un SaaS de livraison, un e-commerce local ou une application mobile ?" }
  ]);
  const [input, setInput] = useState('');
  const [project, setProject] = useState<ProjectState>({
    files: {},
    currentFile: null,
    status: 'idle',
    logs: []
  });
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [view, setView] = useState<'editor' | 'dashboard'>('editor');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('urbain_api_key') || '');

  useEffect(() => {
    localStorage.setItem('urbain_api_key', apiKey);
  }, [apiKey]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const [isIsolated, setIsIsolated] = useState(window.crossOriginIsolated);

  useEffect(() => {
    const isChromium = !!(window as any).chrome;
    if (!isChromium) {
      addLog("⚠️ Attention : Les WebContainers fonctionnent mieux sur les navigateurs basés sur Chromium (Chrome, Edge, Brave).");
    }

    const checkIsolation = () => {
      setIsIsolated(window.crossOriginIsolated);
      console.log("Cross-Origin Isolated:", window.crossOriginIsolated);
    };
    
    checkIsolation();
    // Check again after a short delay as SW might have just activated
    const timer = setTimeout(checkIsolation, 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [project.logs]);

  const addLog = (log: string) => {
    setProject(prev => ({ ...prev, logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] ${log}`] }));
  };

  const startRealBuild = async (files: Record<string, string>) => {
    try {
      setProject(prev => ({ ...prev, status: 'installing', logs: [] }));
      setActiveTab('preview');
      const wc = await getWebContainer();
      
      addLog("Mounting files...");
      await mountFiles(wc, files);
      
      addLog("Installing dependencies...");
      const installExitCode = await runCommand(wc, 'npm', ['install'], (data) => addLog(data));
      
      if (installExitCode !== 0) {
        addLog("Installation failed.");
        setProject(prev => ({ ...prev, status: 'error' }));
        setActiveTab('code');
        return;
      }

      setProject(prev => ({ ...prev, status: 'running' }));
      addLog("Starting dev server...");
      
      wc.on('server-ready', (port, url) => {
        addLog(`Server ready at ${url}`);
        setPreviewUrl(url);
      });

      await runCommand(wc, 'npm', ['run', 'dev'], (data) => addLog(data));
    } catch (error) {
      console.error(error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes("API Key missing")) {
        setMessages(prev => [...prev, { role: 'assistant', content: "❌ Clé API manquante. Veuillez configurer votre clé Gemini dans les paramètres ou dans le panneau des secrets." }]);
      } else if (errorMsg.includes("Chromium")) {
        addLog(`❌ Navigateur non supporté : ${errorMsg}`);
        addLog(`💡 Solution : Utilisez Chrome, Edge ou Brave.`);
      } else if (errorMsg.includes("SharedArrayBuffer") || errorMsg.includes("crossOriginIsolated")) {
        addLog(`❌ Erreur critique : L'isolation inter-origines est manquante.`);
        addLog(`💡 Solution : Cliquez sur "Réparer l'isolation" ci-dessous ou rechargez la page.`);
      } else {
        addLog(`Error: ${errorMsg}`);
      }
      setProject(prev => ({ ...prev, status: 'error' }));
    }
  };

  const [discoveredFiles, setDiscoveredFiles] = useState<string[]>([]);

  const handleSend = async () => {
    if (!input.trim() || project.status === 'generating') return;

    if (!apiKey && !process.env.GEMINI_API_KEY) {
      setMessages(prev => [...prev, { role: 'assistant', content: "❌ Clé API manquante. Veuillez la configurer dans les paramètres (icône ⚙️) en haut à droite pour commencer." }]);
      setShowSettings(true);
      return;
    }

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    
    // Add placeholder for assistant response
    const assistantMsgId = Date.now();
    setMessages(prev => [...prev, { role: 'assistant', content: '', id: assistantMsgId }]);
    
    setProject(prev => ({ ...prev, status: 'generating' }));
    setDiscoveredFiles([]);
    setView('editor');
    setActiveTab('code');

    try {
      const newFiles = await generateProjectStream(
        userMsg, 
        (text) => {
          // Clean the text for display (remove JSON block)
          const cleanedText = text.replace(/```json\n[\s\S]*?(\n```|$)/g, '').trim();
          
          setMessages(prev => prev.map(m => 
            m.id === assistantMsgId ? { ...m, content: cleanedText } : m
          ));

          // Discover and extract files in the stream
          const jsonMatch = text.match(/```json\n([\s\S]*?)(?:\n```|$)/);
          if (jsonMatch && jsonMatch[1]) {
            const content = jsonMatch[1];
            
            // Try to extract individual files using regex for live updates
            const fileEntries = content.matchAll(/"([^"]+)":\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g);
            const extractedFiles: Record<string, string> = {};
            for (const match of fileEntries) {
              const path = match[1];
              let fileContent = match[2];
              // Unescape basic characters
              fileContent = fileContent.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
              extractedFiles[path] = fileContent;
            }

            if (Object.keys(extractedFiles).length > 0) {
              setProject(prev => {
                const newFiles = { ...prev.files, ...extractedFiles };
                return { 
                  ...prev, 
                  files: newFiles,
                  currentFile: prev.currentFile || Object.keys(newFiles)[0]
                };
              });
            }
          }

          const fileMatches = text.matchAll(/"([^"]+\.(?:tsx|ts|js|jsx|css|html|json))":/g);
          const files = Array.from(fileMatches).map(m => m[1]);
          if (files.length > 0) {
            setDiscoveredFiles(prev => Array.from(new Set([...prev, ...files])));
          }
        },
        project.files, 
        apiKey
      );
      
      if (Object.keys(newFiles).length === 0) {
        setProject(prev => ({ ...prev, status: 'idle' }));
        setMessages(prev => [...prev, { role: 'assistant', content: "⚠️ Je n'ai pas pu extraire de code valide de ma réponse. Peux-tu réessayer ou être plus spécifique ?" }]);
        return;
      }

      const updatedFiles = { ...project.files, ...newFiles };
      setProject(prev => ({
        ...prev,
        files: updatedFiles,
        currentFile: Object.keys(newFiles)[0] || prev.currentFile,
        status: 'idle'
      }));
      
      startRealBuild(updatedFiles);
    } catch (error) {
      console.error(error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      setProject(prev => ({ ...prev, status: 'error' }));
      
      if (errorMsg.includes("API Key missing")) {
        setMessages(prev => [...prev, { role: 'assistant', content: "❌ Clé API manquante. \n\n**Solution :**\n1. Cliquez sur l'icône ⚙️ (Paramètres) en haut à droite et collez votre clé Gemini.\n2. OU, si vous avez déployé sur Netlify, ajoutez une variable d'environnement nommée `GEMINI_API_KEY` dans votre tableau de bord Netlify et redéployez." }]);
      } else if (errorMsg.includes("Chromium")) {
        setMessages(prev => [...prev, { role: 'assistant', content: "❌ Navigateur non supporté. Les WebContainers ne fonctionnent que sur Chrome, Edge ou Brave." }]);
      } else if (errorMsg.includes("SharedArrayBuffer") || errorMsg.includes("crossOriginIsolated")) {
        setMessages(prev => [...prev, { role: 'assistant', content: "❌ Erreur d'isolation inter-origines. \n\nLes WebContainers nécessitent des en-têtes de sécurité spécifiques. Cliquez sur le bouton **'Réparer l'isolation'** dans le terminal ci-dessous ou rechargez la page." }]);
        addLog(`❌ Erreur critique : L'isolation inter-origines est manquante.`);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `Désolé, une erreur est survenue : ${errorMsg}. \n\nSi vous êtes sur Netlify, vérifiez que votre clé API est bien configurée.` }]);
      }
    }
  };

  const handleCodeChange = (newContent: string) => {
    if (!project.currentFile) return;
    setProject(prev => ({
      ...prev,
      files: {
        ...prev.files,
        [prev.currentFile!]: newContent
      }
    }));
  };

  const downloadProject = () => {
    const data = JSON.stringify(project.files, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'urbain-studio-project.json';
    a.click();
  };

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('urbain_api_key', key);
    setShowSettings(false);
  };

  const templates = [
    { name: "SaaS Livraison Gaz", icon: Globe, prompt: "Crée un SaaS de livraison de gaz en Côte d'Ivoire avec paiement Mobile Money." },
    { name: "E-commerce Local", icon: Zap, prompt: "Crée une boutique en ligne pour produits artisanaux ivoiriens." },
    { name: "App Mobile Flutter", icon: Smartphone, prompt: "Génère la structure d'une application Flutter pour la gestion de tontines." },
  ];

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-r border-white/10 flex flex-col bg-[#0F0F0F]"
          >
            <div className="p-6 flex items-center gap-3 border-bottom border-white/5">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Cpu className="text-black w-6 h-6" />
              </div>
              <div>
                <h1 className="font-bold text-lg tracking-tight">Urbain Studio</h1>
                <p className="text-[10px] uppercase tracking-widest text-emerald-500 font-semibold opacity-80">AI Web Builder</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <div>
                <button 
                  onClick={() => {
                    setView('editor');
                    setProject({
                      files: {},
                      currentFile: null,
                      status: 'idle',
                      logs: []
                    });
                    setPreviewUrl(null);
                    setMessages([{ role: 'assistant', content: "Nouveau projet prêt ! Que souhaites-tu bâtir ?" }]);
                  }}
                  className={cn(
                    "w-full py-3 px-4 rounded-xl flex items-center gap-3 transition-all border group",
                    view === 'editor' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-white/5 border-white/5 hover:bg-white/10 text-white"
                  )}
                >
                  <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-medium">Nouveau Projet</span>
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold px-2">Navigation</p>
                <button 
                  onClick={() => setView('dashboard')}
                  className={cn(
                    "w-full p-3 rounded-xl flex items-center gap-3 text-sm transition-colors text-left",
                    view === 'dashboard' ? "bg-white/10 text-white" : "text-white/70 hover:text-white hover:bg-white/5"
                  )}
                >
                  <History className="w-4 h-4 text-emerald-500" />
                  Tableau de Bord
                </button>
                <button 
                  onClick={() => setShowSettings(true)}
                  className={cn(
                    "w-full p-3 rounded-xl flex items-center gap-3 text-sm transition-colors text-left",
                    showSettings ? "bg-white/10 text-white" : "text-white/70 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Key className="w-4 h-4 text-emerald-500" />
                  Clé API Gemini
                </button>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold px-2">Templates Afrique</p>
                {templates.map((t, i) => (
                  <button 
                    key={i}
                    onClick={() => {
                      setInput(t.prompt);
                      setView('editor');
                    }}
                    className="w-full p-3 hover:bg-white/5 rounded-xl flex items-center gap-3 text-sm text-white/70 hover:text-white transition-colors text-left"
                  >
                    <t.icon className="w-4 h-4 text-emerald-500" />
                    {t.name}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold px-2">Historique</p>
                <div className="flex flex-col gap-1">
                  <div className="p-3 text-xs text-white/50 italic px-2">Aucun projet récent</div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-white/5 space-y-2">
              <button 
                onClick={() => setShowSettings(true)}
                className="w-full p-3 hover:bg-white/5 rounded-xl flex items-center justify-between text-sm text-white/70 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Settings className="w-4 h-4" />
                  Paramètres
                </div>
                {!apiKey && !process.env.GEMINI_API_KEY && (
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                )}
              </button>
              <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                <p className="text-[10px] text-emerald-400 font-bold uppercase mb-1">Plan Pro</p>
                <p className="text-xs text-white/70">Accès illimité aux modèles Claude 3.5 & Gemini Pro.</p>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">
        {view === 'dashboard' ? (
          <div className="flex-1 overflow-y-auto">
            <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-[#0A0A0A]/80 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                >
                  <Layout className="w-5 h-5 text-white/60" />
                </button>
                <div className="h-4 w-[1px] bg-white/10" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-white/60">Admin Dashboard</h2>
              </div>
            </header>
            <Dashboard />
          </div>
        ) : (
          <>
            {/* Header */}
            <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-[#0A0A0A]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors"
            >
              <Layout className="w-5 h-5 text-white/60" />
            </button>
            <div className="h-4 w-[1px] bg-white/10" />
            <div className="flex items-center gap-2 text-sm font-medium text-white/80">
              <Package className="w-4 h-4 text-emerald-500" />
              <span>mon-saas-ivoirien</span>
              <span className="text-white/30">/</span>
              <span className="text-white/40 font-normal">main</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
              <button 
                onClick={() => setActiveTab('preview')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2",
                  activeTab === 'preview' ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20" : "text-white/60 hover:text-white"
                )}
              >
                <Play className="w-3 h-3" />
                Preview
              </button>
              <button 
                onClick={() => setActiveTab('code')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2",
                  activeTab === 'code' ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20" : "text-white/60 hover:text-white"
                )}
              >
                <Code2 className="w-3 h-3" />
                Code
              </button>
            </div>
            <button 
              onClick={downloadProject}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors"
            >
              <Download className="w-4 h-4 text-white/80" />
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors relative"
            >
              <Settings className="w-4 h-4 text-white/60" />
              {!apiKey && !process.env.GEMINI_API_KEY && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-[#0A0A0A]" />
              )}
            </button>
            <button 
              onClick={() => {
                alert("🚀 Urbain Studio AI est prêt pour Netlify !\n\n1. Connectez votre repo GitHub à Netlify.\n2. Les fichiers netlify.toml et _headers sont déjà configurés pour l'isolation inter-origines.\n3. Build command: npm run build\n4. Publish directory: dist");
              }}
              className="px-4 py-2 bg-white text-black rounded-lg text-sm font-bold hover:bg-white/90 transition-colors flex items-center gap-2"
            >
              <Github className="w-4 h-4" />
              Déployer sur Netlify
            </button>
          </div>
        </header>

        {/* Workspace */}
        <div className="flex-1 flex overflow-hidden">
          {/* Chat Section */}
          <div className="w-[450px] border-r border-white/10 flex flex-col bg-[#0D0D0D]">
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {messages.map((msg, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={i} 
                  className={cn(
                    "flex flex-col gap-2 max-w-[90%]",
                    msg.role === 'user' ? "ml-auto items-end" : "items-start"
                  )}
                >
                  <div className={cn(
                    "p-4 rounded-2xl text-sm leading-relaxed",
                    msg.role === 'user' 
                      ? "bg-emerald-500 text-black font-medium rounded-tr-none" 
                      : "bg-white/5 border border-white/10 text-white/90 rounded-tl-none"
                  )}>
                    {msg.role === 'assistant' ? (
                      <div className="space-y-4">
                        <div className="markdown-body prose prose-invert prose-sm max-w-none">
                          <Markdown>{msg.content}</Markdown>
                        </div>
                        
                        {project.status === 'generating' && discoveredFiles.length > 0 && msg.id === messages[messages.length - 1].id && (
                          <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                              <Code2 className="w-3 h-3 text-emerald-500" />
                              Fichiers en cours de création...
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {discoveredFiles.map(file => (
                                <div key={file} className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] font-mono text-emerald-500/80 animate-pulse">
                                  {file}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                  <span className="text-[10px] text-white/30 uppercase font-bold tracking-widest">
                    {msg.role === 'user' ? 'Vous' : 'Urbain AI'}
                  </span>
                </motion.div>
              ))}
              {project.status === 'generating' && (
                <div className="flex items-center gap-3 text-emerald-500 animate-pulse">
                  <Sparkles className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-widest">Génération en cours...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-6 border-t border-white/10 bg-[#0D0D0D]">
              <div className="relative group">
                <textarea 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                  placeholder="Décris ton application (ex: Un SaaS de livraison de gaz...)"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 pr-12 text-sm focus:outline-none focus:border-emerald-500/50 transition-all resize-none h-24 placeholder:text-white/20"
                />
                <button 
                  onClick={handleSend}
                  disabled={project.status === 'generating'}
                  className="absolute bottom-4 right-4 p-2 bg-emerald-500 text-black rounded-xl hover:scale-110 transition-transform disabled:opacity-50 disabled:hover:scale-100"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between text-[10px] text-white/30 font-bold uppercase tracking-widest">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  WebContainer Ready
                </div>
                <span>Gemini 3.1 Pro</span>
              </div>
            </div>
          </div>

          {/* View Section */}
          <div className="flex-1 bg-black relative flex flex-col">
            {activeTab === 'preview' ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {Object.keys(project.files).length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-white/20 space-y-4">
                    <div className="w-20 h-20 border-2 border-dashed border-white/10 rounded-3xl flex items-center justify-center">
                      <Layout className="w-8 h-8" />
                    </div>
                    <p className="text-sm font-medium">En attente de génération...</p>
                  </div>
                ) : (
                  <div className="flex-1 bg-white rounded-t-xl mx-4 mt-4 overflow-hidden shadow-2xl flex flex-col">
                    <div className="h-8 bg-gray-100 border-b border-gray-200 flex items-center px-4 gap-2 shrink-0">
                      <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                      </div>
                      <div className="flex-1 bg-white h-5 rounded mx-4 border border-gray-200 flex items-center px-2 text-[10px] text-gray-400">
                        {previewUrl || 'Chargement...'}
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto bg-white">
                      {previewUrl ? (
                        <iframe 
                          src={previewUrl}
                          className="w-full h-full border-none"
                          title="Preview"
                        />
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4 relative">
                          {!isIsolated && (
                            <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-10 flex flex-col items-center justify-center p-8 text-center space-y-6">
                              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
                                <ShieldAlert className="w-8 h-8 text-red-500" />
                              </div>
                              <div className="space-y-2">
                                <h3 className="text-white font-bold text-lg">Isolation Requise</h3>
                                <p className="text-sm text-white/60 max-w-xs">
                                  Le moteur WebContainer nécessite une isolation inter-origines pour fonctionner. 
                                  Le Service Worker a été enregistré, mais un rechargement est nécessaire.
                                </p>
                              </div>
                              <button 
                                onClick={() => window.location.reload()}
                                className="px-6 py-3 bg-white text-black rounded-xl text-sm font-bold hover:bg-white/90 transition-colors flex items-center gap-2"
                              >
                                <RefreshCw className="w-4 h-4" />
                                Recharger la page
                              </button>
                            </div>
                          )}
                          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                          <p className="text-sm font-medium uppercase tracking-widest animate-pulse">
                            {project.status === 'installing' ? 'Installation des dépendances...' : 'Lancement du serveur...'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="h-32 border-t border-white/10 flex flex-col bg-[#0A0A0A] overflow-hidden">
                  <div className="h-8 border-b border-white/5 flex items-center px-4 gap-6 bg-[#0F0F0F]">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                      <TerminalIcon className="w-3 h-3" />
                      Terminal
                    </div>
                  </div>
                  <div className="flex-1 p-3 font-mono text-[11px] text-emerald-500/80 overflow-y-auto space-y-1">
                    {project.logs.length === 0 ? (
                      <div className="text-white/20">$ En attente de commande...</div>
                    ) : (
                      <div className="space-y-1">
                        {project.logs.map((log, i) => (
                          <div key={i} className="flex gap-2">
                            <span className="text-white/20 shrink-0">❯</span>
                            <span>{log}</span>
                          </div>
                        ))}
                        {project.status === 'error' && project.logs.some(l => l.includes("SharedArrayBuffer") || l.includes("crossOriginIsolated")) && (
                          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg space-y-3">
                            <p className="text-red-400 font-medium">L'isolation inter-origines n'est pas active.</p>
                            <button 
                              onClick={() => window.location.reload()}
                              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors flex items-center gap-2 font-bold"
                            >
                              <RefreshCw className="w-4 h-4" />
                              Réparer l'isolation (Recharger)
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <div ref={terminalEndRef} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col">
                <div className="flex border-b border-white/10 bg-[#0D0D0D] overflow-x-auto shrink-0">
                  {Object.keys(project.files).map(path => (
                    <button 
                      key={path}
                      onClick={() => setProject(prev => ({ ...prev, currentFile: path }))}
                      className={cn(
                        "px-4 py-3 text-xs font-medium border-r border-white/10 transition-colors whitespace-nowrap",
                        project.currentFile === path ? "bg-white/5 text-emerald-500" : "text-white/40 hover:text-white/60"
                      )}
                    >
                      {path.split('/').pop()}
                    </button>
                  ))}
                </div>
                <div className="flex-1 relative bg-[#050505]">
                  {project.status === 'generating' && (
                    <div className="absolute top-4 right-4 z-10 flex items-center gap-2 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] font-bold text-emerald-500 uppercase tracking-widest animate-pulse">
                      <Zap className="w-3 h-3" />
                      Mise à jour en direct
                    </div>
                  )}
                  <textarea
                    value={project.currentFile ? project.files[project.currentFile] : ""}
                    onChange={(e) => handleCodeChange(e.target.value)}
                    className="code-editor-textarea"
                    placeholder="// Sélectionne un fichier pour voir le code"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    )}
  </main>

  {/* Settings Modal */}
  <AnimatePresence>
    {showSettings && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowSettings(false)}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-md bg-[#121212] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="p-6 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                <Key className="w-4 h-4 text-emerald-500" />
              </div>
              <h2 className="font-bold">Configuration API</h2>
            </div>
            <button 
              onClick={() => setShowSettings(false)}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-white/60 leading-relaxed">
              Urbain Studio utilise l'IA Gemini pour générer du code. Par défaut, une clé partagée est utilisée, mais vous pouvez configurer la vôtre pour plus de stabilité.
            </p>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Clé API Gemini</label>
              <div className="relative">
                <input 
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={process.env.GEMINI_API_KEY ? "Clé configurée via Netlify (cachée)" : "AIzaSy..."}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
              <p className="text-[10px] text-white/30 italic">La clé est sauvegardée localement dans votre navigateur.</p>
            </div>
            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4 flex gap-3">
              <Globe className="w-5 h-5 text-emerald-500 shrink-0" />
              <div className="space-y-1">
                <p className="text-xs text-emerald-500/80 leading-relaxed">
                  Obtenez une clé gratuite sur <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="underline font-bold">Google AI Studio</a>.
                </p>
                <p className="text-[10px] text-white/40">
                  Sur Netlify : Ajoutez <code className="bg-white/5 px-1 rounded">GEMINI_API_KEY</code> dans vos variables d'environnement.
                </p>
              </div>
            </div>
            <button 
              onClick={() => setShowSettings(false)}
              className="w-full py-3 bg-emerald-500 text-black rounded-xl font-bold text-sm hover:bg-emerald-400 transition-colors"
            >
              Enregistrer et Fermer
            </button>
          </div>
          <div className="p-6 bg-white/5 flex gap-3">
            <button 
              onClick={() => setShowSettings(false)}
              className="flex-1 py-3 rounded-xl text-sm font-bold hover:bg-white/5 transition-colors"
            >
              Annuler
            </button>
            <button 
              onClick={() => saveApiKey(apiKey)}
              className="flex-1 py-3 bg-emerald-500 text-black rounded-xl text-sm font-bold hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              Enregistrer
            </button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
</div>
  );
}
