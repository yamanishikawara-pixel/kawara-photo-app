import { X } from 'lucide-react';

type Props = {
  message: string;
  onDismiss?: () => void;
};

export function ErrorMessage({ message, onDismiss }: Props) {
  return (
    <div
      className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800"
      role="alert"
    >
      <p className="flex-1 font-medium">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded hover:bg-red-100 transition-colors"
          aria-label="エラーメッセージを閉じる"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
