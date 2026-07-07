import { Info } from 'lucide-react';

/** Small hover-info icon with a tooltip bubble. */
export default function InfoTooltip({ text }: { text: string }) {
  return (
    <div className="relative group ml-auto flex-shrink-0">
      <Info className="w-3 h-3 text-slate-600 hover:text-slate-400 cursor-help transition-colors" />
      <div className="absolute bottom-full right-0 mb-2 w-56 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-[11px] text-slate-300 leading-relaxed shadow-xl invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-150 z-50 pointer-events-none">
        {text}
        <span className="absolute top-full right-2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-700" />
      </div>
    </div>
  );
}
