import { MapPin, X } from 'lucide-react';
import type { MapPin as MapPinT } from '../../types';

export function PinSelectModal({ isOpen, onClose, pins, onSelect }: {
  isOpen: boolean;
  onClose: () => void;
  pins: MapPinT[] | undefined;
  onSelect: (label: string) => void;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full max-w-sm p-6 rounded-2xl shadow-2xl space-y-5" style={{ background: '#1c1c30', border: '1px solid #2e2e50' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center pb-3 border-b" style={{ borderColor: '#2e2e50' }}>
          <h3 className="text-base font-black flex items-center gap-2" style={{ color: '#f0ede8' }}>
            <MapPin className="w-5 h-5" style={{ color: '#ef4444' }} /> 位置図の場所を選択
          </h3>
          <button onClick={onClose} aria-label="閉じる" className="p-1.5 rounded-lg transition-colors" style={{ color: '#8b8ba8' }} onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')} onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}>
            <X className="w-5 h-5" />
          </button>
        </div>
        {pins && pins.length > 0 ? (
          <div className="grid grid-cols-3 gap-2.5 max-h-[60vh] overflow-y-auto pr-1">
            {pins.map((pin) => (
              <button
                key={pin.id}
                onClick={() => { onSelect(pin.label); onClose(); }}
                className="font-black py-3 text-center rounded-xl text-sm transition-all active:scale-95"
                style={{ background: '#12122a', border: '1px solid #2e2e50', color: '#f0ede8' }}
                onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#ef4444'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; }}
                onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2e2e50'; (e.currentTarget as HTMLButtonElement).style.color = '#f0ede8'; }}
              >
                {pin.label}
              </button>
            ))}
            <button onClick={() => { onSelect(""); onClose(); }} className="col-span-3 font-bold py-2.5 rounded-xl mt-1 transition-colors text-sm" style={{ background: '#12122a', color: '#8b8ba8', border: '1px solid #2e2e50' }}>
              選択を解除
            </button>
          </div>
        ) : (
          <div className="text-center py-10 px-4 rounded-2xl border-2 border-dashed" style={{ borderColor: '#2e2e50' }}>
            <p className="font-bold text-sm leading-relaxed" style={{ color: '#6b7280' }}>
              先に位置図画面で<br /><span style={{ color: '#ef4444' }}>マーカー（符号）</span>を<br />打ってください
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
