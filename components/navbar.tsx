"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Menu, X, User, LogIn, LogOut, Shield, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface NavbarProps {
  onMenuClick: () => void;
  isMenuOpen: boolean;
}

export function Navbar({ onMenuClick, isMenuOpen }: NavbarProps) {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    // Check session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        checkAdminStatus(currentUser.id);
      }
    });

    // Listen to changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        checkAdminStatus(currentUser.id);
      } else {
        setIsAdmin(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkAdminStatus = async (userId: string) => {
    try {
      const { data } = await supabase
        .from("admin_roles")
        .select("role")
        .eq("id", userId)
        .single();
      setIsAdmin(!!data && data.role === "admin");
    } catch {
      setIsAdmin(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const navLinks = [
    { name: "Home", href: "/" },
    { name: "Roadmaps", href: "/#roadmaps" },
    { name: "About", href: "/#about" },
  ];

  return (
    <motion.nav
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={cn(
        "fixed top-4 left-1/2 z-50 -translate-x-1/2 w-[calc(100%-2rem)] max-w-5xl",
        "rounded-2xl border border-white/[0.08] px-4 py-3 md:px-6",
        "backdrop-blur-xl transition-all duration-300",
        scrolled
          ? "bg-black/60 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
          : "bg-black/40"
      )}
    >
      <div className="flex items-center justify-between">
        {/* Logo */}
        <motion.div
          onClick={() => router.push("/")}
          className="flex items-center gap-2 group cursor-pointer"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400">
            <span className="text-sm font-bold text-white">R</span>
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 opacity-0 blur-lg transition-opacity group-hover:opacity-60" />
          </div>
          <span className="text-lg font-semibold text-white">Roadmap</span>
        </motion.div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <motion.a
              key={link.name}
              href={link.href}
              className="relative px-4 py-2 text-sm text-white/70 transition-colors hover:text-white"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {link.name}
              <motion.div
                className="absolute bottom-0 left-1/2 h-px w-0 -translate-x-1/2 bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
                whileHover={{ width: "80%" }}
                transition={{ duration: 0.2 }}
              />
            </motion.a>
          ))}
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2">
          {user ? (
            <div className="flex items-center gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 overflow-hidden outline-none cursor-pointer">
                    <Avatar className="h-9 w-9">
                      <AvatarImage
                        src={user.user_metadata?.avatar_url || ""}
                        alt={user.user_metadata?.full_name || user.email || "User"}
                      />
                      <AvatarFallback className="bg-gradient-to-br from-blue-600 to-cyan-500 text-white text-xs font-bold">
                        {user.user_metadata?.full_name?.[0]?.toUpperCase() ||
                          user.email?.[0]?.toUpperCase() ||
                          "U"}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-black/90 border border-white/10 backdrop-blur-xl text-white">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-semibold leading-none">
                        {user.user_metadata?.full_name || "Student"}
                      </p>
                      <p className="text-xs leading-none text-white/50">
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem
                    onClick={() => router.push("/dashboard")}
                    className="focus:bg-white/10 focus:text-white cursor-pointer"
                  >
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    <span>Dashboard</span>
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem
                      onClick={() => router.push("/admin")}
                      className="focus:bg-violet-500/20 focus:text-white text-violet-300 cursor-pointer"
                    >
                      <Shield className="mr-2 h-4 w-4 text-violet-400" />
                      <span>Admin Panel</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="focus:bg-destructive/20 focus:text-white text-destructive cursor-pointer"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="hidden md:flex text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
                onClick={() => router.push("/login")}
              >
                <LogIn className="mr-2 h-4 w-4" />
                Login
              </Button>
              <Button
                size="sm"
                className="hidden md:flex bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white border-0 shadow-[0_0_20px_rgba(59,130,246,0.3)] cursor-pointer"
                onClick={() => router.push("/login?isSignup=true")}
              >
                Get Started
              </Button>
            </>
          )}

          {/* Mobile Menu Button */}
          <motion.button
            onClick={onMenuClick}
            className="flex md:hidden items-center justify-center h-9 w-9 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
            whileTap={{ scale: 0.9 }}
          >
            <AnimatePresence mode="wait">
              {isMenuOpen ? (
                <motion.div
                  key="close"
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <X className="h-5 w-5" />
                </motion.div>
              ) : (
                <motion.div
                  key="menu"
                  initial={{ rotate: 90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Menu className="h-5 w-5" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>
    </motion.nav>
  );
}

