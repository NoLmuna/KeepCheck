"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import LandingPage from "@/components/LandingPage";

export default function LoginPage() {
  const { user, cachedSession, isGuest, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (user || cachedSession || isGuest)) {
      router.replace("/");
    }
  }, [user, cachedSession, isGuest, loading, router]);

  return <LandingPage />;
}
