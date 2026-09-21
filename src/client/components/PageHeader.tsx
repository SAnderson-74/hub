export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6 md:mb-9">
      <h1 className="text-[2rem] font-bold leading-[1.1] tracking-[-0.03em] text-fg md:text-[2.75rem]">
        {title}
      </h1>
      {subtitle ? <p className="mt-2 text-base text-muted md:text-lg">{subtitle}</p> : null}
    </header>
  );
}
