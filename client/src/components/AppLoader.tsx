/**
 * Full-screen auth-check loader shown by route guards while the session
 * request is in-flight. Replaces the plain "Loading..." text.
 */
export default function AppLoader() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">

      {/* Spinning gradient ring + logo */}
      <div style={{ position: "relative", width: 96, height: 96 }}>

        {/* Conic ring — spins */}
        <div style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: "conic-gradient(from 0deg, transparent 0deg, #6366f1 80deg, #a855f7 160deg, #06b6d4 230deg, transparent 295deg)",
          animation: "apl-spin 1.5s linear infinite",
        }} />

        {/* Inner fill punches the ring gap */}
        <div style={{
          position: "absolute",
          inset: 5,
          borderRadius: "50%",
          background: "var(--background)",
        }} />

        {/* Logo — gentle pulse + glow */}
        <img
          src="/logo.png"
          alt=""
          style={{
            position: "absolute",
            inset: 14,
            width: "calc(100% - 28px)",
            height: "calc(100% - 28px)",
            objectFit: "contain",
            animation: "apl-glow 2.2s ease-in-out infinite",
          }}
        />
      </div>

      {/* Three bouncing dots */}
      <div style={{ display: "flex", gap: 7, marginTop: 28 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              display: "block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "currentColor",
              animation: `apl-dot 1.3s ${i * 0.18}s ease-in-out infinite`,
            }}
            className="text-muted-foreground/50"
          />
        ))}
      </div>

      <style>{`
        @keyframes apl-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes apl-glow {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
            filter: drop-shadow(0 0 6px rgba(99,102,241,0.35));
          }
          50% {
            opacity: 0.82;
            transform: scale(0.94);
            filter: drop-shadow(0 0 18px rgba(168,85,247,0.6));
          }
        }
        @keyframes apl-dot {
          0%, 80%, 100% { opacity: 0.2; transform: translateY(0) scale(0.8); }
          40%            { opacity: 1;   transform: translateY(-5px) scale(1.15); }
        }
      `}</style>
    </div>
  );
}
