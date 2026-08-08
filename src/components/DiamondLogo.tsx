import React from 'react';

export interface DiamondLogoProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  layout?: 'vertical' | 'horizontal' | 'icon';
  showText?: boolean;
  showTagline?: boolean;
  textClassName?: string;
  taglineClassName?: string;
  variant?: 'blue' | 'white' | 'gold' | 'custom';
  customColor?: string;
}

export const DiamondLogo: React.FC<DiamondLogoProps> = ({
  className = '',
  size = 'md',
  layout = 'vertical',
  showText = true,
  showTagline = true,
  textClassName = '',
  taglineClassName = '',
  variant = 'blue',
  customColor
}) => {
  let dimension = 60;
  if (typeof size === 'number') {
    dimension = size;
  } else {
    switch (size) {
      case 'xs': dimension = 28; break;
      case 'sm': dimension = 40; break;
      case 'md': dimension = 64; break;
      case 'lg': dimension = 96; break;
      case 'xl': dimension = 130; break;
    }
  }

  const colorMap = {
    blue: '#0A33CC',
    white: '#FFFFFF',
    gold: '#C9930A',
    custom: customColor || '#0A33CC'
  };

  const fillColor = customColor || colorMap[variant] || colorMap.blue;

  const isIconOnly = layout === 'icon' || (!showText && !showTagline);
  const isHorizontal = layout === 'horizontal';

  const SymbolSVG = (
    <svg
      width={dimension}
      height={dimension * 1.15}
      viewBox="0 0 400 480"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 transition-transform duration-300 hover:scale-105"
    >
      <g fill={fillColor}>
        {/* Academic Graduation Cap (Mortarboard Top) */}
        <polygon points="200,20 385,100 200,180 15,100" />
        
        {/* Cap Underband Rim */}
        <path d="M 115,145 C 160,168 240,168 285,145 L 285,158 C 240,181 160,181 115,158 Z" />

        {/* Hanging Tassel on Left */}
        <circle cx="200" cy="100" r="7.5" />
        <path 
          d="M 200,100 C 110,110 72,142 72,190 L 72,238" 
          stroke={fillColor} 
          strokeWidth="8" 
          strokeLinecap="round" 
          fill="none" 
        />
        <circle cx="72" cy="242" r="8" />
        <path d="M 61,250 C 55,298 89,298 83,250 Z" />

        {/* Integrated D Monogram - Vertical Stem */}
        <path d="M 110,158 L 154,158 L 154,395 L 110,395 Z" />
        
        {/* Integrated D Monogram - Outer Curve */}
        <path d="M 148,158 C 255,158 318,198 318,275 C 318,352 255,395 148,395 L 148,348 C 220,348 268,318 268,275 C 268,232 220,205 148,205 Z" />

        {/* Intertwined S Monogram */}
        <path d="M 215,232 C 270,232 328,252 328,292 C 328,332 272,348 222,360 C 180,370 162,390 162,418 C 162,456 218,474 278,474 C 318,474 348,460 348,440 C 348,426 332,426 322,436 C 308,450 288,456 268,456 C 225,456 198,440 198,418 C 198,398 220,388 262,378 C 312,366 362,342 362,292 C 362,242 308,215 235,215 C 200,215 172,225 172,242 C 172,253 186,253 196,244 C 208,236 226,232 242,232 Z" />
      </g>
    </svg>
  );

  if (isIconOnly) {
    return <div className={`inline-flex items-center justify-center ${className}`}>{SymbolSVG}</div>;
  }

  if (isHorizontal) {
    return (
      <div className={`inline-flex items-center gap-3.5 ${className}`}>
        {SymbolSVG}
        <div className={`flex flex-col justify-center ${textClassName}`}>
          {showText && (
            <span 
              className="font-serif font-black tracking-tight leading-tight text-slate-900"
              style={{ color: variant === 'white' ? '#FFFFFF' : variant === 'gold' ? '#C9930A' : '#0A33CC', fontSize: `${Math.max(16, dimension * 0.38)}px` }}
            >
              Diamond Solution
            </span>
          )}
          {showTagline && (
            <span 
              className={`font-sans font-semibold tracking-normal text-slate-600 mt-0.5 ${taglineClassName}`}
              style={{ color: variant === 'white' ? '#E2E8F0' : '#475569', fontSize: `${Math.max(10, dimension * 0.18)}px` }}
            >
              Committed to raising first-class professionals.
            </span>
          )}
        </div>
      </div>
    );
  }

  // Vertical layout (default)
  return (
    <div className={`inline-flex flex-col items-center text-center ${className}`}>
      {SymbolSVG}
      <div className={`mt-3 flex flex-col items-center ${textClassName}`}>
        {showText && (
          <span 
            className="font-serif font-black tracking-tight leading-none"
            style={{ color: variant === 'white' ? '#FFFFFF' : variant === 'gold' ? '#C9930A' : '#0A33CC', fontSize: `${Math.max(18, dimension * 0.42)}px` }}
          >
            Diamond Solution
          </span>
        )}
        {showTagline && (
          <span 
            className={`font-sans font-semibold text-slate-600 mt-1.5 ${taglineClassName}`}
            style={{ color: variant === 'white' ? '#CBD5E1' : '#475569', fontSize: `${Math.max(11, dimension * 0.2)}px` }}
          >
            Committed to raising first-class professionals.
          </span>
        )}
      </div>
    </div>
  );
};

export default DiamondLogo;
