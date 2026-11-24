import React, { useState, useMemo } from 'react';
import { 
  X, 
  FileCode2, 
  Sparkles, 
  UploadCloud, 
  AlertCircle, 
  CheckCircle2, 
  Terminal,
  Cpu,
  Globe,
  Shield,
  ArrowRight,
  RefreshCw,
  PlusCircle
} from 'lucide-react';
import { MapNode, MapEdge } from '../types/atlas';
import { parseMarkdownToQuestGraph } from '../services/markdownQuestParser';

export interface QuestImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportGraph: (importedNodes: MapNode[], importedEdges: MapEdge[], replaceWorld: boolean) => void;
}

interface TemplatePreset {
  id: string;
  name: string;
  category: string;
  icon: 'globe' | 'cpu' | 'shield';
  description: string;
  markdown: string;
}

const PRESET_TEMPLATES: TemplatePreset[] = [
  {
    id: 'fullstack',
    name: 'Full-Stack Web Architect',
    category: 'Frontend & Backend',
    icon: 'globe',
    description: 'Modern TypeScript, React 19, Node.js, and Cloud Infrastructure curriculum.',
    markdown: `# Full-Stack Web Architect Roadmap

## HTML, CSS & Semantic Foundations
- Region: Frontend Archipelago
- XP: 100
- Tags: frontend, html, css
Semantic HTML5, CSS Grid, Flexbox, responsive layouts, and accessibility fundamentals.

## Modern TypeScript & JavaScript Core
- Region: Frontend Archipelago
- Prerequisites: HTML, CSS & Semantic Foundations
- XP: 150
- Tags: typescript, js, language
Strict type checking, generics, closures, event loop, and asynchronous programming with Promises.

## React 19 & Component Architecture
- Region: Frontend Archipelago
- Prerequisites: Modern TypeScript & JavaScript Core
- XP: 200
- Tags: react, ui, state
Server Components, Suspense, custom hooks, atomic design principles, and performant virtual DOM rendering.

## High-Performance Node.js & REST APIs
- Region: Backend Citadel
- Prerequisites: Modern TypeScript & JavaScript Core
- XP: 180
- Tags: node, api, express
Event-driven server architecture, streaming, rate limiting, and RESTful API endpoints.

## Distributed SQL & High-Availability Databases
- Region: Backend Citadel
- Prerequisites: High-Performance Node.js & REST APIs
- XP: 220
- Tags: database, postgresql, distributed
ACID transactions, query optimization, indexing strategies, and connection pooling.

## Cloud Native CI/CD & Edge Deployment
- Region: Backend Citadel
- Prerequisites: React 19 & Component Architecture, Distributed SQL & High-Availability Databases
- XP: 300
- Tags: devops, docker, edge
Containerization with Docker, GitHub Actions automation, and edge deployment on Cloudflare Workers.
`
  },
  {
    id: 'ai-engineer',
    name: 'AI & Neural Systems Specialist',
    category: 'AI & Machine Learning',
    icon: 'cpu',
    description: 'Deep Learning, PyTorch, Transformers, LLM fine-tuning, and Autonomous Agent Swarms.',
    markdown: `# AI & Neural Systems Syllabus

## Python Math & Tensor Foundations
- Region: AI & Neural Sanctuary
- XP: 100
- Tags: python, math, tensors
NumPy matrix operations, linear algebra, vector spaces, and automatic differentiation.

## Deep Learning & PyTorch Architecture
- Region: AI & Neural Sanctuary
- Prerequisites: Python Math & Tensor Foundations
- XP: 175
- Tags: pytorch, neural-networks, backprop
Loss surfaces, gradient descent optimizers, convolutions, and neural layer design in PyTorch.

## Transformer Models & Attention Mechanisms
- Region: AI & Neural Sanctuary
- Prerequisites: Deep Learning & PyTorch Architecture
- XP: 225
- Tags: transformers, attention, llm
Scaled dot-product attention, multi-head projections, positional encoding, and tokenization pipelines.

## LLM Fine-Tuning, LoRA & Quantization
- Region: AI & Neural Sanctuary
- Prerequisites: Transformer Models & Attention Mechanisms
- XP: 250
- Tags: lora, quantization, vllm
Parameter-Efficient Fine-Tuning (PEFT), 4-bit AWQ/GGUF quantization, and high-throughput serving.

## Autonomous Multi-Agent Swarms
- Region: AI & Neural Sanctuary
- Prerequisites: LLM Fine-Tuning, LoRA & Quantization
- XP: 300
- Tags: agents, reasoning, orchestration
Coordinated multi-agent swarms, shared message boards, tool calling, and autonomous goal execution.
`
  },
  {
    id: 'cybersecurity',
    name: 'Cybersecurity Bastion & Hardening',
    category: 'Security & Systems',
    icon: 'shield',
    description: 'Zero Trust architecture, Cryptography, Network Hardening, and Threat Modeling.',
    markdown: `# Cybersecurity & Hardening Roadmap

## Cryptographic Foundations & PKI
- Region: Cybersecurity Bastion
- XP: 120
- Tags: crypto, tls, security
Symmetric/asymmetric ciphers, hashing, digital signatures, certificates, and TLS 1.3 handshake.

## Network Security & Packet Analysis
- Region: Cybersecurity Bastion
- Prerequisites: Cryptographic Foundations & PKI
- XP: 180
- Tags: networking, firewalls, wireshark
Subnet isolation, stateful firewalls, packet inspection, and DDoS mitigation strategies.

## OWASP Top 10 & AppSec Hardening
- Region: Cybersecurity Bastion
- Prerequisites: Cryptographic Foundations & PKI
- XP: 220
- Tags: owasp, appsec, xss, sqli
Mitigating injection attacks, cross-site scripting, broken access control, and secrets hygiene.

## Zero Trust Architecture & IAM
- Region: Cybersecurity Bastion
- Prerequisites: Network Security & Packet Analysis, OWASP Top 10 & AppSec Hardening
- XP: 260
- Tags: zerotrust, iam, sso
Identity-aware proxies, least-privilege RBAC, ephemeral tokens, and micro-segmentation.
`
  }
];

