"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  LoginLink,
  RegisterLink,
} from "@kinde-oss/kinde-auth-nextjs/components";
import {
  Accordion,
  Avatar,
  Button,
  Card,
  Chip,
  Drawer,
  Dropdown,
  Input,
  Label,
  Link,
  Modal,
  Separator,
  Tabs,
  TextField,
  Typography,
} from "@heroui/react";
import {
  ArrowRight,
  CircleHelp,
  ClipboardList,
  Layers,
  Menu,
  MessageCircle,
  Package,
  Quote,
  Rocket,
  Sparkles,
  Star,
  type LucideIcon,
} from "lucide-react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { toast } from "@/components/heroui-kit";
import { cn } from "@/lib/cn";
import {
  AI_INSIGHTS,
  BENTO,
  CLIENT_PLACEHOLDERS,
  FAQS,
  NAV_LINKS,
  PAINS,
  PRICING,
  PRODUCTS,
  STATS,
  TESTIMONIALS,
  USPS,
  WA,
} from "./marketing/data";
import { GsapPinFlow, GsapScrubText } from "./marketing/gsap-sections";

const easeOut = [0.22, 1, 0.36, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: easeOut },
  },
};

const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.45, ease: easeOut } },
};

const stagger: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.06 },
  },
};

function MotionSection({
  children,
  className,
  id,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      id={id}
      className={className}
      initial={reduce ? false : "hidden"}
      whileInView="show"
      viewport={{ once: true, margin: "-80px 0px" }}
      variants={{
        hidden: {},
        show: {
          transition: { staggerChildren: 0.08, delayChildren: delay },
        },
      }}
    >
      {children}
    </motion.section>
  );
}

function FadeUp({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      transition={{ duration: 0.55, ease: easeOut, delay }}
      initial={reduce ? false : undefined}
    >
      {children}
    </motion.div>
  );
}

function Stagger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={stagger}>
      {children}
    </motion.div>
  );
}

function FadeItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      {children}
    </motion.div>
  );
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function BrandMark({ light }: { light?: boolean }) {
  return (
    <a href="#" className="flex items-center gap-2.5">
      <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0F4C75] to-[#3282B8] text-sm font-bold text-white shadow-sm">
        A
      </div>
      <div>
        <div
          className={cn(
            "text-[15px] font-bold leading-none tracking-tight",
            light ? "text-white" : "text-[#0F4C75]",
          )}
        >
          Arunika
        </div>
        <div
          className={cn(
            "text-[10px] font-medium uppercase tracking-wider",
            light ? "text-white/55" : "text-[#3282B8]",
          )}
        >
          ERP
        </div>
      </div>
    </a>
  );
}

