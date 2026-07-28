import type { ReactNode } from "react";

import StaggeredMenu, { type StaggeredMenuItem } from "@/components/layout/staggered-menu";
import { PlayerBar } from "@/components/player/player-bar";

const menuItems: StaggeredMenuItem[] = [
  { label: "主页", ariaLabel: "前往我的音乐", link: "/" },
  { label: "搜索音乐", ariaLabel: "前往搜索音乐", link: "/search" },
  { label: "喜欢的音乐", ariaLabel: "前往喜欢的音乐", link: "/library" },
  { label: "个人中心", ariaLabel: "前往个人中心", link: "/profile" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f7fb] pb-28">
      <StaggeredMenu items={menuItems} position="right" colors={["#c4b5fd", "#7c3aed"]} accentColor="#6d28d9" />
      <main className="pt-10 sm:pt-12">{children}</main>
      <PlayerBar />
    </div>
  );
}
