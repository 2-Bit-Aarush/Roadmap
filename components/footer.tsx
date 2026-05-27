"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Github, Twitter, ArrowUpRight } from "lucide-react";
import { siteConfig } from "@/lib/config";

const footerLinks = {
  platform: [
    { name: "Roadmaps", href: "#roadmaps" },
    { name: "About", href: "#about" },
  ],
};

export function Footer() {
  const formatLink = (url?: string) => {
    if (!url) return "#";
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return `https://${url}`;
  };

  const links = siteConfig.links as any;
  const socialLinks = [];
  if (links.github) {
    socialLinks.push({ name: "GitHub", icon: Github, href: formatLink(links.github) });
  }
  if (links.linkedin) {
    // Use the existing Twitter/X icon/button visually, BUT make it open the LinkedIn profile link instead
    socialLinks.push({ name: "LinkedIn", icon: Twitter, href: formatLink(links.linkedin) });
  } else if (links.twitter) {
    socialLinks.push({ name: "Twitter/X", icon: Twitter, href: formatLink(links.twitter) });
  }

  return (
    <footer className="relative border-t border-white/[0.05] bg-black/20">
      <div className="relative max-w-6xl mx-auto px-4 md:px-8 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Brand */}
          <div className="flex flex-col items-center md:items-start gap-4">
            <motion.a
              href="#"
              className="inline-flex items-center gap-2"
              whileHover={{ scale: 1.02 }}
            >
              <span
                className="text-xl font-semibold text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {siteConfig.name}
              </span>
            </motion.a>
            <p className="text-white/40 text-sm text-center md:text-left">
              A small initiative by {siteConfig.creator}
            </p>
            {((siteConfig as any).contactEmail || (siteConfig as any).phone) && (
              <div className="flex flex-col gap-1 text-xs text-white/30 text-center md:text-left mt-1">
                {(siteConfig as any).contactEmail && (
                  <a href={`mailto:${(siteConfig as any).contactEmail}`} className="hover:text-white transition-colors">
                    {(siteConfig as any).contactEmail}
                  </a>
                )}
                {(siteConfig as any).phone && (
                  <a href={`tel:${(siteConfig as any).phone}`} className="hover:text-white transition-colors">
                    {(siteConfig as any).phone}
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Links */}
          <div className="flex items-center gap-8">
            {footerLinks.platform.map((link) => (
              <motion.a
                key={link.name}
                href={link.href}
                className="text-sm text-white/40 hover:text-white transition-colors inline-flex items-center gap-1 group"
                whileHover={{ x: 2 }}
              >
                {link.name}
                <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </motion.a>
            ))}
          </div>

          {/* Social Links */}
          <div className="flex items-center gap-3">
            {socialLinks.map((social) => (
              <motion.a
                key={social.name}
                href={social.href}
                className={cn(
                  "flex items-center justify-center w-9 h-9 rounded-lg",
                  "bg-white/5 border border-white/10",
                  "text-white/50 hover:text-white hover:bg-white/10 hover:border-white/20",
                  "transition-all duration-200"
                )}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                aria-label={social.name}
                target="_blank"
                rel="noopener noreferrer"
              >
                <social.icon className="h-4 w-4" />
              </motion.a>
            ))}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 pt-8 border-t border-white/[0.05] text-center">
          <p className="text-xs text-white/30">
            © {new Date().getFullYear()} {siteConfig.name}
          </p>
        </div>
      </div>
    </footer>
  );
}
