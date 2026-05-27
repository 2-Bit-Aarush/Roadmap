"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  Home,
  Compass,
  LayoutDashboard,
  TrendingUp,
  Bookmark,
  Clock,
  User,
  Settings,
  Info,
  LogIn,
  LogOut,
  Shield,
  BarChart3,
  FileText,
  Users,
  ChevronRight,
  X,
} from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const menuItems = [
  { name: "Home", icon: Home, href: "/" },
  { name: "Explore Roadmaps", icon: Compass, href: "/#roadmaps" },
  { name: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { name: "My Progress", icon: TrendingUp, href: "/dashboard?tab=progress" },
  { name: "Saved Roadmaps", icon: Bookmark, href: "/dashboard?tab=bookmarks" },
  { name: "Recently Viewed", icon: Clock, href: "/dashboard?tab=recent" },
];

const accountItems = [
  { name: "Profile", icon: User, href: "/dashboard?tab=profile" },
  { name: "About", icon: Info, href: "/#about" },
];

const adminItems = [
  { name: "Admin Dashboard", icon: Shield, href: "/admin" },
  { name: "Manage Roadmaps", icon: FileText, href: "/admin?tab=roadmaps" },
  { name: "User Analytics", icon: Users, href: "/admin?tab=analytics" },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Check initial session
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

  const handleAuthAction = async () => {
    onClose();
    if (user) {
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    } else {
      router.push("/login");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sidebar Panel */}
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className={cn(
              "fixed left-0 top-0 z-50 h-full w-80 max-w-[85vw]",
              "border-r border-white/[0.08]",
              "bg-black/80 backdrop-blur-2xl",
              "overflow-y-auto"
            )}
          >
            <div className="flex flex-col h-full p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-8">
                <div
                  onClick={() => {
                    onClose();
                    router.push("/");
                  }}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400">
                    <span className="text-lg font-bold text-white">R</span>
                  </div>
                  <span className="text-xl font-semibold text-white">Roadmap</span>
                </div>
                <motion.button
                  onClick={onClose}
                  className="flex items-center justify-center h-9 w-9 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                  whileTap={{ scale: 0.9 }}
                >
                  <X className="h-5 w-5" />
                </motion.button>
              </div>

              {/* Navigation */}
              <nav className="flex-1 space-y-6">
                {/* Main Menu */}
                <div>
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-white/40">
                    Navigation
                  </p>
                  <ul className="space-y-1">
                    {menuItems.map((item, index) => (
                      <motion.li
                        key={item.name}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <SidebarLink item={item} onClose={onClose} />
                      </motion.li>
                    ))}
                  </ul>
                </div>

                {/* Account */}
                <div>
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-white/40">
                    Account
                  </p>
                  <ul className="space-y-1">
                    {accountItems.map((item, index) => (
                      <motion.li
                        key={item.name}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: (menuItems.length + index) * 0.05 }}
                      >
                        <SidebarLink item={item} onClose={onClose} />
                      </motion.li>
                    ))}
                  </ul>
                </div>

                {/* Admin Section */}
                {isAdmin && (
                  <div>
                    <p className="mb-3 text-xs font-medium uppercase tracking-wider text-white/40">
                      Admin
                    </p>
                    <ul className="space-y-1">
                      {adminItems.map((item, index) => (
                        <motion.li
                          key={item.name}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            delay: (menuItems.length + accountItems.length + index) * 0.05,
                          }}
                        >
                          <SidebarLink item={item} onClose={onClose} isAdmin />
                        </motion.li>
                      ))}
                    </ul>
                  </div>
                )}
              </nav>

              {/* Footer */}
              <div className="mt-6 pt-6 border-t border-white/[0.08]">
                <motion.button
                  onClick={handleAuthAction}
                  className={cn(
                    "w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl",
                    "bg-gradient-to-r from-blue-600/20 to-cyan-500/20",
                    "border border-blue-500/30",
                    "text-white hover:from-blue-600/30 hover:to-cyan-500/30",
                    "transition-all duration-300 cursor-pointer"
                  )}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {user ? (
                    <>
                      <LogOut className="h-5 w-5 text-cyan-400" />
                      <span className="font-medium">Sign Out</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="h-5 w-5 text-cyan-400" />
                      <span className="font-medium">Sign In</span>
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

interface SidebarLinkProps {
  item: { name: string; icon: React.ElementType; href: string };
  onClose: () => void;
  isAdmin?: boolean;
}

function SidebarLink({ item, onClose, isAdmin }: SidebarLinkProps) {
  const router = useRouter();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onClose();
    router.push(item.href);
  };

  return (
    <a
      href={item.href}
      onClick={handleClick}
      className={cn(
        "group flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer",
        "text-white/70 hover:text-white",
        "hover:bg-white/[0.06] transition-all duration-200",
        isAdmin && "hover:bg-violet-500/10"
      )}
    >
      <item.icon
        className={cn(
          "h-5 w-5 transition-colors",
          isAdmin
            ? "text-violet-400 group-hover:text-violet-300"
            : "text-cyan-400 group-hover:text-cyan-300"
        )}
      />
      <span className="flex-1">{item.name}</span>
      <ChevronRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-50 group-hover:translate-x-0 transition-all" />
    </a>
  );
}