export const QuestImportModal: React.FC<QuestImportModalProps> = ({
  isOpen,
  onClose,
  onImportGraph,
}) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(PRESET_TEMPLATES[0].id);
  const [markdownText, setMarkdownText] = useState<string>(PRESET_TEMPLATES[0].markdown);
  const [replaceMode, setReplaceMode] = useState<boolean>(true); // true = replace current world, false = merge
  const [validationError, setValidationError] = useState<string | null>(null);

  // Automatically validate on change
  const parseResult = useMemo(() => {
    if (!markdownText.trim()) return null;
    try {
      const res = parseMarkdownToQuestGraph(markdownText);
      return res;
    } catch (err) {
      console.error(err);
      return null;
    }
  }, [markdownText]);

  if (!isOpen) return null;

  const handleSelectTemplate = (tmpl: TemplatePreset) => {
    setSelectedTemplateId(tmpl.id);
    setMarkdownText(tmpl.markdown);
    setValidationError(null);
  };

  const handleImport = () => {
    try {
      const res = parseMarkdownToQuestGraph(markdownText);
      if (res.nodes.length === 0) {
        setValidationError('No valid tasks or landmarks found in the markdown text.');
        return;
      }
      onImportGraph(res.nodes, res.edges, replaceMode);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error applying graph.';
      setValidationError(message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-4xl glass-panel rounded-2xl border border-purple-500/40 shadow-2xl shadow-purple-950/50 flex flex-col max-h-[92vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-slate-900/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <FileCode2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold font-mono text-slate-100 flex items-center gap-2">
                <span>Import Quest Spec & Markdown</span>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300">
                  DAG Parser v2
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Transform study outlines & Kiro specs into 3D territory islands and unlockable road highways.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          
          {/* Preset Roadmap Templates */}
          <div>
            <label className="block text-xs font-mono font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
              CHOOSE A CURATED ROADMAP PRESET OR PASTE YOUR OWN
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {PRESET_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => handleSelectTemplate(tmpl)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    selectedTemplateId === tmpl.id
                      ? 'bg-purple-950/50 border-purple-500/70 text-purple-200 shadow-md shadow-purple-500/20 ring-1 ring-purple-400/40'
                      : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {tmpl.icon === 'globe' && <Globe className="w-4 h-4 text-cyan-400" />}
                    {tmpl.icon === 'cpu' && <Cpu className="w-4 h-4 text-purple-400" />}
                    {tmpl.icon === 'shield' && <Shield className="w-4 h-4 text-emerald-400" />}
                    <span className="font-mono font-bold text-xs truncate text-slate-200">{tmpl.name}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                    {tmpl.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Import Destination Mode: Replace vs Merge */}
          <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800">
            <span className="text-xs font-mono font-semibold text-slate-300 block mb-2">
              IMPORT TARGET MODE:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setReplaceMode(true)}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left text-xs font-mono transition-all ${
                  replaceMode
                    ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-300 shadow-sm'
                    : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                }`}
              >
                <RefreshCw className={`w-4 h-4 ${replaceMode ? 'text-cyan-400' : 'text-slate-500'}`} />
                <div>
                  <div className="font-bold">Replace World (Clean Slate)</div>
                  <div className="text-[10px] text-slate-400">Recommended. Overwrites current map with this roadmap.</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setReplaceMode(false)}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left text-xs font-mono transition-all ${
                  !replaceMode
                    ? 'bg-purple-950/40 border-purple-500/60 text-purple-300 shadow-sm'
                    : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                }`}
              >
                <PlusCircle className={`w-4 h-4 ${!replaceMode ? 'text-purple-400' : 'text-slate-500'}`} />
                <div>
                  <div className="font-bold">Merge with Current Map</div>
                  <div className="text-[10px] text-slate-400">Appends new landmarks and bridges prerequisite highways.</div>
                </div>
              </button>
            </div>
          </div>

          {/* Markdown Text Area */}
          <div>
            <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-1.5">
              <span className="flex items-center gap-1 font-semibold text-slate-300">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                MARKDOWN SPECIFICATION (Sections with - Region:, - Prerequisites:, - XP:)
              </span>
            </div>

            <textarea
              value={markdownText}
              onChange={(e) => {
                setMarkdownText(e.target.value);
                setValidationError(null);
              }}
              rows={9}
              className="w-full p-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-500/60 transition-colors leading-relaxed resize-y"
              placeholder="# Quest Island Title&#10;&#10;## Landmark Task Title&#10;- Region: Frontend Archipelago&#10;- Prerequisites: Previous Task Title&#10;- XP: 150&#10;Task notes..."
            />
          </div>

          {/* Validation Feedback & Preview */}
          {validationError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs font-mono text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{validationError}</span>
            </div>
          )}

          {parseResult && parseResult.nodes.length > 0 && (
            <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/40 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                <div className="flex items-center gap-2 text-cyan-300 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                  <span>Valid DAG Structure Detected:</span>
                </div>
                <div className="flex items-center gap-3 text-slate-300 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300 font-bold">
                    {parseResult.nodes.length} Landmarks
                  </span>
                  <span className="px-2 py-0.5 rounded bg-purple-950 border border-purple-800 text-purple-300 font-bold">
                    {parseResult.edges.length} Road Highways
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800 text-indigo-300 font-bold">
                    {parseResult.regions.length} Island Regions
                  </span>
                </div>
              </div>

              {/* Quick parsed items list */}
              <div className="max-h-32 overflow-y-auto space-y-1 pr-1 font-mono text-[11px]">
                {parseResult.nodes.map((n) => (
                  <div key={n.id} className="flex items-center justify-between py-1 px-2 rounded bg-slate-900/60 border border-slate-800/80">
                    <span className="text-slate-200 font-medium truncate max-w-xs">{n.title}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">{n.region}</span>
                      {n.prerequisites.length > 0 && (
                        <span className="text-[10px] text-cyan-400 flex items-center gap-0.5">
                          <ArrowRight className="w-2.5 h-2.5" /> {n.prerequisites.length} prereq
                        </span>
                      )}
                      <span className="text-[10px] text-yellow-400">+{n.xpReward} XP</span>
                    </div>
                  </div>
                ))}
              </div>

              {parseResult.warnings.length > 0 && (
                <div className="text-[11px] text-amber-400 font-mono mt-1">
                  {parseResult.warnings.map((w, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800/80 bg-slate-900/70 flex items-center justify-between">
          <div className="text-xs font-mono text-slate-400 hidden sm:block">
            {replaceMode ? 'Will replace existing map with clean roadmap.' : 'Will merge into current 3D map.'}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-mono font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleImport}
              disabled={!parseResult || parseResult.nodes.length === 0}
              className="px-5 py-2.5 rounded-xl text-xs font-mono font-bold flex items-center gap-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-slate-950 shadow-lg shadow-purple-950/50 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UploadCloud className="w-4 h-4" />
              Generate 3D Island Graph
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default QuestImportModal;
