"use client";

import { useLayoutEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Check } from "lucide-react";
import { FLOW_STEPS, SCRUB_WORDS } from "./data";
import { cn } from "@/lib/cn";

gsap.registerPlugin(ScrollTrigger);

export function GsapPinFlow({ className }: { className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useLayoutEffect(() => {
    if (reduce || !root.current) return;
    const ctx = gsap.context(() => {
      const pin = root.current?.querySelector("[data-pin-title]");
      const cards = gsap.utils.toArray<HTMLElement>(
        root.current?.querySelectorAll("[data-flow-card]") ?? [],
      );
      if (pin && window.matchMedia("(min-width: 1024px)").matches) {
        ScrollTrigger.create({
          trigger: root.current,
          start: "top top+=96",
          end: "bottom bottom",
          pin,
          pinSpacing: false,
        });
      }
      cards.forEach((card) => {
        gsap.fromTo(
          card,
          { scale: 0.88, opacity: 0.35 },
          {
            scale: 1,
            opacity: 1,
            ease: "none",
            scrollTrigger: {
              trigger: card,
              start: "top 85%",
              end: "top 35%",
              scrub: true,
            },
          },
        );
      });
    }, root);
    return () => ctx.revert();
  }, [reduce]);

  return (
    <div
      ref={root}
      className={cn(
        "grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16",
        className,
      )}
    >
      <div data-pin-title className="lg:self-start">
        <h2 className="max-w-md text-[clamp(1.75rem,3vw,2.75rem)] font-bold leading-[1.15] tracking-tight text-[#0F4C75]">
          Satu transaksi menggerakkan seluruh proses
        </h2>
        <p className="mt-5 max-w-sm text-base leading-relaxed text-[#1B262C]/60">
          Setiap dokumen saling terhubung. Tidak perlu memasukkan ulang informasi
          atau menyusun laporan secara manual.
        </p>
      </div>
      <div className="space-y-5 pb-8">
        {FLOW_STEPS.map((step, i) => (
          <div
            key={step.label}
            data-flow-card
            className="group overflow-hidden rounded-2xl border border-[#e8eef3] bg-white p-6 shadow-[0_8px_30px_rgba(15,76,117,0.06)] transition-transform duration-700 ease-out hover:scale-[1.02]"
          >
            <div className="flex items-start gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#0F4C75] text-sm font-bold text-white">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div>
                <div className="text-lg font-semibold text-[#0F4C75]">
                  {step.label}
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm text-[#1B262C]/55">
                  <Check className="size-3.5 text-[#3282B8]" />
                  {step.detail}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GsapScrubText({ className }: { className?: string }) {
  const root = useRef<HTMLParagraphElement>(null);
  const reduce = useReducedMotion();
  const words = SCRUB_WORDS.split(" ");

  useLayoutEffect(() => {
    if (reduce || !root.current) return;
    const ctx = gsap.context(() => {
      const spans = root.current?.querySelectorAll("span[data-word]");
      if (!spans?.length) return;
      gsap.fromTo(
        spans,
        { opacity: 0.12 },
        {
          opacity: 1,
          stagger: 0.08,
          ease: "none",
          scrollTrigger: {
            trigger: root.current,
            start: "top 75%",
            end: "bottom 40%",
            scrub: true,
          },
        },
      );
    }, root);
    return () => ctx.revert();
  }, [reduce]);

  return (
    <p
      ref={root}
      className={cn(
        "mx-auto max-w-4xl text-center text-[clamp(1.35rem,2.8vw,2.15rem)] font-semibold leading-snug tracking-tight text-[#0F4C75]",
        className,
      )}
    >
      {words.map((w, i) => (
        <span key={`${w}-${i}`} data-word className="inline">
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}
