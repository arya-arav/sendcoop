import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="mb-8 text-center text-lg font-semibold tracking-tight">Sendcoop</p>
        <Card>
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            </CardTitle>
            {subtitle && <CardDescription>{subtitle}</CardDescription>}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
        {footer && <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>}
      </div>
    </main>
  );
}
