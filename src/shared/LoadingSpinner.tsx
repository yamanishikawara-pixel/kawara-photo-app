export function LoadingSpinner({ label = '読み込み中...' }: { label?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center p-10 text-center min-h-[200px]"
      role="status"
      aria-live="polite"
    >
      <div className="w-10 h-10 rounded-full animate-spin mb-4" style={{ border: '4px solid #2e2e50', borderTopColor: '#ff6b35' }} />
      <p className="text-sm font-medium" style={{ color: '#8b8ba8' }}>{label}</p>
    </div>
  );
}
