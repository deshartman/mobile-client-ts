"use client";

import dynamic from "next/dynamic";

const InnerBanner = dynamic(
  () => import("./incoming-call-banner-inner").then((m) => m.IncomingCallBannerInner),
  { ssr: false },
);

export function IncomingCallBanner({ userGuid }: Readonly<{ userGuid: string }>) {
  return <InnerBanner userGuid={userGuid} />;
}
