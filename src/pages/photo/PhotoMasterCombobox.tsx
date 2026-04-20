import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PhotoMaster } from '../../types';

export function PhotoMasterCombobox({
  masters,
  onApply,
}: {
  masters: PhotoMaster[];
  onApply: (m: PhotoMaster) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? masters.filter((m) => m.name.includes(query.trim()) || m.process.includes(query.trim()))
    : masters;

  useEffect(() => {
    const handler = (e: globalThis.MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (m: PhotoMaster) => {
    setOpen(false);
    onApply(m);
  };

  if (masters.length === 0) return null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); setQuery(''); setOpen((o) => !o); }}
        className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
        style={{ color: '#ff6b35', background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.25)' }}
      >
        テンプレート <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-64 rounded-xl shadow-xl overflow-hidden" style={{ background: '#1c1c30', border: '1px solid #2e2e50' }}>
          <div className="p-2 border-b" style={{ borderColor: '#2e2e50' }}>
            <input
              type="text"
              placeholder="絞り込み..."
              className="w-full px-3 py-2 text-sm rounded-lg outline-none"
              style={{ background: '#12122a', border: '1px solid #3d3d60', color: '#f0ede8' }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-center" style={{ color: '#6b7280' }}>該当なし</li>
            ) : (
              filtered.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3 transition-colors border-b last:border-none"
                    style={{ borderColor: '#2e2e50' }}
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(m); }}
                    onPointerEnter={e => (e.currentTarget.style.background = '#2e2e50')}
                    onPointerLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div className="font-bold text-sm" style={{ color: '#f0ede8' }}>{m.name}</div>
                    {m.process && <div className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{m.process}</div>}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
