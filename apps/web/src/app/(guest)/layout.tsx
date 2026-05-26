/**
 * Minimal layout for guest video pages — no session check, no banners,
 * no overlays. The (app) layout would redirect unauthenticated users
 * to /signup, which would defeat the entire guest-link UX.
 */
export default function GuestLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <main className="flex min-h-dvh flex-col bg-black text-white">{children}</main>;
}