function ConsultModal({ trigger }: { trigger: React.ReactNode }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <Modal>
      <Modal.Trigger>{trigger}</Modal.Trigger>
      <Modal.Backdrop>
        <Modal.Container size="md" placement="center">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Konsultasi Arunika ERP</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="space-y-3">
              <Typography.Paragraph size="sm" className="text-muted">
                Ceritakan kebutuhan bisnis Anda. Tim kami akan membantu memilih
                modul dan jadwal demo.
              </Typography.Paragraph>
              <TextField>
                <Label>Nama</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama lengkap"
                />
              </TextField>
              <TextField>
                <Label>Email bisnis</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@perusahaan.com"
                />
              </TextField>
            </Modal.Body>
            <Modal.Footer className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                isPending={loading}
                onPress={() => {
                  if (!name.trim() || !email.trim()) {
                    toast.danger("Lengkapi nama dan email");
                    return;
                  }
                  setLoading(true);
                  window.setTimeout(() => {
                    setLoading(false);
                    toast.success(
                      "Permintaan terkirim. Tim akan menghubungi Anda.",
                    );
                    setName("");
                    setEmail("");
                  }, 700);
                }}
              >
                Kirim permintaan
              </Button>
              <a href={WA} target="_blank" rel="noreferrer">
                <Button variant="secondary">
                  <MessageCircle className="mr-1.5 size-4" />
                  WhatsApp
                </Button>
              </a>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-[#BBE1FA]/50 via-transparent to-[#3282B8]/20 blur-2xl" />
      <div className="relative overflow-hidden rounded-3xl border border-[#e8eef3] bg-white/90 shadow-[0_24px_80px_rgba(15,76,117,0.14)] backdrop-blur">
        <div className="flex items-center gap-2 border-b border-[#eef2f6] px-4 py-3">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-2 text-xs font-medium text-[#1B262C]/45">
            Dashboard · data simulasi
          </span>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-gradient-to-br from-[#0F4C75] to-[#3282B8] p-4 text-white sm:col-span-2">
            <div className="text-xs font-medium text-white/65">
              Penjualan bulan ini
            </div>
            <div className="mt-1 text-2xl font-bold tracking-tight">
              Rp486.500.000
            </div>
            <div className="mt-2 text-xs font-semibold text-[#BBE1FA]">
              +12,8% vs bulan lalu
            </div>
          </div>
          <div className="rounded-2xl border border-[#e8eef3] bg-[#f7fafc] p-4">
            <div className="text-xs text-[#1B262C]/50">Invoice jatuh tempo</div>
            <div className="mt-1 text-lg font-bold text-[#0F4C75]">
              Rp38.200.000
            </div>
            <div className="mt-1 text-xs text-[#3282B8]">8 invoice</div>
          </div>
          <div className="rounded-2xl border border-[#e8eef3] bg-[#f7fafc] p-4">
            <div className="text-xs text-[#1B262C]/50">Stok perlu perhatian</div>
            <div className="mt-1 text-lg font-bold text-[#0F4C75]">14 item</div>
            <div className="mt-1 text-xs text-[#3282B8]">Multi-gudang</div>
          </div>
          <div className="rounded-2xl border border-[#e8eef3] bg-white p-3 sm:col-span-2">
            <div className="mb-2 text-xs font-semibold text-[#0F4C75]">
              Aktivitas terbaru
            </div>
            <ul className="space-y-2 text-xs text-[#1B262C]/65">
              <li className="flex justify-between gap-2">
                <span>SO-24081 dikirim</span>
                <span className="text-[#3282B8]">Baru</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>INV-1192 dibayar sebagian</span>
                <span className="text-[#3282B8]">Kas</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>AI: stok SKU-A 9 hari</span>
                <span className="text-[#0F4C75]">Insight</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function HorizontalModules() {
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();

  return (
    <div className="mt-12 flex flex-col gap-3 lg:flex-row lg:h-[420px]">
      {PRODUCTS.slice(0, 6).map((p, i) => {
        const Icon = p.icon;
        const open = active === i;
        return (
          <button
            key={p.key}
            type="button"
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            className={cn(
              "group relative overflow-hidden rounded-3xl border border-[#e8eef3] text-left transition-all duration-700 ease-out",
              open
                ? "flex-[2.2] bg-[#0F4C75] text-white shadow-lg"
                : "flex-1 bg-white text-[#0F4C75] hover:border-[#3282B8]/40",
            )}
          >
            <div
              className={cn(
                "absolute inset-0 bg-cover bg-center opacity-0 transition duration-700",
                open && "opacity-30 mix-blend-luminosity",
              )}
              style={{
                backgroundImage: `url(https://picsum.photos/seed/arunika-${p.key}/900/700)`,
              }}
            />
            <div className="relative flex h-full flex-col justify-between p-5 md:p-6">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex size-10 items-center justify-center rounded-xl",
                    open ? "bg-white/15 text-white" : "bg-[#E8F4FC] text-[#0F4C75]",
                  )}
                >
                  <Icon className="size-5" />
                </div>
                {!open ? (
                  <span className="text-sm font-semibold writing-mode-vertical lg:rotate-0">
                    {p.name}
                  </span>
                ) : null}
              </div>
              <AnimatePresence mode="wait">
                {open ? (
                  <motion.div
                    key={p.key}
                    initial={reduce ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.35, ease: easeOut }}
                    className="mt-6"
                  >
                    <div className="text-xl font-bold md:text-2xl">{p.name}</div>
                    <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/80">
                      {p.benefit}
                    </p>
                    <p className="mt-3 max-w-sm text-xs text-white/55">{p.desc}</p>
                    <span className="mt-6 inline-flex items-center text-sm font-semibold text-[#BBE1FA]">
                      Pelajari modul
                      <ArrowRight className="ml-1.5 size-4" />
                    </span>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function MarketingHome() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <main className="overflow-x-hidden w-full max-w-full min-h-screen bg-white text-[#1B262C]">
      {/* Floating glass nav */}
      <motion.header
        className={cn(
          "fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3 md:px-6",
        )}
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: easeOut }}
      >
        <div
          className={cn(
            "flex h-14 w-full max-w-6xl items-center justify-between gap-3 rounded-full border px-3 pl-4 pr-2 transition-all duration-300 md:h-[3.75rem] md:px-4",
            scrolled
              ? "border-white/60 bg-white/85 shadow-[0_12px_40px_rgba(15,76,117,0.12)] backdrop-blur-xl"
              : "border-[#e8eef3]/80 bg-white/70 backdrop-blur-md",
          )}
        >
          <div className="flex min-w-0 items-center gap-6">
            <BrandMark />
            <nav className="hidden items-center gap-0.5 lg:flex">
              <Dropdown>
                <Button
                  variant="ghost"
                  size="sm"
                  className="font-medium text-[#1B262C]/80"
                >
                  <Package className="mr-1.5 size-3.5 opacity-70" />
                  Produk
                </Button>
                <Dropdown.Popover
                  placement="bottom start"
                  className="min-w-[300px]"
                >
                  <Dropdown.Menu onAction={() => scrollTo("produk")}>
                    {PRODUCTS.map((p) => {
                      const Icon = p.icon;
                      return (
                        <Dropdown.Item
                          key={p.key}
                          id={p.key}
                          textValue={p.name}
                        >
                          <div className="flex items-center gap-2">
                            <Icon className="size-3.5 text-[#0F4C75]" />
                            <Label>{p.name}</Label>
                          </div>
                        </Dropdown.Item>
                      );
                    })}
                    <Dropdown.Item key="all" id="all" textValue="Lihat semua">
                      <div className="flex items-center gap-2">
                        <Layers className="size-3.5 text-[#0F4C75]" />
                        <Label>Lihat semua modul</Label>
                      </div>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
              {NAV_LINKS.filter((n) => n.id !== "produk").map((n) => {
                const Icon = n.icon;
                return (
                  <Button
                    key={n.id}
                    variant="ghost"
                    size="sm"
                    className="font-medium text-[#1B262C]/80"
                    onPress={() => scrollTo(n.id)}
                  >
                    <Icon className="mr-1.5 size-3.5 opacity-70" />
                    {n.label}
                  </Button>
                );
              })}
            </nav>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <LoginLink>
              <Button variant="ghost" size="sm" className="font-medium">
                Masuk
              </Button>
            </LoginLink>
            <a href={WA} target="_blank" rel="noreferrer">
              <Button
                variant="primary"
                size="sm"
                className="rounded-full bg-[#0F4C75] px-4 font-semibold text-white data-[hovered=true]:bg-[#0c3d5c]"
              >
                WhatsApp
              </Button>
            </a>
            <RegisterLink>
              <Button
                variant="secondary"
                size="sm"
                className="rounded-full border-[#0F4C75]/25 font-semibold text-[#0F4C75]"
              >
                Coba gratis
              </Button>
            </RegisterLink>
          </div>

          <Drawer>
            <Drawer.Trigger>
              <Button
                variant="secondary"
                size="sm"
                isIconOnly
                className="lg:hidden"
                aria-label="Menu"
              >
                <Menu className="size-4" />
              </Button>
            </Drawer.Trigger>
            <Drawer.Backdrop>
              <Drawer.Content placement="left" className="w-[min(100%,20rem)]">
                <Drawer.Dialog>
                  <Drawer.Header className="border-b border-border">
                    <Drawer.Heading>Arunika ERP</Drawer.Heading>
                    <Drawer.CloseTrigger />
                  </Drawer.Header>
                  <Drawer.Body className="flex flex-col gap-1 p-3">
                    {NAV_LINKS.map((n) => {
                      const Icon = n.icon;
                      return (
                        <Button
                          key={n.id}
                          variant="ghost"
                          className="justify-start"
                          onPress={() => scrollTo(n.id)}
                        >
                          <Icon className="mr-2 size-4 text-[#0F4C75]" />
                          {n.label}
                        </Button>
                      );
                    })}
                    <Separator className="my-2" />
                    <LoginLink>
                      <Button variant="secondary" className="w-full">
                        Masuk
                      </Button>
                    </LoginLink>
                    <RegisterLink>
                      <Button variant="primary" className="w-full bg-[#0F4C75]">
                        Coba gratis
                      </Button>
                    </RegisterLink>
                    <a
                      href={WA}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full"
                    >
                      <Button variant="secondary" className="w-full">
                        <MessageCircle className="mr-1.5 size-4" />
                        WhatsApp
                      </Button>
                    </a>
                  </Drawer.Body>
                </Drawer.Dialog>
              </Drawer.Content>
            </Drawer.Backdrop>
          </Drawer>
        </div>
      </motion.header>

      {/* Attention — Editorial Split hero */}
      <section className="relative mkt-radial pt-28 md:pt-36">
        <div className="pointer-events-none absolute inset-0 mkt-grain opacity-60" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-24 pt-8 md:px-8 md:pb-32 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <motion.div
            initial="hidden"
            animate="show"
            variants={stagger}
            className="min-w-0"
          >
            <motion.h1
              variants={fadeUp}
              className="max-w-5xl text-[clamp(2.75rem,5vw,4.5rem)] font-bold leading-[1.08] tracking-tight text-[#0F4C75]"
            >
              Kelola seluruh bisnis{" "}
              <span
                className="mx-1.5 inline-block h-9 w-20 rounded-full bg-cover bg-center align-middle shadow-inner md:h-11 md:w-28"
                style={{
                  backgroundImage:
                    "url(https://picsum.photos/seed/arunika-inline/200/80)",
                  filter: "grayscale(20%) contrast(1.1)",
                }}
              />{" "}
              dalam satu alur terhubung
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mt-6 max-w-xl text-base leading-relaxed text-[#1B262C]/65 md:text-lg"
            >
              Hubungkan penjualan, pembelian, inventori, akuntansi, pajak,
              produksi, dan SDM tanpa pencatatan berulang atau aplikasi yang
              terpisah.
            </motion.p>
            <motion.div
              variants={fadeUp}
              className="mt-9 flex flex-wrap items-center gap-3"
            >
              <a href={WA} target="_blank" rel="noreferrer">
                <Button
                  variant="primary"
                  size="lg"
                  className="rounded-full bg-[#0F4C75] px-7 font-semibold text-white data-[hovered=true]:bg-[#0c3d5c]"
                >
                  <MessageCircle className="mr-1.5 size-4" />
                  Coba demo interaktif
                </Button>
              </a>
              <ConsultModal
                trigger={
                  <Button
                    variant="secondary"
                    size="lg"
                    className="rounded-full border-[#0F4C75]/25 bg-white font-semibold text-[#0F4C75]"
                  >
                    Jadwalkan konsultasi
                    <ArrowRight className="ml-1.5 size-4" />
                  </Button>
                }
              />
            </motion.div>
            <motion.p
              variants={fadeIn}
              className="mt-6 text-sm text-[#1B262C]/50"
            >
              Sudah punya akun?{" "}
              <LoginLink>
                <Link className="font-semibold text-[#0F4C75]">
                  Masuk ke dashboard
                </Link>
              </LoginLink>
              {" · "}
              <RegisterLink>
                <Link className="font-semibold text-[#0F4C75]">Coba gratis</Link>
              </RegisterLink>
            </motion.p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: easeOut }}
          >
            <ProductPreview />
          </motion.div>
        </div>
      </section>

      {/* Trust marquee */}
      <section className="border-y border-[#eef2f6] bg-white py-10">
        <p className="mb-6 text-center text-sm font-medium text-[#1B262C]/50">
          Dirancang untuk bisnis Indonesia di berbagai industri
        </p>
        <div className="relative overflow-hidden">
          <div className="mkt-marquee-track flex w-max gap-3 px-4">
            {[...CLIENT_PLACEHOLDERS, ...CLIENT_PLACEHOLDERS].map(
              ({ name, icon: Icon }, i) => (
                <div
                  key={`${name}-${i}`}
                  className="flex h-12 min-w-[9rem] items-center justify-center gap-2 rounded-full border border-[#e8eef3] bg-[#f8fafc] px-5 text-sm font-semibold tracking-wide text-[#0F4C75]/75"
                >
                  <Icon className="size-4 text-[#3282B8]" />
                  {name}
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      {/* Interest — pains */}
      <MotionSection className="bg-white py-32 md:py-48">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <FadeUp className="max-w-3xl">
            <h2 className="text-[clamp(1.75rem,3vw,2.75rem)] font-bold tracking-tight text-[#0F4C75]">
              Masih mengelola bisnis dengan data yang terpisah?
            </h2>
            <p className="mt-4 max-w-2xl text-base text-[#1B262C]/60">
              Arunika menghubungkan setiap proses sehingga satu transaksi dapat
              memperbarui stok, piutang, pajak, dan laporan secara otomatis.
            </p>
          </FadeUp>
          <Stagger className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PAINS.map((p) => (
              <FadeItem key={p.title}>
                <div className="group h-full overflow-hidden rounded-3xl border border-[#e8eef3] bg-[#f7fafc] p-6 transition-transform duration-700 ease-out hover:-translate-y-1">
                  <div className="mb-4 size-1.5 rounded-full bg-[#3282B8]" />
                  <h3 className="text-lg font-semibold text-[#0F4C75]">
                    {p.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#1B262C]/60">
                    {p.desc}
                  </p>
                </div>
              </FadeItem>
            ))}
          </Stagger>
        </div>
      </MotionSection>

      {/* Interest — gapless bento */}
      <MotionSection
        id="mengapa"
        className="scroll-mt-28 bg-[#0a1620] py-32 text-white md:py-48"
      >
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <FadeUp className="max-w-3xl">
            <h2 className="text-[clamp(1.75rem,3vw,2.75rem)] font-bold tracking-tight">
              Platform yang terasa padat, bukan katalog fitur
            </h2>
            <p className="mt-4 text-white/55">
              Modul inti saling mengunci — dari gudang sampai pajak Indonesia.
            </p>
          </FadeUp>
          <Stagger className="mt-14 grid auto-rows-[minmax(160px,auto)] grid-cols-1 gap-4 grid-flow-dense md:grid-cols-6 lg:grid-cols-12">
            {BENTO.map((b) => (
              <FadeItem key={b.key} className={cn("min-h-[160px]", b.span)}>
                <div
                  className={cn(
                    "group relative h-full overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition-transform duration-700 ease-out hover:scale-[1.01]",
                    b.key === "flow" && "min-h-[320px]",
                  )}
                >
                  {"image" in b && b.image ? (
                    <div
                      className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-luminosity transition duration-700 group-hover:scale-105 group-hover:opacity-50"
                      style={{ backgroundImage: `url(${b.image})` }}
                    />
                  ) : null}
                  <div className="relative flex h-full flex-col justify-end">
                    <h3 className="text-xl font-semibold tracking-tight md:text-2xl">
                      {b.title}
                    </h3>
                    <p className="mt-2 max-w-md text-sm text-white/65">
                      {b.desc}
                    </p>
                  </div>
                </div>
              </FadeItem>
            ))}
          </Stagger>
          <Stagger className="mt-16 grid grid-cols-2 gap-4 md:grid-cols-4">
            {STATS.map((s) => {
              const Icon = s.icon;
              return (
                <FadeItem key={s.l}>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-6 text-center">
                    <Icon className="mx-auto mb-3 size-5 text-[#BBE1FA]" />
                    <div className="text-2xl font-bold text-white md:text-3xl">
                      {s.n}
                    </div>
                    <div className="mt-1 text-sm text-white/50">{s.l}</div>
                  </div>
                </FadeItem>
              );
            })}
          </Stagger>
        </div>
      </MotionSection>

      {/* Interest — horizontal modules */}
      <MotionSection
        id="produk"
        className="scroll-mt-28 bg-white py-32 md:py-48"
      >
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <FadeUp className="max-w-3xl">
            <h2 className="text-[clamp(1.75rem,3vw,2.75rem)] font-bold tracking-tight text-[#0F4C75]">
              Modul yang bisa diaktifkan sesuai tahap bisnis
            </h2>
            <p className="mt-4 text-[#1B262C]/60">
              Arahkan kursor ke panel untuk membuka detail — atau gulir di
              mobile dengan tap.
            </p>
          </FadeUp>
          <HorizontalModules />
        </div>
      </MotionSection>

      {/* Desire — GSAP pin flow */}
      <MotionSection
        id="alur"
        className="scroll-mt-28 bg-[#f5fafd] py-32 md:py-48"
      >
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <GsapPinFlow />
        </div>
      </MotionSection>

      {/* Desire — scrub text */}
      <section className="bg-white py-32 md:py-40">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <GsapScrubText />
        </div>
      </section>

      {/* Desire — AI */}
      <MotionSection className="bg-white pb-32 md:pb-48">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <FadeUp className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#3282B8]">
              <Sparkles className="size-4" />
              AI Insight
            </div>
            <h2 className="text-[clamp(1.75rem,3vw,2.75rem)] font-bold tracking-tight text-[#0F4C75]">
              Insight yang tidak berhenti di grafik
            </h2>
          </FadeUp>
          <Stagger className="mt-12 grid gap-4 md:grid-cols-2">
            {AI_INSIGHTS.map((a) => (
              <FadeItem key={a.title}>
                <div className="group h-full overflow-hidden rounded-3xl border border-[#e8eef3] bg-[#f7fafc] p-7 transition-transform duration-700 ease-out hover:-translate-y-1">
                  <h3 className="text-lg font-semibold text-[#0F4C75]">
                    {a.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#1B262C]/65">
                    {a.body}
                  </p>
                  <button
                    type="button"
                    className="mt-6 inline-flex items-center text-sm font-semibold text-[#0F4C75]"
                    onClick={() => scrollTo("harga")}
                  >
                    {a.action}
                    <ArrowRight className="ml-1.5 size-4 transition group-hover:translate-x-1" />
                  </button>
                </div>
              </FadeItem>
            ))}
          </Stagger>
        </div>
      </MotionSection>

      {/* USPs compact */}
      <MotionSection className="border-y border-[#eef2f6] bg-[#f7fafc] py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {USPS.map((u) => {
              const Icon = u.icon;
              return (
                <FadeItem key={u.title}>
                  <div className="h-full rounded-3xl border border-[#e8eef3] bg-white p-6">
                    <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-[#E8F4FC] text-[#0F4C75]">
                      <Icon className="size-5" />
                    </div>
                    <h3 className="text-base font-semibold text-[#0F4C75]">
                      {u.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#1B262C]/60">
                      {u.desc}
                    </p>
                  </div>
                </FadeItem>
              );
            })}
          </Stagger>
        </div>
      </MotionSection>

      {/* Testimonials */}
      <MotionSection
        id="solusi"
        className="scroll-mt-28 bg-white py-32 md:py-48"
      >
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <FadeUp>
            <h2 className="text-[clamp(1.75rem,3vw,2.75rem)] font-bold tracking-tight text-[#0F4C75]">
              Insight nyata dari tim operasional
            </h2>
            <p className="mt-3 max-w-2xl text-[#1B262C]/60">
              Distribusi, retail, dan manufaktur — data yang sama, peran yang
              berbeda.
            </p>
          </FadeUp>
          <div className="mt-12">
            <Tabs defaultSelectedKey="dist" className="w-full">
              <Tabs.ListContainer>
                <Tabs.List aria-label="Industri">
                  {TESTIMONIALS.map((t) => {
                    const Icon = t.icon;
                    return (
                      <Tabs.Tab key={t.id} id={t.id}>
                        <span className="inline-flex items-center gap-1.5">
                          <Icon className="size-3.5" />
                          {t.industry}
                        </span>
                        <Tabs.Indicator />
                      </Tabs.Tab>
                    );
                  })}
                </Tabs.List>
              </Tabs.ListContainer>
              {TESTIMONIALS.map((t) => (
                <Tabs.Panel key={t.id} id={t.id} className="pt-8">
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: easeOut }}
                    className="grid gap-6 rounded-3xl border border-[#e8eef3] bg-[#f7fafc] p-6 md:grid-cols-[1fr_1.2fr] md:p-10"
                  >
                    <div className="flex flex-col justify-center">
                      <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-[#E8F4FC] text-[#0F4C75]">
                        <t.icon className="size-6" />
                      </div>
                      <div className="text-4xl font-bold text-[#0F4C75] md:text-5xl">
                        {t.metric}
                      </div>
                      <div className="mt-1 text-sm font-medium text-[#3282B8]">
                        {t.metricLabel}
                      </div>
                      <div className="mt-8 flex items-center gap-3">
                        <Avatar color="accent" size="lg">
                          <Avatar.Fallback>{t.initials}</Avatar.Fallback>
                        </Avatar>
                        <div>
                          <div className="font-semibold text-[#0F4C75]">
                            {t.name}
                          </div>
                          <div className="text-sm text-[#1B262C]/55">
                            {t.role}, {t.company}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col justify-center">
                      <Quote className="mb-3 size-8 text-[#BBE1FA]" />
                      <p className="text-lg leading-relaxed text-[#1B262C]/75 md:text-xl">
                        “{t.quote}”
                      </p>
                    </div>
                  </motion.div>
                </Tabs.Panel>
              ))}
            </Tabs>
          </div>
        </div>
      </MotionSection>

      {/* Action — pricing */}
      <MotionSection
        id="harga"
        className="scroll-mt-28 bg-[#f7fafc] py-32 md:py-48"
      >
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <FadeUp className="mx-auto max-w-2xl text-center">
            <h2 className="text-[clamp(1.75rem,3vw,2.75rem)] font-bold tracking-tight text-[#0F4C75]">
              Mulai sesuai skala bisnis Anda
            </h2>
            <p className="mt-3 text-[#1B262C]/60">
              Biaya disesuaikan dengan modul, jumlah pengguna, dan kebutuhan
              implementasi.
            </p>
          </FadeUp>
          <Stagger className="mt-14 grid gap-4 md:grid-cols-3">
            {PRICING.map((p) => {
              const Icon = p.icon;
              return (
                <FadeItem key={p.name}>
                  <Card
                    className={cn(
                      "h-full border-[#e8eef3] bg-white",
                      "featured" in p &&
                        p.featured &&
                        "border-[#0F4C75] shadow-md ring-1 ring-[#0F4C75]/15",
                    )}
                  >
                    <Card.Header>
                      {"featured" in p && p.featured ? (
                        <Chip
                          color="accent"
                          size="sm"
                          variant="soft"
                          className="mb-2 w-fit"
                        >
                          <Chip.Label className="inline-flex items-center gap-1">
                            <Star className="size-3" />
                            Paling populer
                          </Chip.Label>
                        </Chip>
                      ) : null}
                      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-[#E8F4FC] text-[#0F4C75]">
                        <Icon className="size-5" />
                      </div>
                      <Card.Title className="text-xl text-[#0F4C75]">
                        {p.name}
                      </Card.Title>
                      <Card.Description className="leading-relaxed">
                        {p.desc}
                      </Card.Description>
                    </Card.Header>
                    <Card.Footer>
                      {p.name === "Starter" ? (
                        <RegisterLink>
                          <Button
                            variant={
                              "featured" in p && p.featured
                                ? "primary"
                                : "secondary"
                            }
                            className={
                              "featured" in p && p.featured
                                ? "bg-[#0F4C75] text-white"
                                : undefined
                            }
                          >
                            <Rocket className="mr-1.5 size-4" />
                            {p.cta}
                          </Button>
                        </RegisterLink>
                      ) : (
                        <ConsultModal
                          trigger={
                            <Button
                              variant={
                                "featured" in p && p.featured
                                  ? "primary"
                                  : "secondary"
                              }
                              className={
                                "featured" in p && p.featured
                                  ? "bg-[#0F4C75] text-white"
                                  : undefined
                              }
                            >
                              <MessageCircle className="mr-1.5 size-4" />
                              {p.cta}
                            </Button>
                          }
                        />
                      )}
                    </Card.Footer>
                  </Card>
                </FadeItem>
              );
            })}
          </Stagger>
        </div>
      </MotionSection>

      {/* FAQ */}
      <MotionSection id="faq" className="scroll-mt-28 bg-white py-32 md:py-48">
        <div className="mx-auto max-w-[760px] px-5 md:px-8">
          <FadeUp>
            <h2 className="text-center text-[clamp(1.75rem,3vw,2.75rem)] font-bold tracking-tight text-[#0F4C75]">
              Pertanyaan yang sering muncul
            </h2>
          </FadeUp>
          <FadeUp delay={0.1}>
            <Accordion className="mt-12" defaultExpandedKeys={["0"]}>
              {FAQS.map((f, i) => (
                <Accordion.Item key={String(i)} id={String(i)}>
                  <Accordion.Heading>
                    <Accordion.Trigger className="text-left text-sm font-semibold text-[#0F4C75]">
                      <span className="inline-flex items-start gap-2">
                        <CircleHelp className="mt-0.5 size-4 shrink-0 opacity-60" />
                        {f.q}
                      </span>
                      <Accordion.Indicator />
                    </Accordion.Trigger>
                  </Accordion.Heading>
                  <Accordion.Panel>
                    <Accordion.Body className="text-sm leading-relaxed text-[#1B262C]/65">
                      {f.a}
                    </Accordion.Body>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          </FadeUp>
        </div>
      </MotionSection>

      {/* Final CTA */}
      <MotionSection className="relative overflow-hidden bg-gradient-to-br from-[#0F4C75] to-[#1B262C] py-32 text-white md:py-40">
        <div className="pointer-events-none absolute inset-0 mkt-grain opacity-40" />
        <div className="relative mx-auto max-w-[800px] px-5 text-center md:px-8">
          <FadeUp>
            <h2 className="text-[clamp(1.75rem,3.5vw,3rem)] font-bold tracking-tight">
              Siap akselerasikan pertumbuhan?
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-white/70">
              Tingkatkan efisiensi operasional, kolaborasi lintas fungsi, dan
              ambil keputusan lebih cepat bersama Arunika ERP.
            </p>
          </FadeUp>
          <FadeUp
            delay={0.1}
            className="mt-10 flex flex-wrap items-center justify-center gap-3"
          >
            <ConsultModal
              trigger={
                <Button
                  variant="secondary"
                  size="lg"
                  className="rounded-full bg-white font-semibold text-[#0F4C75] data-[hovered=true]:bg-[#BBE1FA]"
                >
                  Konsultasi sekarang
                </Button>
              }
            />
            <a href={WA} target="_blank" rel="noreferrer">
              <Button
                variant="ghost"
                size="lg"
                className="rounded-full font-semibold text-white data-[hovered=true]:bg-white/10"
              >
                <MessageCircle className="mr-1.5 size-4" />
                WhatsApp kami
              </Button>
            </a>
          </FadeUp>
        </div>
      </MotionSection>

      <footer className="bg-[#0a1620] py-16 text-[#9db4c4]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:grid-cols-2 md:px-8 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <BrandMark light />
            <p className="mt-4 text-sm leading-relaxed text-white/45">
              ERP terintegrasi untuk penjualan, stok, keuangan, pajak, produksi,
              dan SDM.
            </p>
          </div>
          <FooterCol
            title="Produk"
            items={[
              "Penjualan & CRM",
              "Pembelian",
              "Inventori",
              "Akuntansi",
              "Pajak",
              "Produksi",
              "SDM & Payroll",
              "AI Insight",
            ]}
          />
          <FooterCol
            title="Solusi"
            items={[
              "Distribusi",
              "Retail",
              "Manufaktur",
              "F&B",
              "Jasa",
              "Multi-company",
            ]}
          />
          <FooterCol
            title="Resources"
            items={["FAQ", "Pusat bantuan", "Studi kasus", "Blog"]}
          />
          <FooterCol
            title="Perusahaan"
            items={[
              "Tentang Arunika",
              "Mengapa Arunika",
              "Kontak",
              "Kebijakan Privasi",
              "Syarat Layanan",
            ]}
          />
        </div>
        <div className="mx-auto mt-12 max-w-7xl border-t border-white/10 px-5 pt-6 md:px-8">
          <div className="flex flex-col items-center justify-between gap-3 text-xs text-white/35 sm:flex-row">
            <span>© 2026 BAD-EiZA. All rights reserved.</span>
            <span>Dibangun untuk bisnis Indonesia</span>
          </div>
        </div>
      </footer>

      <motion.a
        href={WA}
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-lg"
        initial={{ opacity: 0, y: 24, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1, duration: 0.45, ease: easeOut }}
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.97 }}
      >
        <MessageCircle className="size-5" />
        <span className="hidden sm:inline">WhatsApp kami</span>
      </motion.a>
    </main>
  );
}

const FOOTER_ICONS: Record<string, LucideIcon> = {
  Produk: Package,
  Solusi: Layers,
  Resources: ClipboardList,
  Perusahaan: CircleHelp,
};

function FooterCol({ title, items }: { title: string; items: string[] }) {
  const TitleIcon = FOOTER_ICONS[title] ?? ClipboardList;
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <TitleIcon className="size-3.5 text-[#3282B8]" />
        {title}
      </div>
      <ul className="mt-4 space-y-2.5 text-sm">
        {items.map((i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => scrollTo("produk")}
              className="text-left text-white/45 transition hover:text-white"
            >
              {i}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
