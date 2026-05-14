import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Laptop,
  Moon,
  Palette,
  Sparkles,
  Sun,
  Waves
} from "lucide-react";
import clsx from "clsx";
import { useTheme } from "next-themes";
import type { LucideIcon } from "lucide-react";
import type { AppTheme } from "../providers/theme-provider";

type ThemeOption = {
  value: AppTheme;
  label: string;
  description: string;
  icon: LucideIcon;
};

const THEME_OPTIONS: ThemeOption[] = [
  { value: "light", label: "Light", description: "Soft white surfaces with blue accents.", icon: Sun },
  { value: "dark", label: "Dark", description: "Muted zinc-style dark mode.", icon: Moon },
  { value: "midnight", label: "Midnight", description: "Deep navy enterprise contrast.", icon: Sparkles },
  { value: "ocean", label: "Ocean", description: "Professional blue-tinted workspace.", icon: Waves },
  { value: "glass", label: "Glass", description: "Translucent surfaces with blur.", icon: Palette },
  { value: "system", label: "System", description: "Follow the operating system theme.", icon: Laptop }
];

export function ThemeSwitcher({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme, theme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const selectedTheme = mounted ? theme ?? "system" : "system";
  const activeTheme = mounted ? resolvedTheme ?? "light" : "light";
  const selectedOption = THEME_OPTIONS.find((option) => option.value === selectedTheme) ?? THEME_OPTIONS[5];

  return (
    <div ref={containerRef} className={clsx("relative", className)}>
      <button
        type="button"
        className="topbar-profile-trigger inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select color theme"
        onClick={() => setIsOpen((current) => !current)}
      >
        <selectedOption.icon className="h-4 w-4" />
        <span className="hidden sm:inline">{selectedOption.label}</span>
        <span className="hidden text-[10px] font-medium text-topbar-foreground/60 lg:inline">
          {selectedTheme === "system" ? `Auto · ${capitalize(activeTheme)}` : selectedOption.description}
        </span>
        <ChevronDown className={clsx("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      {isOpen ? (
        <div className="theme-switcher-panel absolute right-0 top-11 z-[140]" role="listbox" aria-label="Theme options">
          {THEME_OPTIONS.map((option) => {
            const isSelected = selectedTheme === option.value;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-active={isSelected}
                className="theme-switcher-option"
                onClick={() => {
                  setTheme(option.value);
                  setIsOpen(false);
                }}
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-foreground">
                  <option.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-card-foreground">{option.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{option.description}</span>
                </span>
                {isSelected ? <Check className="h-4 w-4 text-primary" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}