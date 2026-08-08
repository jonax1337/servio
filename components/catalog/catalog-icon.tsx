import {
  ShoppingBag, Laptop, Monitor, Smartphone, KeyRound, Mail, Wifi, ShieldCheck,
  HardDrive, Printer, Headphones, Server, Cloud, Package, Boxes, UserPlus,
  Settings, Wrench, Database, Globe, CreditCard, FileText, Phone, Cpu,
  Keyboard, Briefcase, GraduationCap, Building2, Plug, LifeBuoy, Camera,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Curated set of icons an admin can pick for a catalog item. */
export const CATALOG_ICONS: Record<string, LucideIcon> = {
  ShoppingBag, Laptop, Monitor, Smartphone, KeyRound, Mail, Wifi, ShieldCheck,
  HardDrive, Printer, Headphones, Server, Cloud, Package, Boxes, UserPlus,
  Settings, Wrench, Database, Globe, CreditCard, FileText, Phone, Cpu,
  Keyboard, Briefcase, GraduationCap, Building2, Plug, LifeBuoy, Camera,
};

export const CATALOG_ICON_NAMES = Object.keys(CATALOG_ICONS);

export function CatalogIcon({ name, className }: { name?: string | null; className?: string }) {
  const Icon = (name && CATALOG_ICONS[name]) || ShoppingBag;
  return <Icon className={className} />;
}
