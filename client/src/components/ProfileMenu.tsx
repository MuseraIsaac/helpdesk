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
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { LogOut, Moon, Sun, Monitor, UserCircle, Settings, Info, Palette as PaletteIcon, Check } from "lucide-react";
import AboutDialog from "@/components/AboutDialog";
import { PALETTES, findPalette, DEFAULT_PALETTE_ID } from "../lib/palettes";

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
  const { theme, setTheme, paletteId, setPalette } = useTheme();
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

      <DropdownMenuContent align="end" className="w-72">
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

        {/* Brightness mode (light / dark / system) */}
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 py-1">
          Mode
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

        {/* Palette picker — collapsed into a submenu so the parent menu
          *  stays compact. The trigger is a single row showing the active
          *  palette's swatch + name; the submenu opens on hover/click. */}
        {(() => {
          const active = findPalette(paletteId) ?? findPalette(DEFAULT_PALETTE_ID)!;
          return (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2 cursor-pointer">
                <PaletteIcon className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 truncate text-sm">Palette</span>
                {/* Active palette preview — three-stripe swatch + name */}
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="flex h-4 w-6 rounded border border-border/40 overflow-hidden shrink-0 shadow-sm">
                    {active.swatch.map((hex, i) => (
                      <span key={i} className="flex-1" style={{ backgroundColor: hex }} />
                    ))}
                  </span>
                  <span className="truncate max-w-[80px]">{active.name}</span>
                </span>
              </DropdownMenuSubTrigger>

              <DropdownMenuSubContent
                sideOffset={6}
                className="w-72 p-1.5 shadow-xl"
              >
                {/* Header — pill-style brand stripe */}
                <div className="px-2 pt-1 pb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1.5">
                    <PaletteIcon className="h-3 w-3" />
                    Choose a palette
                  </p>
                  <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                    Recolour the entire app with one click.
                  </p>
                </div>
                <DropdownMenuSeparator className="my-0" />
                {/* Scrollable list of palettes */}
                <div className="max-h-[320px] overflow-y-auto py-1">
                  {PALETTES.map((p) => {
                    const isActive = paletteId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPalette(p.id)}
                        className={[
                          "group w-full flex items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted/60 text-foreground/85 hover:text-foreground",
                        ].join(" ")}
                      >
                        {/* Larger 3-stripe swatch with subtle shine */}
                        <span
                          className={[
                            "relative flex h-9 w-12 rounded-md overflow-hidden shrink-0 shadow-sm border",
                            isActive ? "border-primary/40" : "border-border/50",
                          ].join(" ")}
                        >
                          {p.swatch.map((hex, i) => (
                            <span key={i} className="flex-1" style={{ backgroundColor: hex }} />
                          ))}
                          {/* Glossy highlight to make the chip pop */}
                          <span
                            className="absolute inset-0 pointer-events-none"
                            style={{
                              background: "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,0.05) 100%)",
                            }}
                          />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[12.5px] font-medium leading-tight truncate">
                            {p.name}
                          </span>
                          <span className="block text-[10.5px] text-muted-foreground/80 mt-0.5 truncate">
                            {p.description}
                          </span>
                        </span>
                        {isActive && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0 shadow-sm">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        })()}

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
