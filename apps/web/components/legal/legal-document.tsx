import { LEGAL_PARTS, LEGAL_UPDATED, LEGAL_VERSION } from '@/lib/legal/politica-y-terminos';

// Documento legal con índice. El texto vive en lib/legal; aquí solo se presenta.
export function LegalDocument() {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
        <span className="rounded-full bg-gold-soft px-2.5 py-1 font-semibold text-warning">
          Borrador para revisión legal
        </span>
        <span>Versión {LEGAL_VERSION}</span>
        <span aria-hidden="true">·</span>
        <span>Actualizado el {LEGAL_UPDATED}</span>
      </div>

      <nav aria-label="Contenido del documento" className="grid gap-1 text-sm">
        {LEGAL_PARTS.map((part) => (
          <a
            key={part.id}
            href={`#${part.id}`}
            className="w-fit rounded-sm font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active"
          >
            {part.title}
          </a>
        ))}
      </nav>

      {LEGAL_PARTS.map((part) => (
        <section key={part.id} aria-labelledby={part.id} className="grid gap-5 scroll-mt-2">
          <div>
            <h3 id={part.id} className="font-heading text-lg font-semibold text-brand">
              {part.title}
            </h3>
            <p className="mt-2 text-ink-2">{part.intro}</p>
          </div>

          {part.sections.map((section) => (
            <article key={section.id} aria-labelledby={section.id} className="grid gap-2">
              <h4 id={section.id} className="font-semibold text-ink">
                {section.title}
              </h4>
              {section.paragraphs?.map((text) => (
                <p key={text} className="text-ink-2">
                  {text}
                </p>
              ))}
              {section.items && (
                <ul className="grid list-disc gap-1.5 pl-5 text-ink-2 marker:text-brand">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              {section.after?.map((text) => (
                <p key={text} className="text-ink-2">
                  {text}
                </p>
              ))}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
