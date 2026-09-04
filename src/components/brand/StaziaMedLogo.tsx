import React from "react";

interface StaziaMedLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  layout?: "horizontal" | "vertical" | "monogram";
  isDark?: boolean;
}

export const StaziaMedLogo: React.FC<StaziaMedLogoProps> = ({
  className = "",
  size = "md",
  layout = "horizontal",
  isDark = false,
}) => {
  const sizeMap = {
    sm: { width: 140, height: 44, iconSize: 34 },
    md: { width: 200, height: 60, iconSize: 48 },
    lg: { width: 260, height: 78, iconSize: 64 },
    xl: { width: 320, height: 96, iconSize: 80 },
  };

  const currentSize = sizeMap[size];

  // Standalone Monogram
  if (layout === "monogram") {
    return (
      <svg
        className={`shrink-0 ${className}`}
        width={currentSize.iconSize}
        height={currentSize.iconSize}
        viewBox="0 0 160 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="StaziaMed Monograma"
        role="img"
      >
        <defs>
          <linearGradient id="staziaSGrad" x1="10%" y1="0%" x2="90%" y2="100%">
            <stop offset="0%" stopColor="#00E5C0" />
            <stop offset="25%" stopColor="#00D2B4" />
            <stop offset="60%" stopColor="#0284C7" />
            <stop offset="100%" stopColor="#0A2540" />
          </linearGradient>
        </defs>

        {/* Top Node Dot */}
        <circle cx="122" cy="38" r="14" fill="#00D2B4" />

        {/* Continuous S Body */}
        <path
          d="M 120 38
             C 105 38 80 40 54 46
             C 32 52 24 68 24 84
             C 24 100 36 112 56 116
             L 94 122
             C 116 126 128 136 128 152
             C 128 170 112 186 86 186
             C 58 186 36 178 26 172"
          stroke="url(#staziaSGrad)"
          strokeWidth="20"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="scale(0.72) translate(14, 0)"
        />

        {/* Top Medical Cross */}
        <g transform="translate(42, 60)" fill="#00D2B4">
          <rect x="0" y="5" width="18" height="6" rx="3" />
          <rect x="6" y="0" width="6" height="16" rx="3" />
        </g>

        {/* Bottom Medical Cross */}
        <g transform="translate(68, 96)" fill="#0284C7">
          <rect x="0" y="5" width="18" height="6" rx="3" />
          <rect x="6" y="0" width="6" height="16" rx="3" />
        </g>

        {/* Bottom Node Dot */}
        <circle cx="38" cy="124" r="14" fill="#0A2540" />
      </svg>
    );
  }

  // Vertical Stacked Layout (e.g. for card hero / dedicated brand panel / login)
  if (layout === "vertical") {
    const maxHeightMap = {
      sm: "max-h-24 sm:max-h-28",
      md: "max-h-32 sm:max-h-36",
      lg: "max-h-44 sm:max-h-52",
      xl: "max-h-56 sm:max-h-64",
    };
    const logoSrc = isDark
      ? "/images/logo/staziamed_logo_vertical_dark.png"
      : "/images/logo/staziamed_logo_vertical.png";

    return (
      <div className={`flex flex-col items-center justify-center select-none text-center ${className}`}>
        <img
          src={logoSrc}
          alt="StaziaMed Revalida"
          className={`w-auto ${maxHeightMap[size]} object-contain drop-shadow-sm transition-opacity duration-300`}
          draggable={false}
          loading="eager"
        />
      </div>
    );
  }

  // Standard Horizontal Layout
  return (
    <div className={`inline-flex items-center gap-3.5 select-none ${className}`}>
      {/* Monogram Icon */}
      <svg
        width={currentSize.iconSize}
        height={currentSize.iconSize}
        viewBox="0 0 160 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="staziaSGradHoriz" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00E5C0" />
            <stop offset="25%" stopColor="#00D2B4" />
            <stop offset="60%" stopColor="#0284C7" />
            <stop offset="100%" stopColor="#0A2540" />
          </linearGradient>
        </defs>

        {/* Top Node Dot */}
        <circle cx="122" cy="38" r="14" fill="#00D2B4" />

        {/* Continuous S Body */}
        <path
          d="M 120 38
             C 105 38 80 40 54 46
             C 32 52 24 68 24 84
             C 24 100 36 112 56 116
             L 94 122
             C 116 126 128 136 128 152
             C 128 170 112 186 86 186
             C 58 186 36 178 26 172"
          stroke="url(#staziaSGradHoriz)"
          strokeWidth="20"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="scale(0.72) translate(14, 0)"
        />

        {/* Top Medical Cross */}
        <g transform="translate(42, 60)" fill="#00D2B4">
          <rect x="0" y="5" width="18" height="6" rx="3" />
          <rect x="6" y="0" width="6" height="16" rx="3" />
        </g>

        {/* Bottom Medical Cross */}
        <g transform="translate(68, 96)" fill="#0284C7">
          <rect x="0" y="5" width="18" height="6" rx="3" />
          <rect x="6" y="0" width="6" height="16" rx="3" />
        </g>

        {/* Bottom Node Dot */}
        <circle cx="38" cy="124" r="14" fill="#0A2540" />
      </svg>

      {/* Brand Typography */}
      <div className="flex flex-col text-left">
        <div className="flex items-center tracking-tight leading-none text-xl sm:text-2xl font-extrabold">
          <span className={isDark ? "text-white" : "text-[#0A1C3E]"}>Stazia</span>
          <span className="text-[#00D2B4]">Med</span>
        </div>

        <div className="flex items-center gap-1.5 mt-1">
          <div className="h-[1.5px] w-3 bg-[#00D2B4]/60 rounded-full" />
          <span
            className={`text-[8.5px] sm:text-[9.5px] font-black tracking-[0.25em] uppercase leading-none ${
              isDark ? "text-teal-400" : "text-[#0A1C3E]"
            }`}
          >
            REVALIDA
          </span>
          <div className="h-[1.5px] flex-1 bg-[#00D2B4]/60 rounded-full" />
        </div>
      </div>
    </div>
  );
};
