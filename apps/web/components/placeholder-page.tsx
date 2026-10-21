type PlaceholderPageProps = {
  title: string;
  owner: string;
  requirements: string;
};

export function PlaceholderPage({ title, owner, requirements }: PlaceholderPageProps) {
  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Página pendiente de implementar. Responsable: {owner}. Requisitos: {requirements}.
      </p>
    </main>
  );
}
