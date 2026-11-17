"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="flex h-[100dvh] w-full items-center justify-center bg-[#FAF7F2] dark:bg-[#15110F]">
      <div className="w-4 h-4 border-2 border-stone-300 dark:border-stone-600 border-t-amber-700 dark:border-t-amber-500 rounded-full animate-spin" />
    </div>
  );
}
