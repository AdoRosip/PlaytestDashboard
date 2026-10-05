'use client';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { getTesterDisplayName } from '@/lib/testerIdentity';
import TesterProfile from './TesterProfile';
import s from './TesterProfile.module.css';

export default function TesterProfileModal() {
  const open = useDashboardStore(state => state.testerPanelOpen);
  const tester = useDashboardStore(state => state.testers.find(t => t.id === state.activeTesterId));
  const close = useDashboardStore(state => state.closeTesterPanel);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopImmediatePropagation(); close(); return; }
      if (event.key !== 'Tab') return;
      const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])') ?? []).filter(el => el.tabIndex !== -1 && el.getClientRects().length);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const trap = (event: FocusEvent) => { if (!dialog.current?.contains(event.target as Node)) closeButton.current?.focus(); };
    window.addEventListener('keydown', keyboard, true);
    document.addEventListener('focusin', trap);
    return () => {
      window.removeEventListener('keydown', keyboard, true); document.removeEventListener('focusin', trap);
      document.body.style.overflow = previousOverflow; previousFocus?.focus({ preventScroll: true });
    };
  }, [open, close]);
  if (!open) return null;
  return createPortal(<div className={s.dossier}>
    <div className={s.overlay} onClick={close} aria-hidden="true" />
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={tester ? getTesterDisplayName(tester) : 'Tester profile'} className={`${s.container} ${s.dialog}`}>
      <div className={s.dialogHeader}><button ref={closeButton} onClick={close} aria-label="Close tester profile" className={s.close}><X size={18} /></button></div>
      <div className={s.dialogScroll}>{tester ? <TesterProfile key={tester.id} tester={tester} /> : <p className={s.empty}>Tester not found</p>}</div>
    </div>
  </div>, document.body);
}
