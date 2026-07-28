"use client";

import { gsap } from "gsap";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

export interface StaggeredMenuItem {
  label: string;
  ariaLabel: string;
  link: string;
}

interface StaggeredMenuProps {
  items: StaggeredMenuItem[];
  position?: "left" | "right";
  colors?: string[];
  logoText?: string;
  accentColor?: string;
  displayItemNumbering?: boolean;
}

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function StaggeredMenu({
  items,
  position = "right",
  colors = ["#b497cf", "#5227ff"],
  logoText = "音屿",
  accentColor = "#6d28d9",
  displayItemNumbering = true,
}: StaggeredMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const layersRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef(false);
  const offscreen = position === "left" ? -100 : 100;

  useIsomorphicLayoutEffect(() => {
    const context = gsap.context(() => {
      const panel = panelRef.current;
      const layers = layersRef.current?.querySelectorAll<HTMLElement>("[data-menu-layer]");
      if (panel && layers) gsap.set([panel, ...layers], { xPercent: offscreen });
    }, rootRef);
    return () => context.revert();
  }, [offscreen]);

  useEffect(() => {
    const panel = panelRef.current;
    const layers = layersRef.current?.querySelectorAll<HTMLElement>("[data-menu-layer]");
    if (!panel || !layers) return;
    const labels = panel.querySelectorAll<HTMLElement>("[data-menu-item-label]");

    if (!hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
      return;
    }

    gsap.killTweensOf([panel, ...layers, ...labels]);
    if (open) {
      const timeline = gsap.timeline();
      timeline.to(layers, { xPercent: 0, duration: 0.48, ease: "power4.out", stagger: 0.07 });
      timeline.to(panel, { xPercent: 0, duration: 0.62, ease: "power4.out" }, 0.1);
      timeline.fromTo(
        labels,
        { yPercent: 135, rotate: 8 },
        { yPercent: 0, rotate: 0, duration: 0.82, ease: "power4.out", stagger: 0.09 },
        0.28,
      );
      return;
    }

    gsap.to([panel, ...layers], { xPercent: offscreen, duration: 0.32, ease: "power3.in", stagger: 0.03 });
  }, [offscreen, open]);

  const closeMenu = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) closeMenu();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [closeMenu, open]);

  const sideClass = position === "left" ? "left-0" : "right-0";

  return (
    <div ref={rootRef} className="pointer-events-none fixed inset-0 z-40" style={{ "--menu-accent": accentColor } as CSSProperties}>
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between px-5 py-5 sm:px-8 sm:py-7">
        <Link href="/" className="pointer-events-auto flex items-center gap-2 text-lg font-semibold text-slate-900" aria-label="返回我的音乐">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xl text-white shadow-lg shadow-violet-500/25">♫</span>
          {logoText}
        </Link>
        <button
          type="button"
          aria-label={open ? "关闭导航" : "打开导航"}
          aria-expanded={open}
          aria-controls="primary-navigation"
          onClick={() => setOpen((value) => !value)}
          className={`pointer-events-auto inline-flex items-center gap-3 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
            open ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white/90 text-slate-800 shadow-sm backdrop-blur hover:border-violet-300 hover:text-violet-700"
          }`}
        >
          {open ? "关闭" : "导航"}
          <span className="relative h-3.5 w-3.5" aria-hidden="true">
            <span className={`absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 rounded bg-current transition-transform duration-300 ${open ? "rotate-45" : ""}`} />
            <span className={`absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 rounded bg-current transition-transform duration-300 ${open ? "-rotate-45" : "rotate-90"}`} />
          </span>
        </button>
      </header>

      <div ref={layersRef} aria-hidden="true" className={`pointer-events-none absolute inset-y-0 ${sideClass} z-10 w-full max-w-[460px]`}>
        {colors.slice(0, 3).map((color) => <div key={color} data-menu-layer className="absolute inset-0" style={{ backgroundColor: color }} />)}
      </div>

      <aside
        id="primary-navigation"
        ref={panelRef}
        aria-hidden={!open}
        className={`pointer-events-auto absolute inset-y-0 ${sideClass} z-20 flex w-full max-w-[460px] flex-col items-start justify-start bg-white px-7 pb-8 pt-28 text-left shadow-2xl sm:px-10 sm:pt-32`}
      >
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">Navigation</p>
        <nav aria-label="主导航" className="staggered-menu-nav w-full self-start text-left">
          <ul className="staggered-menu-list m-0 list-none space-y-2 p-0">
            {items.map((item, index) => (
              <li key={item.link} className="staggered-menu-list-item overflow-hidden">
                <Link href={item.link} aria-label={item.ariaLabel} onClick={closeMenu} className="staggered-menu-item group flex items-start justify-start gap-4 py-1 text-left text-[clamp(2.2rem,7vw,4rem)] font-semibold leading-none tracking-[-0.05em] text-slate-950">
                  {displayItemNumbering ? <span className="mt-1 text-xs font-medium tracking-normal text-violet-600">{String(index + 1).padStart(2, "0")}</span> : null}
                  <span data-menu-item-label className="staggered-menu-item-label inline-block origin-bottom">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="mt-auto border-t border-slate-200 pt-5 text-sm text-slate-500">音乐、歌单与播放记录，都会在这里慢慢汇集。</p>
      </aside>

      <style>{`
        .staggered-menu-item-label {
          transition: color 180ms ease;
        }

        #primary-navigation,
        .staggered-menu-nav,
        .staggered-menu-list,
        .staggered-menu-list-item,
        .staggered-menu-item {
          align-items: flex-start !important;
          justify-content: flex-start !important;
          text-align: left !important;
        }

        .staggered-menu-list {
          display: flex !important;
          width: 100% !important;
          flex-direction: column !important;
        }

        .staggered-menu-list-item,
        .staggered-menu-item {
          width: 100% !important;
        }

        .staggered-menu-item:hover .staggered-menu-item-label,
        .staggered-menu-item:focus-visible .staggered-menu-item-label {
          color: var(--menu-accent) !important;
        }
      `}</style>
    </div>
  );
}
