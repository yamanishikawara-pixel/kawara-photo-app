import type React from 'react';
import { ChevronRight } from 'lucide-react';

type MenuButtonProps = {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  onClick: () => void;
};

export function MenuButton({
  title,
  subtitle,
  icon: Icon,
  colorClass,
  onClick,
}: MenuButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      className={`w-full flex items-center gap-4 p-5 rounded-2xl border border-black/5 shadow-sm hover:shadow-md transition-all text-left ${colorClass}`}
    >
      <div className="w-[58px] h-[58px] flex-shrink-0 flex items-center justify-center bg-white/95 rounded-[16px] shadow-sm">
        <Icon className="w-6 h-6 text-gray-800" />
      </div>
      <div className="flex-1">
        <div className="text-xl font-bold text-gray-900">{title}</div>
        <div className="text-sm text-gray-500 line-clamp-2 mt-1">
          {subtitle}
        </div>
      </div>
      <ChevronRight className="w-6 h-6 text-gray-400" />
    </button>
  );
}

type InputFieldProps = {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  bgColor?: string;
  id?: string;
};

export function InputField({
  label,
  placeholder,
  value,
  onChange,
  bgColor,
  id,
}: InputFieldProps) {
  const fieldId = id ?? `input-${label.replace(/\s/g, '-')}`;
  return (
    <div className={`p-5 rounded-xl mb-4 ${bgColor ?? ''}`}>
      <label htmlFor={fieldId} className="block text-base font-bold text-gray-800 mb-2">
        {label}
      </label>
      <input
        id={fieldId}
        type="text"
        className="w-full p-3.5 text-lg border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

