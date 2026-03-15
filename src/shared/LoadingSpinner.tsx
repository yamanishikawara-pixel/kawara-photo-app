export function LoadingSpinner({ label = '読み込み中...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-10 text-center" role="status" aria-live="polite">
      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-gray-600 font-medium">{label}</p>
    </div>
  );
}
