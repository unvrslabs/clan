import { Instagram, Linkedin, Video, FileText, ExternalLink, Download } from "lucide-react";
import { Badge } from "./ui/badge";
import type { Publication } from "../api/publications";

const platformConfig = {
  instagram: {
    label: "Instagram",
    icon: Instagram,
    badgeClass: "bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0",
  },
  linkedin: {
    label: "LinkedIn",
    icon: Linkedin,
    badgeClass: "bg-[#0A66C2] text-white border-0",
  },
} as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function handleDownload(e: React.MouseEvent, mediaUrl: string, caption?: string) {
  e.preventDefault();
  e.stopPropagation();
  const filename = caption
    ? `${caption.slice(0, 40).replace(/[^a-zA-Z0-9À-ú ]/g, "").trim().replace(/\s+/g, "_")}.png`
    : "publication.png";
  const a = document.createElement("a");
  a.href = mediaUrl;
  a.download = filename;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function PublicationCard({ pub }: { pub: Publication }) {
  const { data } = pub;
  const config = platformConfig[data.platform] || platformConfig.instagram;
  const PlatformIcon = config.icon;
  const postUrl = data.postUrl;

  return (
    <a
      href={postUrl ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-2xl card-border-light bg-card overflow-hidden transition-all duration-200 hover:shadow-lg hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Thumbnail */}
      <div className="relative aspect-square bg-muted overflow-hidden">
        {data.mediaUrl ? (
          data.mediaType === "video" ? (
            <div className="flex items-center justify-center h-full bg-muted">
              <Video className="h-12 w-12 text-muted-foreground/40" />
              <img
                src={data.mediaUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          ) : (
            <img
              src={data.mediaUrl}
              alt={data.caption?.slice(0, 100) || "Published image"}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                el.style.display = "none";
              }}
            />
          )
        ) : (
          <div className="flex items-center justify-center h-full">
            <FileText className="h-12 w-12 text-muted-foreground/40" />
          </div>
        )}

        {/* Platform badge overlay */}
        <div className="absolute top-2 left-2">
          <Badge className={config.badgeClass}>
            <PlatformIcon className="h-3 w-3" />
            {config.label}
          </Badge>
        </div>

        {/* Action buttons on hover */}
        <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {data.mediaUrl && (
            <button
              onClick={(e) => handleDownload(e, data.mediaUrl!, data.caption)}
              className="rounded-full bg-black/50 p-1.5 hover:bg-black/70 transition-colors"
              title="Scarica immagine"
            >
              <Download className="h-3 w-3 text-white" />
            </button>
          )}
          {postUrl && (
            <div className="rounded-full bg-black/50 p-1.5">
              <ExternalLink className="h-3 w-3 text-white" />
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-3 space-y-1.5">
        <p className="text-sm text-foreground line-clamp-2 leading-snug">
          {data.caption || pub.title || "No caption"}
        </p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>@{data.accountName}</span>
          <span>{formatDate(data.publishedAt || pub.createdAt)}</span>
        </div>
      </div>
    </a>
  );
}
