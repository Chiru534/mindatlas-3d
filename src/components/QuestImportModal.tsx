import React, { useState } from 'react';
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
  Shield
} from 'lucide-react';
import { MapNode, MapEdge } from '../types/atlas';

export interface QuestImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportGraph: (importedNodes: MapNode[], importedEdges: MapEdge[]) => void;
  parseMarkdownToGraph: (markdown: string) => { nodes: MapNode[]; edges: MapEdge[] };
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
- XP: 350
- Tags: agents, swarm, tool-calling
DAG planning, tool execution protocols, memory recall, and coordinated multi-agent consensus.
`
  },
  {
    id: 'cybersecurity',
    name: 'Cybersecurity Bastion & Hardening',
    category: 'Security & Penetration Testing',
    icon: 'shield',
    description: 'Zero Trust architecture, protocol reverse engineering, kernel defense, and exploit prevention.',
    markdown: `# Cybersecurity Bastion Curricula

## Network Protocols & Packet Inspection
- Region: Cybersecurity Bastion
- XP: 120
- Tags: networking, tcp, wireshark
Deep TCP/IP stack analysis, TLS handshakes, DNS routing, and packet dissections.

## Linux System Internals & Memory Architecture
- Region: Cybersecurity Bastion
- XP: 140
- Tags: linux, kernel, memory
Virtual memory addressing, syscall tables, namespace isolation, and cgroups.

## Web Application Vulnerabilities & OWASP
- Region: Cybersecurity Bastion
- Prerequisites: Network Protocols & Packet Inspection
- XP: 200
- Tags: websec, owasp, xss, sqli
Cross-site scripting mitigation, SQL injection defense, SSRF countermeasures, and CORS policies.

## Cryptographic Primitives & Zero Knowledge
- Region: Cybersecurity Bastion
- Prerequisites: Network Protocols & Packet Inspection
- XP: 240
- Tags: crypto, rsa, ecc, zk
Elliptic curve cryptography, AES-GCM symmetric ciphers, and zero-knowledge verification circuits.

## Red Team Evasion & Kernel Hardening
- Region: Cybersecurity Bastion
- Prerequisites: Linux System Internals & Memory Architecture, Web Application Vulnerabilities & OWASP
- XP: 320
- Tags: exploit-dev, hardening, audit
Buffer overflow defenses, ASLR bypass protection, eBPF telemetry monitoring, and container security.
`
  }
];

export const QuestImportModal: React.FC<QuestImportModalProps> = ({
  isOpen,
  onClose,
  onImportGraph,
  parseMarkdownToGraph,
}) => {
  const [markdownText, setMarkdownText] = useState<string>(PRESET_TEMPLATES[0].markdown);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(PRESET_TEMPLATES[0].id);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<{ nodeCount: number; edgeCount: number } | null>(null);

  if (!isOpen) return null;

  const handleSelectTemplate = (template: TemplatePreset) => {
    setSelectedTemplateId(template.id);
    setMarkdownText(template.markdown);
    setValidationError(null);
    setParsedPreview(null);
  };

  const handleValidate = () => {
    try {
      if (!markdownText.trim()) {
        setValidationError('Please enter markdown specification or select a preset template.');
        setParsedPreview(null);
        return;
      }

      const { nodes, edges } = parseMarkdownToGraph(markdownText);
      if (nodes.length === 0) {
        setValidationError('No valid quest headings (# or ##) found in the text.');
        setParsedPreview(null);
        return;
      }

      setValidationError(null);
      setParsedPreview({ nodeCount: nodes.length, edgeCount: edges.length });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to parse markdown.';
      setValidationError(message);
      setParsedPreview(null);
    }
  };

  const handleImport = () => {
    try {
      const { nodes, edges } = parseMarkdownToGraph(markdownText);
      if (nodes.length === 0) {
        setValidationError('No valid quest headings found in markdown.');
        return;
      }
      onImportGraph(nodes, edges);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error applying graph.';
      setValidationError(message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-3xl glass-panel rounded-2xl border border-purple-500/40 shadow-2xl shadow-purple-950/50 flex flex-col max-h-[90vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <FileCode2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold font-mono text-slate-100 flex items-center gap-2">
                <span>Import Quest Spec & Markdown</span>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300">
                  DAG Parser
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Transform outlines into 3D territory islands and unlockable landmark nodes.
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
              SELECT CURATED ROADMAP TEMPLATE OR PASTE CUSTOM SPEC
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {PRESET_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => handleSelectTemplate(tmpl)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    selectedTemplateId === tmpl.id
                      ? 'bg-purple-950/40 border-purple-500/60 text-purple-200 shadow-sm shadow-purple-500/20'
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

          {/* Markdown Text Area */}
          <div>
            <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-1.5">
              <span className="flex items-center gap-1 font-semibold text-slate-300">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                MARKDOWN SPECIFICATION (Headings, Prerequisites & XP)
              </span>
              <button
                type="button"
                onClick={handleValidate}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
              >
                Inspect & Validate Graph
              </button>
            </div>

            <textarea
              value={markdownText}
              onChange={(e) => {
                setMarkdownText(e.target.value);
                setValidationError(null);
                setParsedPreview(null);
              }}
              rows={10}
              className="w-full p-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-500/60 transition-colors leading-relaxed resize-y"
              placeholder="# Quest Island Title&#10;&#10;## Landmark Task Title&#10;- Region: Frontend Archipelago&#10;- Prerequisites: Previous Task&#10;- XP: 150&#10;Task notes..."
            />
          </div>

          {/* Validation Feedback */}
          {validationError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs font-mono text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{validationError}</span>
            </div>
          )}

          {parsedPreview && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/40 text-xs font-mono text-cyan-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                <span>Validated DAG Structure:</span>
              </div>
              <div className="flex items-center gap-4">
                <span><strong>{parsedPreview.nodeCount}</strong> Landmarks</span>
                <span><strong>{parsedPreview.edgeCount}</strong> Road Highways</span>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800/80 bg-slate-900/60 flex items-center justify-end gap-3">
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
            className="px-5 py-2.5 rounded-xl text-xs font-mono font-bold flex items-center gap-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-slate-950 shadow-lg shadow-purple-950/50 active:scale-95 transition-all cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            Generate 3D Island Graph
          </button>
        </div>

      </div>
    </div>
  );
};

export default QuestImportModal;
