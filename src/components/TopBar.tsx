import React, { useRef, useState } from 'react';
import {
  Zap,
  RotateCcw,
  Volume2,
  VolumeX,
  Skull,
  HeartPulse,
  Sparkles,
  Upload,
  Download,
  GitBranch,
  Cpu,
  KeyRound,
  Loader2,
  X,
} from 'lucide-react';
import { AiProviderConfig, LegacyPreset } from '../types/necromancer';

interface TopBarProps {
  presets: LegacyPreset[];
  activePresetId: string;
  fileName: string;
  onSelectPreset: (presetId: string) => void;
  onUploadFile: (name: string, content: string) => void;
  onImportGitHubUrl: (url: string) => Promise<void>;
  onDownloadCode: () => void;
  onDownloadPatch: () => void;
  hasPatch: boolean;
  vitalityScore: number;
  curseCount: number;
  isResurrected: boolean;
  isResurrecting: boolean;
  onCastResurrection: () => void;
  onResetCode: () => void;
  audioMuted: boolean;
  onToggleAudio: () => void;
  aiConfig: AiProviderConfig | null;
  onSaveAiConfig: (cfg: AiProviderConfig | null) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  presets,
  activePresetId,
  fileName,
  onSelectPreset,
  onUploadFile,
  onImportGitHubUrl,
  onDownloadCode,
  onDownloadPatch,
  hasPatch,
  vitalityScore,
  curseCount,
  isResurrected,
  isResurrecting,
  onCastResurrection,
  onResetCode,
  audioMuted,
  onToggleAudio,
  aiConfig,
  onSaveAiConfig,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [githubUrl, setGithubUrl] = useState('');
  const [githubError, setGithubError] = useState<string | null>(null);
  const [loadingGithub, setLoadingGithub] = useState(false);

  const [showAiModal, setShowAiModal] = useState(false);
  const [provider, setProvider] = useState<'gemini' | 'openai'>(aiConfig?.provider || 'gemini');
  const [apiKey, setApiKey] = useState<string>(aiConfig?.apiKey || '');

