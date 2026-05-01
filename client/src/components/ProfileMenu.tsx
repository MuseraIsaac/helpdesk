import { useState } from "react";
import { Link } from "react-router";
import { useSession } from "../lib/auth-client";
import { useTheme } from "../lib/theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Moon, Sun, Monitor, UserCircle, Settings, Info } from "lucide-react";
import AboutDialog from "@/components/AboutDialog";

interface ProfileMenuProps {
  onSignOut: () => void;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
}

export default function ProfileMenu({ onSignOut }: ProfileMenuProps) {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const [aboutOpen, setAboutOpen] = useState(false);

  const name = session?.user?.name ?? "";
  const email = session?.user?.email ?? "";
  const initials = getInitials(name);

  const themeOptions: { value: "light" | "dark" | "system"; icon: React.ReactNode; label: string }[] = [
    { value: "light", icon: <Sun className="h-3.5 w-3.5" />, label: "Light" },
    { value: "dark", icon: <Moon className="h-3.5 w-3.5" />, label: "Dark" },
    { value: "system", icon: <Monitor className="h-3.5 w-3.5" />, label: "System" },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Open profile menu"
        >
          {/* Avatar */}
          <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold shrink-0">
            {initials}
          </span>
          <span className="hidden sm:block max-w-[120px] truncate">{name}</span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* Identity */}
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium leading-none">{name}</span>
            <span className="text-xs text-muted-foreground leading-none mt-1 truncate">{email}</span>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Profile link */}
        <DropdownMenuItem asChild>
          <Link to="/profile" className="flex items-center gap-2 cursor-pointer">
            <UserCircle className="h-4 w-4" />
            Profile & Preferences
          </Link>
        </DropdownMenuItem>

        {/* Settings link */}
        <DropdownMenuItem asChild>
          <Link to="/settings" className="flex items-center gap-2 cursor-pointer">
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Theme picker */}
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 py-1">
          Theme
        </DropdownMenuLabel>
        <div className="flex gap-1 px-2 pb-1.5">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={[
                "flex flex-1 flex-col items-center gap-1 rounded-md border py-1.5 text-[11px] font-medium transition-colors",
                theme === opt.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-transparent hover:border-border text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>

        <DropdownMenuSeparator />

        {/* About */}
        <DropdownMenuItem
          onSelect={(e) => {
            // Radix closes the menu on select by default, which races the
            // dialog open. preventDefault here keeps the menu's close
            // animation from focus-stealing the dialog's first paint.
            e.preventDefault();
            setAboutOpen(true);
          }}
          className="gap-2 cursor-pointer"
        >
          <Info className="h-4 w-4" />
          About
        </DropdownMenuItem>

        {/* Sign out */}
        <DropdownMenuItem
          onClick={onSignOut}
          className="text-destructive focus:text-destructive gap-2 cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>

      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </DropdownMenu>
  );
}
