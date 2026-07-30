import type { HeadAccessoryId, HeldItemId } from "@type-battle/shared";

type HeadAccessorySvgProps = {
  id: HeadAccessoryId;
};

type HeldItemSvgProps = {
  id: HeldItemId;
};

const navy = "#07153d";
const blue = "#119cff";
const cyan = "#20d4ff";
const gold = "#ffd428";
const red = "#ff4f64";
const purple = "#7c3aed";

export function HeadAccessorySvg({ id }: HeadAccessorySvgProps) {
  const common = {
    "data-cosmetic-slot": "head",
    "data-cosmetic-id": id,
    stroke: navy,
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (id) {
    case "none":
      return null;
    case "cap":
      return (
        <g {...common}>
          <path fill={blue} d="M23 10C24 2 28-2 33-2c6 0 10 5 10 13-7-2-13-2-20-1Z" />
          <path fill={cyan} d="M20 10c7-2 17-2 24 1-4 2-9 2-14 1-4-1-7-1-10-1Z" />
        </g>
      );
    case "headband":
      return (
        <g {...common}>
          <path fill={red} d="M22 7c5-3 15-3 20 0l-1 5c-5-2-13-2-18 0Z" />
          <circle fill={red} cx="42" cy="9" r="2.5" />
          <path fill={red} d="m43 9 7-4-2 6 4 3-9-2Z" />
        </g>
      );
    case "sunglasses":
      return (
        <g {...common}>
          <path fill={cyan} d="M21 13h10c2 0 3 1 3 3 0 5-3 8-7 8-5 0-7-4-6-11Z" />
          <path fill={cyan} d="M43 13H33c-2 0-3 1-3 3 0 5 3 8 7 8 5 0 7-4 6-11Z" />
          <path d="M31 15h2M20 14l-3-1M44 14l3-1" />
          <path stroke="#fff" d="m24 20 5-6m8 7 4-6" />
        </g>
      );
    case "beanie":
      return (
        <g {...common}>
          <path fill="#1976ff" d="M20 15C20 5 25 0 32 0s12 5 12 15v5H20z" />
          <path fill="#1261d6" d="M20 14h24v7H20z" />
          <path fill="#1976ff" d="M28 1c0-4 8-4 8 0" />
          <path opacity=".35" d="M25 4v10m7-13v13m7-10v10" />
        </g>
      );
    case "cat-ears":
      return (
        <g {...common}>
          <path fill="#fff" d="m21 10 1-12 10 8m11 4L42-2 32 6" />
          <path fill={red} stroke="none" d="m24 5 1-6 5 6m10 0-1-6-5 6" />
          <path fill="none" d="M22 11c5-5 15-5 20 0" />
        </g>
      );
    case "paper-bag":
      return (
        <g {...common}>
          <path fill="#f4bd68" d="M19 2h27l2 3-2 29-5-3-4 4-5-4-5 4-4-4-5 3 2-29z" />
          <circle fill={navy} stroke="none" cx="27" cy="16" r="2.2" />
          <circle fill={navy} stroke="none" cx="38" cy="16" r="2.2" />
          <path opacity=".35" d="M43 3v27" />
        </g>
      );
    case "headphones":
      return (
        <g {...common}>
          <path fill="none" stroke={cyan} strokeWidth="4" d="M20 17C20 4 44 4 44 17" />
          <path fill={blue} d="M18 16h6v15h-5c-3-3-3-12-1-15Zm28 0h-6v15h5c3-3 3-12 1-15Z" />
          <path fill="none" d="M22 12c5-7 15-7 20 0" />
        </g>
      );
    case "goggles":
      return (
        <g {...common}>
          <path fill="#eff9ff" d="M19 12h26v12c-3 5-8 6-13 1-5 5-10 4-13-1z" />
          <path fill={cyan} d="M22 15h20v7c-3 3-7 3-10-1-3 4-7 4-10 1z" />
          <path stroke="#fff" d="m25 21 4-6m6 7 4-7" />
          <path d="M19 17h-4m30 0h4" />
        </g>
      );
    case "devil-horns":
      return (
        <g {...common}>
          <path fill={red} d="M24 10C17 7 17 0 20-5c0 6 4 7 8 9z" />
          <path fill={red} d="M40 10c7-3 7-10 4-15 0 6-4 7-8 9z" />
          <path opacity=".4" d="m20 2 5 5m19-5-5 5" />
        </g>
      );
    case "crown":
      return (
        <g {...common}>
          <path fill={gold} d="m19 14-2-14 9 7 6-11 6 11 9-7-2 14z" />
          <path fill="#ffb300" d="M19 14h26v6H19z" />
          <path fill={blue} d="m32 3 3 5-3 5-3-5z" />
          <circle fill={gold} cx="17" cy="0" r="2" />
          <circle fill={gold} cx="32" cy="-4" r="2" />
          <circle fill={gold} cx="47" cy="0" r="2" />
        </g>
      );
    case "wizard-hat":
      return (
        <g {...common}>
          <path fill={purple} d="M23 13 31-9c7 4 10 10 8 20z" />
          <path fill={purple} d="M15 14c9-4 25-4 34 0-7 7-27 7-34 0Z" />
          <path fill={gold} d="M22 10h18l2 5H20z" />
          <path fill={gold} stroke="none" d="m31 0 1.5 3 3 .5-2 2 1 3-3.5-2-3 2 1-3-2.5-2 3-.5z" />
        </g>
      );
    case "samurai-helmet":
      return (
        <g {...common}>
          <path fill="#1458b8" d="M22 9c2-8 18-8 20 0v14H22z" />
          <path fill={gold} d="M22 6 15-2c4 1 8 4 11 8m16 0 7-8c-4 1-8 4-11 8" />
          <path fill={gold} d="M29 3h6v10h-6z" />
          <circle fill={blue} cx="32" cy="7" r="4" />
          <path fill={blue} d="m22 14-8 5 5 9 6-10m17-4 8 5-5 9-6-10" />
        </g>
      );
    case "afro":
      return (
        <g {...common} fill="#172554">
          <circle cx="20" cy="10" r="7" />
          <circle cx="24" cy="3" r="7" />
          <circle cx="32" cy="1" r="8" />
          <circle cx="40" cy="3" r="7" />
          <circle cx="44" cy="10" r="7" />
          <circle cx="18" cy="18" r="6" />
          <circle cx="46" cy="18" r="6" />
          <path d="M20 17c1-10 23-10 24 0" />
        </g>
      );
    case "halo":
      return (
        <g {...common}>
          <ellipse fill="none" stroke={gold} strokeWidth="4" cx="32" cy="0" rx="15" ry="4" />
          <path stroke={gold} d="M14-1 9-4m41 3 5-3M15 5l-5 3m39-3 5 3" />
        </g>
      );
  }
}

export function HeldItemSvg({ id }: HeldItemSvgProps) {
  const common = {
    "data-cosmetic-slot": "held",
    "data-cosmetic-id": id,
    stroke: navy,
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (id) {
    case "none":
      return null;
    case "wood-sword":
      return (
        <g {...common}>
          <path fill="#b66a32" d="m47 47 5-30 5-8 2 9-8 30z" />
          <path fill={gold} d="m45 42 10 3-1 4-10-3z" />
          <path fill="#9a5a2b" d="m46 46 6 2-3 8-4-1z" />
        </g>
      );
    case "umbrella":
      return (
        <g {...common}>
          <path fill={blue} d="M41 15c8-10 19-8 23 1-6-2-10 0-12 4-3-4-6-5-11-5Z" />
          <path fill={cyan} d="M52 20c3-4 7-6 12-4-1-6-5-10-10-11z" />
          <path fill="none" d="M52 18 47 48c-2 7 6 8 7 2" />
        </g>
      );
    case "frying-pan":
      return (
        <g {...common}>
          <ellipse fill="#303b4d" cx="55" cy="17" rx="10" ry="12" transform="rotate(22 55 17)" />
          <ellipse fill="#596579" cx="55" cy="17" rx="7" ry="9" transform="rotate(22 55 17)" />
          <path fill={red} d="m51 27-5 21 5 2 7-21z" />
        </g>
      );
    case "baseball-bat":
      return (
        <g {...common}>
          <path fill="#c77a3e" d="M48 46 57 9c2-7 8-5 7 1L53 48z" />
          <path fill="#f0a45c" d="m50 41 5 2-2 7-5-2z" />
        </g>
      );
    case "baguette":
      return (
        <g {...common}>
          <path fill="#e89b32" d="m47 47 9-34c3-7 9-4 8 3l-11 33z" />
          <path stroke="#fff0b3" d="m57 18 5 2m-7 5 5 2m-8 5 6 2" />
        </g>
      );
    case "iron-sword":
      return (
        <g {...common}>
          <path fill="#cfe9ff" d="m50 43 7-34 5-7 1 9-9 34z" />
          <path fill="#fff" d="m58 10 3-4-1 7-7 27z" stroke="none" />
          <path fill={gold} d="m46 40 12 4-1 4-12-4z" />
          <path fill="#2563eb" d="m48 46 6 2-3 9-5-2z" />
        </g>
      );
    case "spear":
      return (
        <g {...common}>
          <path fill="#9a5a2b" d="m47 51 10-38 3 1-9 39z" />
          <path fill="#d9efff" d="m57 15 3-12 6 7-6 6z" />
          <path fill={red} d="m56 18 7 3-5 4z" />
        </g>
      );
    case "electric-guitar":
      return (
        <g {...common}>
          <path fill={cyan} d="M45 38c-6-4-8 6-3 10 4 4 8 1 11-2 2 5 9 3 9-3 0-5-6-6-9-4z" />
          <path fill="#d99b4d" d="m51 41 7-28 4 1-7 29z" />
          <path fill="#f0c46e" d="m57 14 2-7 7 2-3 7z" />
          <path stroke="#fff" d="m48 39 9 3m-10 3 8 2" />
        </g>
      );
    case "toy-hammer":
      return (
        <g {...common}>
          <path fill={gold} d="m48 50 8-25 4 2-8 25z" />
          <path fill={red} d="m49 19 15 5-3 9-15-5z" />
          <path opacity=".25" d="m52 20-3 9m7-7-3 9m7-7-3 9" />
        </g>
      );
    case "greatsword":
      return (
        <g {...common}>
          <path fill="#8ca4bf" d="m47 44 9-38 7-7 1 11-12 37z" />
          <path fill="#dcecff" d="m58 8 4-5-1 8-9 31z" />
          <path fill="#bcc9d8" d="m44 41 13 5-2 5-13-5z" />
          <path fill="#64748b" d="m47 48 6 2-3 8-6-2z" />
        </g>
      );
    case "magic-wand":
      return (
        <g {...common}>
          <path fill={purple} d="m47 50 11-29 4 2-11 29z" />
          <path fill={gold} d="m61 6 2 6 7 1-5 4 2 7-6-4-6 4 2-7-5-4 7-1z" />
          <circle fill={cyan} stroke="none" cx="52" cy="14" r="1.5" />
          <circle fill={purple} stroke="none" cx="68" cy="8" r="1.5" />
        </g>
      );
    case "keyboard":
      return (
        <g {...common}>
          <path fill="#dbe7f5" d="m38 31 22 8-6 18-22-8z" />
          <path fill="#52657b" d="m39 34 18 7-4 12-18-7z" />
          <path stroke="#fff" strokeWidth="1" d="m39 39 16 6m-17-2 16 6m-10-13-4 12m9-10-4 12m9-10-4 12" />
        </g>
      );
    case "frozen-tuna":
      return (
        <g {...common}>
          <path fill="#82c9ff" d="M42 43c7-13 14-18 24-16-1 9-8 17-19 21z" />
          <path fill="#dff5ff" d="M45 42c8-7 14-10 20-11-3 8-9 13-18 16z" />
          <path fill="#5ba7df" d="m42 43-7-6 2 9-7 4 12 1z" />
          <circle fill={navy} stroke="none" cx="61" cy="31" r="1.5" />
          <path stroke={cyan} d="m49 27-2-5m8 4 1-6m4 7 5-4" />
        </g>
      );
    case "katana":
      return (
        <g {...common}>
          <path fill="#edf8ff" d="m49 42 8-35 5-7-1 10-8 34z" />
          <path fill={gold} d="m46 40 10 3-1 4-10-3z" />
          <path fill="#1f2937" d="m47 45 6 2-3 10-6-2z" />
          <path stroke="#fff" strokeWidth="1" d="m47 48 5 2m-6 2 5 2" />
        </g>
      );
    case "scythe":
      return (
        <g {...common}>
          <path fill="#242b36" d="m47 55 10-43 4 1-10 43z" />
          <path fill="#c9d7e5" d="M57 13c9-3 15 2 17 8-8-4-13 0-18 5z" />
          <path fill="#eff8ff" d="M60 14c6-1 10 2 12 5-6-2-10 1-14 5z" />
          <circle fill="#f4f7fb" cx="59" cy="12" r="4" />
          <circle fill={navy} stroke="none" cx="57.5" cy="11.5" r="1" />
          <circle fill={navy} stroke="none" cx="60.5" cy="11.5" r="1" />
        </g>
      );
    case "giant-pencil":
      return (
        <g {...common}>
          <path fill={gold} d="m43 48 12-32 7 3-12 32z" />
          <path fill="#f2c49b" d="m55 16 7-10 1 13z" />
          <path fill={navy} d="m60 9 2-3 1 4z" />
          <path fill={red} d="m43 48 7 3-3 7-7-3z" />
          <path fill="#b7c4d8" d="m44 45 8 3-2 5-8-3z" />
        </g>
      );
  }
}
