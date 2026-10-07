/** Layout for public pages people reach from forms and emails. */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-12">
      <div className="grid w-full max-w-md gap-6">
        {children}
        <p className="text-center text-xs text-muted-foreground">Powered by Sendcoop</p>
      </div>
    </main>
  );
}
