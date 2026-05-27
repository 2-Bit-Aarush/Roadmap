"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LogIn, UserPlus, Github, Chrome, Compass, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectedFrom = searchParams.get("redirectedFrom") || "/dashboard";

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Sync signup query parameter if it exists
  useEffect(() => {
    if (searchParams.get("isSignup") === "true") {
      setIsLogin(false);
    }
  }, [searchParams]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    if (!email || !password || (!isLogin && !fullName)) {
      setErrorMsg("Please fill in all fields.");
      setLoading(false);
      return;
    }

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        toast.success("Successfully logged in!");
        router.push(redirectedFrom);
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
            emailRedirectTo: `${window.location.origin}/auth/callback?redirectedFrom=${redirectedFrom}`,
          },
        });

        if (error) throw error;

        toast.success("Signup successful! Please check your email for verification.");
        setIsLogin(true);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An authentication error occurred.");
      toast.error(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?redirectedFrom=${redirectedFrom}`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || "Google Login failed");
    }
  };

  return (
    <main className="relative min-h-screen w-full flex items-center justify-center bg-background overflow-hidden p-4">
      {/* Background gradients */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-background to-background" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 left-1/3 w-[300px] h-[300px] bg-cyan-500/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/3 right-1/3 w-[300px] h-[300px] bg-violet-500/5 rounded-full blur-[100px]" />
      </div>

      <Toaster position="top-center" theme="dark" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo / Header */}
        <div className="flex flex-col items-center mb-8">
          <motion.div
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 shadow-[0_0_20px_rgba(59,130,246,0.3)] mb-4"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <span className="text-xl font-bold text-white">R</span>
          </motion.div>
          <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: "var(--font-display)" }}>
            {isLogin ? "Welcome Back" : "Create Account"}
          </h1>
          <p className="text-white/50 text-sm">
            {isLogin ? "Log in to track your learning progress" : "Sign up to unlock and bookmark roadmaps"}
          </p>
        </div>

        {/* Card Body */}
        <div className="rounded-2xl border border-white/[0.08] bg-black/60 backdrop-blur-xl p-6 md:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          {errorMsg && (
            <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-white/70 text-xs">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-cyan-500/50"
                  disabled={loading}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-white/70 text-xs">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-cyan-500/50"
                disabled={loading}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-white/70 text-xs">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-cyan-500/50"
                disabled={loading}
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white border-0 shadow-[0_0_20px_rgba(59,130,246,0.2)] mt-2"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </span>
              ) : isLogin ? (
                <>
                  <LogIn className="h-4 w-4" />
                  Sign In
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  Sign Up
                </>
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/[0.08]" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-black/60 px-2 text-white/40">Or continue with</span>
            </div>
          </div>

          {/* Social login */}
          <Button
            type="button"
            variant="outline"
            onClick={handleGoogleLogin}
            className="w-full border-white/10 hover:bg-white/5 text-white/80 hover:text-white"
            disabled={loading}
          >
            <Chrome className="h-4 w-4 mr-2" />
            Google
          </Button>

          {/* Switch flow link */}
          <div className="text-center mt-6 text-sm">
            <span className="text-white/40">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
            </span>
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setErrorMsg("");
              }}
              className="text-cyan-400 hover:text-cyan-300 font-medium underline-offset-4 hover:underline transition-colors bg-transparent border-0 cursor-pointer p-0"
              disabled={loading}
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </div>
        </div>

        {/* Back to Home link */}
        <div className="text-center mt-6">
          <Button
            variant="link"
            onClick={() => router.push("/")}
            className="text-white/40 hover:text-white/70 gap-1.5"
          >
            <Compass className="h-4 w-4" />
            Back to Home
          </Button>
        </div>
      </motion.div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
