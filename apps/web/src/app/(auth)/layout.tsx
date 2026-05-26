export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
