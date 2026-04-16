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
  if (!isOpen) return null;

  const isDanger = variant === 'danger';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: '#1c1c30', border: '1px solid #2e2e50', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 id="confirm-modal-title" className="text-lg font-bold" style={{ color: '#f0ede8' }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded transition-colors"
            style={{ color: '#8b8ba8' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#f0ede8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
            aria-label="キャンセル"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p id="confirm-modal-desc" className="text-sm mb-6 whitespace-pre-line" style={{ color: '#8b8ba8' }}>
          {message}
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 font-bold rounded-xl border transition-colors text-sm"
            style={{ borderColor: '#2e2e50', color: '#8b8ba8', background: 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#f0ede8'; e.currentTarget.style.color = '#f0ede8'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2e2e50'; e.currentTarget.style.color = '#8b8ba8'; }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => { onConfirm(); onCancel(); }}
            className="flex-1 py-3 font-bold rounded-xl text-sm transition-colors"
            style={isDanger
              ? { background: '#ef4444', color: '#fff' }
              : { background: '#ff6b35', color: '#fff' }
            }
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
