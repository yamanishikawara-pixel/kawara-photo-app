import { useEffect } from 'react';
import { X } from 'lucide-react';

type Props = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'はい',
  cancelLabel = 'キャンセル',
  variant = 'danger',
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const isDanger = variant === 'danger';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
    >
      <div
        className="w-full max-w-sm rounded-2xl p-5 sm:p-6 text-left"
        style={{ background: '#1c1c30', border: '1px solid #2e2e50', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 id="confirm-modal-title" className="text-lg font-bold break-words pr-3" style={{ color: '#f0ede8' }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded transition-colors"
            style={{ color: '#8b8ba8' }}
            onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')}
            onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
            aria-label="キャンセル"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p id="confirm-modal-desc" className="text-sm mb-6 whitespace-pre-line break-words" style={{ color: '#8b8ba8' }}>
          {message}
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 font-bold rounded-xl border transition-colors text-sm"
            style={{ borderColor: '#2e2e50', color: '#8b8ba8', background: 'transparent' }}
            onPointerEnter={e => { e.currentTarget.style.borderColor = '#f0ede8'; e.currentTarget.style.color = '#f0ede8'; }}
            onPointerLeave={e => { e.currentTarget.style.borderColor = '#2e2e50'; e.currentTarget.style.color = '#8b8ba8'; }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-3 font-bold rounded-xl text-sm transition-colors"
            style={isDanger
              ? { background: '#ef4444', color: '#fff' }
              : { background: '#ff6b35', color: '#fff' }
            }
            onPointerEnter={e => (e.currentTarget.style.opacity = '0.85')}
            onPointerLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
