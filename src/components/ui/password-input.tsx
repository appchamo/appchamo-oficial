import { useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  id?: string;
  className?: string;
  /** Quando true, não mostra o ícone de cadeado (para usar dentro de InputRow que já tem ícone) */
  noIcon?: boolean;
  disabled?: boolean;
  autoComplete?: string;
}

export function PasswordInput({
  value,
  onChange,
  placeholder = "••••••••",
  label,
  id,
  className = "",
  noIcon,
  disabled,
  autoComplete,
}: PasswordInputProps) {
  const [show, setShow] = useState(false);

  const content = (
    <>
      {!noIcon && <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
      <input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        className="flex-1 min-w-0 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="flex-shrink-0 p-1 rounded text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        tabIndex={-1}
        aria-label={show ? "Ocultar senha" : "Mostrar senha"}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </>
  );

  if (noIcon) {
    return <div className={`flex items-center gap-2 flex-1 ${className}`.trim()}>{content}</div>;
  }

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground mb-1.5 block">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30">
        {content}
      </div>
    </div>
  );
}