  const vitalityColor =
    vitalityScore >= 85
      ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
      : vitalityScore >= 50
      ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
      : 'text-rose-400 border-rose-500/30 bg-rose-500/10';

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    onUploadFile(file.name, text);
    e.target.value = '';
  };

  const handleGithubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubUrl.trim()) return;
    setLoadingGithub(true);
    setGithubError(null);
    try {
      await onImportGitHubUrl(githubUrl.trim());
      setShowGithubModal(false);
      setGithubUrl('');
    } catch (err) {
      setGithubError(err instanceof Error ? err.message : 'Failed to fetch file');
    } finally {
      setLoadingGithub(false);
    }
  };

  const handleSaveAi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      onSaveAiConfig(null);
    } else {
      onSaveAiConfig({ provider, apiKey: apiKey.trim() });
    }
    setShowAiModal(false);
  };

  return (
    <>
      <header className="h-14 shrink-0 border-b border-slate-800/90 bg-[#0b0f17] px-3 sm:px-4 flex items-center justify-between gap-2 overflow-x-auto">
        {/* Brand */}
        <div className="flex items-center gap-2.5 min-w-0 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-violet-950/50 shrink-0">
            <Skull className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white whitespace-nowrap">
                DeadCode Necromancer
              </h1>
              <span className="hidden xl:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/30">
                TS AST + KIRO
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate hidden md:block">
              {fileName} • AST Curse Autopsy &amp; Resurrection
            </p>
          </div>
        </div>

        {/* Input Sources: Presets, File Upload, GitHub URL */}
        <div className="flex items-center gap-1.5 shrink-0">
          <select
            aria-label="Select Legacy Specimen"
            value={activePresetId}
            onChange={(e) => onSelectPreset(e.target.value)}
            className="bg-slate-900 border border-slate-700/80 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-500 cursor-pointer max-w-[180px]"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {activePresetId === 'custom-upload' && (
              <option value="custom-upload">Custom: {fileName}</option>
            )}
          </select>

          <input
            ref={fileInputRef}
            type="file"
            accept=".js,.jsx,.ts,.tsx,.mjs,.cjs"
            onChange={handleFilePick}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Upload local .js / .ts / .tsx file"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-300 hover:text-white hover:border-slate-700 text-xs transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Upload</span>
          </button>

          <button
            onClick={() => setShowGithubModal(true)}
            title="Import raw GitHub file or Gist URL"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-300 hover:text-white hover:border-slate-700 text-xs transition-colors cursor-pointer"
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">GitHub</span>
          </button>
        </div>

        {/* Vitality, Engine Mode, Export & Cast */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-semibold ${vitalityColor}`}
          >
            <HeartPulse className="w-3.5 h-3.5" />
            <span>{vitalityScore}%</span>
            <span className="text-[10px] opacity-75 hidden lg:inline">
              ({curseCount} {curseCount === 1 ? 'curse' : 'curses'})
            </span>
          </div>

          <button
            onClick={() => setShowAiModal(true)}
            title="Configure Engine: Local AST or Optional BYOK AI"
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
              aiConfig
                ? 'border-violet-500/40 bg-violet-500/15 text-violet-300'
                : 'border-slate-800 bg-slate-900/80 text-slate-300 hover:text-white'
            }`}
          >
            {aiConfig ? <KeyRound className="w-3.5 h-3.5" /> : <Cpu className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">
              {aiConfig ? `AI: ${aiConfig.provider.toUpperCase()}` : 'Local AST'}
            </span>
          </button>

          <button
            onClick={onDownloadCode}
            title="Download current file (.ts)"
            className="p-2 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-400 hover:text-emerald-300 hover:border-slate-700 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {hasPatch && (
            <button
              onClick={onDownloadPatch}
              title="Export git-compatible .patch file"
              className="hidden sm:inline-flex items-center px-2 py-1.5 rounded-lg border border-slate-800 bg-slate-900/80 text-[11px] font-mono text-slate-300 hover:text-white hover:border-slate-700 cursor-pointer"
            >
              .patch
            </button>
          )}

          <button
            onClick={onResetCode}
            title="Restore Original Specimen"
            className="p-2 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-400 hover:text-slate-100 hover:border-slate-700 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onToggleAudio}
            title={audioMuted ? 'Unmute Audio Cues' : 'Mute Audio Cues'}
            className="p-2 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-400 hover:text-slate-100 hover:border-slate-700 transition-colors cursor-pointer"
          >
            {audioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={onCastResurrection}
            disabled={(curseCount === 0 && !aiConfig) || isResurrecting}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              curseCount === 0 && isResurrected
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 cursor-default'
                : 'bg-gradient-to-r from-violet-600 to-emerald-500 hover:from-violet-500 hover:to-emerald-400 text-white shadow-lg shadow-violet-950/60'
            }`}
          >
            {isResurrecting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Resurrecting...</span>
              </>
            ) : curseCount === 0 && isResurrected ? (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Resurrected</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5" />
                <span>Cast Resurrection</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* GitHub Raw Import Modal */}
      {showGithubModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleGithubSubmit}
            className="w-full max-w-md bg-[#0b0f17] border border-slate-800 rounded-xl p-4 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <GitBranch className="w-4 h-4 text-violet-400" />
                <span>Import Legacy File from GitHub</span>
              </div>
              <button
                type="button"
                onClick={() => setShowGithubModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Paste any public GitHub file URL or Raw Gist URL. Blob URLs are automatically
              converted to <code className="text-slate-300">raw.githubusercontent.com</code>.
            </p>
            <input
              type="url"
              required
              placeholder="https://github.com/user/repo/blob/main/legacy.js"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-violet-500"
            />
            {githubError && (
              <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-2.5 py-1.5">
                {githubError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowGithubModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loadingGithub}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white cursor-pointer"
              >
                {loadingGithub && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Fetch Specimen</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Optional BYOK AI Configuration Modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveAi}
            className="w-full max-w-md bg-[#0b0f17] border border-slate-800 rounded-xl p-4 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <KeyRound className="w-4 h-4 text-emerald-400" />
                <span>Resurrection Engine Mode</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              The zero-config <strong>Local TypeScript AST Engine</strong> runs 100% offline.
              Optionally add your own API key (kept only in browser session memory) for full
              AI-assisted async/await rewrites verified by our AST compiler.
            </p>
            <div className="space-y-2">
              <label className="block text-[11px] font-mono text-slate-400">PROVIDER</label>
              <div className="grid grid-cols-2 gap-2">
                {(['gemini', 'openai'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProvider(p)}
                    className={`py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
                      provider === p
                        ? 'bg-violet-500/20 border-violet-500 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {p === 'gemini' ? 'Google Gemini 2.5' : 'OpenAI GPT-4o-mini'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] font-mono text-slate-400">
                API KEY (LEAVE BLANK FOR LOCAL AST ONLY)
              </label>
              <input
                type="password"
                placeholder={provider === 'gemini' ? 'AIza...' : 'sk-...'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex justify-between items-center pt-1">
              <button
                type="button"
                onClick={() => {
                  setApiKey('');
                  onSaveAiConfig(null);
                  setShowAiModal(false);
                }}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Use Local AST Only
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
              >
                Save Mode
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};
