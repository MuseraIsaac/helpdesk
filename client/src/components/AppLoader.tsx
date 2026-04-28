/**
 * Full-screen auth-check loader shown by route guards while the session
 * request is in-flight. Replaces the plain "Loading..." text.
 */
export default function AppLoader() {
  const SIZE = 88;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">

      {/* Logo — gentle pulse + glow, no surrounding ring */}
      <img
        src="/logo.png"
        alt=""
        style={{
          width: SIZE,
          height: SIZE,
          objectFit: "contain",
          borderRadius: "50%",
          animation: "apl-glow 2.4s ease-in-out infinite",
        }}
      />

      {/* Indeterminate progress bar — sweeps left-to-right repeatedly */}
      <div
        role="progressbar"
        aria-label="Loading"
        style={{
          position: "relative",
          marginTop: 28,
          width: 160,
          height: 3,
          borderRadius: 2,
          overflow: "hidden",
          background: "rgba(127, 127, 127, 0.15)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: "40%",
            borderRadius: 2,
            background: "linear-gradient(90deg, transparent 0%, #6366f1 30%, #a855f7 50%, #06b6d4 70%, transparent 100%)",
            animation: "apl-bar 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite",
          }}
        />
      </div>

      <style>{`
        @keyframes apl-glow {
          0%, 100% { opacity: 1;    filter: drop-shadow(0 0 5px rgba(99,102,241,0.35)); }
          50%      { opacity: 0.85; filter: drop-shadow(0 0 14px rgba(168,85,247,0.65)); }
        }
        @keyframes apl-bar {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}
