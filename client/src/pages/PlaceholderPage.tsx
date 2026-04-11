import { Construction } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  description?: string;
}

export default function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
        <Construction className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {description ?? "This section is coming soon."}
        </p>
      </div>
    </div>
  );
}
