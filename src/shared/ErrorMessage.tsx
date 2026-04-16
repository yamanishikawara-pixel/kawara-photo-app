import { X } from 'lucide-react';

type Props = {
  message: string;
  onDismiss?: () => void;
};

export function ErrorMessage({ message, onDismiss }: Props) {
  return (
    <div
      className="flex items-center gap-3 p-4 rounded-xl"
      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}
      role="alert"
    >
      <p className="flex-1 text-sm font-medium">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded transition-colors shrink-0"
          style={{ color: '#f87171' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          aria-label="エラーメッセージを閉じる"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
