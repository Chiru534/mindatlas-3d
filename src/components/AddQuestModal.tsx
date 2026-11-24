import React, { useState } from 'react';
import { 
  X, 
  Plus, 
  MapPin, 
  Sparkles, 
  Compass, 
  Layers, 
  FileText, 
  Tag, 
  AlertCircle 
} from 'lucide-react';
import { MapNode } from '../types/atlas';

export interface AddQuestModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingNodes: MapNode[];
  onAddQuest: (newQuest: {
    title: string;
    region: string;
    notes: string;
    xpReward: number;
    prerequisites: string[];
    tags: string[];
  }) => void;
}

const REGION_OPTIONS = [
  'Frontend Archipelago',
  'Backend Citadel',
  'AI & Neural Sanctuary',
  'Cybersecurity Bastion',
];

export const AddQuestModal: React.FC<AddQuestModalProps> = ({
  isOpen,
  onClose,
  existingNodes,
  onAddQuest,
}) => {
  const [title, setTitle] = useState('');
  const [region, setRegion] = useState(REGION_OPTIONS[0]);
  const [customRegion, setCustomRegion] = useState('');
  const [notes, setNotes] = useState('');
  const [xpReward, setXpReward] = useState<number>(150);
  const [selectedPrereqIds, setSelectedPrereqIds] = useState<string[]>([]);
  const [tagsInput, setTagsInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePrereqToggle = (nodeId: string) => {
    setSelectedPrereqIds((prev) =>
      prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a landmark title.');
      return;
    }

    const finalRegion = region === 'Custom' ? customRegion.trim() || 'Custom Island' : region;
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    onAddQuest({
      title: title.trim(),
      region: finalRegion,
      notes: notes.trim(),
      xpReward: Math.max(25, Number(xpReward) || 100),
      prerequisites: selectedPrereqIds,
      tags,
    });

    // Reset and close
    setTitle('');
    setNotes('');
    setXpReward(150);
    setSelectedPrereqIds([]);
    setTagsInput('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-xl glass-panel rounded-2xl border border-cyan-500/40 shadow-2xl shadow-cyan-950/50 flex flex-col max-h-[90vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold font-mono text-slate-100 flex items-center gap-2">
                <span>Spawn Knowledge Landmark</span>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300">
                  3D Builder
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Create a study quest and connect it into the spatial DAG network.
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

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs font-mono text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-mono font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" />
              LANDMARK / QUEST TITLE *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. WebGL Shader Programming & GLSL"
              className="w-full px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
              required
            />
          </div>

          {/* Region and XP */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                ISLAND TERRITORY / REGION
              </label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                {REGION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt} className="bg-slate-900 text-slate-200">
                    {opt}
                  </option>
                ))}
                <option value="Custom" className="bg-slate-900 text-slate-200">
                  + Custom Island Territory...
                </option>
              </select>

              {region === 'Custom' && (
                <input
                  type="text"
                  value={customRegion}
                  onChange={(e) => setCustomRegion(e.target.value)}
                  placeholder="Enter custom territory name"
                  className="mt-2 w-full px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-mono font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                XP COMPLETION REWARD
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="50"
                  max="500"
                  step="25"
                  value={xpReward}
                  onChange={(e) => setXpReward(Number(e.target.value))}
                  className="flex-1 accent-cyan-400"
                />
                <span className="font-mono text-xs font-bold text-yellow-300 w-16 text-right">
                  +{xpReward} XP
                </span>
              </div>
            </div>
          </div>

          {/* Prerequisites Selection */}
          <div>
            <label className="block text-xs font-mono font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              PREREQUISITE LANDMARKS (CONNECTING HIGHWAYS)
            </label>
            <div className="max-h-36 overflow-y-auto p-2 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
              {existingNodes.length > 0 ? (
                existingNodes.map((n) => {
                  const isChecked = selectedPrereqIds.includes(n.id);
                  return (
                    <label
                      key={n.id}
                      className={`flex items-center gap-2 p-1.5 rounded text-xs font-mono cursor-pointer transition-colors ${
                        isChecked ? 'bg-cyan-950/40 text-cyan-200' : 'text-slate-400 hover:bg-slate-900'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handlePrereqToggle(n.id)}
                        className="rounded accent-cyan-500"
                      />
                      <span className="truncate">{n.title}</span>
                      <span className="text-[10px] text-slate-500 ml-auto shrink-0">{n.region}</span>
                    </label>
                  );
                })
              ) : (
                <p className="text-xs text-slate-500 p-1">No existing nodes. This will be a root landmark.</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-mono font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-cyan-400" />
              RESEARCH NOTES & OBJECTIVES (Markdown supported)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="- Objective 1: Master vertex shaders&#10;- Objective 2: Render animated wave heights"
              className="w-full px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors leading-relaxed"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-mono font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-cyan-400" />
              TAGS (Comma separated)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. webgl, shaders, graphics"
              className="w-full px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* Submit Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-mono font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl text-xs font-mono font-bold flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-lg shadow-cyan-950/50 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Spawn 3D Landmark
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default AddQuestModal;
